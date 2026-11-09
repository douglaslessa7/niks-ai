import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT } from '../_shared/jwt.ts'
import { registrarDivergencia, verificarAssinatura } from '../_shared/assinatura.ts'

// Assinatura conferida no servidor (migration 20261105120000). Sempre com o JWT da
// usuária; o user_id vem do token.
//   { acao: 'vincular', rc_id }  → liga à conta as compras feitas com o id anônimo do
//       RevenueCat dela (customerInfo.originalAppUserId — a compra acontece ANTES da
//       conta). Um id já ligado a outra conta não muda de dona.
//   { acao: 'conferir', rc_id?, superwall_id?, premium? } → a cada abertura do app (Parte B,
//       Fase 0A): liga as compras pelos ids que ela tem no aparelho e registra se o app e o
//       servidor discordam.
//   { acao: 'discordancia_rc', rc, superwall } → Fase 0C: o RevenueCat discordou do portão.
//   { acao: 'status' }           → { assinante } segundo o servidor.
// Saída: 200 JSON · 400 entrada inválida · 401 sem JWT válido.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Só ids anônimos de compra: o UUID da conta não precisa de vínculo, e aceitar um UUID
// qualquer permitiria tomar compras de outra pessoa.
const ID_DE_COMPRA = /^\$(RCAnonymousID|SuperwallAlias):/

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const jwtPayload = await verifyJWT(authHeader.slice(7))
  if (!jwtPayload?.sub) return json({ error: 'Unauthorized' }, 401)
  const userId = jwtPayload.sub

  const body = await req.json().catch(() => ({}))
  const acao = String(body?.acao ?? '')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  try {
    if (acao === 'vincular') {
      const rcId = typeof body?.rc_id === 'string' ? body.rc_id.trim() : ''
      if (rcId.length < 8 || rcId.length > 200) return json({ error: 'rc_id inválido' }, 400)
      const { data, error } = await supabase.rpc('vincular_rc', { p_uid: userId, p_rc_id: rcId })
      if (error) throw error
      return json(data)
    }
    if (acao === 'conferir') {
      const appPremium = typeof body?.premium === 'boolean' ? body.premium : null
      let motivoVinculo: string | null = null
      for (const bruto of [body?.rc_id, body?.superwall_id]) {
        const id = typeof bruto === 'string' ? bruto.trim() : ''
        if (!ID_DE_COMPRA.test(id) || id.length > 200) continue
        const { data, error } = await supabase.rpc('vincular_rc', { p_uid: userId, p_rc_id: id })
        if (error) throw error
        if (data && data.ok === false) motivoVinculo = String(data.motivo ?? 'sem motivo')
      }
      const assinante = await verificarAssinatura(supabase, userId)
      if ((appPremium !== null && appPremium !== assinante) || motivoVinculo) {
        await registrarDivergencia(supabase, userId, 'abertura', assinante, appPremium, motivoVinculo)
      }
      return json({ ok: true, assinante })
    }
    if (acao === 'discordancia_rc') {
      const rc = typeof body?.rc === 'boolean' ? body.rc : null
      const superwall = ['ACTIVE', 'INACTIVE'].includes(body?.superwall) ? body.superwall : 'sem resposta'
      const servidor = await verificarAssinatura(supabase, userId)
      await registrarDivergencia(supabase, userId, 'rc_discordou', servidor, rc, `superwall=${superwall}`)
      return json({ ok: true })
    }
    if (acao === 'status') {
      const { data, error } = await supabase.rpc('assinante', { p_uid: userId })
      if (error) throw error
      return json({ assinante: data === true })
    }
    return json({ error: 'acao inválida' }, 400)
  } catch (e) {
    console.error('[assinatura]', (e as Error).message)
    return json({ error: 'Erro interno' }, 500)
  }
})
