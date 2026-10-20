import { geminiModel, type ChamadaFerramenta, type Uso } from './model.ts'
import { ClaudeModel, temChaveAnthropic, type ConfigClaude, type Consultas, type RegistroFerramenta } from './claude.ts'
import { custoUsd, MODELO_OPENAI, tetoAnthropicAtingido } from '../_shared/ia-custos.ts'

// Escolhe quem responde a mensagem do NIKS Chat (out/2026):
//   1. `chat_config.provedor = 'openai'`        → gpt-5.4-mini (chave de troca SEM deploy);
//   2. gasto da Anthropic no mês (TODAS as funções) ≥ teto global (ia_config, _shared/ia-custos.ts)
//                                               → gpt-5.4-mini até o dia 1º seguinte;
//   3. senão Claude; erro/recusa antes do primeiro texto ou demora > espera_primeiro_texto_ms
//      → a MESMA mensagem vai para o gpt-5.4-mini, sem a usuária perceber.
// Cada chamada vira uma linha em `ia_custos` (registrarCusto, chamado no waitUntil).

// Cliente sem schema tipado (como em protocol-actions.ts): as tabelas novas não existem nos tipos.
// deno-lint-ignore no-explicit-any
type Supabase = any

type ChatConfig = ConfigClaude & {
  provedor: 'anthropic' | 'openai'
  esperaPrimeiroTextoMs: number
}

const PADRAO: ChatConfig = {
  provedor: 'anthropic',
  modelo: 'claude-sonnet-5-5',
  esforco: 'low',
  cacheTtl: '5m',
  esperaPrimeiroTextoMs: 20000,
}

// Espera máxima pelo 1º texto quando o Claude já está consultando (cabe nos 90 s do app,
// com folga para um eventual fallback).
const ESPERA_COM_CONSULTA_MS = 45_000

// Leitura guardada por 60 s em cada instância da função: a troca de provedor vale em ≤ 1 min.
const CACHE_MS = 60_000
let configCache: { em: number; valor: ChatConfig } | null = null

async function lerConfig(supabase: Supabase): Promise<ChatConfig> {
  if (configCache && Date.now() - configCache.em < CACHE_MS) return configCache.valor
  let valor = PADRAO
  try {
    const { data, error } = await supabase.from('chat_config').select('*').eq('id', 1).maybeSingle()
    if (error) throw error
    if (data) {
      valor = {
        provedor: data.provedor === 'openai' ? 'openai' : 'anthropic',
        modelo: data.anthropic_modelo ?? PADRAO.modelo,
        esforco: data.esforco ?? PADRAO.esforco,
        cacheTtl: data.cache_ttl === '1h' ? '1h' : '5m',
        esperaPrimeiroTextoMs: Number(data.espera_primeiro_texto_ms ?? PADRAO.esperaPrimeiroTextoMs),
      }
    }
  } catch (e) {
    console.error('niks-chat/roteador: chat_config ilegível, usando o padrão', e)
  }
  configCache = { em: Date.now(), valor }
  return valor
}

type Chamada = {
  provedor: 'anthropic' | 'openai'
  modelo: string
  esforco: string | null
  uso: Promise<Uso>
  inicio: number
  primeiroTextoMs: number | null
  fim: Promise<number>
  motivo: string | null
  // Só no Claude: consultas feitas e idas ao modelo. O gpt (reserva) não consulta.
  registros?: Promise<RegistroFerramenta[]>
  rodadas?: Promise<number>
}

