// ─────────────────────────────────────────────────────────────────────────────
// apple-notificacoes (19/nov/2026) — recebe as App Store Server Notifications V2 do NIKS no
// lugar do Superwall, repassa TODAS, intactas, para a URL do Superwall, e responde os pedidos
// de reembolso (CONSUMPTION_REQUEST) conforme a chave `apple_reembolso_config.responder`.
//
// Deploy SEM verificação de JWT (quem chama é a Apple; a confiança vem da assinatura dela):
//   supabase functions deploy apple-notificacoes --no-verify-jwt --project-ref utpljvwmeyeqwrfulbfr
// Segredos: SUPERWALL_APPLE_URL (+ SUPERWALL_APPLE_URL_SANDBOX, se for outra), APPLE_IAP_KEY_P8,
//   APPLE_IAP_KEY_ID, APPLE_ISSUER_ID, APPLE_NOTIF_ADMIN_SECRET.
//
// Ações de administração (cabeçalho x-admin-secret = APPLE_NOTIF_ADMIN_SECRET), body JSON:
//   { acao: 'pendentes' }                          → tarefa agendada (a cada 15 min)
//   { acao: 'teste', ambiente: 'SANDBOX' }          → pede à Apple uma notificação de teste
//   { acao: 'status_teste', ambiente, token }       → tentativas de entrega dessa notificação
// ─────────────────────────────────────────────────────────────────────────────
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { lerJwsApple } from '../_shared/appleJws.ts'
import { credenciaisDoAmbiente, pedirNotificacaoTeste, statusNotificacaoTeste, type AmbienteApple } from '../_shared/appleApi.ts'
import { receber } from './nucleo.ts'
import { depsDoBanco, processarPedido, processarPendentes } from './banco.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

const REPASSE_TIMEOUT_MS = 10_000
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

/** Repasse ao Superwall: o mesmo corpo, intacto. Sem URL configurada → 0 (a Apple tenta de novo). */
async function repassar(raw: string, ambiente: AmbienteApple | null, contentType: string | null) {
  const url = (ambiente === 'SANDBOX' && Deno.env.get('SUPERWALL_APPLE_URL_SANDBOX')) || Deno.env.get('SUPERWALL_APPLE_URL')
  const t0 = Date.now()
  if (!url) return { status: 0, ms: 0 }
  try {
    const r = await fetch(url, {
      method: 'POST', body: raw, headers: { 'Content-Type': contentType || 'application/json' },
      signal: AbortSignal.timeout(REPASSE_TIMEOUT_MS),
    })
    await r.body?.cancel()
    return { status: r.status, ms: Date.now() - t0 }
  } catch (e) {
    console.error('APPLE_NOTIF repasse falhou', String(e))
    return { status: 0, ms: Date.now() - t0 }
  }
}

async function admin(req: Request): Promise<Response> {
  const segredo = Deno.env.get('APPLE_NOTIF_ADMIN_SECRET')
  if (!segredo || req.headers.get('x-admin-secret') !== segredo) return json({ error: 'não autorizado' }, 401)
  const body = await req.json().catch(() => ({}))
  const banco = db()
  if (body.acao === 'pendentes') return json({ ok: true, ...(await processarPendentes(banco)) })
  if (body.acao === 'pedido' && body.uuid) return json({ decisao: await processarPedido(banco, body.uuid) })
  const ambiente: AmbienteApple = body.ambiente === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX'
  const cred = credenciaisDoAmbiente()
  if (!cred) return json({ error: 'faltam os segredos da chave In-App Purchase' }, 500)
  if (body.acao === 'teste') return json(await pedirNotificacaoTeste(cred, ambiente))
  if (body.acao === 'status_teste' && body.token) return json(await statusNotificacaoTeste(cred, ambiente, body.token))
  return json({ error: 'ação desconhecida' }, 400)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 })
  if (req.headers.has('x-admin-secret')) return admin(req)

  // Notificação da Apple: lê o corpo CRU antes de qualquer coisa (o repasse manda igual).
  const raw = await req.text()
  const banco = db()
  const status = await receber(raw, {
    repassar: (r, amb) => repassar(r, amb, req.headers.get('content-type')),
    lerJws: (j) => lerJwsApple(j),
    ...depsDoBanco(banco),
    emSegundoPlano: (uuid) => EdgeRuntime.waitUntil(processarPedido(banco, uuid).catch((e) => console.error('APPLE_REEMBOLSO erro', uuid, e))),
  })
  return new Response(status === 200 ? 'ok' : 'tente de novo', { status })
})
