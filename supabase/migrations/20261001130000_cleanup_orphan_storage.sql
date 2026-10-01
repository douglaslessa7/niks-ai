-- cleanup-orphan-storage — rede de segurança para arquivos de contas apagadas
-- Builds antigas do app ainda apagam a conta pela RPC `delete_user`, que só faz
-- DELETE em auth.users: as tabelas cascateiam, mas as FOTOS ficam nos buckets.
-- A Edge Function `cleanup-orphan-storage` (pg_cron, 1x/dia) usa estas peças para
-- achar as pastas `{user_id}/` cujo dono não existe mais e apagá-las pela API de
-- Storage (que remove os bytes, não só o registro).
-- Nada aqui apaga arquivo: só lista e registra. O cron + segredo no Vault são
-- criados à parte (ver README → "Limpeza de arquivos órfãos").

-- Log de cada execução (auditoria / LGPD) -------------------------------------
create table if not exists public.storage_cleanup_log (
  id                bigint generated always as identity primary key,
  run_at            timestamptz not null default now(),
  dry_run           boolean not null,
  status            text not null,            -- 'ok' | 'aborted' | 'error'
  reason            text,                     -- por que abortou / erro
  auth_users_count  bigint,
  candidates        int not null default 0,   -- donos órfãos achados no SQL
  confirmed         int not null default 0,   -- confirmados 404 na API de Admin
  files             int not null default 0,   -- arquivos dos confirmados
  bytes             bigint not null default 0,
  removed           int not null default 0,   -- de fato apagados (0 a seco)
  details           jsonb not null default '[]'::jsonb
);

-- Sem policies: só o service_role (a Edge Function e o painel) lê e grava.
alter table public.storage_cleanup_log enable row level security;
revoke all on public.storage_cleanup_log from anon, authenticated;

-- Total de usuárias em auth.users ---------------------------------------------
-- Trava da função: se vier 0 ou erro, ela aborta (uma consulta quebrada faria
-- TODO MUNDO parecer órfão).
create or replace function public.auth_users_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from auth.users;
$$;

-- Arquivos órfãos, agrupados por dono e bucket -------------------------------
-- Só pastas com nome UUID, cujo dono não existe em auth.users e cujo arquivo
-- mais recente (em qualquer dos 4 buckets) tem mais que `min_age` — não disputa
-- com uma exclusão de conta em andamento. Uma linha por (dono, bucket), com os
-- caminhos exatos: o PostgREST corta em 1000 linhas, e assim isso só acontece
-- muito acima do limite por execução da função (que então aborta).
create or replace function public.orphan_storage_folders(min_age interval default interval '24 hours')
returns table (owner_id text, bucket_id text, files int, bytes bigint, paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  with obj as (
    select o.bucket_id,
           split_part(o.name, '/', 1)                    as owner_id,
           o.name,
           coalesce((o.metadata->>'size')::bigint, 0)    as size,
           greatest(o.created_at, o.updated_at)          as touched_at
      from storage.objects o
     where o.bucket_id in ('scans', 'product-scans', 'coach-images', 'routine-photos')
       and o.name like '%/%'
  ),
  orphan as (
    select obj.owner_id
      from obj
     where obj.owner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (select 1 from auth.users a where a.id::text = obj.owner_id)
     group by obj.owner_id
    having max(obj.touched_at) < now() - min_age
  )
  select obj.owner_id,
         obj.bucket_id,
         count(*)::int,
         sum(obj.size)::bigint,
         array_agg(obj.name order by obj.name)
    from obj
    join orphan using (owner_id)
   group by obj.owner_id, obj.bucket_id
   order by obj.owner_id, obj.bucket_id;
$$;

revoke execute on function public.auth_users_count() from public, anon, authenticated;
revoke execute on function public.orphan_storage_folders(interval) from public, anon, authenticated;
grant  execute on function public.auth_users_count() to service_role;
grant  execute on function public.orphan_storage_folders(interval) to service_role;
