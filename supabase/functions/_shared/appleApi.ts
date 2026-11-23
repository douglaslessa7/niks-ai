// App Store Server API (19/nov/2026): token ES256 com a chave In-App Purchase (.p8) e as
// chamadas que o NIKS usa — resposta a pedido de reembolso (Send Consumption Information,
// v2) e notificação de teste. A chave vem SÓ dos segredos do Supabase.
// Doc: developer.apple.com/documentation/appstoreserverapi

export type AmbienteApple = 'PRODUCTION' | 'SANDBOX'
export interface CredenciaisApple { p8: string; keyId: string; issuerId: string; bundleId: string }

const BASE: Record<AmbienteApple, string> = {
  PRODUCTION: 'https://api.storekit.apple.com',
  SANDBOX: 'https://api.storekit-sandbox.apple.com',
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const json64 = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))

/** Lê a .p8 (PEM, com ou sem cabeçalho; "\n" literal vira quebra de linha). */
async function chavePrivada(p8: string): Promise<CryptoKey> {
  const corpo = p8.replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0))
  return await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/** JWT da App Store Server API: ES256, `kid` = Key ID, vale 20 min (a Apple aceita até 60). */
export async function tokenApple(c: CredenciaisApple, agora = Date.now()): Promise<string> {
  const iat = Math.floor(agora / 1000)
  const h = json64({ alg: 'ES256', kid: c.keyId, typ: 'JWT' })
  const p = json64({ iss: c.issuerId, iat, exp: iat + 20 * 60, aud: 'appstoreconnect-v1', bid: c.bundleId })
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await chavePrivada(c.p8), new TextEncoder().encode(`${h}.${p}`)))
  return `${h}.${p}.${b64url(sig)}`
}

export function credenciaisDoAmbiente(): CredenciaisApple | null {
  const p8 = Deno.env.get('APPLE_IAP_KEY_P8')
  const keyId = Deno.env.get('APPLE_IAP_KEY_ID')
  const issuerId = Deno.env.get('APPLE_ISSUER_ID')
  if (!p8 || !keyId || !issuerId) return null
  return { p8, keyId, issuerId, bundleId: 'br.com.niksai.app' }
}

/** Corpo da v2 (ConsumptionRequest). `consumptionPercentage` fica de fora (decisão de 19/nov/2026). */
export interface CorpoConsumo {
  customerConsented: true
  deliveryStatus: 'DELIVERED' | 'UNDELIVERED_QUALITY_ISSUE' | 'UNDELIVERED_WRONG_ITEM' | 'UNDELIVERED_SERVER_OUTAGE' | 'UNDELIVERED_OTHER'
  refundPreference?: 'DECLINE' | 'GRANT_FULL' | 'GRANT_PRORATED'
  sampleContentProvided: boolean
  consumptionPercentage?: number
}

type Fetch = typeof fetch

/** PUT /inApps/v2/transactions/consumption/{transactionId} — 202 = a Apple recebeu. */
export async function enviarConsumo(
  c: CredenciaisApple, ambiente: AmbienteApple, transactionId: string, corpo: CorpoConsumo, f: Fetch = fetch,
): Promise<{ status: number; texto: string }> {
  const r = await f(`${BASE[ambiente]}/inApps/v2/transactions/consumption/${encodeURIComponent(transactionId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${await tokenApple(c)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(20_000),
  })
  return { status: r.status, texto: (await r.text().catch(() => '')).slice(0, 1000) }
}

/** POST /inApps/v1/notifications/test → { testNotificationToken } */
export async function pedirNotificacaoTeste(c: CredenciaisApple, ambiente: AmbienteApple, f: Fetch = fetch) {
  const r = await f(`${BASE[ambiente]}/inApps/v1/notifications/test`, {
    method: 'POST', headers: { Authorization: `Bearer ${await tokenApple(c)}` }, signal: AbortSignal.timeout(20_000),
  })
  return { status: r.status, corpo: await r.json().catch(() => null) }
}

/** GET /inApps/v1/notifications/test/{token} → tentativas de entrega (sendAttemptResult). */
export async function statusNotificacaoTeste(c: CredenciaisApple, ambiente: AmbienteApple, token: string, f: Fetch = fetch) {
  const r = await f(`${BASE[ambiente]}/inApps/v1/notifications/test/${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${await tokenApple(c)}` }, signal: AbortSignal.timeout(20_000),
  })
  const corpo = await r.json().catch(() => null)
  return { status: r.status, tentativas: corpo?.sendAttempts ?? null }
}
