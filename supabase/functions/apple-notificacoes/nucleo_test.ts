import { assert, assertEquals } from 'jsr:@std/assert@1'
import { lerJwsApple } from '../_shared/appleJws.ts'
import { assinarJws, criarCadeia } from '../_shared/appleJws_testutil.ts'
import { enviarConsumo, tokenApple } from '../_shared/appleApi.ts'
import { CORPO_PADRAO, decidir, decisaoDaResposta, receber, type Contexto, type Deps } from './nucleo.ts'

const BUNDLE = 'br.com.niksai.app'
const cadeia = await criarCadeia()
const assina = (p: Record<string, unknown>) => assinarJws(cadeia, { signedDate: Date.now(), ...p })

async function notificacao(tipo: string, extra: Record<string, unknown> = {}, tx: Record<string, unknown> | null = {}) {
  const data: Record<string, unknown> = { bundleId: BUNDLE, environment: 'Sandbox', ...extra }
  if (tx) data.signedTransactionInfo = await assina({ bundleId: BUNDLE, transactionId: 't-2', originalTransactionId: 'o-1', productId: 'p', ...tx })
  return JSON.stringify({ signedPayload: await assina({ notificationType: tipo, notificationUUID: `uuid-${tipo}`, data }) })
}

function deps(over: Partial<Deps> = {}) {
  const log = { repasses: [] as string[], notifs: [] as any[], pedidos: [] as any[], desfechos: [] as any[], fundo: [] as string[] }
  const d: Deps = {
    repassar: async (raw) => { log.repasses.push(raw); return { status: 200, ms: 5 } },
    lerJws: (j) => lerJwsApple(j, cadeia.raizSha256),
    registrarNotificacao: async (n) => { log.notifs.push(n) },
    gravarPedido: async (p) => { log.pedidos.push(p); return true },
    marcarDesfecho: async (t, o, r) => { log.desfechos.push([t, o, r]) },
    emSegundoPlano: (u) => { log.fundo.push(u) },
    ...over,
  }
  return { d, log }
}

Deno.test('repassa o corpo INTACTO e responde 200', async () => {
  const raw = await notificacao('DID_RENEW')
  const { d, log } = deps()
  assertEquals(await receber(raw, d), 200)
  assertEquals(log.repasses, [raw])
  assertEquals(log.notifs[0].tipo, 'DID_RENEW')
  assertEquals(log.notifs[0].assinatura_ok, true)
})

Deno.test('repasse sem sucesso (erro ou demora) → 500, para a Apple tentar de novo', async () => {
  for (const status of [0, 404, 500, 503]) {
    const { d } = deps({ repassar: async () => ({ status, ms: 10_000 }) })
    assertEquals(await receber(await notificacao('SUBSCRIBED'), d), 500)
  }
})

Deno.test('assinatura que não é da Apple: repassa, registra como inválida e não cria pedido', async () => {
  const outra = await criarCadeia()
  const raw = JSON.stringify({ signedPayload: await assinarJws(outra, { notificationType: 'CONSUMPTION_REQUEST', notificationUUID: 'x', signedDate: Date.now(), data: { bundleId: BUNDLE } }) })
  const { d, log } = deps()
  assertEquals(await receber(raw, d), 200)
  assertEquals(log.repasses.length, 1)
  assertEquals(log.notifs[0].assinatura_ok, false)
  assertEquals(log.pedidos.length, 0)
})

Deno.test('notificação de outro app não cria pedido', async () => {
  const { d, log } = deps()
  assertEquals(await receber(await notificacao('CONSUMPTION_REQUEST', { bundleId: 'outro.app' }), d), 200)
  assertEquals(log.pedidos.length, 0)
})

Deno.test('corpo inválido: repassa assim mesmo e não quebra', async () => {
  const { d, log } = deps()
  assertEquals(await receber('não é json', d), 200)
  assertEquals(log.repasses, ['não é json'])
})

Deno.test('CONSUMPTION_REQUEST: grava o pedido (transação, motivo, ambiente) e responde em segundo plano', async () => {
  const { d, log } = deps()
  assertEquals(await receber(await notificacao('CONSUMPTION_REQUEST', { consumptionRequestReason: 'UNINTENDED_PURCHASE' }), d), 200)
  assertEquals(log.pedidos[0].transaction_id, 't-2')
  assertEquals(log.pedidos[0].original_transaction_id, 'o-1')
  assertEquals(log.pedidos[0].motivo, 'UNINTENDED_PURCHASE')
  assertEquals(log.pedidos[0].ambiente, 'SANDBOX')
  assertEquals(log.fundo, ['uuid-CONSUMPTION_REQUEST'])
})

Deno.test('CONSUMPTION_REQUEST que não deu para gravar → 500 (a Apple manda de novo)', async () => {
  const { d } = deps({ gravarPedido: async () => false })
  assertEquals(await receber(await notificacao('CONSUMPTION_REQUEST'), d), 500)
})

