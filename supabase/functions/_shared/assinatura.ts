// Assinatura conferida no servidor (Parte B, Fase 0A; migration 20261119120000).
// A fonte é `assinante()`, alimentada pelos eventos do Superwall em `assinaturas_loja`.
//
// `exigirAssinante`: a trava das funções de IA (ligada só na Fase 8). Secret
// ASSINATURA_TRAVA: 'AVISAR' (padrão; só registra quem seria bloqueada) ou 'BLOQUEAR'.

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
    console.error('[assinatura] conferência:', (e as Error).message)
    return { permitido: !bloquear }
  }
  if (assinante) return { permitido: true }
  await registrarDivergencia(supabase, uid, funcao, false, null)
  return { permitido: !bloquear }
}
