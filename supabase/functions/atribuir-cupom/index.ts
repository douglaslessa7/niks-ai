// atribuir-cupom
// Completa a aplicação de cupom com o user_id REAL, depois que a usuária se identifica.
//
// Contexto: o cupom é aplicado ANTES do signup (usuária anônima, RevenueCat anônimo).
// A linha em cupom_aplicacoes fica com user_id NULL e rc_app_user_id = o id anônimo do
// momento. Quando a identidade real é resolvida (signup, ou usuária que já tinha conta
// e reassina), o app chama esta função com o rc_app_user_id GUARDADO (não o atual):
// assim NÃO depende da ordem do Purchases.logIn, que troca o id do RevenueCat.
//
// Responsabilidade: liga o user_id E marca converteu=true (a compra já aconteceu quando
// esta função é chamada — o app só chama pós-assinatura). O webhook também marca a
// conversão no caso comum, mas ele casa a linha só pelo app_user_id da compra; se o id
// do RevenueCat MUDOU entre aplicar o cupom e comprar (um Purchases.logIn no meio), o
// webhook não acha a linha. Por isso o app marca converteu aqui também — ele acha a
// linha de forma confiável pelo rc_app_user_id GUARDADO. Os dois são idempotentes: o
// contador só sobe no false→true do trigger, rodar 2× não infla.
//
// Nunca deve travar o signup — o app chama sem bloquear.

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

    // Liga o user_id e marca convertida. Sem guard de `user_id is null`: a conversão
    // precisa ser marcada mesmo que o user_id já tenha sido ligado antes. Idempotente:
    // reescrever o mesmo user_id não muda nada, e o contador só sobe no false→true do
    // trigger. Casa a linha pelo cupom + o rc_app_user_id GUARDADO (o do momento da
    // aplicação), então independe do id ter mudado até a compra.
    const { data: updated, error } = await supabase
      .from('cupom_aplicacoes')
      .update({ user_id, converteu: true })
      .eq('cupom_id', cupom.id)
      .eq('rc_app_user_id', rc_app_user_id)
      .select('id')

    if (error) throw error

    return json({ ok: true, linked: (updated?.length ?? 0) > 0 })
  } catch (err) {
    console.error('[atribuir-cupom] erro:', err)
    // Mesmo em erro, não é papel desta função travar nada — o app chama sem bloquear.
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
