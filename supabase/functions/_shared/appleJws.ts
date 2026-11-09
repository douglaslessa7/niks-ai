// Valida uma transação assinada pela Apple (JWS do StoreKit 2), sem chamar a Apple e sem
// chave: confere a cadeia x5c até a Apple Root CA G3 (pela impressão digital), as extensões
// exigidas pela Apple e a assinatura ES256.
//
// Usa WebCrypto + @peculiar/x509: a 1ª versão usava X509Certificate do `node:crypto`, que
// funcionava no Deno local e recusava tudo no servidor do Supabase (08/nov/2026).
import * as x509 from 'npm:@peculiar/x509@1.14.3'

export const APPLE_ROOT_G3_SHA256 = '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179'
const OID_FOLHA = '1.2.840.113635.100.6.11.1'
const OID_INTERMEDIARIO = '1.2.840.113635.100.6.2.1'

export type TransacaoApple = {
  originalTransactionId: string
  productId: string
  ambiente: 'PRODUCTION' | 'SANDBOX'
  expiraEm: Date
  assinadoEm: Date
}

const b64urlBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const texto = (b: Uint8Array) => new TextDecoder().decode(b)
const cert = (b64: string) => new x509.X509Certificate(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
const temOid = (c: x509.X509Certificate, oid: string) => c.extensions.some((e) => e.type === oid)
const dentroDaValidade = (c: x509.X509Certificate, d: Date) => c.notBefore <= d && d <= c.notAfter

async function sha256Hex(dados: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', dados))
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Devolve a transação validada ou `null`. Nunca lança. */
export async function validarJws(
  jws: string,
  bundleId: string,
  agora = new Date(),
  raizSha256 = APPLE_ROOT_G3_SHA256,
): Promise<TransacaoApple | null> {
  try {
    const partes = jws.split('.')
    if (partes.length !== 3) return null
    const [h, p, s] = partes
    const header = JSON.parse(texto(b64urlBytes(h)))
    if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) return null

    const [folha, intermediario, raiz] = (header.x5c as string[]).map(cert)
    if ((await sha256Hex(raiz.rawData)) !== raizSha256) return null
    const signatureOnly = true
    if (!(await folha.verify({ publicKey: intermediario.publicKey, signatureOnly }, crypto))) return null
    if (!(await intermediario.verify({ publicKey: raiz.publicKey, signatureOnly }, crypto))) return null
    if (!temOid(folha, OID_FOLHA) || !temOid(intermediario, OID_INTERMEDIARIO)) return null

    const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }
    const chave = await folha.publicKey.export(alg, ['verify'], crypto)
    const assinado = await crypto.subtle.verify(alg, chave, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`))
    if (!assinado) return null

    const t = JSON.parse(texto(b64urlBytes(p)))
    const assinadoEm = new Date(Number(t.signedDate))
    if (!dentroDaValidade(folha, assinadoEm) || !dentroDaValidade(intermediario, assinadoEm)) return null
    if (t.bundleId !== bundleId || t.type !== 'Auto-Renewable Subscription' || t.revocationDate) return null
    if (typeof t.originalTransactionId !== 'string' || typeof t.productId !== 'string') return null
    if (t.environment !== 'Production' && t.environment !== 'Sandbox') return null

    const expiraEm = new Date(Number(t.expiresDate))
    if (!(expiraEm.getTime() > agora.getTime())) return null
    return {
      originalTransactionId: t.originalTransactionId,
      productId: t.productId,
      ambiente: t.environment === 'Sandbox' ? 'SANDBOX' : 'PRODUCTION',
      expiraEm,
      assinadoEm,
    }
  } catch (e) {
    console.error('[appleJws]', (e as Error).message)
    return null
  }
}
