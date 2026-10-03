import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT } from '../_shared/jwt.ts'
import { ensureScanCutout } from '../_shared/scanCutout.ts'

// Recorte SEM FUNDO sob demanda (Fase 3) — mesmo caminho da analisar-produto
// (`_shared/scanCutout.ts`: catálogo → reuso da mesma usuária → BiRefNet no Replicate).
// Usado pelo app para:
//   • scans antigos (feitos antes do recorte automático) que aparecem em Escaneados;
//   • itens da Minha coleção / estante vindos de scan.
// Itens da coleção vindos do CATÁLOGO usam o recorte do catálogo (recortar-catalogo).
//
// Entrada:  { scanId }  ou  { id }  (id de colecao_produtos) [+ fromPhoto?, force?]
// Saída:    200 { status: 'ok' | 'falhou' | 'catalogo', origem? }
//           400 sem id · 401 sem JWT válido · 404 não é da usuária
// O user_id vem do JWT (verificado localmente), nunca do corpo.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const jwtPayload = await verifyJWT(authHeader.slice(7))
  if (!jwtPayload?.sub) return json({ error: 'Unauthorized' }, 401)
  const userId = jwtPayload.sub

  const body = await req.json().catch(() => ({}))
  const opts = { fromPhoto: body?.fromPhoto === true, force: body?.force === true }
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  let scanId: string | null = body?.scanId ? String(body.scanId) : null
  if (!scanId && body?.id) {
    const { data: item } = await supabase
      .from('colecao_produtos')
      .select('id, origem, product_scan_id')
      .eq('id', String(body.id))
      .eq('user_id', userId)
      .maybeSingle()
    if (!item) return json({ error: 'Produto não encontrado' }, 404)
    if (item.origem !== 'scan' || !item.product_scan_id) return json({ status: 'catalogo' })
    scanId = item.product_scan_id
  }
  if (!scanId) return json({ error: 'scanId ou id obrigatório' }, 400)

  // O scan precisa ser da usuária do token.
  const { data: own } = await supabase.from('product_scans').select('id').eq('id', scanId).eq('user_id', userId).maybeSingle()
  if (!own) return json({ error: 'Scan não encontrado' }, 404)

  return json(await ensureScanCutout(supabase, scanId, opts))
})
