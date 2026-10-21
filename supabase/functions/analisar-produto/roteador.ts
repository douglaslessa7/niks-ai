import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import { custoUsd, MODELO_OPENAI, USO_ZERO, type Uso } from '../_shared/ia-custos.ts'
import { contasDisponiveis, marcarProblema, problemaDaConta } from '../_shared/anthropic-contas.ts'

// Escolhe quem analisa o produto (out/2026) — mesmo esquema do niks-chat:
//   1. `analise_produto_config.provedor = 'openai'` → gpt-5.4-mini (chave SÓ desta função, sem deploy);
//   2. Claude pela conta da Anthropic da vez (_shared/anthropic-contas.ts: limite por ciclo,
//      crédito, chave); nenhuma conta disponível → gpt-5.4-mini;
//   3. erro de crédito ou de chave → a MESMA análise vai para a próxima conta; outro erro,
//      recusa, resposta cortada, JSON ilegível ou demora > espera_ms → gpt-5.4-mini, sem a
//      usuária perceber. Na demora, o Claude
//      NÃO é cortado: termina em segundo plano e o custo gravado é o que a Anthropic cobrou.
// Cada chamada vira uma linha em `ia_custos` (registrarCusto, chamado no waitUntil).

// deno-lint-ignore no-explicit-any
type Supabase = any

type Config = {
  provedor: 'anthropic' | 'openai'
  modelo: string
  esforco: string
  cacheTtl: '5m' | '1h'
  esperaMs: number
}

const PADRAO: Config = {
  provedor: 'anthropic',
  modelo: 'claude-sonnet-5-5',
  esforco: 'low',
  cacheTtl: '5m',
  esperaMs: 30_000,
}

// Um cliente por chave (uma por conta da Anthropic), criado na primeira vez que a conta é usada.
const clientes = new Map<string, Anthropic>()
const clientePara = (apiKey: string) => {
  let c = clientes.get(apiKey)
  if (!c) { c = new Anthropic({ apiKey, maxRetries: 0 }); clientes.set(apiKey, c) }
  return c
}

// Leitura guardada por 60 s em cada instância da função: a troca de provedor vale em ≤ 1 min.
const CACHE_MS = 60_000
let configCache: { em: number; valor: Config } | null = null

async function lerConfig(supabase: Supabase): Promise<Config> {
  if (configCache && Date.now() - configCache.em < CACHE_MS) return configCache.valor
  let valor = PADRAO
  try {
    const { data, error } = await supabase.from('analise_produto_config').select('*').eq('id', 1).maybeSingle()
    if (error) throw error
    if (data) {
      valor = {
        provedor: data.provedor === 'openai' ? 'openai' : 'anthropic',
        modelo: data.anthropic_modelo ?? PADRAO.modelo,
        esforco: data.esforco ?? PADRAO.esforco,
        cacheTtl: data.cache_ttl === '1h' ? '1h' : '5m',
        esperaMs: Number(data.espera_ms ?? PADRAO.esperaMs),
      }
    }
  } catch (e) {
    console.error('analisar-produto/roteador: analise_produto_config ilegível, usando o padrão', e)
  }
  configCache = { em: Date.now(), valor }
  return valor
}

// Parse defensivo: localiza o primeiro `{` e o último `}` para tolerar qualquer
// preâmbulo/markdown que o modelo eventualmente adicione.
export function extractJSON(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Nenhum objeto JSON encontrado na resposta do modelo')
  }
  return JSON.parse(text.slice(start, end + 1))
}

// Resposta aproveitável = JSON com `status` conhecido. Qualquer outra coisa → reserva.
function lerResultado(texto: string): any {
  const result = extractJSON(texto)
  if (result?.status !== 'ok' && result?.status !== 'precisa_foto') {
    throw new Error(`status inesperado: ${String(result?.status).slice(0, 40)}`)
  }
  return result
}

type Imagem = { base64: string; mimeType: string }

const TIPOS_IMAGEM = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

// Claude que passou de `espera_ms` continua em segundo plano até este limite a mais; depois é
// cortado e o uso fica estimado (a API não chega a informar os tokens).
const LIMITE_ABANDONADA_MS = 60_000
// Estimativa só para chamada cortada: ~3 caracteres por token e ~400 tokens por foto de 512 px.
const estimarUso = (systemPrompt: string, texto: string, imagens: Imagem[]): Uso => ({
  ...USO_ZERO,
  input: Math.ceil((systemPrompt.length + texto.length) / 3) + imagens.length * 400,
  estimado: true,
})

