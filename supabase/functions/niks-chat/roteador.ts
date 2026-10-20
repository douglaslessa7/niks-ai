import { geminiModel, type ChamadaFerramenta, type Uso } from './model.ts'
import { ClaudeModel, temChaveAnthropic, type ConfigClaude } from './claude.ts'

// Escolhe quem responde a mensagem do NIKS Chat (out/2026):
//   1. `chat_config.provedor = 'openai'`        → gpt-5.4-mini (chave de troca SEM deploy);
//   2. gasto da Anthropic no mês ≥ teto         → gpt-5.4-mini até o dia 1º seguinte;
//   3. senão Claude; erro/recusa antes do primeiro texto ou demora > espera_primeiro_texto_ms
//      → a MESMA mensagem vai para o gpt-5.4-mini, sem a usuária perceber.
// Cada chamada vira uma linha em `ia_custos` (registrarCusto, chamado no waitUntil).

// Cliente sem schema tipado (como em protocol-actions.ts): as tabelas novas não existem nos tipos.
// deno-lint-ignore no-explicit-any
type Supabase = any

type ChatConfig = ConfigClaude & {
  provedor: 'anthropic' | 'openai'
  limiteMensalUsd: number
  esperaPrimeiroTextoMs: number
}

const PADRAO: ChatConfig = {
  provedor: 'anthropic',
  modelo: 'claude-sonnet-5-5',
  esforco: 'low',
  cacheTtl: '5m',
  limiteMensalUsd: 120,
  esperaPrimeiroTextoMs: 20000,
}

const MODELO_OPENAI = 'gpt-5.4-mini'

// US$ por 1 milhão de tokens. Sonnet 5.5: leitura de cache = 5% da entrada (doc, out/2026).
const PRECOS: Record<string, { input: number; output: number; cacheWrite: number; cacheWrite1h: number; cacheRead: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheWrite1h: 4, cacheRead: 0.10 },
  [MODELO_OPENAI]: { input: 0.75, output: 4.5, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0 },
}

export function custoUsd(modelo: string, u: Uso): number {
  const p = PRECOS[modelo] ?? PRECOS['claude-sonnet-5-5'] // modelo desconhecido: preço do Sonnet (nunca 0)
  return (u.input * p.input + u.output * p.output + u.cacheWrite * p.cacheWrite +
    u.cacheWrite1h * p.cacheWrite1h + u.cacheRead * p.cacheRead) / 1_000_000
}

// Leituras guardadas por 60 s em cada instância da função: a troca de provedor vale em ≤ 1 min.
const CACHE_MS = 60_000
let configCache: { em: number; valor: ChatConfig } | null = null
let gastoCache: { em: number; valor: number } | null = null

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
        limiteMensalUsd: Number(data.limite_mensal_usd ?? PADRAO.limiteMensalUsd),
        esperaPrimeiroTextoMs: Number(data.espera_primeiro_texto_ms ?? PADRAO.esperaPrimeiroTextoMs),
      }
    }
  } catch (e) {
    console.error('niks-chat/roteador: chat_config ilegível, usando o padrão', e)
  }
  configCache = { em: Date.now(), valor }
  return valor
}

async function gastoAnthropicMes(supabase: Supabase): Promise<number> {
  if (gastoCache && Date.now() - gastoCache.em < CACHE_MS) return gastoCache.valor
  let valor = 0
  try {
    const { data, error } = await supabase.rpc('gasto_ia_mes', { p_provedor: 'anthropic' })
    if (error) throw error
    valor = Number(data ?? 0)
  } catch (e) {
    console.error('niks-chat/roteador: gasto do mês ilegível (segue sem teto nesta leitura)', e)
  }
  gastoCache = { em: Date.now(), valor }
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
}

export async function responder(args: {
  supabase: Supabase
  userId: string
  systemPrompt: string
  contextPack: string
  images?: Array<{ base64: string; mimeType: string }>
  tools: unknown[]
}): Promise<{
  stream: ReadableStream<Uint8Array>
  ferramentas: Promise<ChamadaFerramenta[]>
  registrarCusto: () => Promise<void>
}> {
  const { supabase, userId, systemPrompt, contextPack, images, tools } = args
  const cfg = await lerConfig(supabase)
  const chamadas: Chamada[] = []

  let motivo: string | null = null
  if (cfg.provedor === 'openai') motivo = 'config_openai'
  else if (!temChaveAnthropic()) motivo = 'sem_chave_anthropic'
  else if ((await gastoAnthropicMes(supabase)) >= cfg.limiteMensalUsd) motivo = 'teto_mensal'

  let escolhido: { stream: ReadableStream<Uint8Array>; ferramentas: Promise<ChamadaFerramenta[]> } | null = null

  if (!motivo) {
    const inicio = Date.now()
    const c = new ClaudeModel(cfg).stream(systemPrompt, contextPack, images, tools)
    const chamada: Chamada = {
      provedor: 'anthropic', modelo: cfg.modelo, esforco: cfg.esforco, uso: c.uso, inicio,
      primeiroTextoMs: null, fim: c.uso.then(() => Date.now()), motivo: null,
    }
    chamadas.push(chamada)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        c.primeiro,
        new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('demora')), cfg.esperaPrimeiroTextoMs) }),
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
        }
      }))
      const { error } = await supabase.from('ia_custos').insert(linhas)
      if (error) console.error('niks-chat/roteador: falha ao gravar ia_custos', error)
    } catch (e) {
      console.error('niks-chat/roteador: registrarCusto falhou', e)
    }
  }

  return { stream: escolhido.stream, ferramentas: escolhido.ferramentas, registrarCusto }
}
