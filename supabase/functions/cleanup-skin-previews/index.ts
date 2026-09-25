import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Previews com mais de 2h são lixo: a imagem é usada UMA vez, na tela
// plan-preview do onboarding, e nunca mais. A URL nem é guardada em tabela.
const MAX_AGE_MS = 1000 * 60 * 60 * 2

const BUCKET = 'skin-previews'
const LIST_PAGE_SIZE = 1000   // máximo aceito pela API de Storage
const DELETE_BATCH_SIZE = 100

serve(async (req) => {
  // Esta função APAGA arquivos. Sem esta trava, qualquer um que descobrisse a URL
  // poderia zerar o bucket. O segredo vem do Vault, via pg_cron.
  // Precisa ser deployada com --no-verify-jwt (o pg_cron não tem sessão de usuário).
  const expected = Deno.env.get('CLEANUP_SECRET')
  if (!expected || req.headers.get('x-cleanup-secret') !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const cutoff = Date.now() - MAX_AGE_MS
  const expired: string[] = []

  try {
    // Pagina a listagem: o bucket é plano (arquivos na raiz) e pode ter
    // acumulado muita coisa desde que o app entrou no ar.
    let offset = 0
    while (true) {
      const { data: files, error } = await supabase.storage
        .from(BUCKET)
        .list('', { limit: LIST_PAGE_SIZE, offset })

      if (error) {
        console.error('cleanup-skin-previews: list failed', error)
        return new Response(JSON.stringify({ error: 'List failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (!files || files.length === 0) break

      for (const f of files) {
        // A raiz de um bucket pode conter o placeholder de pasta vazia do Supabase.
        if (f.name === '.emptyFolderPlaceholder') continue
        // Um item sem `id` é pasta, não arquivo — não tem o que remover aqui.
        if (!f.id) continue

        const createdAt = f.created_at ? Date.parse(f.created_at) : NaN
        // Data ilegível: NÃO apaga. Preferimos deixar lixo a apagar algo recente
        // por engano — este é um caminho destrutivo e sem volta.
        if (Number.isNaN(createdAt)) {
          console.warn('cleanup-skin-previews: created_at ilegível, pulando', f.name)
          continue
        }
        if (createdAt < cutoff) expired.push(f.name)
      }

      if (files.length < LIST_PAGE_SIZE) break
      offset += LIST_PAGE_SIZE
    }

    // .remove() da API de Storage — apaga o registro E os bytes.
    // É por isso que esta limpeza é uma Edge Function e não um DELETE em SQL:
    // apagar linhas de storage.objects some com o registro mas pode deixar
    // os bytes órfãos no backend, que é exatamente o que NÃO queremos aqui.
    let removed = 0
    const failures: string[] = []

    for (let i = 0; i < expired.length; i += DELETE_BATCH_SIZE) {
      const batch = expired.slice(i, i + DELETE_BATCH_SIZE)
      const { data, error } = await supabase.storage.from(BUCKET).remove(batch)
      if (error) {
        console.error('cleanup-skin-previews: remove failed', error)
        failures.push(...batch)
        continue   // segue para o próximo lote em vez de abortar tudo
      }
      removed += data?.length ?? batch.length
    }

    console.log(
      `cleanup-skin-previews: ${expired.length} expiradas, ${removed} removidas, ${failures.length} falhas`
    )

    return new Response(
      JSON.stringify({
        ok: true,
        cutoff: new Date(cutoff).toISOString(),
        expired: expired.length,
        removed,
        failed: failures.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('cleanup-skin-previews: unexpected error', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
