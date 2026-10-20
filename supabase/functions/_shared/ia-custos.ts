// Preços e teto ÚNICO da Anthropic, comuns a todas as funções com IA (out/2026).
// Teto: ia_config.limite_mensal_anthropic_usd (US$ 199) contra o gasto do mês de TODA a
// Anthropic — gasto_ia_mes('anthropic') soma chat + analisar-produto + o que vier depois.
// Passou → toda função usa o gpt-5.4-mini até o dia 1º seguinte (mês de Brasília).

// deno-lint-ignore no-explicit-any
type Supabase = any

export type Uso = { input: number; cacheWrite: number; cacheWrite1h: number; cacheRead: number; output: number }
export const USO_ZERO: Uso = { input: 0, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 }

export const MODELO_OPENAI = 'gpt-5.4-mini'

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

const TETO_PADRAO_USD = 199

// Leituras guardadas por 60 s em cada instância da função: mudar o teto vale em ≤ 1 min.
const CACHE_MS = 60_000
let tetoCache: { em: number; valor: number } | null = null
let gastoCache: { em: number; valor: number } | null = null

async function lerTeto(supabase: Supabase): Promise<number> {
  if (tetoCache && Date.now() - tetoCache.em < CACHE_MS) return tetoCache.valor
  let valor = TETO_PADRAO_USD
  try {
    const { data, error } = await supabase.from('ia_config').select('limite_mensal_anthropic_usd').eq('id', 1).maybeSingle()
    if (error) throw error
    if (data) valor = Number(data.limite_mensal_anthropic_usd ?? TETO_PADRAO_USD)
  } catch (e) {
    console.error('ia-custos: ia_config ilegível, usando o teto padrão', e)
  }
  tetoCache = { em: Date.now(), valor }
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
    console.error('ia-custos: gasto do mês ilegível (segue sem teto nesta leitura)', e)
  }
  gastoCache = { em: Date.now(), valor }
  return valor
}

/** O gasto da Anthropic no mês (todas as funções) já chegou ao teto global? */
export async function tetoAnthropicAtingido(supabase: Supabase): Promise<boolean> {
  const [teto, gasto] = await Promise.all([lerTeto(supabase), gastoAnthropicMes(supabase)])
  return gasto >= teto
}