async function chamarClaude(cfg: Config, apiKey: string, systemPrompt: string, texto: string, imagens: Imagem[]): Promise<{ texto: string; uso: Uso }> {
  const cache = cfg.cacheTtl === '1h'
    ? { type: 'ephemeral' as const, ttl: '1h' as const }
    : { type: 'ephemeral' as const }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.esperaMs + LIMITE_ABANDONADA_MS)
  try {
    const msg: any = await clientePara(apiKey).messages.create(
      {
        model: cfg.modelo,
        // Raciocínio adaptativo (padrão do modelo) + esforço da config. O teto cobre
        // raciocínio + resposta (4096 podia cortar com o raciocínio ligado).
        max_tokens: 8000,
        output_config: { effort: cfg.esforco as any },
        // Cache: o prompt de sistema é igual para todas as usuárias.
        system: [{ type: 'text', text: systemPrompt, cache_control: cache }],
        // Mesma ordem do gpt (texto, depois as fotos) — foi a testada em 20/out/2026.
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: texto },
            ...imagens.map((img) => ({
              type: 'image',
              source: {
                type: 'base64',
                media_type: TIPOS_IMAGEM.has(img.mimeType) ? img.mimeType : 'image/jpeg',
                data: img.base64,
              },
            })),
          ],
        }],
      } as any,
      { signal: controller.signal },
    )
    const u = msg?.usage ?? {}
    const cc = u.cache_creation
    const uso: Uso = {
      input: u.input_tokens ?? 0,
      cacheWrite: cc ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0),
      cacheWrite1h: cc ? (cc.ephemeral_1h_input_tokens ?? 0) : 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      output: u.output_tokens ?? 0,
    }
    const saida = (msg?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    if (msg?.stop_reason === 'refusal') throw Object.assign(new Error('recusa'), { uso })
    if (msg?.stop_reason === 'max_tokens') throw Object.assign(new Error('cortada'), { uso })
    return { texto: saida, uso }
  } catch (e) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error('cortada_no_limite'), { uso: estimarUso(systemPrompt, texto, imagens) })
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// gpt-5.4-mini exatamente como antes da troca: família GPT-5 (max_completion_tokens, NUNCA
// max_tokens), json_object, retry 3x em HTTP 500/503, sem stream.
async function chamarOpenAI(systemPrompt: string, texto: string, imagens: Imagem[]): Promise<{ texto: string; uso: Uso }> {
  const userContent: any[] = [{ type: 'text', text: texto }]
  for (const img of imagens) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` },
    })
  }

  let data: any = null
  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: MODELO_OPENAI,
        max_completion_tokens: 4096,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    })

    data = await response.json()
    const isUnavailable = !response.ok && (response.status === 503 || response.status === 500)
    if (isUnavailable) {
      lastError = JSON.stringify(data)
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        continue
      }
    }
    break
  }

  // Sem desconto de cache no custo (igual ao chat): `cached_tokens` fica dentro de `input`.
  const uso: Uso = { ...USO_ZERO, input: data?.usage?.prompt_tokens ?? 0, output: data?.usage?.completion_tokens ?? 0 }
  if (!data?.choices || data.choices.length === 0) {
    throw Object.assign(new Error(`OpenAI sem choices: ${JSON.stringify(data).slice(0, 300)} ${lastError.slice(0, 300)}`), { uso })
  }
  return { texto: data.choices[0].message.content ?? '', uso }
}

type Chamada = {
  provedor: 'anthropic' | 'openai'
  modelo: string
  esforco: string | null
  conta: number | null // conta da Anthropic (null no gpt)
  // Promessa: o Claude abandonado por demora só informa o uso quando termina.
  uso: Promise<Uso>
  duracaoMs: Promise<number>
  motivo: string | null
}

/**
 * Analisa o produto: Claude primeiro (se a config e o teto deixarem), gpt-5.4-mini como
 * reserva. `result` = JSON da análise, ou null se as duas falharam (a função devolve 500,
 * como antes). `registrarCusto` grava uma linha por chamada em `ia_custos`.
 */
export async function analisar(args: {
  supabase: Supabase
  userId: string
  systemPrompt: string
  texto: string
  imagens: Imagem[]
}): Promise<{ result: any | null; registrarCusto: () => Promise<void> }> {
  const { supabase, userId, systemPrompt, texto, imagens } = args
  const cfg = await lerConfig(supabase)
  const chamadas: Chamada[] = []
  let result: any = null

  let motivo: string | null = null
  let contas: Awaited<ReturnType<typeof contasDisponiveis>>['contas'] = []
  if (cfg.provedor === 'openai') motivo = 'config_openai'
  else {
    const disp = await contasDisponiveis(supabase)
    contas = disp.contas
    if (contas.length === 0) motivo = `sem_conta_anthropic: ${disp.motivo ?? ''}`
  }

  for (const conta of contas) {
    const inicio = Date.now()
    // A chamada segue até o fim mesmo se pararmos de esperar por ela (custo exato).
    const promessa = chamarClaude(cfg, conta.apiKey, systemPrompt, texto, imagens)
    const chamada: Chamada = {
      provedor: 'anthropic', modelo: cfg.modelo, esforco: cfg.esforco, conta: conta.id,
      uso: promessa.then((c) => c.uso, (e) => (e as { uso?: Uso })?.uso ?? { ...USO_ZERO }),
      duracaoMs: promessa.then(() => Date.now() - inicio, () => Date.now() - inicio),
      motivo: null,
    }
    chamadas.push(chamada)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const c = await Promise.race([
        promessa,
        new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('demora')), cfg.esperaMs) }),
      ])
      try {
        result = lerResultado(c.texto)
      } catch (e) {
        throw new Error(`json_ilegivel: ${(e as Error)?.message ?? e}`)
      }
      break
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      const status = (e as { status?: number })?.status
      const problema = problemaDaConta(e)
      if (problema) {
        // Problema da CONTA (crédito ou chave): sai da fila e a mesma análise vai para a próxima.
        await marcarProblema(supabase, conta.id, problema, `${status ?? ''} ${msg}`.trim())
        motivo = `${problema}_conta_${conta.id}`
        chamada.motivo = `abandonada: ${motivo}`
        console.warn('analisar-produto/roteador: conta da Anthropic fora da fila —', conta.id, problema)
        continue
      }
      motivo = msg === 'demora' || msg === 'recusa' || msg === 'cortada' || msg.startsWith('json_ilegivel')
        ? msg.slice(0, 200)
        : `erro_anthropic${status ? `_${status}` : ''}: ${msg.slice(0, 200)}`
      chamada.motivo = `abandonada: ${motivo}`
      console.warn('analisar-produto/roteador: Claude falhou, indo para o gpt-5.4-mini —', motivo)
      break
    } finally {
      clearTimeout(timer)
    }
  }

  if (!result) {
    const inicio = Date.now()
    let uso: Uso = { ...USO_ZERO }
    try {
      const o = await chamarOpenAI(systemPrompt, texto, imagens)
      uso = o.uso
      result = extractJSON(o.texto) // como antes da troca: sem conferir o `status`
    } catch (e) {
      const usoErro = (e as { uso?: Uso })?.uso
      if (usoErro) uso = usoErro
      console.error('analisar-produto/roteador: gpt-5.4-mini também falhou', e)
    }
    chamadas.push({
      provedor: 'openai', modelo: MODELO_OPENAI, esforco: null, conta: null,
      uso: Promise.resolve(uso), duracaoMs: Promise.resolve(Date.now() - inicio), motivo,
    })
  }

  const registrarCusto = async () => {
    try {
      const linhas = await Promise.all(chamadas.map(async (c) => {
        const u = await c.uso
        return {
          funcao: 'analisar-produto',
          user_id: userId,
          provedor: c.provedor,
          modelo: c.modelo,
          esforco: c.esforco,
          input_tokens: u.input,
          cache_write_tokens: u.cacheWrite + u.cacheWrite1h,
          cache_read_tokens: u.cacheRead,
          output_tokens: u.output,
          custo_usd: Number(custoUsd(c.modelo, u).toFixed(6)),
          duracao_ms: await c.duracaoMs,
          fallback_motivo: c.motivo,
          rodadas: 1,
          uso_estimado: !!u.estimado,
          anthropic_conta: c.conta,
        }
      }))
      const { error } = await supabase.from('ia_custos').insert(linhas)
      if (error) console.error('analisar-produto/roteador: falha ao gravar ia_custos', error)
    } catch (e) {
      console.error('analisar-produto/roteador: registrarCusto falhou', e)
    }
  }

  return { result, registrarCusto }
}
