// Verificação LOCAL de JWT do Supabase (crypto.subtle) — sem ida à rede ao Auth.
// Extraído da niks-chat (que migrou de auth.getUser() por causa de 401 falsos
// documentados). Fonte única — importado por niks-chat e approve-coach-protocol-change.
// Suporta HS256 (legacy secret) e ES256/RS256 (JWT Signing Keys via SUPABASE_JWKS).

const NIKS_JWT_SECRET = Deno.env.get('NIKS_JWT_SECRET') ?? ''
const SUPABASE_JWKS_RAW = Deno.env.get('SUPABASE_JWKS') ?? ''

let jwksKeys: any[] = []
try {
  if (SUPABASE_JWKS_RAW) {
    const parsed = JSON.parse(SUPABASE_JWKS_RAW)
    jwksKeys = parsed.keys ?? []
  }
} catch { /* JWKS parse failed */ }

const decode = (b64url: string) =>
  atob(b64url.replace(/-/g, '+').replace(/_/g, '/'))

export async function verifyJWT(token: string): Promise<{ sub: string } | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, sigB64] = parts
    const header  = JSON.parse(decode(headerB64))
    const payload = JSON.parse(decode(payloadB64))

    if (!payload.sub) return null
    if (payload.exp && payload.exp * 1000 < Date.now()) return null

    const alg  = header.alg ?? 'HS256'
    const sig  = Uint8Array.from(decode(sigB64), c => c.charCodeAt(0))
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)

    // ── HS256 (legacy JWT secret) ──────────────────────────────────────────
    if (alg === 'HS256' && NIKS_JWT_SECRET) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(NIKS_JWT_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      )
      const valid = await crypto.subtle.verify('HMAC', key, sig, data)
      return valid ? payload : null
    }

    // ── ES256 / RS256 (novas JWT Signing Keys — usa SUPABASE_JWKS) ─────────
    if ((alg === 'ES256' || alg === 'RS256') && jwksKeys.length > 0) {
      const kid = header.kid
      const jwk = jwksKeys.find((k: any) => !kid || k.kid === kid) ?? jwksKeys[0]

      const importAlg = alg === 'RS256'
        ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
        : { name: 'ECDSA', namedCurve: 'P-256' }

      const verifyAlg = alg === 'RS256'
        ? { name: 'RSASSA-PKCS1-v1_5' }
        : { name: 'ECDSA', hash: { name: 'SHA-256' } }

      const key   = await crypto.subtle.importKey('jwk', jwk, importAlg, false, ['verify'])
      const valid = await crypto.subtle.verify(verifyAlg, key, sig, data)
      return valid ? payload : null
    }

    console.error('verifyJWT — alg não suportado:', alg,
      '| jwksKeys:', jwksKeys.length, '| hasLegacySecret:', !!NIKS_JWT_SECRET)
    return null
  } catch (e) {
    console.error('verifyJWT exception:', e)
    return null
  }
}
