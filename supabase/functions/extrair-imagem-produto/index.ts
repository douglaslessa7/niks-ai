import { verifyJWT } from '../_shared/jwt.ts'

// Extrai a FOTO e o TÍTULO de um produto a partir de um link compartilhado com o app
// (feature "Compartilhar com o NIKS"). Roda ANTES do `analisar-produto`, para a foto
// aparecer na tela de carregamento o quanto antes. Não chama IA e não escreve no banco.
//
// Entrada:  { sourceUrl }
// Saída:    200 { status: 'ok', imageBase64, mimeType, titulo, imageUrl, finalUrl }
//           200 { status: 'sem_imagem', titulo, motivo }
//           400 URL inválida · 401 sem JWT válido
//
// Se a própria URL responder `content-type: image/*`, ela JÁ É a foto: devolve direto
// (cobre "Compartilhar imagem" e CDNs sem extensão no caminho, como a VTEX).
// Caso contrário, busca de imagem, em ordem: JSON-LD Product.image → imagem principal da Amazon
// (data-a-dynamic-image) → og:image(:secure_url) → twitter:image →
// link[rel=image_src]. Página de verificação/captcha → motivo `pagina_bloqueada`.
// Mercado Livre: fallback pela API (/items/{anúncio}, depois /products/{catálogo})
// quando a página bloqueia o scraping.
//
// O app só chama esta função quando a extensão NÃO trouxe a foto lida no Safari
// (`pendingShare.pageImageUrl`) ou quando baixar essa foto falhou.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
// Abaixo disso o rótulo fica ilegível para a IA (a Sallve servia 100×100 via JSON-LD
// do Shopify). Não é corte duro: se nenhum candidato passar, vale o maior que baixou.
const MIN_IMAGE_SIDE = 400
const MAX_IMAGE_TRIES = 5

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6',
}

// ── Proteção contra SSRF ─────────────────────────────────────────────────────
// A função faz fetch de URL arbitrária vinda do app: nunca pode alcançar a rede
// interna. Checado em CADA hop de redirect (um link público pode redirecionar
// para 127.0.0.1).

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  return (
    p[0] === 0 || p[0] === 10 || p[0] === 127 ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19)) ||
    p[0] >= 224
  )
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (v === '::' || v === '::1') return true
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateIPv4(mapped[1]) : false
}

async function isSafeUrl(raw: string): Promise<URL | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return null
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPrivateIPv4(host) ? null : url
  if (host.includes(':')) return isPrivateIPv6(host) ? null : url
  if (!host.includes('.')) return null

  // Resolve o DNS para barrar domínio público apontando para IP interno.
  // Se o runtime não permitir resolveDns, segue só com a checagem literal.
  try {
    const [a, aaaa] = await Promise.all([
      Deno.resolveDns(host, 'A').catch(() => [] as string[]),
      Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
    ])
    if (a.some(isPrivateIPv4) || aaaa.some(isPrivateIPv6)) return null
  } catch {
    // resolveDns indisponível
  }
  return url
}

// ── Fetch com redirects manuais, timeout e limite de tamanho ─────────────────

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { headers, redirect: 'manual', signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function safeFetch(
  startUrl: string,
  headers: Record<string, string>,
): Promise<{ response: Response; finalUrl: string } | null> {
  let current = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = await isSafeUrl(current)
    if (!safe) return null
    const response = await fetchWithTimeout(safe.toString(), headers)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) return null
      current = new URL(location, safe).toString()
      continue
    }
    return { response, finalUrl: safe.toString() }
  }
  return null
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > maxBytes) {
    await response.body?.cancel()
    return null
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

// HTML truncado em vez de recusado: as metatags ficam no <head>, no começo.
async function readHtml(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  let total = 0
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    html += decoder.decode(value, { stream: true })
  }
  await reader.cancel().catch(() => {})
  return html
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// ── Parsing do HTML ──────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim()
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null
}

function metaContent(html: string, keys: string[]): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const key of keys) {
    for (const tag of tags) {
      const k = (attr(tag, 'property') ?? attr(tag, 'name') ?? attr(tag, 'itemprop') ?? '').toLowerCase()
      if (k === key) {
        const content = attr(tag, 'content')
        if (content) return content
      }
    }
  }
  return null
}

function imageFromLd(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(imageFromLd)
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    return imageFromLd(v.url ?? v.contentUrl)
  }
  return []
}

function isProductType(type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type]
  return types.some((t) => typeof t === 'string' && /(^|\/)(Product|ProductGroup|IndividualProduct)$/i.test(t))
}

