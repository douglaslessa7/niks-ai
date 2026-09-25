import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT } from '../_shared/jwt.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Os três buckets que guardam arquivo de usuário com o padrão '{user_id}/arquivo'.
//   scans         → foto de rosto, foto de comida e foto da home (prefixo home_)
//   product-scans → foto de produto
//   coach-images  → fotos enviadas no chat com a NIKS
//
// `skin-previews` NÃO entra: os arquivos lá são 'preview_{timestamp}.jpg', sem o
// user id no caminho, e a URL nunca é gravada em tabela — não há como saber de
// quem é cada um. Quem cuida deles é a `cleanup-skin-previews`, por idade (2h).
const USER_BUCKETS = ['scans', 'product-scans', 'coach-images'] as const

const LIST_PAGE_SIZE = 1000
const DELETE_BATCH_SIZE = 100

/** Lista tudo dentro de `{userId}/` num bucket, paginando. */
async function listUserFiles(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  userId: string,
): Promise<string[]> {
  const paths: string[] = []
  let offset = 0

  while (true) {
    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list(userId, { limit: LIST_PAGE_SIZE, offset })

    // Um erro aqui NÃO pode virar "não havia arquivos": isso apagaria a conta e
    // deixaria as fotos para trás em silêncio — o bug que esta função existe para
    // corrigir. Propaga para o chamador abortar antes de tocar em auth.users.
    if (error) throw new Error(`list ${bucket}/${userId}: ${error.message}`)
    if (!files || files.length === 0) break

    for (const f of files) {
      if (f.name === '.emptyFolderPlaceholder') continue
      if (!f.id) continue   // pasta, não arquivo
      paths.push(`${userId}/${f.name}`)
    }

    if (files.length < LIST_PAGE_SIZE) break
    offset += LIST_PAGE_SIZE
  }

  return paths
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Só o próprio dono apaga a própria conta ───────────────────────────────
    // O id vem do JWT assinado, NUNCA do corpo da requisição. Aceitar um user_id
    // enviado pelo cliente deixaria qualquer pessoa apagar a conta de qualquer
    // outra. Mesma verificação local usada pela niks-chat (_shared/jwt.ts).
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.slice(7)
    const jwtPayload = await verifyJWT(token)
    if (!jwtPayload?.sub) {
      console.error('delete-account: JWT verification failed')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const userId = jwtPayload.sub

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── 1. Arquivos primeiro ──────────────────────────────────────────────────
    // Se o usuário fosse apagado antes, um erro no meio deixaria a conta destruída
    // e os arquivos órfãos para sempre — sem nenhum user id para reencontrá-los.
    // Nesta ordem, uma falha aqui aborta tudo e a conta continua intacta: o usuário
    // pode tentar de novo.
    const removedPerBucket: Record<string, number> = {}

    for (const bucket of USER_BUCKETS) {
      const paths = await listUserFiles(supabase, bucket, userId)
      removedPerBucket[bucket] = 0
      if (paths.length === 0) continue

      for (let i = 0; i < paths.length; i += DELETE_BATCH_SIZE) {
        const batch = paths.slice(i, i + DELETE_BATCH_SIZE)
        // .remove() da API de Storage apaga o registro E os bytes. Um DELETE em
        // storage.objects por SQL removeria só o registro, podendo deixar os bytes
        // órfãos no backend — inaceitável para uma exclusão de conta, que precisa
        // ser real para efeito de LGPD e do Data Safety do Google Play.
        const { data, error } = await supabase.storage.from(bucket).remove(batch)
        if (error) throw new Error(`remove ${bucket}: ${error.message}`)
        removedPerBucket[bucket] += data?.length ?? batch.length
      }
    }

    // ── 2. Só agora o usuário ─────────────────────────────────────────────────
    // As tabelas (users, skin_scans, coach_messages, protocolos, …) cascateiam a
    // partir de auth.users — isso já funcionava antes e não muda aqui.
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('delete-account: auth.admin.deleteUser failed', deleteError)
      return new Response(
        JSON.stringify({ error: 'Failed to delete user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(
      `delete-account: usuário ${userId} apagado; arquivos removidos:`,
      JSON.stringify(removedPerBucket)
    )

    return new Response(
      JSON.stringify({ ok: true, removed: removedPerBucket }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    // Chega aqui quando a limpeza de arquivos falhou. A conta NÃO foi apagada —
    // o app deve mostrar erro e deixar a pessoa tentar de novo, e não seguir para
    // o signOut como se tivesse dado certo.
    console.error('delete-account: falhou antes de apagar o usuário', err)
    return new Response(
      JSON.stringify({ error: 'Failed to delete account files' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
