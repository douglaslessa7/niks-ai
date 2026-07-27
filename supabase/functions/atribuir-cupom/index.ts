// atribuir-cupom
// Completa a aplicação de cupom com o user_id REAL, depois que a usuária se identifica.
//
// Contexto: o cupom é aplicado ANTES do signup (usuária anônima, RevenueCat anônimo).
// A linha em cupom_aplicacoes fica com user_id NULL e rc_app_user_id = o id anônimo do
// momento. Quando a identidade real é resolvida (signup, ou usuária que já tinha conta
// e reassina), o app chama esta função com o rc_app_user_id GUARDADO (não o atual):
// assim NÃO depende da ordem do Purchases.logIn, que troca o id do RevenueCat.
//
// Responsabilidade: SÓ liga o user_id. A CONVERSÃO (converteu=true) é marcada pelo
// revenuecat-webhook, que é mais confiável (sobrevive ao app fechar) e sabe pelo
// product_id que a compra veio de cupom. Divisão de responsabilidades de propósito.
//
// Idempotente: só liga quando ainda está NULL; rodar de novo não muda nada e não toca
// no contador de conversões. Nunca deve travar o signup — o app chama sem bloquear.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user_id, rc_app_user_id, codigo } = await req.json().catch(() => ({}))

    if (!user_id || typeof user_id !== 'string' || !UUID_REGEX.test(user_id)) {
      return json({ error: 'user_id inválido' }, 400)
    }
    if (!rc_app_user_id || typeof rc_app_user_id !== 'string') {
      return json({ error: 'rc_app_user_id é obrigatório' }, 400)
    }
    const codigoNorm = typeof codigo === 'string' ? codigo.trim().toUpperCase() : ''
    if (!codigoNorm) return json({ error: 'codigo é obrigatório' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Resolve o cupom exato que a usuária usou (o app manda o código guardado) — assim
    // a atribuição é precisa mesmo que ela tenha testado mais de um cupom.
    const { data: cupom } = await supabase
      .from('cupons')
      .select('id')
      .eq('codigo', codigoNorm)
      .maybeSingle()

    // Cupom sumiu do banco: nada a ligar, mas não é erro do fluxo.
    if (!cupom) return json({ ok: true, linked: false })

    // Liga o user_id só se ainda estiver NULL (idempotente; não sobrescreve).
    const { data: updated, error } = await supabase
      .from('cupom_aplicacoes')
      .update({ user_id })
      .eq('cupom_id', cupom.id)
      .eq('rc_app_user_id', rc_app_user_id)
      .is('user_id', null)
      .select('id')

    if (error) throw error

    return json({ ok: true, linked: (updated?.length ?? 0) > 0 })
  } catch (err) {
    console.error('[atribuir-cupom] erro:', err)
    // Mesmo em erro, não é papel desta função travar nada — o app chama sem bloquear.
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
