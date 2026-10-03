import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'
import { verifyJWT } from '../_shared/jwt.ts'

// Recorte da "miniatura" de um produto da coleção (design 48a — Minha estante).
// Tira o fundo da foto (fal.ai BiRefNet; rembg de reserva), corta as bordas
// transparentes, limita a 600px e grava o PNG no bucket PRIVADO `colecao`
// ({user_id}/{id}.png). Uma vez por produto: se já está 'ok', só devolve.
//
// Entrada:  { id }  — id de colecao_produtos (da PRÓPRIA usuária, conferido pelo JWT)
// Saída:    200 { status: 'ok', recorte_path, w, h } · 200 { status: 'falhou', motivo }
//           400 sem id · 401 sem JWT válido · 404 produto não é dela
// Secrets:  FAL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NIKS_JWT_SECRET/SUPABASE_JWKS

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const BUCKET = 'colecao'
const MAX_SIDE = 600
const ALPHA_MIN = 16          // pixel com alfa abaixo disso conta como fundo no corte
const FAL_TIMEOUT_MS = 60_000

// Tira o fundo: BiRefNet (melhor contorno em frascos/tubos); se falhar, rembg.
async function removeBackground(imageUrl: string, key: string): Promise<string> {
  const tries: [string, Record<string, unknown>][] = [
    ['https://fal.run/fal-ai/birefnet', { image_url: imageUrl, output_format: 'png' }],
    ['https://fal.run/fal-ai/imageutils/rembg', { image_url: imageUrl }],
  ]
  let lastErr = ''
  for (const [url, body] of tries) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FAL_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      if (!res.ok) { lastErr = `${url} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`; continue }
      const out = await res.json()
      const outUrl = out?.image?.url
      if (typeof outUrl === 'string' && outUrl) return outUrl
      lastErr = `${url} → resposta sem image.url`
    } catch (e) {
      lastErr = `${url} → ${(e as Error)?.message ?? e}`
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(lastErr || 'remoção de fundo falhou')
}

// Corta as bordas transparentes (com 2px de folga) e reduz para no máximo MAX_SIDE.
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
  if (maxX < 0) throw new Error('recorte vazio (nenhum pixel do produto)')
  const pad = 2
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ── Só a dona do produto pede o recorte ────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const jwtPayload = await verifyJWT(authHeader.slice(7))
  if (!jwtPayload?.sub) return json({ error: 'Unauthorized' }, 401)
  const userId = jwtPayload.sub

  let id = ''
  try { id = String((await req.json())?.id ?? '') } catch { /* corpo inválido */ }
  if (!id) return json({ error: 'id obrigatório' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: row, error: rowErr } = await supabase
    .from('colecao_produtos')
    .select('id, user_id, origem, imagem_url, recorte_path, recorte_status, recorte_w, recorte_h')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (rowErr) return json({ error: 'Erro ao ler o produto' }, 500)
  if (!row) return json({ error: 'Produto não encontrado' }, 404)
  if (row.recorte_status === 'ok' && row.recorte_path) {
    return json({ status: 'ok', recorte_path: row.recorte_path, w: row.recorte_w, h: row.recorte_h })
  }

  const fail = async (motivo: string) => {
    console.error('recortar-produto:', id, motivo)
    await supabase.from('colecao_produtos').update({ recorte_status: 'falhou' }).eq('id', id)
    return json({ status: 'falhou', motivo })
  }

  try {
    // Foto de origem: catálogo = URL pública; scan = foto no bucket privado product-scans.
    let sourceUrl = row.imagem_url as string | null
    if (row.origem === 'scan' && sourceUrl && !/^https?:\/\//.test(sourceUrl)) {
      const { data: signed, error } = await supabase.storage.from('product-scans').createSignedUrl(sourceUrl, 600)
      if (error || !signed?.signedUrl) return await fail(`URL assinada da foto: ${error?.message ?? 'vazia'}`)
      sourceUrl = signed.signedUrl
    }
    if (!sourceUrl) return await fail('produto sem foto')

    const falKey = Deno.env.get('FAL_API_KEY')
    if (!falKey) return await fail('FAL_API_KEY ausente')

    const cutUrl = await removeBackground(sourceUrl, falKey)
    const pngRes = await fetch(cutUrl)
    if (!pngRes.ok) return await fail(`download do recorte: HTTP ${pngRes.status}`)
    const img = trimAndFit(await Image.decode(new Uint8Array(await pngRes.arrayBuffer())))
    const png = await img.encode(1)

    const path = `${userId}/${id}.png`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: true })
    if (upErr) return await fail(`upload: ${upErr.message}`)

    const { error: updErr } = await supabase
      .from('colecao_produtos')
      .update({ recorte_path: path, recorte_status: 'ok', recorte_w: img.width, recorte_h: img.height })
      .eq('id', id)
    if (updErr) return await fail(`update: ${updErr.message}`)

    return json({ status: 'ok', recorte_path: path, w: img.width, h: img.height })
  } catch (e) {
    return await fail(String((e as Error)?.message ?? e))
  }
})
