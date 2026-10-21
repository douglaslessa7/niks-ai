import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import { USO_ZERO, type ChamadaFerramenta, type RespostaModelo, type Uso } from './model.ts'

// NIKS Chat no Claude Sonnet 5.5 (out/2026). Mesma interface do OpenAIModel (model.ts):
// devolve o TEXTO em pedaços (o app recebe exatamente o mesmo formato de antes), as
// chamadas de ferramenta como { name, arguments } e o uso de tokens.
// Além disso, `primeiro` resolve no primeiro texto (ou início da ferramenta de proposta) e
// REJEITA se a Anthropic falhar/recusar antes disso — é o que o roteador espera para decidir
// se manda a mesma mensagem para o gpt-5.4-mini sem a usuária perceber.
//
// Agente (out/2026): além da proposta (terminal — vai para o cartão, como antes), a NIKS
// pode pedir CONSULTAS (só leitura). A função executa a consulta, devolve o resultado ao
// modelo e continua a resposta no MESMO stream — o app não percebe diferença.

export type ConfigClaude = { modelo: string; esforco: string; cacheTtl: '5m' | '1h' }

// Consultas que a NIKS pode pedir no meio da resposta. `definicoes` já no formato Anthropic.
export type Consultas = {
  definicoes: Array<{ name: string; description: string; input_schema: unknown }>
  // Seção do prompt de sistema sobre as consultas (entra depois do prompt principal, no cache).
  instrucoes: string
  executar: (nome: string, entrada: unknown) => Promise<string>
}

export type RegistroFerramenta = {
  ferramenta: string
  rodada: number
  entrada: unknown
  duracaoMs: number
  tamanhoResultado: number
  erro: string | null
}

export type RespostaClaude = RespostaModelo & {
  primeiro: Promise<void>
  // Ninguém mais vai ler a resposta (o roteador desistiu dela): para de enviar e não começa
  // outra ida ao modelo, mas a ida em andamento termina — para o custo sair exato.
  abandonar: () => void
  // Já pediu alguma consulta? O roteador espera mais pelo 1º texto quando ela está trabalhando.
  pediuConsulta: () => boolean
  registros: Promise<RegistroFerramenta[]>
  rodadas: Promise<number>
}

// Limites do agente por resposta (ver o plano: até 3 idas ao modelo, 4 consultas, 60 s).
const MAX_RODADAS = 3
const MAX_CONSULTAS = 4
const TEMPO_MAX_MS = 60_000
// Resposta que ninguém lê (a usuária fechou o chat, ou o roteador foi para o gpt) termina em
// segundo plano para o custo ser o que a Anthropic cobrou. Passou disto, aí sim é cortada e o
// uso em `ia_custos` fica marcado como estimado.
const LIMITE_ABANDONADA_MS = 60_000
const AVISO_INTERROMPIDO = '\n\nNão consegui terminar agora. Me pergunta de novo?'

// Ferramenta no formato OpenAI ({ type:'function', function:{ name, description, parameters } })
// → formato Anthropic. proposta.ts continua sendo a fonte única dos textos e do schema.
function converterFerramenta(t: any) {
  const f = t?.function ?? t
  return {
    name: f.name,
    description: f.description,
    input_schema: f.parameters,
    eager_input_streaming: true,
  }
}

const somarUso = (a: Uso, b: Uso): Uso => ({
  input: a.input + b.input,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
  cacheRead: a.cacheRead + b.cacheRead,
  output: a.output + b.output,
})

export class ClaudeModel {
  private client: Anthropic