function jsonLdProduct(html: string): { images: string[]; name: string | null } {
  const scripts = html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? []
  const images: string[] = []
  let name: string | null = null

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(visit)
    const obj = node as Record<string, unknown>
    if (isProductType(obj['@type'])) {
      images.push(...imageFromLd(obj.image))
      if (!name && typeof obj.name === 'string') name = obj.name
    }
    if (obj['@graph']) visit(obj['@graph'])
    if (obj.mainEntity) visit(obj.mainEntity)
  }

  for (const script of scripts) {
    const body = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim()
    try {
      visit(JSON.parse(body))
    } catch {
      // JSON-LD malformado é comum — ignora esse bloco
    }
  }
  return { images, name }
}

function linkImageSrc(html: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    if ((attr(tag, 'rel') ?? '').toLowerCase() === 'image_src') return attr(tag, 'href')
  }
  return null
}

function metaRefreshUrl(html: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    if ((attr(tag, 'http-equiv') ?? '').toLowerCase() !== 'refresh') continue
    const m = (attr(tag, 'content') ?? '').match(/url\s*=\s*['"]?([^'"\s;]+)/i)
    if (m) return m[1]
  }
  return null
}

function htmlTitle(html: string): string | null {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ') || null : null
}

// ── Página de verificação / anti-robô ────────────────────────────────────────
// Várias lojas respondem 200 com uma tela de captcha em vez do produto (o Mercado
// Livre redireciona para /gz/account-verification). Sem esta checagem o motivo
// sairia `sem_metatag`, escondendo que a página foi bloqueada.
//
// Duas forças de sinal:
//  • URL final de verificação → bloqueio certo (descarta o HTML).
//  • Marcador de captcha no HTML → só conta se a página NÃO trouxe nenhuma imagem
//    de produto. reCAPTCHA de newsletter/login aparece em páginas normais, e
//    tratar isso como bloqueio jogaria fora uma og:image válida.

function isVerificationUrl(finalUrl: string): boolean {
  try {
    return /\/(gz\/)?account-verification(\/|$)|\/captcha(\/|$)|\/errors\/validatecaptcha|\/cdn-cgi\/challenge-platform/i
      .test(new URL(finalUrl).pathname)
  } catch {
    return false
  }
}

function hasCaptchaMarkers(html: string): boolean {
  const head = html.slice(0, 200_000)
  return (
    /validateCaptcha|captcha-delivery\.com|cf-chl-|challenge-platform|px-captcha|g-recaptcha|hcaptcha\.com/i.test(head) ||
    /<title>\s*(access denied|attention required|robot check|just a moment|verifica[çc][ãa]o)/i.test(head)
  )
}

// ── Amazon ───────────────────────────────────────────────────────────────────
// A Amazon não publica og:image. A foto fica em `data-a-dynamic-image`, um JSON
// (entity-encoded) de { url: [largura, altura] }. A imagem principal é a do
// elemento `landingImage`/`main-image`; sem ele, o primeiro bloco da página.
// Na versão mobile esse bloco só tem miniaturas (≤288px): tirar o modificador de
// tamanho da URL (`41bWbXXrRnL._AC_SS288_.jpg` → `41bWbXXrRnL.jpg`) devolve a original (~1000px).

function amazonOriginal(url: string): string {
  return url.replace(/\._[^/]*_\.(jpe?g|png|webp)$/i, '.$1')
}

function isAmazon(url: string): boolean {
  try {
    return /(^|\.)amazon\.[a-z.]+$/i.test(new URL(url).hostname)
  } catch {
    return false
  }
}

function amazonImages(html: string): string[] {
  const tags = html.match(/<img\b[^>]*data-a-dynamic-image\s*=[^>]*>/gi) ?? []
  const main = tags.find((t) => /\bid\s*=\s*["'](landingImage|main-image|imgBlkFront|ebooksImgBlkFront)["']/i.test(t))
  for (const tag of main ? [main, ...tags] : tags) {
    const raw = attr(tag, 'data-a-dynamic-image')
    if (!raw) continue
    try {
      const sizes = JSON.parse(raw) as Record<string, [number, number]>
      const ranked = Object.entries(sizes)
        .filter(([u]) => /^https?:\/\//.test(u))
        .sort(([, a], [, b]) => (b[0] * b[1]) - (a[0] * a[1]))
        .map(([u]) => u)
      if (ranked.length) return [amazonOriginal(ranked[0]), ...ranked]
    } catch {
      // JSON inválido nesse bloco — tenta o próximo
    }
  }
  const hiRes = html.match(/"hiRes"\s*:\s*"(https:\/\/[^"]+)"/)
  return hiRes ? [hiRes[1], amazonOriginal(hiRes[1])] : []
}

// ── Mercado Livre ────────────────────────────────────────────────────────────
// Dois IDs diferentes aparecem nos links:
//   • ANÚNCIO (item)  — `MLB-123…` no path do produto.mercadolivre, ou
//     `item_id:MLB…` / `wid=MLB…` nos links do botão Compartilhar do app → /items/{id}
//   • CATÁLOGO (product) — `/p/MLB…` → /products/{id}
// Preferência: anúncio; catálogo como alternativa.

type MercadoLivreIds = { itemId: string | null; productId: string | null }

function mercadoLivreIds(url: string): MercadoLivreIds {
  const empty = { itemId: null, productId: null }
  if (!/mercadoli(vre|bre)\.com/i.test(url)) return empty
  let decoded = url
  try {
    decoded = decodeURIComponent(url)
  } catch {
    // mantém a URL crua
  }
  const itemFromParams =
    decoded.match(/[?&#]wid=(MLB\d{6,})/i)?.[1] ??
    decoded.match(/item_id[:=](MLB\d{6,})/i)?.[1] ??
    null
  const productId = decoded.match(/\/p\/(MLB\d{6,})/i)?.[1] ?? null
  const itemFromPath = decoded.match(/\/(MLB)-?(\d{6,})/i)
  const itemId = itemFromParams ?? (itemFromPath && !productId ? `MLB${itemFromPath[2]}` : null)
  return { itemId: itemId?.toUpperCase() ?? null, productId: productId?.toUpperCase() ?? null }
}

function picturesFrom(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return list
    .map((p: { secure_url?: string; url?: string }) => p?.secure_url ?? p?.url)
    .filter((u): u is string => typeof u === 'string')
}

async function mercadoLivreApi(path: string): Promise<Record<string, unknown> | null> {
  try {
    const result = await safeFetch(`https://api.mercadolibre.com${path}`, { Accept: 'application/json' })
    if (!result || !result.response.ok) {
      console.log(`extrair-imagem-produto: ML API ${path.split('/')[1]} status=${result?.response.status ?? 'sem_resposta'}`)
      await result?.response.body?.cancel()
      return null
    }
    return await result.response.json()
  } catch {
    return null
  }
}

async function mercadoLivreFallback(ids: MercadoLivreIds): Promise<{ images: string[]; title: string | null } | null> {
  if (ids.itemId) {
    const item = await mercadoLivreApi(`/items/${ids.itemId}`)
    const images = picturesFrom(item?.pictures)
    if (images.length) return { images, title: typeof item?.title === 'string' ? item.title : null }
  }
  if (ids.productId) {
    const product = await mercadoLivreApi(`/products/${ids.productId}`)
    const images = picturesFrom(product?.pictures)
    if (images.length) return { images, title: typeof product?.name === 'string' ? product.name : null }
  }
  return null
}

// ── Dimensões pelo CABEÇALHO do arquivo (sem decodificar a imagem) ──────────
// Deno no Edge não tem decoder de imagem; ler o header é barato e resolve os três
// formatos que aceitamos.

function imageMinSide(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  try {
    // PNG: IHDR nos bytes 16..24
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      return Math.min(view.getUint32(16), view.getUint32(20))
    }
    // JPEG: procura um marcador SOF
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let i = 2
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) { i++; continue }
        const marker = bytes[i + 1]
        const len = view.getUint16(i + 2)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return Math.min(view.getUint16(i + 7), view.getUint16(i + 5))
        }
        i += 2 + len
      }
      return null
    }
    // WebP: RIFF....WEBP + VP8X / VP8L / VP8
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
      if (chunk === 'VP8X') {
        const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
        const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
        return Math.min(w, h)
      }
      if (chunk === 'VP8L') {
        const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
        return Math.min(1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff))
      }
      if (chunk === 'VP8 ') {
        return Math.min(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff)
      }
    }
  } catch {
    // header estranho — deixa a decisão para o tamanho em bytes
  }
  return null
}

