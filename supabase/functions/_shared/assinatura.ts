// Assinatura conferida no servidor (Parte B, Fase 0A; migration 20261119120000).
// A fonte é `assinante()`, alimentada pelos eventos do Superwall em `assinaturas_loja`.
//
// `exigirAssinante`: a trava das funções de IA (ligada só na Fase 8). Secret
// ASSINATURA_TRAVA: 'AVISAR' (padrão; só registra quem seria bloqueada) ou 'BLOQUEAR'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT } from './jwt.ts'

// deno-lint-ignore no-explicit-any
type Supa = any

export async function verificarAssinatura(supabase: Supa, uid: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('assinante', { p_uid: uid })
  if (error) throw error
  return data === true
}

export async function registrarDivergencia(
  supabase: Supa,
  uid: string,
  origem: string,
  servidor: boolean,
  appPremium: boolean | null,
  motivoVinculo: string | null = null,
): Promise<void> {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const { error } = await supabase.from('assinatura_divergencias').upsert({
    user_id: uid,
    dia,
    origem,
    app_premium: appPremium,
    servidor,
    motivo_vinculo: motivoVinculo,
    ultimo_em: new Date().toISOString(),
  })
  if (error) console.error('[assinatura] divergência:', error.message)
}

/** Trava das funções de IA. Em AVISAR, sempre permite e só registra. */
export async function exigirAssinante(supabase: Supa, uid: string, funcao: string): Promise<{ permitido: boolean }> {
  const bloquear = Deno.env.get('ASSINATURA_TRAVA') === 'BLOQUEAR'
  let assinante: boolean
  try {
    assinante = await verificarAssinatura(supabase, uid)
  } catch (e) {
    // Falha na verificação não pode tirar a IA de quem paga.
    console.error('[assinatura] conferência:', (e as Error).message)
    return { permitido: true }
  }
  if (assinante) return { permitido: true }
  await registrarDivergencia(supabase, uid, funcao, false, null)
  return { permitido: !bloquear }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

/** `null` = pode seguir. Em BLOQUEAR, quem não assina recebe 403 `assinatura`. */
export async function travaAssinatura(uid: string, funcao: string): Promise<Response | null> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const { permitido } = await exigirAssinante(supabase, uid, funcao)
  return permitido ? null : new Response(JSON.stringify({ error: 'assinatura' }), { status: 403, headers: CORS })
}

/** Id da usuária quando há sessão. A anon key não tem `sub`, então volta `null`. */
export async function uidDaSessao(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? ''
  const jwt = auth.startsWith('Bearer ') ? await verifyJWT(auth.slice(7)) : null
  return jwt?.sub ?? null
}

/** Só confere quando há sessão de usuária. */
export async function travaSeHouverSessao(req: Request, funcao: string): Promise<Response | null> {
  const uid = await uidDaSessao(req)
  return uid ? travaAssinatura(uid, funcao) : null
}