  // `apiKey`: a chave da conta da Anthropic escolhida para esta resposta (_shared/anthropic-contas.ts).
  constructor(private cfg: ConfigClaude, apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 0 })
  }

  stream(
    systemPrompt: string,
    userMessage: string,
    images?: Array<{ base64: string; mimeType: string }>,
    tools?: unknown[],
    consultas?: Consultas,
  ): RespostaClaude {
    const cfg = this.cfg
    const client = this.client
    const cache = cfg.cacheTtl === '1h'
      ? { type: 'ephemeral' as const, ttl: '1h' as const }
      : { type: 'ephemeral' as const }

    // Cache: ferramentas + prompt de sistema (iguais para todas as usuárias). A ordem do
    // cache é tools → system → messages; o contexto de cada usuária vem depois.
    // Ordem fixa das ferramentas (a proposta primeiro, depois as consultas) — mudar a ordem
    // invalida o cache.
    const nomesConsulta = new Set((consultas?.definicoes ?? []).map((d) => d.name))
    const ferramentasDef: any[] = [
      ...(tools ?? []).map(converterFerramenta),
      ...(consultas?.definicoes ?? []),
    ]
    if (ferramentasDef.length) {
      ferramentasDef[ferramentasDef.length - 1] = { ...ferramentasDef[ferramentasDef.length - 1], cache_control: cache }
    }

    const content: any[] = [
      ...(images ?? []).map((img) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      })),
      { type: 'text', text: userMessage },
    ]
    const messages: any[] = [{ role: 'user', content }]
    const sistema = consultas ? `${systemPrompt}\n\n${consultas.instrucoes}` : systemPrompt

    const controller = new AbortController()
    const encoder = new TextEncoder()
    const chamadas: { name: string; arguments: string }[] = []
    const registros: RegistroFerramenta[] = []
    let usoTotal: Uso = { ...USO_ZERO }
    let rodada = 0
    let algoSaiu = false   // texto ou proposta — depois disso não há mais troca de modelo
    let houveTexto = false // já foi texto para a tela
    let pediuConsulta = false
    let abandonada = false
    let timerAbandono: ReturnType<typeof setTimeout> | undefined
    // Ida ao modelo em andamento: o uso dela só entra em `usoTotal` quando ela termina. Se for
    // cortada no meio, entra no `finally` (entrada e cache já são conhecidos; a saída é estimada
    // pelo texto que saiu — o raciocínio não aparece, então o número é um piso).
    let rodadaAberta = false
    let inicioRecebido = false // a API começou a ida (message_start) — só então há cobrança
    let usoRodadaAberta: Uso = { ...USO_ZERO }
    let charsRodada = 0
    const abandonar = () => {
      if (abandonada) return
      abandonada = true
      timerAbandono = setTimeout(() => controller.abort(), LIMITE_ABANDONADA_MS)
    }

    let resolverPrimeiro!: () => void
    let rejeitarPrimeiro!: (e: unknown) => void
    const primeiro = new Promise<void>((res, rej) => { resolverPrimeiro = res; rejeitarPrimeiro = rej })
    primeiro.catch(() => {}) // quem decide é o roteador; sem "unhandled rejection"
    const marcarSaida = () => { if (!algoSaiu) { algoSaiu = true; resolverPrimeiro() } }

    let resolverFerramentas!: (c: ChamadaFerramenta[]) => void
    const ferramentas = new Promise<ChamadaFerramenta[]>((r) => { resolverFerramentas = r })
    let resolverUso!: (u: Uso) => void
    const usoPromise = new Promise<Uso>((r) => { resolverUso = r })
    let resolverRegistros!: (r: RegistroFerramenta[]) => void
    const registrosPromise = new Promise<RegistroFerramenta[]>((r) => { resolverRegistros = r })
    let resolverRodadas!: (n: number) => void
    const rodadasPromise = new Promise<number>((r) => { resolverRodadas = r })

    // Uso de UMA ida ao modelo (message_start + message_delta, cumulativos).
    const lerUso = (atual: Uso, u: any): Uso => {
      if (!u) return atual
      const cc = u.cache_creation
      const novo: Uso = {
        input: u.input_tokens ?? atual.input,
        cacheWrite: cc ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? atual.cacheWrite),
        cacheWrite1h: cc ? (cc.ephemeral_1h_input_tokens ?? 0) : atual.cacheWrite1h,
        cacheRead: u.cache_read_input_tokens ?? atual.cacheRead,
        output: u.output_tokens ?? atual.output,
      }
      // Sem o detalhamento: atribui a gravação ao TTL configurado.
      if (!cc && cfg.cacheTtl === '1h') { novo.cacheWrite1h = novo.cacheWrite; novo.cacheWrite = 0 }
      return novo
    }

    const inicio = Date.now()

    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const enviar = (s: string) => {
          if (abandonada) return
          try { ctrl.enqueue(encoder.encode(s)) } catch { abandonar() /* stream fechado */ }
        }
        try {
          while (true) {
            rodada++
            // Estourou algum limite: a última ida é SEM ferramentas — ela responde com o que tem.
            const semFerramentas = rodada > 1 &&
              (rodada >= MAX_RODADAS || registros.length >= MAX_CONSULTAS || Date.now() - inicio > TEMPO_MAX_MS)

            const sdkStream = client.messages.stream(
              {
                model: cfg.modelo,
                // Raciocínio adaptativo (padrão do modelo) + esforço da chat_config. O teto
                // cobre raciocínio + resposta visível.
                max_tokens: 8000,
                output_config: { effort: cfg.esforco as any },
                system: [{ type: 'text', text: sistema, cache_control: cache }],
                ...(ferramentasDef.length
                  ? {
                    tools: ferramentasDef as any,
                    tool_choice: semFerramentas
                      ? { type: 'none' }
                      : { type: 'auto', disable_parallel_tool_use: true },
                  }
                  : {}),
                messages,
              } as any,
              { signal: controller.signal },
            )

            // Argumentos da PROPOSTA, juntados por índice do bloco (igual a antes).
            const blocos = new Map<number, { name: string; arguments: string }>()
            let usoRodada: Uso = { ...USO_ZERO }
            rodadaAberta = true
            inicioRecebido = false
            usoRodadaAberta = { ...USO_ZERO }
            charsRodada = 0
            let textoNestaRodada = false
            let recusou = false

            for await (const ev of sdkStream as AsyncIterable<any>) {
              switch (ev.type) {
                case 'message_start':
                  usoRodada = lerUso(usoRodada, ev.message?.usage)
                  usoRodadaAberta = usoRodada
                  inicioRecebido = true
                  break
                case 'content_block_start':
                  if (ev.content_block?.type === 'tool_use') {
                    if (nomesConsulta.has(ev.content_block.name)) {
                      pediuConsulta = true
                    } else {
                      blocos.set(ev.index, { name: ev.content_block.name, arguments: '' })
                      marcarSaida()
                    }
                  }
                  break
                case 'content_block_delta':
                  if (ev.delta?.type === 'text_delta' && ev.delta.text) {
                    // Texto de uma ida nova depois de texto anterior: parágrafo novo (vira
                    // outra bolha no app).
                    if (!textoNestaRodada && houveTexto) enviar('\n\n')
                    textoNestaRodada = true
                    houveTexto = true
                    marcarSaida()
                    charsRodada += ev.delta.text.length
                    enviar(ev.delta.text)
                  } else if (ev.delta?.type === 'input_json_delta') {
                    const b = blocos.get(ev.index)
                    if (b) b.arguments += ev.delta.partial_json ?? ''
                  }
                  break
                case 'content_block_stop': {
                  const b = blocos.get(ev.index)
                  if (b) { chamadas.push(b); blocos.delete(ev.index) }
                  break
                }
                case 'message_delta':
                  usoRodada = lerUso(usoRodada, ev.usage)
                  usoRodadaAberta = usoRodada
                  if (ev.delta?.stop_reason === 'refusal') {
                    recusou = true
                    // Recusa antes de qualquer texto → o roteador manda para o gpt-5.4-mini.
                    // Depois de texto, só termina com o que já saiu.
                    if (!algoSaiu) rejeitarPrimeiro(new Error(`refusal:${ev.delta?.stop_details?.category ?? ''}`))
                    chamadas.length = 0 // ferramenta de uma resposta recusada nunca é usada
                  }
                  break
              }
            }
            usoTotal = somarUso(usoTotal, usoRodada)
            rodadaAberta = false
            if (recusou || abandonada) break // ninguém lê: não começa outra ida

            // O que o modelo pediu nesta ida. A proposta é terminal (vai para o cartão no
            // flush do index.ts, como antes); só consulta faz o loop continuar.
            const final: any = await sdkStream.finalMessage()
            const pedidas = (final?.content ?? []).filter((b: any) => b?.type === 'tool_use' && nomesConsulta.has(b.name))
            if (final?.stop_reason !== 'tool_use' || pedidas.length === 0 || chamadas.length > 0 || !consultas) break

            const resultados: any[] = []
            for (const b of pedidas) {
              const t0 = Date.now()
              let resultado: string
              let erro: string | null = null
              try {
                resultado = await consultas.executar(b.name, b.input ?? {})
              } catch (e) {
                erro = (e as Error)?.message ?? String(e)
                resultado = 'Não consegui consultar isso agora. Responda sem esse dado e não invente.'
              }
              registros.push({
                ferramenta: b.name, rodada, entrada: b.input ?? null,
                duracaoMs: Date.now() - t0, tamanhoResultado: resultado.length, erro,
              })
              resultados.push({ type: 'tool_result', tool_use_id: b.id, content: resultado, ...(erro ? { is_error: true } : {}) })
            }
            // Turno do assistente INTEIRO (inclusive os blocos de raciocínio, sem mexer) +
            // os resultados — a próxima ida continua dali.
            messages.push({ role: 'assistant', content: final.content }, { role: 'user', content: resultados })
          }
          if (!algoSaiu) rejeitarPrimeiro(new Error('resposta-vazia'))
          try { ctrl.close() } catch { /* a usuária já fechou o chat */ }
        } catch (err) {
          // Antes do primeiro texto: o roteador troca de modelo. Depois: a resposta termina
          // com o que já foi enviado (não dá para trocar sem repetir texto na tela) — e, se
          // caiu no meio de uma consulta, avisa que não terminou.
          if (!algoSaiu) rejeitarPrimeiro(err)
          else {
            console.warn('niks-chat/claude: erro depois do primeiro texto', (err as Error)?.message ?? err)
            if (rodada > 1 && houveTexto && !controller.signal.aborted) {
              try { enviar(AVISO_INTERROMPIDO) } catch { /* stream já fechado */ }
            }
          }
          try { ctrl.close() } catch { /* já fechado/cancelado */ }
        } finally {
          resolverFerramentas(chamadas)
          clearTimeout(timerAbandono)
          let estimado = false
          // Recusada antes de começar (erro da API, ex.: chave): nada foi cobrado, o 0 é exato.
          if (rodadaAberta && (inicioRecebido || controller.signal.aborted)) {
            // Ida cortada no meio (limite da resposta abandonada, ou erro da API no meio do
            // stream): soma o que já se sabe e marca a linha como estimada.
            estimado = true
            usoTotal = somarUso(usoTotal, {
              ...usoRodadaAberta,
              output: Math.max(usoRodadaAberta.output, Math.ceil(charsRodada / 3)),
            })
          }
          resolverUso({ ...usoTotal, estimado })
          resolverRegistros(registros)
          resolverRodadas(rodada)
        }
      },
      // A usuária fechou o chat: a resposta termina em segundo plano (custo exato).
      cancel() {
        abandonar()
      },
    })

    return {
      stream,
      ferramentas,
      uso: usoPromise,
      primeiro,
      abandonar,
      pediuConsulta: () => pediuConsulta,
      registros: registrosPromise,
      rodadas: rodadasPromise,
    }
  }
}
