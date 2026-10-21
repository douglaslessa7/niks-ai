// Preços e tipo de uso comuns a todas as funções com IA (out/2026). O limite de gasto da
// Anthropic é por conta, em _shared/anthropic-contas.ts.

// deno-lint-ignore no-explicit-any
type Supabase = any

// `estimado`: a chamada foi cortada antes de a API informar o uso — os números são um piso.
export type Uso = { input: number; cacheWrite: number; cacheWrite1h: number; cacheRead: number; output: number; estimado?: boolean }
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