Deno.test('desfecho: REFUND → concedido, REFUND_DECLINED → negado, REFUND_REVERSED → revertido', async () => {
  const { d, log } = deps()
  for (const t of ['REFUND', 'REFUND_DECLINED', 'REFUND_REVERSED']) await receber(await notificacao(t), d)
  assertEquals(log.desfechos.map((x) => x[2]), ['concedido', 'negado', 'revertido'])
})

Deno.test('notificação de teste da Apple (sem transação): repassa e registra', async () => {
  const { d, log } = deps()
  assertEquals(await receber(await notificacao('TEST', {}, null), d), 200)
  assertEquals(log.notifs[0].tipo, 'TEST')
  assertEquals(log.notifs[0].assinatura_ok, true)
})

// ── Decisão ──
const uso = { dias_conta: 1, scans: 1, rotinas_geradas: 1, rotinas_feitas: 0, msgs_chat: 0, scans_produto: 0 }
const ctx = (x: Partial<Contexto> = {}): Contexto => ({
  chave: 'ligado', ambiente: 'PRODUCTION', userId: 'u', termosAceitosEm: new Date('2026-12-01'), recebidoEm: new Date('2026-12-05'), uso, ...x,
})

Deno.test('decidir: chave desligada não responde; "sandbox" só responde em sandbox', () => {
  assertEquals(decidir(ctx({ chave: 'desligado' })).decisao, 'desligado')
  assertEquals(decidir(ctx({ chave: 'sandbox' })).decisao, 'desligado')
  assertEquals(decidir(ctx({ chave: 'sandbox', ambiente: 'SANDBOX' })).corpo, CORPO_PADRAO)
})

Deno.test('decidir: sem conta, sem aceite dos Termos ou aceite DEPOIS do pedido não responde', () => {
  assertEquals(decidir(ctx({ userId: null })).decisao, 'sem_conta')
  assertEquals(decidir(ctx({ termosAceitosEm: null })).decisao, 'sem_consentimento')
  assertEquals(decidir(ctx({ termosAceitosEm: new Date('2026-12-06') })).decisao, 'sem_consentimento')
})

Deno.test('decidir: nada entregue (sem análise e sem rotina) não responde', () => {
  assertEquals(decidir(ctx({ uso: { ...uso, scans: 0, rotinas_geradas: 0 } })).decisao, 'nao_entregue')
})

Deno.test('decidir: resposta = consentiu, entregue, recusar, amostra grátis; sem porcentagem', () => {
  const c = decidir(ctx()).corpo!
  assertEquals(c, { customerConsented: true, deliveryStatus: 'DELIVERED', refundPreference: 'DECLINE', sampleContentProvided: true })
  assert(!('consumptionPercentage' in c))
})

Deno.test('resposta da Apple: 202 respondido; 401/429/5xx/rede tenta de novo; 400/404 erro', () => {
  assertEquals(decisaoDaResposta(202), 'respondido')
  for (const s of [0, 401, 429, 500, 503]) assertEquals(decisaoDaResposta(s), 'tentar_de_novo')
  for (const s of [400, 404]) assertEquals(decisaoDaResposta(s), 'erro')
})

// ── API da Apple ──
async function credTeste() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', k.privateKey))
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`
  return { k, cred: { p8: pem, keyId: 'KEY123', issuerId: 'iss-1', bundleId: BUNDLE } }
}

Deno.test('token da Apple: ES256 com kid, iss, aud, bid; assinatura confere com a chave', async () => {
  const { k, cred } = await credTeste()
  const t = await tokenApple(cred, 1_800_000_000_000)
  const [h, p, s] = t.split('.')
  const dec = (x: string) => JSON.parse(atob(x.replace(/-/g, '+').replace(/_/g, '/')))
  assertEquals(dec(h), { alg: 'ES256', kid: 'KEY123', typ: 'JWT' })
  assertEquals(dec(p), { iss: 'iss-1', iat: 1_800_000_000, exp: 1_800_001_200, aud: 'appstoreconnect-v1', bid: BUNDLE })
  const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.publicKey, sig, new TextEncoder().encode(`${h}.${p}`)))
})

Deno.test('a .p8 colada com "\\n" literal também funciona', async () => {
  const { cred } = await credTeste()
  assert(await tokenApple({ ...cred, p8: cred.p8.replace(/\n/g, '\\n') }))
})

Deno.test('enviarConsumo: PUT na v2 do ambiente certo, com token e o corpo', async () => {
  const { cred } = await credTeste()
  let pedido: { url: string; init: RequestInit } | null = null
  const f = (async (url: string, init: RequestInit) => { pedido = { url, init }; return new Response(null, { status: 202 }) }) as unknown as typeof fetch
  const r = await enviarConsumo(cred, 'SANDBOX', 't-2', CORPO_PADRAO, f)
  assertEquals(r.status, 202)
  assertEquals(pedido!.url, 'https://api.storekit-sandbox.apple.com/inApps/v2/transactions/consumption/t-2')
  assertEquals(pedido!.init.method, 'PUT')
  assert(String((pedido!.init.headers as Record<string, string>).Authorization).startsWith('Bearer '))
  assertEquals(JSON.parse(String(pedido!.init.body)), CORPO_PADRAO)
})
