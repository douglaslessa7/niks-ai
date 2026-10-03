-- colecao_produtos — "Minha coleção" (design 47a) + "Minha estante" (design 48a)
-- Produtos que a usuária MARCOU que tem em casa ("Tenho em casa"), vindos de um scan
-- (product_scans) ou do catálogo (produtos, pela aba Recomendados). Cada um ganha um
-- recorte sem fundo (PNG) para virar "miniatura" na estante — feito pela Edge Function
-- `recortar-produto` e guardado no bucket PRIVADO `colecao` ({user_id}/{id}.png).
-- `estante` = posição na estante ({"s": 0..2 prateleira, "x": centro em pt do frame
-- 393}); null = "Fora da estante".

-- Tabela (idempotente) --------------------------------------------------------
create table if not exists public.colecao_produtos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  origem           text not null check (origem in ('scan', 'catalogo')),
  product_scan_id  uuid references public.product_scans(id) on delete set null,
  produto_id       uuid references public.produtos(id) on delete set null,
  nome             text,
  marca            text,
  categoria        text,
  compatibilidade  int,
  -- foto original: URL pública (catálogo) ou path no bucket product-scans (scan)
  imagem_url       text,
  recorte_path     text,
  recorte_status   text not null default 'pendente' check (recorte_status in ('pendente', 'ok', 'falhou')),
  recorte_w        int,
  recorte_h        int,
  estante          jsonb,
  created_at       timestamptz not null default now()
);

-- Um mesmo scan / produto do catálogo entra uma vez só na coleção da usuária.
create unique index if not exists colecao_produtos_user_scan_key
  on public.colecao_produtos (user_id, product_scan_id) where product_scan_id is not null;
create unique index if not exists colecao_produtos_user_produto_key
  on public.colecao_produtos (user_id, produto_id) where produto_id is not null;
create index if not exists colecao_produtos_user_created_idx
  on public.colecao_produtos (user_id, created_at desc);

-- RLS: a usuária lê, adiciona, move (estante) e tira só os próprios produtos ----
-- O recorte (recorte_*) é gravado pela Edge Function com service role.
alter table public.colecao_produtos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'colecao_produtos' and policyname = 'colecao_select_own') then
    create policy colecao_select_own on public.colecao_produtos
      for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'colecao_produtos' and policyname = 'colecao_insert_own') then
    create policy colecao_insert_own on public.colecao_produtos
      for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'colecao_produtos' and policyname = 'colecao_update_own') then
    create policy colecao_update_own on public.colecao_produtos
      for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'colecao_produtos' and policyname = 'colecao_delete_own') then
    create policy colecao_delete_own on public.colecao_produtos
      for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- Bucket privado dos recortes ---------------------------------------------------
insert into storage.buckets (id, name, public)
values ('colecao', 'colecao', false)
on conflict (id) do nothing;

-- Storage: a usuária só LÊ a própria pasta ({user_id}/...). Quem grava é a Edge
-- Function (service role) — o app nunca sobe arquivo neste bucket.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'colecao_read_own') then
    create policy colecao_read_own on storage.objects
      for select to authenticated
      using (bucket_id = 'colecao' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- A limpeza diária de arquivos órfãos (cleanup-orphan-storage) passa a olhar também
-- o bucket `colecao`. Mesma função da migration 20261001130000, só com o 5º bucket.
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
     where o.bucket_id in ('scans', 'product-scans', 'coach-images', 'routine-photos', 'colecao')
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

revoke execute on function public.orphan_storage_folders(interval) from public, anon, authenticated;
grant  execute on function public.orphan_storage_folders(interval) to service_role;
