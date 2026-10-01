import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Rede de segurança: apaga as pastas `{user_id}/` dos 4 buckets cujo dono não
// existe mais em auth.users. Builds antigas do app apagam a conta pela RPC
// `delete_user` (só auth.users) e deixam as fotos para trás; a delete-account
// atual já apaga os arquivos antes — esta função pega o que escapar.
// Roda 1x/dia via pg_cron. Migration: 20261001130000_cleanup_orphan_storage.sql.
//
// Remoção DESLIGADA por padrão: só apaga com o secret ORPHAN_CLEANUP_REMOVE=true.
// Sem ele, roda a seco e só grava em public.storage_cleanup_log.

const MIN_AGE = '24 hours'          // não disputa com uma exclusão em andamento
const MAX_OWNERS_PER_RUN = 50       // mais que isso = algo estranho → aborta
const DELETE_BATCH_SIZE = 100

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

serve(async (req) => {
  // Esta função APAGA arquivos. O segredo vem do Vault, via pg_cron.
  // Deployada com verify_jwt = false (o pg_cron não tem sessão de usuário).
  const expected = Deno.env.get('ORPHAN_CLEANUP_SECRET')
  if (!expected || req.headers.get('x-cleanup-secret') !== expected) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const dryRun = Deno.env.get('ORPHAN_CLEANUP_REMOVE') !== 'true'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const log = {
    dry_run: dryRun,
    status: 'ok',
    reason: null as string | null,
    auth_users_count: null as number | null,
    candidates: 0,
    confirmed: 0,
    files: 0,
    bytes: 0,
    removed: 0,
    details: [] as Record<string, unknown>[],
  }

  const finish = async (httpStatus = 200) => {
    const { error } = await supabase.from('storage_cleanup_log').insert(log)
    if (error) console.error('cleanup-orphan-storage: log insert failed', error)
    console.log('cleanup-orphan-storage:', JSON.stringify({ ...log, details: log.details.length }))
    return json({ ...log, details: log.details.length }, httpStatus)
  }

  try {
    // ── Trava 1: auth.users precisa responder e ter gente ─────────────────────
    // Se a contagem falhar ou vier 0, TODO MUNDO pareceria órfão.
    const { data: count, error: countErr } = await supabase.rpc('auth_users_count')
    if (countErr || typeof count !== 'number' || count <= 0) {
      log.status = 'aborted'
      log.reason = `auth_users_count inválido: ${countErr?.message ?? count}`
      return await finish()
    }
    log.auth_users_count = count

    // A API de Admin também precisa estar de pé (é ela que confirma cada dono).
    const { data: probe, error: probeErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (probeErr || !probe?.users?.length) {
      log.status = 'aborted'
      log.reason = `API de Admin não respondeu com usuários: ${probeErr?.message ?? 'lista vazia'}`
      return await finish()
    }

    // ── Candidatas (SQL) ─────────────────────────────────────────────────────
    const { data: rows, error: rowsErr } = await supabase.rpc('orphan_storage_folders', { min_age: MIN_AGE })
    if (rowsErr) {
      log.status = 'error'
      log.reason = `orphan_storage_folders: ${rowsErr.message}`
      return await finish(500)
    }

    type Row = { owner_id: string; bucket_id: string; files: number; bytes: number; paths: string[] }
    const byOwner = new Map<string, Row[]>()
    for (const r of (rows ?? []) as Row[]) {
      if (!byOwner.has(r.owner_id)) byOwner.set(r.owner_id, [])
      byOwner.get(r.owner_id)!.push(r)
    }
    log.candidates = byOwner.size

    // ── Trava 2: limite por execução ─────────────────────────────────────────
    if (byOwner.size > MAX_OWNERS_PER_RUN) {
      log.status = 'aborted'
      log.reason = `${byOwner.size} donos órfãos (limite ${MAX_OWNERS_PER_RUN}) — nada apagado, conferir à mão`
      log.details = [...byOwner.keys()].slice(0, MAX_OWNERS_PER_RUN).map((owner_id) => ({ owner_id }))
      return await finish()
    }

    // ── Trava 3: cada dono confirmado pela API de Admin ──────────────────────
    for (const [ownerId, buckets] of byOwner) {
      const { data, error } = await supabase.auth.admin.getUserById(ownerId)
      // deno-lint-ignore no-explicit-any
      const e = error as any
      const notFound = !!e && e.status === 404 && e.code === 'user_not_found'
      if (!notFound) {
        // Existe (ou resposta duvidosa): NUNCA apaga.
        log.details.push({ owner_id: ownerId, action: data?.user ? 'skip_exists' : 'skip_uncertain', error: e?.message ?? null })
        continue
      }
      log.confirmed++

      for (const b of buckets) {
        // Só caminhos dentro da própria pasta do dono.
        const paths = b.paths.filter((p) => p.startsWith(`${ownerId}/`))
        log.files += paths.length
        log.bytes += Number(b.bytes) || 0

        if (dryRun) {
          log.details.push({ owner_id: ownerId, bucket: b.bucket_id, files: paths.length, bytes: b.bytes, action: 'would_remove' })
          continue
        }

        let removed = 0
        const failures: string[] = []
        for (let i = 0; i < paths.length; i += DELETE_BATCH_SIZE) {
          const batch = paths.slice(i, i + DELETE_BATCH_SIZE)
          // .remove() da API de Storage apaga o registro E os bytes.
          const { data: gone, error: rmErr } = await supabase.storage.from(b.bucket_id).remove(batch)
          if (rmErr) {
            console.error('cleanup-orphan-storage: remove failed', b.bucket_id, ownerId, rmErr)
            failures.push(...batch)
            continue
          }
          removed += gone?.length ?? 0
        }
        log.removed += removed
        log.details.push({
          owner_id: ownerId, bucket: b.bucket_id, files: paths.length, bytes: b.bytes,
          action: 'removed', removed, failed: failures.length,
        })
      }
    }

    return await finish()
  } catch (err) {
    console.error('cleanup-orphan-storage: unexpected error', err)
    log.status = 'error'
    log.reason = String((err as Error)?.message ?? err)
    return await finish(500)
  }
})
