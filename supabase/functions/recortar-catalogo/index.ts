import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

// Recorte SEM FUNDO das fotos do catálogo (Fase 2) — só para administrador.
// Para cada produto: foto original → BiRefNet no Replicate (`sprited/birefnet`) →
// corta as bordas transparentes (folga de 3%) → máx. 1024px → WebP com transparência
// (qualidade 90, convertido pelo próprio Storage) → produtos/recortes/{id}.webp →
// grava imagem_recorte_* em `produtos`. A `imagem_url` original nunca é tocada; se der
// errado, o produto fica 'falhou' e o app continua usando a original.
//
// Trava: header x-admin-secret = secret CATALOG_CUTOUT_SECRET (não é chamada pelo app).
// Corpo:  { ids?: string[], limit?: number (padrão 20), retryFailed?: boolean }
// Um produto por vez: conta do Replicate com limite baixo (429) → espera e tenta de novo.
// Para sozinha perto do limite de tempo da Edge Function e diz quantos faltam —
// é só chamar de novo (idempotente: pega só os sem recorte).
// Secrets: CATALOG_CUTOUT_SECRET, REPLICATE_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const MODEL = 'sprited/birefnet'
const BUCKET = 'produtos'
const MAX_SIDE = 1024
const ALPHA_MIN = 16
const PAD_RATIO = 0.03
const TIME_BUDGET_MS = 120_000

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function replicate(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.replicate.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  let body: any = null
  try { body = await res.json() } catch { /* sem corpo */ }
  return { status: res.status, body }
}

// Corta o fundo transparente com folga e reduz para no máximo MAX_SIDE.
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

serve(async (req) => {
  const expected = Deno.env.get('CATALOG_CUTOUT_SECRET')
  if (!expected || req.headers.get('x-admin-secret') !== expected) return json({ error: 'Unauthorized' }, 401)
  const token = Deno.env.get('REPLICATE_API_TOKEN')
  if (!token) return json({ error: 'REPLICATE_API_TOKEN ausente' }, 500)

  const { ids, limit = 20, retryFailed = false } = await req.json().catch(() => ({}))
  const t0 = Date.now()
  const supaUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabase = createClient(supaUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  let q = supabase.from('produtos').select('id, nome, imagem_url').not('imagem_url', 'is', null).order('id').limit(limit)
  if (Array.isArray(ids) && ids.length) q = q.in('id', ids)
  // Só os pendentes (e os que falharam, com retryFailed) — chamar de novo nunca refaz um 'ok'.
  q = retryFailed ? q.or('imagem_recorte_status.is.null,imagem_recorte_status.eq.falhou') : q.is('imagem_recorte_status', null)
  const { data: rows, error } = await q
  if (error) return json({ error: error.message }, 500)

  const m = await replicate(`/models/${MODEL}`, token)
  const version = m.body?.latest_version?.id
  if (!version) return json({ error: 'versão do modelo não encontrada', http: m.status }, 500)

  const results: Record<string, unknown>[] = []
  for (const p of rows ?? []) {
    if (Date.now() - t0 > TIME_BUDGET_MS) break
    const s0 = Date.now()
    try {
      // AVIF: o modelo não abre — pede ao Storage uma versão em JPEG (endereço de render).
      let src = p.imagem_url as string
      if (/\.avif(\?|$)/i.test(src)) src = src.replace('/object/public/', '/render/image/public/')

      let pr = { status: 0, body: null as any }
      for (let attempt = 0; attempt < 6; attempt++) {
        pr = await replicate('/predictions', token, {
          method: 'POST', headers: { Prefer: 'wait=60' },
          body: JSON.stringify({ version, input: { image: src } }),
        })
        if (pr.status !== 429) break
        await sleep(Math.min(35, Math.max(2, Number(pr.body?.retry_after ?? 10))) * 1000)
      }
      let pred = pr.body
      while (pred && ['starting', 'processing'].includes(pred.status) && Date.now() - s0 < 90_000) {
        await sleep(1500)
        pred = (await replicate(`/predictions/${pred.id}`, token)).body
      }
      if (pred?.status !== 'succeeded' || !pred?.output) throw new Error(pred?.error ?? `predição ${pred?.status ?? 'http ' + pr.status}`)

      const pngRes = await fetch(String(pred.output))
      if (!pngRes.ok) throw new Error(`download do recorte: HTTP ${pngRes.status}`)
      const img = trimAndFit(await Image.decode(new Uint8Array(await pngRes.arrayBuffer())))

      // PNG temporário → o Storage converte para WebP (mantém a transparência).
      const tmp = `recortes/tmp/${p.id}.png`
      const up = await supabase.storage.from(BUCKET).upload(tmp, await img.encode(1), { contentType: 'image/png', upsert: true })
      if (up.error) throw new Error(`upload temporário: ${up.error.message}`)
      const webpRes = await fetch(
        `${supaUrl}/storage/v1/render/image/public/${BUCKET}/${tmp}?width=${img.width}&height=${img.height}&resize=contain&quality=90&v=${Date.now()}`,
        { headers: { Accept: 'image/webp' } },
      )
      const webpType = webpRes.headers.get('content-type') ?? ''
      if (!webpRes.ok || !webpType.includes('webp')) throw new Error(`conversão WebP: HTTP ${webpRes.status} ${webpType}`)
      const webp = new Uint8Array(await webpRes.arrayBuffer())
      const path = `recortes/${p.id}.webp`
      const fin = await supabase.storage.from(BUCKET).upload(path, webp, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
      await supabase.storage.from(BUCKET).remove([tmp])
      if (fin.error) throw new Error(`upload final: ${fin.error.message}`)

      const url = `${supaUrl}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}`
      const { error: updErr } = await supabase.from('produtos').update({
        imagem_recorte_url: url, imagem_recorte_status: 'ok', imagem_recorte_w: img.width, imagem_recorte_h: img.height,
        imagem_recorte_em: new Date().toISOString(), imagem_recorte_erro: null,
      }).eq('id', p.id)
      if (updErr) throw new Error(`update: ${updErr.message}`)
      results.push({ id: p.id, nome: p.nome, status: 'ok', w: img.width, h: img.height, kb: Math.round(webp.length / 1024), gpu_s: pred.metrics?.predict_time ?? null, ms: Date.now() - s0 })
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 300)
      await supabase.from('produtos').update({ imagem_recorte_status: 'falhou', imagem_recorte_erro: msg, imagem_recorte_em: new Date().toISOString() }).eq('id', p.id)
      results.push({ id: p.id, nome: p.nome, status: 'falhou', erro: msg, ms: Date.now() - s0 })
    }
  }

  const { count: faltam } = await supabase.from('produtos').select('id', { count: 'exact', head: true })
    .not('imagem_url', 'is', null).is('imagem_recorte_status', null)
  return json({
    processados: results.length,
    ok: results.filter((r) => r.status === 'ok').length,
    falhou: results.filter((r) => r.status === 'falhou').length,
    faltam_no_catalogo: faltam, ms: Date.now() - t0, results,
  })
})