// Variantes de CDN que servem miniatura no lugar da foto cheia. Tentamos a original
// ANTES da variante (a variante continua na fila, como reserva).
function upgradedCandidates(url: string): string[] {
  const out: string[] = []
  // Shopify: ..._small.png / ..._100x100.png / ..._1024x1024@2x.jpg → original
  const shopify = url.replace(/_(?:small|compact|medium|large|grande|pico|icon|thumb|\d+x\d*(?:@\dx)?)(\.[a-z]{3,4})(\?|$)/i, '$1$2')
  if (shopify !== url) out.push(shopify)
  // VTEX: /arquivos/ids/741879-450-450/foo.jpg → /arquivos/ids/741879/foo.jpg
  const vtex = url.replace(/\/ids\/(\d+)-\d+-\d+\//, '/ids/$1/')
  if (vtex !== url) out.push(vtex)
  // Amazon: ..._AC_SS288_.jpg → original
  const amazon = amazonOriginal(url)
  if (amazon !== url) out.push(amazon)
  out.push(url)
  return out
}

// ── Download da imagem ───────────────────────────────────────────────────────

async function downloadImage(src: string, referer: string): Promise<{ base64: string; mimeType: string; url: string; minSide: number | null } | null> {
  try {
    const result = await safeFetch(src, {
      ...BROWSER_HEADERS,
      Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8',
      Referer: referer,
    })
    if (!result || !result.response.ok) {
      await result?.response.body?.cancel()
      return null
    }
    const mimeType = (result.response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!ACCEPTED_IMAGE_TYPES.includes(mimeType)) {
      await result.response.body?.cancel()
      return null
    }
    const bytes = await readLimited(result.response, MAX_IMAGE_BYTES)
    if (!bytes || bytes.byteLength < 1024) return null
    return {
      base64: toBase64(bytes),
      mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
      url: result.finalUrl,
      minSide: imageMinSide(bytes),
    }
  } catch {
    return null
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Body-first: bufferiza o body antes de qualquer rede (mesmo padrão do analisar-produto).
  let rawBody = ''
  try {
    rawBody = await req.text()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const jwtPayload = await verifyJWT(authHeader.slice(7))
    if (!jwtPayload?.sub) {
      console.error('extrair-imagem-produto: JWT verification failed')
      return json({ error: 'Unauthorized' }, 401)
    }

    let sourceUrl = ''
    try {
      sourceUrl = String(JSON.parse(rawBody)?.sourceUrl ?? '').trim()
    } catch {
      return json({ error: 'Body inválido' }, 400)
    }
    if (!sourceUrl || sourceUrl.length > 2048 || !(await isSafeUrl(sourceUrl))) {
      return json({ error: 'URL inválida' }, 400)
    }

    const candidates: string[] = []
    let titulo: string | null = null
    let finalUrl = sourceUrl
    let pageBlocked = false     // 403/429/503 ou tela de verificação
    let pageUnavailable = false // 404 e outros erros da própria página

    // 1. Página (com redirects; meta-refresh conta como um hop extra)
    try {
      let page = await safeFetch(sourceUrl, { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,image/*;q=0.9' })
      let html = ''
      if (page && page.response.ok) {
        finalUrl = page.finalUrl

        // ⚠️ A URL compartilhada JÁ É a foto? Acontece o tempo todo: "Compartilhar
        // imagem" do Safari, galeria do Shopify/VTEX abrindo o arquivo. Muitas
        // dessas URLs NÃO têm extensão (`/arquivos/ids/158355-1200-auto?width=1200`),
        // então adivinhar pelo caminho não basta — quem responde é o `content-type`.
        // Sem isto, tentávamos ler metatags de um JPEG e a análise morria.
        const contentType = (page.response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
        if (contentType.startsWith('image/')) {
          if (!ACCEPTED_IMAGE_TYPES.includes(contentType)) {
            await page.response.body?.cancel()
            console.log(`extrair-imagem-produto: url e imagem mas tipo nao aceito (${contentType})`)
            return json({ status: 'sem_imagem', titulo: null, motivo: 'imagem_invalida' })
          }
          const bytes = await readLimited(page.response, MAX_IMAGE_BYTES)
          if (!bytes || bytes.byteLength < 1024) {
            return json({ status: 'sem_imagem', titulo: null, motivo: 'imagem_invalida' })
          }
          const minSide = imageMinSide(bytes)
          console.log(`extrair-imagem-produto: url e imagem direta kb=${Math.round(bytes.byteLength / 1024)} minSide=${minSide ?? '?'}`)
          return json({
            status: 'ok',
            imageBase64: toBase64(bytes),
            mimeType: contentType === 'image/jpg' ? 'image/jpeg' : contentType,
            titulo: null,
            imageUrl: finalUrl,
            finalUrl,
          })
        }

        html = await readHtml(page.response)
        const refresh = metaRefreshUrl(html)
        if (refresh && !metaContent(html, ['og:image'])) {
          page = await safeFetch(new URL(refresh, finalUrl).toString(), { ...BROWSER_HEADERS, Accept: 'text/html' })
          if (page && page.response.ok) {
            finalUrl = page.finalUrl
            html = await readHtml(page.response)
          }
        }
      } else {
        // ⚠️ Não é tudo "bloqueio": um 404 (link velho/errado) levava o app a abrir a
        // WebView por 25 s numa página que não existe. Só 403/429/503 e a tela de
        // verificação contam como anti-robô.
        const status = page?.response.status ?? 0
        if (status === 403 || status === 429 || status === 503) pageBlocked = true
        else pageUnavailable = true
        console.log(`extrair-imagem-produto: pagina nao-ok status=${status}`)
        if (page) finalUrl = page.finalUrl
        await page?.response.body?.cancel()
      }

      if (html && isVerificationUrl(finalUrl)) {
        pageBlocked = true
        html = ''
      }

      if (html) {
        const ld = jsonLdProduct(html)
        candidates.push(
          ...ld.images,
          ...(isAmazon(finalUrl) ? amazonImages(html) : []),
          ...[
            metaContent(html, ['og:image:secure_url']),
            metaContent(html, ['og:image']),
            metaContent(html, ['twitter:image', 'twitter:image:src']),
            linkImageSrc(html),
          ].filter((v): v is string => Boolean(v)),
        )
        titulo = metaContent(html, ['og:title']) ?? metaContent(html, ['twitter:title']) ?? ld.name ?? htmlTitle(html)
        if (candidates.length === 0 && hasCaptchaMarkers(html)) {
          pageBlocked = true
          titulo = null // título de tela de captcha ("Just a moment…") não é nome de produto
        }
      }
    } catch (err) {
      pageUnavailable = true
      console.warn('extrair-imagem-produto: falha ao baixar página', String(err))
    }

    // 2. Mercado Livre: API — cobre bloqueio de scraping e página sem og:image.
    // IDs lidos da URL de ORIGEM primeiro (a final pode ser a tela de verificação).
    const fromSource = mercadoLivreIds(sourceUrl)
    const fromFinal = mercadoLivreIds(finalUrl)
    const mlIds: MercadoLivreIds = {
      itemId: fromSource.itemId ?? fromFinal.itemId,
      productId: fromSource.productId ?? fromFinal.productId,
    }
    if ((mlIds.itemId || mlIds.productId) && (pageBlocked || candidates.length === 0)) {
      const ml = await mercadoLivreFallback(mlIds)
      if (ml) {
        candidates.unshift(...ml.images)
        titulo = titulo ?? ml.title
      }
    }

    // 3. Baixa os candidatos NA ORDEM e escolhe pela resolução: aceita o primeiro com
    //    lado menor >= MIN_IMAGE_SIDE; guarda o maior como reserva. Sem isso, o
    //    primeiro que baixasse valia — e no Shopify isso era a miniatura de 100px.
    //    Custo: no caso comum a 1ª tentativa já passa (nenhum download extra); no pior
    //    caso baixa até MAX_IMAGE_TRIES miniaturas, que são justamente as leves.
    const seen = new Set<string>()
    const queue = candidates.flatMap((c) => {
      try {
        return upgradedCandidates(new URL(c, finalUrl).toString())
      } catch {
        return []
      }
    })
    let best: { base64: string; mimeType: string; url: string; minSide: number | null } | null = null
    let tries = 0

    for (const absolute of queue) {
      if (seen.has(absolute)) continue
      seen.add(absolute)
      if (tries >= MAX_IMAGE_TRIES) break
      tries += 1

      const image = await downloadImage(absolute, finalUrl)
      if (!image) continue
      if (image.minSide === null || image.minSide >= MIN_IMAGE_SIDE) {
        best = image
        break
      }
      console.log(`extrair-imagem-produto: candidato pequeno (${image.minSide}px) — tentando o proximo`)
      if (!best || (best.minSide ?? 0) < image.minSide) best = image
    }

    if (best) {
      console.log(`extrair-imagem-produto: ok host=${new URL(finalUrl).hostname} kb=${Math.round(best.base64.length * 0.75 / 1024)} minSide=${best.minSide ?? '?'}`)
      return json({
        status: 'ok',
        imageBase64: best.base64,
        mimeType: best.mimeType,
        titulo: titulo?.slice(0, 200) ?? null,
        imageUrl: best.url,
        finalUrl,
      })
    }

    const motivo = pageBlocked
      ? 'pagina_bloqueada'
      : pageUnavailable
        ? 'pagina_indisponivel'
        : candidates.length === 0 ? 'sem_metatag' : 'imagem_invalida'
    console.log(`extrair-imagem-produto: sem_imagem host=${new URL(finalUrl).hostname} motivo=${motivo}`)
    return json({ status: 'sem_imagem', titulo: titulo?.slice(0, 200) ?? null, motivo })
  } catch (err) {
    console.error('extrair-imagem-produto: erro inesperado', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
