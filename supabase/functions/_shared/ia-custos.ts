// Preços e tipo de uso comuns a todas as funções com IA (out/2026). O limite de gasto da
// Anthropic é por conta, em _shared/anthropic-contas.ts.

import { verifyJWT } from './jwt.ts'

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
  // Gemini API, prompts até 200k tokens; o raciocínio é cobrado como saída (pricing, nov/2026).
  'gemini-2.5-pro': { input: 1.25, output: 10, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0 },
}

export function custoUsd(modelo: string, u: Uso): number {
  const p = PRECOS[modelo] ?? PRECOS['claude-sonnet-5-5'] // modelo desconhecido: preço do Sonnet (nunca 0)
  return (u.input * p.input + u.output * p.output + u.cacheWrite * p.cacheWrite +
    u.cacheWrite1h * p.cacheWrite1h + u.cacheRead * p.cacheRead) / 1_000_000
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro de TODA chamada de IA em `ia_custos` (23/nov/2026)
// Regras: o registro NUNCA atrasa a resposta nem muda o que a função faz.
//   · As funções `registrar*` não são async e nunca lançam: disparam a gravação e a
//     entregam ao EdgeRuntime.waitUntil (segue em segundo plano, inclusive depois da
//     resposta). Falhou (rede, banco, JWT) → só console.error.
//   · A "parte" (onboarding/app) é decidida pelo BANCO no insert (gatilho
//     `ia_custos_parte` → `ja_assinou`: já assinou alguma vez = app). `parte: 'interno'`
//     só para trabalho de administrador (ex.: recortar-catalogo).
//   · Sem `userId`, passe `auth` (cabeçalho Authorization): o id sai do JWT em segundo
//     plano; anon key / sem sessão → user_id null → 'onboarding'.
//   · Chamada que voltou sem `usage` (erro da API) não é registrada: não é cobrada.
// Os três roteadores (niks-chat, analisar-produto, sos-espinha) e a identificação de
// ingredientes gravam pelo caminho deles (com a conta da Anthropic); o gatilho põe a parte.
// ─────────────────────────────────────────────────────────────────────────────

export type Provedor = 'openai' | 'anthropic' | 'google' | 'replicate'

export type RegistroIa = {
  funcao: string
  provedor: Provedor
  modelo: string
  userId?: string | null
  /** Cabeçalho Authorization da requisição (o id da usuária sai dele em segundo plano). */
  auth?: string | null
  uso?: Uso
  /** Quando o preço não sai da tabela por token (imagem, Replicate, moderação). */
  custoUsd?: number
  duracaoMs?: number
  esforco?: string
  parte?: 'interno'
}

export function registrarIa(r: RegistroIa): void {
  try {
    const p = gravarRegistro(r).catch((e) =>
      console.error('[ia-custos] registro não gravado', r.funcao, String((e as Error)?.message ?? e)))
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime
    if (rt?.waitUntil) rt.waitUntil(p)
  } catch (e) {
    console.error('[ia-custos] registro não gravado', r.funcao, String(e))
  }
}

async function gravarRegistro(r: RegistroIa): Promise<void> {
  let userId = r.userId ?? null
  if (!userId && r.auth?.startsWith('Bearer ')) userId = (await verifyJWT(r.auth.slice(7)))?.sub ?? null
  const u = r.uso ?? USO_ZERO
  const custo = r.custoUsd ?? custoUsd(r.modelo, u)
  const url = Deno.env.get('SUPABASE_URL')
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !chave) throw new Error('sem SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const res = await fetch(`${url}/rest/v1/ia_custos`, {
    method: 'POST',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      funcao: r.funcao,
      user_id: userId,
      provedor: r.provedor,
      modelo: r.modelo,
      esforco: r.esforco ?? null,
      input_tokens: Math.round(u.input),
      cache_write_tokens: Math.round(u.cacheWrite + u.cacheWrite1h),
      cache_read_tokens: Math.round(u.cacheRead),
      output_tokens: Math.round(u.output),
      custo_usd: Number((Number.isFinite(custo) ? custo : 0).toFixed(6)),
      duracao_ms: r.duracaoMs != null && Number.isFinite(r.duracaoMs) ? Math.round(r.duracaoMs) : null,
      uso_estimado: !!u.estimado,
      ...(r.parte ? { parte: r.parte } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

type Quem = { userId?: string | null; auth?: string | null; duracaoMs?: number; esforco?: string }

/**
 * Chat Completions da OpenAI. Mesma convenção dos roteadores: `cached_tokens` fica dentro
 * de `input`, sem desconto (o custo é um teto). `modelo` = o que a função pediu.
 */
export function registrarChatOpenAI(funcao: string, modelo: string, data: unknown, quem: Quem = {}): void {
  try {
    // deno-lint-ignore no-explicit-any
    const usage = (data as any)?.usage
    if (!usage || typeof usage !== 'object') return
    registrarIa({
      funcao, provedor: 'openai', modelo, ...quem,
      uso: { ...USO_ZERO, input: Number(usage.prompt_tokens) || 0, output: Number(usage.completion_tokens) || 0 },
    })
  } catch (e) {
    console.error('[ia-custos] registro não gravado', funcao, String(e))
  }
}

// gpt-image-2 (US$ por 1M tokens, pricing nov/2026): texto 5, imagem 8 na entrada; imagem 30 na saída.
const GPT_IMAGE_2 = { texto: 5, imagem: 8, saida: 30 }

/** Images API (gpt-image-2). Sem `usage` na resposta → linha com custo 0 e `uso_estimado`. */
export function registrarImagemOpenAI(funcao: string, modelo: string, data: unknown, quem: Quem = {}): void {
  try {
    // deno-lint-ignore no-explicit-any
    const usage = (data as any)?.usage
    if (!usage || typeof usage !== 'object') {
      registrarIa({ funcao, provedor: 'openai', modelo, ...quem, uso: { ...USO_ZERO, estimado: true }, custoUsd: 0 })
      return
    }
    const entrada = Number(usage.input_tokens) || 0
    const texto = Number(usage.input_tokens_details?.text_tokens) || 0
    const imagem = Number(usage.input_tokens_details?.image_tokens) || Math.max(0, entrada - texto)
    const saida = Number(usage.output_tokens) || 0
    registrarIa({
      funcao, provedor: 'openai', modelo, ...quem,
      uso: { ...USO_ZERO, input: entrada, output: saida },
      custoUsd: (texto * GPT_IMAGE_2.texto + imagem * GPT_IMAGE_2.imagem + saida * GPT_IMAGE_2.saida) / 1_000_000,
    })
  } catch (e) {
    console.error('[ia-custos] registro não gravado', funcao, String(e))
  }
}

/** Gemini (generateContent): o raciocínio (`thoughtsTokenCount`) entra como saída. */
export function registrarGemini(funcao: string, modelo: string, data: unknown, quem: Quem = {}): void {
  try {
    // deno-lint-ignore no-explicit-any
    const m = (data as any)?.usageMetadata
    if (!m || typeof m !== 'object') return
    registrarIa({
      funcao, provedor: 'google', modelo, ...quem,
      uso: {
        ...USO_ZERO,
        input: Number(m.promptTokenCount) || 0,
        output: (Number(m.candidatesTokenCount) || 0) + (Number(m.thoughtsTokenCount) || 0),
      },
    })
  } catch (e) {
    console.error('[ia-custos] registro não gravado', funcao, String(e))
  }
}

// Replicate cobra por segundo de GPU. sprited/birefnet roda em Nvidia L40S (pricing, nov/2026).
const REPLICATE_US_POR_SEGUNDO: Record<string, number> = { 'sprited/birefnet': 0.000975 }

/** Predição do Replicate (sucesso ou falha): custo = `metrics.predict_time` × preço do hardware. */
export function registrarReplicate(funcao: string, modelo: string, pred: unknown, quem: Quem & { parte?: 'interno' } = {}): void {
  try {
    // deno-lint-ignore no-explicit-any
    const s = Number((pred as any)?.metrics?.predict_time)
    if (!Number.isFinite(s) || s <= 0) return
    registrarIa({
      funcao, provedor: 'replicate', modelo, ...quem,
      duracaoMs: s * 1000,
      custoUsd: s * (REPLICATE_US_POR_SEGUNDO[modelo] ?? REPLICATE_US_POR_SEGUNDO['sprited/birefnet']),
    })
  } catch (e) {
    console.error('[ia-custos] registro não gravado', funcao, String(e))
  }
}
