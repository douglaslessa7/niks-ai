import { assert, assertEquals } from 'jsr:@std/assert@1'
import { lerJwsApple, validarJws } from './appleJws.ts'
import { assinarJws, criarCadeia } from './appleJws_testutil.ts'

const BUNDLE = 'br.com.niksai.app'
const agora = Date.now()
const transacao = (extra: Record<string, unknown> = {}) => ({
  bundleId: BUNDLE, type: 'Auto-Renewable Subscription', originalTransactionId: '2000001', productId: 'p.anual',
  environment: 'Production', signedDate: agora, expiresDate: agora + 30 * 864e5, ...extra,
})

Deno.test('lerJwsApple: JWS assinado pela cadeia confiável é lido', async () => {
  const c = await criarCadeia()
  const jws = await assinarJws(c, { notificationType: 'TEST', notificationUUID: 'u1', signedDate: agora, data: { bundleId: BUNDLE } })
  const p = await lerJwsApple(jws, c.raizSha256)
  assertEquals(p?.notificationType, 'TEST')
})

Deno.test('lerJwsApple: raiz diferente da confiável é recusada', async () => {
  const c = await criarCadeia()
  const jws = await assinarJws(c, { notificationType: 'TEST', signedDate: agora })
  assertEquals(await lerJwsApple(jws), null) // raiz falsa ≠ Apple Root G3
})

Deno.test('lerJwsApple: conteúdo alterado depois de assinado é recusado', async () => {
  const c = await criarCadeia()
  const [h, , s] = (await assinarJws(c, { notificationType: 'TEST', signedDate: agora })).split('.')
  const falso = btoa(JSON.stringify({ notificationType: 'CONSUMPTION_REQUEST', signedDate: agora })).replace(/=+$/, '')
  assertEquals(await lerJwsApple(`${h}.${falso}.${s}`, c.raizSha256), null)
})

Deno.test('lerJwsApple: lixo e JWS sem cadeia são recusados, sem lançar', async () => {
  assertEquals(await lerJwsApple('nada'), null)
  assertEquals(await lerJwsApple('a.b.c'), null)
  assertEquals(await lerJwsApple(undefined as unknown as string), null)
})

Deno.test('validarJws (comprovar-assinatura) continua igual: transação válida passa; vencida, revogada ou de outro app não', async () => {
  const c = await criarCadeia()
  const ok = await validarJws(await assinarJws(c, transacao()), BUNDLE, new Date(agora), c.raizSha256)
  assertEquals(ok?.originalTransactionId, '2000001')
  assertEquals(ok?.ambiente, 'PRODUCTION')
  assertEquals(await validarJws(await assinarJws(c, transacao({ expiresDate: agora - 1000 })), BUNDLE, new Date(agora), c.raizSha256), null)
  assertEquals(await validarJws(await assinarJws(c, transacao({ revocationDate: agora })), BUNDLE, new Date(agora), c.raizSha256), null)
  assertEquals(await validarJws(await assinarJws(c, transacao({ bundleId: 'outro.app' })), BUNDLE, new Date(agora), c.raizSha256), null)
  assert(!(await validarJws(await assinarJws(c, transacao()), BUNDLE, new Date(agora))), 'sem a raiz de teste, recusa')
})