export async function responder(args: {
  supabase: Supabase
  userId: string
  systemPrompt: string
  contextPack: string
  images?: Array<{ base64: string; mimeType: string }>
  tools: unknown[]
  // Consultas do agente (só o Claude usa; a reserva gpt-5.4-mini segue no modo de antes).
  consultas?: Consultas
}): Promise<{
  stream: ReadableStream<Uint8Array>
  ferramentas: Promise<ChamadaFerramenta[]>
  registrarCusto: () => Promise<void>
}> {
  const { supabase, userId, systemPrompt, contextPack, images, tools, consultas } = args
  const cfg = await lerConfig(supabase)
  const chamadas: Chamada[] = []

  let motivo: string | null = null
  if (cfg.provedor === 'openai') motivo = 'config_openai'
  else if (!temChaveAnthropic()) motivo = 'sem_chave_anthropic'
  else if (await tetoAnthropicAtingido(supabase)) motivo = 'teto_mensal'

  let escolhido: { stream: ReadableStream<Uint8Array>; ferramentas: Promise<ChamadaFerramenta[]> } | null = null

  if (!motivo) {
    const inicio = Date.now()
    const c = new ClaudeModel(cfg).stream(systemPrompt, contextPack, images, tools, consultas)
    const chamada: Chamada = {
      provedor: 'anthropic', modelo: cfg.modelo, esforco: cfg.esforco, uso: c.uso, inicio,
      primeiroTextoMs: null, fim: c.uso.then(() => Date.now()), motivo: null,
      registros: c.registros, rodadas: c.rodadas,
    }
    chamadas.push(chamada)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      // Espera pelo 1º texto: `espera_primeiro_texto_ms` (20 s); se ela já pediu uma consulta,
      // até ESPERA_COM_CONSULTA_MS — consultando sem a frase antes (e com o cache frio) ela
      // passava dos 20 s e o trabalho ia fora, com o gpt respondendo sem os dados.
      await Promise.race([
        c.primeiro,
        new Promise<never>((_, rej) => {
          const checar = () => {
            const prazo = inicio + (c.pediuConsulta()
              ? Math.max(cfg.esperaPrimeiroTextoMs, ESPERA_COM_CONSULTA_MS)
              : cfg.esperaPrimeiroTextoMs)
            const falta = prazo - Date.now()
            if (falta <= 0) rej(new Error('demora'))
            else timer = setTimeout(checar, falta)
          }
          timer = setTimeout(checar, cfg.esperaPrimeiroTextoMs)
        }),
      ])
      chamada.primeiroTextoMs = Date.now() - inicio
      escolhido = c
    } catch (e) {
      c.abortar()
      const msg = (e as Error)?.message ?? String(e)
      const status = (e as { status?: number })?.status
      motivo = msg === 'demora' ? 'demora' : `erro_anthropic${status ? `_${status}` : ''}: ${msg.slice(0, 200)}`
      chamada.motivo = `abandonada: ${motivo}`
      console.warn('niks-chat/roteador: Claude falhou, indo para o gpt-5.4-mini —', motivo)
    } finally {
      clearTimeout(timer)
    }
  }

  if (!escolhido) {
    const inicio = Date.now()
    const o = await geminiModel.stream(systemPrompt, contextPack, images, tools)
    chamadas.push({
      provedor: 'openai', modelo: MODELO_OPENAI, esforco: null, uso: o.uso, inicio,
      primeiroTextoMs: null, fim: o.uso.then(() => Date.now()), motivo,
    })
    escolhido = o
  }

  const registrarCusto = async () => {
    try {
      const linhas = await Promise.all(chamadas.map(async (c) => {
        const u = await c.uso
        const fim = await c.fim
        return {
          funcao: 'niks-chat',
          user_id: userId,
          provedor: c.provedor,
          modelo: c.modelo,
          esforco: c.esforco,
          input_tokens: u.input,
          cache_write_tokens: u.cacheWrite + u.cacheWrite1h,
          cache_read_tokens: u.cacheRead,
          output_tokens: u.output,
          custo_usd: Number(custoUsd(c.modelo, u).toFixed(6)),
          primeiro_texto_ms: c.primeiroTextoMs,
          duracao_ms: fim - c.inicio,
          fallback_motivo: c.motivo,
          rodadas: c.rodadas ? await c.rodadas : 1,
        }
      }))
      const { error } = await supabase.from('ia_custos').insert(linhas)
      if (error) console.error('niks-chat/roteador: falha ao gravar ia_custos', error)

      // Consultas do agente (uma linha por consulta), inclusive as de um Claude abandonado.
      const consultasFeitas = (await Promise.all(chamadas.map((c) => c.registros ?? Promise.resolve([])))).flat()
      if (consultasFeitas.length) {
        const { error: errF } = await supabase.from('ia_ferramentas').insert(consultasFeitas.map((r) => ({
          funcao: 'niks-chat',
          user_id: userId,
          ferramenta: r.ferramenta,
          rodada: r.rodada,
          entrada: r.entrada,
          duracao_ms: r.duracaoMs,
          tamanho_resultado: r.tamanhoResultado,
          erro: r.erro,
        })))
        if (errF) console.error('niks-chat/roteador: falha ao gravar ia_ferramentas', errF)
      }
    } catch (e) {
      console.error('niks-chat/roteador: registrarCusto falhou', e)
    }
  }

  return { stream: escolhido.stream, ferramentas: escolhido.ferramentas, registrarCusto }
}
