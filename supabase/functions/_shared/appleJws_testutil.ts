// SÓ PARA TESTES: cadeia x5c falsa (raiz → intermediário → folha) com as extensões que a
// Apple usa, para assinar JWS como a Apple faz. A raiz falsa entra no lugar da G3 pelo
// parâmetro `raizSha256` das funções de appleJws.ts.
import * as x509 from 'npm:@peculiar/x509@1.14.3'

const OID_FOLHA = '1.2.840.113635.100.6.11.1'
const OID_INTERMEDIARIO = '1.2.840.113635.100.6.2.1'
const ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const
const NULO = new Uint8Array([5, 0]) // ASN.1 NULL

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))

export interface CadeiaTeste { x5c: string[]; chaveFolha: CryptoKey; raizSha256: string }

export async function criarCadeia(): Promise<CadeiaTeste> {
  x509.cryptoProvider.set(crypto)
  const inicio = new Date(Date.now() - 365 * 864e5)
  const fim = new Date(Date.now() + 365 * 864e5)
  const kRaiz = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']) as CryptoKeyPair
  const kInter = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']) as CryptoKeyPair
  const kFolha = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']) as CryptoKeyPair
  const raiz = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01', name: 'CN=Raiz de Teste', notBefore: inicio, notAfter: fim, keys: kRaiz, signingAlgorithm: ALG,
    extensions: [new x509.BasicConstraintsExtension(true, 2, true)],
  })
  const inter = await x509.X509CertificateGenerator.create({
    serialNumber: '02', subject: 'CN=Intermediario de Teste', issuer: raiz.subject, notBefore: inicio, notAfter: fim,
    publicKey: kInter.publicKey, signingKey: kRaiz.privateKey, signingAlgorithm: ALG,
    extensions: [new x509.BasicConstraintsExtension(true, 0, true), new x509.Extension(OID_INTERMEDIARIO, false, NULO)],
  })
  const folha = await x509.X509CertificateGenerator.create({
    serialNumber: '03', subject: 'CN=Folha de Teste', issuer: inter.subject, notBefore: inicio, notAfter: fim,
    publicKey: kFolha.publicKey, signingKey: kInter.privateKey, signingAlgorithm: ALG,
    extensions: [new x509.Extension(OID_FOLHA, false, NULO)],
  })
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', raiz.rawData))
  return {
    x5c: [b64(folha.rawData), b64(inter.rawData), b64(raiz.rawData)],
    chaveFolha: kFolha.privateKey,
    raizSha256: Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase(),
  }
}

/** Assina `payload` como a Apple (JWS ES256 com x5c). */
export async function assinarJws(cadeia: CadeiaTeste, payload: Record<string, unknown>): Promise<string> {
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))
  const h = enc({ alg: 'ES256', x5c: cadeia.x5c })
  const p = enc(payload)
  const s = new Uint8Array(await crypto.subtle.sign(ALG, cadeia.chaveFolha, new TextEncoder().encode(`${h}.${p}`)))
  return `${h}.${p}.${b64url(s)}`
}
