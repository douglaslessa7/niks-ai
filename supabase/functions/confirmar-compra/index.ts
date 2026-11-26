import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT } from '../_shared/jwt.ts'
import { registrarDivergencia, verificarAssinatura } from '../_shared/assinatura.ts'

// Compra que o aparelho não confirma (correção 2b, 26/nov/2026; migration 20261230120000).
// O Superwall disse "comprou", mas no aparelho o status não ficou ativo. O app pergunta ao
// servidor se o webhook da loja já chegou com o id anônimo deste aparelho.
//   { superwall_id: '$SuperwallAlias:<uuid>', transferir?: 'compra' | 'restaurar' | 'cadastro' }
//   • SEM conta (paywall, antes do cadastro): compra dos últimos 15 min → { confirmado, produto }.
//     Só lê.
//   • COM conta (JWT da usuária, logo depois do cadastro): compra dos últimos 60 min; também liga a compra a esta conta
//     pela `comprovar_compra` (a mesma da prova da Apple). Compra de outra conta só muda de dona
//     com `transferir` (ela comprou neste aparelho nesta sessão).
//     → { confirmado, produto, ligada, assinante }
// Sem conta a função não devolve id de transação nem data: só "sim/não" e o produto.
// Saída: 200 JSON · 400 entrada inválida · 401 JWT presente e inválido.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const ALIAS = /^\$superwallalias:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ORIGENS_DE_TRANSFERENCIA = ['restaurar', 'compra', 'cadastro']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // O app sem conta manda a chave pública (anon) no Authorization: ela não tem `sub`.
  let userId: string | null = null
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const p = await verifyJWT(authHeader.slice(7)).catch(() => null)
    if (p?.sub) userId = p.sub
  }

  const body = await req.json().catch(() => ({}))
  const alias = typeof body?.superwall_id === 'string' ? body.superwall_id.trim() : ''
  if (!ALIAS.test(alias)) return json({ error: 'superwall_id inválido' }, 400)
  const origem = ORIGENS_DE_TRANSFERENCIA.includes(body?.transferir) ? String(body.transferir) : null

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  try {
    // Sem conta: 15 min (logo depois de pagar). Com conta: 60 min (o pós-compra vem antes do
    // cadastro e leva alguns minutos).
    const { data: c, error } = await supabase.rpc('compra_recente_superwall', { p_alias: alias, p_minutos: userId ? 60 : 15 })
    if (error) throw error
    const confirmado = c?.confirmado === true
    const produto = confirmado ? (c.produto ?? null) : null
    if (!userId) {
      console.log(`[confirmar-compra] sem conta · confirmado=${confirmado}${confirmado ? '' : ` · ${c?.motivo ?? ''}`}`)
      return json({ confirmado, produto })
    }

    let ligada = false
    if (confirmado) {
      const { data: l, error: e2 } = await supabase.rpc('comprovar_compra', {
        p_uid: userId,
        p_otid: c.otid,
        p_produto: c.produto,
        p_ambiente: c.ambiente,
        p_expira: c.expira_em,
        p_quando: new Date().toISOString(),
        p_transferir: origem !== null,
        p_origem: origem ? `superwall_${origem}` : null,
      })
      if (e2) throw e2
      ligada = l?.ok === true
      if (!ligada) {
        const servidor = await verificarAssinatura(supabase, userId)
        await registrarDivergencia(supabase, userId, 'compra_recente', servidor, null, String(l?.motivo ?? 'sem motivo'), c.otid)
      }
    }
    const assinante = await verificarAssinatura(supabase, userId)
    console.log(`[confirmar-compra] conta · confirmado=${confirmado} · ligada=${ligada} · assinante=${assinante}`)
    return json({ confirmado, produto, ligada, assinante })
  } catch (e) {
    console.error('[confirmar-compra]', (e as Error).message)
    return json({ error: 'Erro interno' }, 500)
  }
})
