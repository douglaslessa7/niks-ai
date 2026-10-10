// ─────────────────────────────────────────────────────────────────────────────
// Recorte SEM FUNDO da foto de um produto escaneado (Fase 3).
// Usado pela analisar-produto (em segundo plano, logo depois de salvar o scan) e pela
// recortar-produto (sob demanda: scans antigos, coleção/estante). Ordem:
//   1. catálogo  — marca + nome batem (com segurança) com um produto do catálogo que já
//                  tem recorte → usa a URL pública dele (sem custo);
//   2. reuso     — a mesma usuária já tem um scan recortado do mesmo produto → copia;
//   3. replicate — BiRefNet (sprited/birefnet) na foto do scan → corta bordas
//                  transparentes com folga → máx. 1024px → WebP com transparência
//                  (qualidade 90, convertido pelo Storage) → product-scans/{user}/{scan}_recorte.webp.
// Grava em product_scans.recorte_* ('ok' ou 'falhou'). Nunca lança: falha vira 'falhou'
// e o app continua mostrando a foto original.
// Secrets: REPLICATE_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

const MODEL = 'sprited/birefnet'
const BUCKET = 'product-scans'
const MAX_SIDE = 1024
const ALPHA_MIN = 16
const PAD_RATIO = 0.03

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// "SKIN1004 — Madagascar Centella Ampoule" → "madagascar centella ampoule" (sem acento/pontuação)
export function norm(s?: string | null): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim()
}
function tokens(s: string): Set<string> {
  return new Set(s.split(' ').filter((t) => t.length > 1))
}
export function sameBrand(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}
// Estrito de propósito: casar o produto errado mostraria a foto de OUTRO produto.
export function sameName(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const A = tokens(a), B = tokens(b)
  if (A.size < 2 || B.size < 2) return false
  let inter = 0
  A.forEach((t) => { if (B.has(t)) inter++ })
  return inter / (A.size + B.size - inter) >= 0.85
}

async function replicate(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.replicate.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  let body: any = null
  try { body = await res.json() } catch { /* sem corpo */ }
  return { status: res.status, body }
}

let cachedVersion: string | null = null
async function modelVersion(token: string): Promise<string> {
  if (cachedVersion) return cachedVersion
  const m = await replicate(`/models/${MODEL}`, token)
  const v = m.body?.latest_version?.id
  if (!v) throw new Error(`versão do modelo não encontrada (HTTP ${m.status})`)
  cachedVersion = v
  return v
}

