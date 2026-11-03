import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT } from '../_shared/jwt.ts'

// Assinatura conferida no servidor (migration 20261105120000). Sempre com o JWT da
// usuária; o user_id vem do token.
//   { acao: 'vincular', rc_id }  → liga à conta as compras feitas com o id anônimo do
//       RevenueCat dela (customerInfo.originalAppUserId — a compra acontece ANTES da
//       conta). Um id já ligado a outra conta não muda de dona.
//   { acao: 'status' }           → { assinante } segundo o servidor.
// Saída: 200 JSON · 400 entrada inválida · 401 sem JWT válido.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

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
