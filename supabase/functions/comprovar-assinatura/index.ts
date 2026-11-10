import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT } from '../_shared/jwt.ts'
import { validarJws } from '../_shared/appleJws.ts'
import { registrarDivergencia, verificarAssinatura } from '../_shared/assinatura.ts'

// Prova da Apple (Parte B, Fase 0B; migration 20261120120000). O app envia as transações
// assinadas do StoreKit; cada uma validada é ligada à conta do JWT.
//   { jws: string[], transferir?: 'restaurar' | 'compra' | 'cadastro' }
//     → { ok, ligadas, conflitos, invalidas, transferidas }
// Compra ligada a outra conta só muda de dona com `transferir` (a usuária comprou ou restaurou
// neste aparelho; migration 20261130120000). Sem ele, fica em `assinatura_divergencias`.
// Saída: 200 JSON · 400 entrada inválida · 401 sem JWT válido.

const BUNDLE_ID = 'br.com.niksai.app'
const MAXIMO = 5
const ORIGENS_DE_TRANSFERENCIA = ['restaurar', 'compra', 'cadastro']

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

serve(async (req) => {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const jwtPayload = await verifyJWT(authHeader.slice(7))
  if (!jwtPayload?.sub) return json({ error: 'Unauthorized' }, 401)
  const userId = jwtPayload.sub

  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body?.jws) || body.jws.length > MAXIMO) return json({ error: 'jws inválido' }, 400)
  const origem = ORIGENS_DE_TRANSFERENCIA.includes(body?.transferir) ? String(body.transferir) : null

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  try {
    let ligadas = 0, conflitos = 0, invalidas = 0, transferidas = 0
    let compraEmConflito: string | null = null
    for (const jws of body.jws) {
      const t = typeof jws === 'string' && jws.length < 20000 ? await validarJws(jws, BUNDLE_ID) : null
      if (!t) { invalidas++; continue }
      const { data, error } = await supabase.rpc('comprovar_compra', {
        p_uid: userId,
        p_otid: t.originalTransactionId,
        p_produto: t.productId,
        p_ambiente: t.ambiente,
        p_expira: t.expiraEm.toISOString(),
        p_quando: t.assinadoEm.toISOString(),
        p_transferir: origem !== null,
        p_origem: origem,
      })
      if (error) throw error
      if (data?.ok) {
        ligadas++
        if (data.transferida) transferidas++
      } else {
        conflitos++
        compraEmConflito = t.originalTransactionId
      }
    }
    if (conflitos) {
      const servidor = await verificarAssinatura(supabase, userId)
      await registrarDivergencia(supabase, userId, 'comprovante', servidor, null, 'compra de outra conta', compraEmConflito)
    }
    return json({ ok: true, ligadas, conflitos, invalidas, transferidas })
  } catch (e) {
    console.error('[comprovar-assinatura]', (e as Error).message)
    return json({ error: 'Erro interno' }, 500)
  }
})