// Tira o fundo; um pedido por vez, esperando quando a conta devolve 429.
async function removeBackground(imageUrl: string, token: string): Promise<Uint8Array> {
  const version = await modelVersion(token)
  const t0 = Date.now()
  let pr = { status: 0, body: null as any }
  for (let attempt = 0; attempt < 6; attempt++) {
    pr = await replicate('/predictions', token, {
      method: 'POST', headers: { Prefer: 'wait=60' },
      body: JSON.stringify({ version, input: { image: imageUrl } }),
    })
    if (pr.status !== 429) break
    await sleep(Math.min(35, Math.max(2, Number(pr.body?.retry_after ?? 10))) * 1000)
  }
  let pred = pr.body
  while (pred && ['starting', 'processing'].includes(pred.status) && Date.now() - t0 < 90_000) {
    await sleep(1500)
    pred = (await replicate(`/predictions/${pred.id}`, token)).body
  }
  if (pred?.status !== 'succeeded' || !pred?.output) throw new Error(pred?.error ?? `predição ${pred?.status ?? 'http ' + pr.status}`)
  const res = await fetch(String(pred.output))
  if (!res.ok) throw new Error(`download do recorte: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

function trimAndFit(img: Image): Image {
  const { width: W, height: H, bitmap } = img
  let minX = W, minY = H, maxX = -1, maxY = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (bitmap[(y * W + x) * 4 + 3] > ALPHA_MIN) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('recorte vazio')
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * PAD_RATIO)
  const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad)
  const x1 = Math.min(W - 1, maxX + pad), y1 = Math.min(H - 1, maxY + pad)
  img.crop(x0, y0, x1 - x0 + 1, y1 - y0 + 1)
  if (img.width > MAX_SIDE || img.height > MAX_SIDE) {
    if (img.height >= img.width) img.resize(Image.RESIZE_AUTO, MAX_SIDE)
    else img.resize(MAX_SIDE, Image.RESIZE_AUTO)
  }
  return img
}

// fromPhoto: pula catálogo/reuso e recorta a foto do scan · force: refaz mesmo já estando 'ok'
type Opts = { fromPhoto?: boolean; force?: boolean }

// Garante o recorte do scan. Devolve o estado final ('ok' | 'falhou') e de onde veio.
export async function ensureScanCutout(supabase: any, scanId: string, opts: Opts = {}): Promise<{ status: string; origem?: string; erro?: string }> {
  const { data: scan, error } = await supabase
    .from('product_scans')
    .select('id, user_id, image_path, produto_nome, produto_marca, recorte_status')
    .eq('id', scanId)
    .maybeSingle()
  if (error || !scan) return { status: 'falhou', erro: 'scan não encontrado' }
  if (scan.recorte_status === 'ok' && !opts.fromPhoto && !opts.force) return { status: 'ok' }

  const done = async (fields: Record<string, unknown>) => {
    await supabase.from('product_scans').update({ ...fields, recorte_em: new Date().toISOString() }).eq('id', scanId)
  }
  const nome = norm(scan.produto_nome), marca = norm(scan.produto_marca)

  try {
    if (!opts.fromPhoto && nome && marca) {
      // 1. Catálogo — mesma marca e mesmo nome, só produtos já recortados.
      const first = marca.split(' ')[0]
      const { data: cands } = await supabase
        .from('produtos')
        .select('id, marca, nome, imagem_recorte_url, imagem_recorte_w, imagem_recorte_h')
        .eq('imagem_recorte_status', 'ok')
        .ilike('marca', `%${first}%`)
        .limit(300)
      const hit = (cands ?? []).find((p: any) => sameBrand(norm(p.marca), marca) && sameName(norm(p.nome), nome))
      if (hit?.imagem_recorte_url) {
        await done({ recorte_status: 'ok', recorte_origem: 'catalogo', recorte_url: hit.imagem_recorte_url, recorte_path: null, recorte_w: hit.imagem_recorte_w, recorte_h: hit.imagem_recorte_h, recorte_erro: null })
        return { status: 'ok', origem: 'catalogo' }
      }
      // 2. Reuso — scan anterior da MESMA usuária, mesmo produto, já recortado.
      const { data: prev } = await supabase
        .from('product_scans')
        .select('id, produto_nome, produto_marca, recorte_origem, recorte_path, recorte_url, recorte_w, recorte_h')
        .eq('user_id', scan.user_id)
        .eq('recorte_status', 'ok')
        .neq('id', scanId)
        .order('created_at', { ascending: false })
        .limit(200)
      const same = (prev ?? []).find((p: any) => sameBrand(norm(p.produto_marca), marca) && sameName(norm(p.produto_nome), nome))
      if (same) {
        await done({ recorte_status: 'ok', recorte_origem: 'reuso', recorte_url: same.recorte_url, recorte_path: same.recorte_path, recorte_w: same.recorte_w, recorte_h: same.recorte_h, recorte_erro: null })
        return { status: 'ok', origem: 'reuso' }
      }
    }

    // 3. Replicate na foto do scan.
    if (!scan.image_path) throw new Error('scan sem foto')
    const token = Deno.env.get('REPLICATE_API_TOKEN')
    if (!token) throw new Error('REPLICATE_API_TOKEN ausente')
    const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(scan.image_path, 600)
    if (signErr || !signed?.signedUrl) throw new Error(`URL da foto: ${signErr?.message ?? 'vazia'}`)

    const img = trimAndFit(await Image.decode(await removeBackground(signed.signedUrl, token)))

    // PNG temporário (mesma pasta da usuária) → o Storage converte para WebP.
    const tmp = `${scan.user_id}/${scanId}_tmp.png`
    const up = await supabase.storage.from(BUCKET).upload(tmp, await img.encode(1), { contentType: 'image/png', upsert: true })
    if (up.error) throw new Error(`upload temporário: ${up.error.message}`)
    // URL assinada JÁ com a conversão (independe do formato da chave de serviço).
    const { data: tr, error: trErr } = await supabase.storage.from(BUCKET).createSignedUrl(tmp, 120, {
      transform: { width: img.width, height: img.height, resize: 'contain', quality: 90 },
    })
    if (trErr || !tr?.signedUrl) {
      await supabase.storage.from(BUCKET).remove([tmp])
      throw new Error(`URL da conversão: ${trErr?.message ?? 'vazia'}`)
    }
    const webpRes = await fetch(tr.signedUrl, { headers: { Accept: 'image/webp' } })
    const type = webpRes.headers.get('content-type') ?? ''
    if (!webpRes.ok || !type.includes('webp')) {
      await supabase.storage.from(BUCKET).remove([tmp])
      throw new Error(`conversão WebP: HTTP ${webpRes.status} ${type} ${(await webpRes.text()).slice(0, 120)}`)
    }
    const webp = new Uint8Array(await webpRes.arrayBuffer())
    const path = `${scan.user_id}/${scanId}_recorte.webp`
    const fin = await supabase.storage.from(BUCKET).upload(path, webp, { contentType: 'image/webp', upsert: true })
    await supabase.storage.from(BUCKET).remove([tmp])
    if (fin.error) throw new Error(`upload final: ${fin.error.message}`)

    await done({ recorte_status: 'ok', recorte_origem: 'replicate', recorte_path: path, recorte_url: null, recorte_w: img.width, recorte_h: img.height, recorte_erro: null })
    return { status: 'ok', origem: 'replicate' }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300)
    console.error('scanCutout:', scanId, msg)
    await done({ recorte_status: 'falhou', recorte_erro: msg })
    return { status: 'falhou', erro: msg }
  }
}
