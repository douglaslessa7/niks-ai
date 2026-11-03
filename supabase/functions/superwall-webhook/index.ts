import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Eventos de loja do Superwall (formato do RevenueCat: INITIAL_PURCHASE, RENEWAL,
// CANCELLATION, EXPIRATION, BILLING_ISSUE…) → `registrar_evento_loja` (migration
// 20261105120000). É o que faz o servidor saber quem paga (`assinante(uid)`).
//
// Sem JWT (o Superwall não tem sessão): a trava é a ASSINATURA Svix — headers
// svix-id / svix-timestamp / svix-signature (ou webhook-*), HMAC-SHA256 em base64 de
// "<id>.<timestamp>.<corpo cru>" com o segredo do painel (SUPERWALL_WEBHOOK_SECRET,
// "whsec_…"). Timestamp com mais de 5 min de diferença é recusado (replay).
// Respostas: 200 (gravado, repetido ou ignorado) · 401 assinatura inválida ·
// 400 corpo inválido · 500 erro do banco (o Svix tenta de novo).

const TOLERANCIA_S = 5 * 60

function b64(bytes: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s)
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function assinaturaValida(req: Request, corpo: string): Promise<boolean> {
  const segredo = (Deno.env.get('SUPERWALL_WEBHOOK_SECRET') ?? '').replace(/^whsec_/, '')
  if (!segredo) return false
  const h = (n: string) => req.headers.get(`svix-${n}`) ?? req.headers.get(`webhook-${n}`)
  const id = h('id'), ts = h('timestamp'), sig = h('signature')
  if (!id || !ts || !sig) return false
  const agora = Math.floor(Date.now() / 1000)
  if (!/^\d+$/.test(ts) || Math.abs(agora - Number(ts)) > TOLERANCIA_S) return false
  let chave: Uint8Array
  try { chave = Uint8Array.from(atob(segredo), (c) => c.charCodeAt(0)) } catch { return false }
  const key = await crypto.subtle.importKey('raw', chave as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const esperado = b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${corpo}`)))
  // Na troca de segredo vêm várias: "v1,<a> v1,<b>".
  return sig.split(' ').some((p) => {
    const [ver, valor] = p.split(',')
    return ver === 'v1' && !!valor && iguais(valor, esperado)
  })
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('método', { status: 405 })
  const corpo = await req.text() // CRU: a assinatura é sobre os bytes recebidos
  if (!(await assinaturaValida(req, corpo))) return new Response('assinatura inválida', { status: 401 })

  let evento: unknown
  try { evento = JSON.parse(corpo) } catch { return new Response('json inválido', { status: 400 }) }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const { data, error } = await supabase.rpc('registrar_evento_loja', { p_evento: evento, p_origem: 'webhook' })
  if (error) {
    console.error('[superwall-webhook] registrar_evento_loja:', error.message)
    return new Response('erro', { status: 500 })
  }
  console.log('[superwall-webhook]', JSON.stringify(data))
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
