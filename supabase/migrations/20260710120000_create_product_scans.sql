-- product_scans
-- Histórico de "escanear produto": cada scan de produto de uma usuária, com o
-- resultado inteiro da análise guardado para re-renderizar a tela sem re-rodar IA.
-- Escrita só via service role (Edge Function); usuária lê apenas as próprias linhas.
-- A imagem fica no bucket privado `product-scans` (só o `image_path` é guardado —
-- a URL assinada é gerada na leitura). `resultado` (jsonb) é o objeto de resposta
-- inteiro da análise; `produto_nome`/`produto_marca` são denormalizados para a
-- lista "Escaneados por você" não precisar abrir o jsonb.

-- Tabela (idempotente) --------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'product_scans'
  ) then
    create table public.product_scans (
      id             uuid primary key default gen_random_uuid(),
      user_id        uuid not null references public.users(id) on delete cascade,
      skin_scan_id   uuid references public.skin_scans(id) on delete set null,
      image_path     text not null,
      produto_nome   text,
      produto_marca  text,
      resultado      jsonb not null,
      client_scan_id text,
      created_at     timestamptz not null default now()
    );
  end if;
end $$;

-- Índices ---------------------------------------------------------------------
-- Lista "Escaneados por você": por usuária, mais recentes primeiro.
create index if not exists product_scans_user_id_created_at_idx
  on public.product_scans (user_id, created_at desc);

-- Idempotência contra double-tap / StrictMode: UNIQUE em client_scan_id, mas só
-- quando não-nulo (linhas sem client_scan_id não colidem entre si).
create unique index if not exists product_scans_client_scan_id_key
  on public.product_scans (client_scan_id)
  where client_scan_id is not null;

-- RLS -------------------------------------------------------------------------
alter table public.product_scans enable row level security;

-- Leitura: só as próprias linhas. (Sem policy de INSERT/UPDATE/DELETE →
-- escrita fica restrita à service role, que faz bypass de RLS.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'product_scans'
      and policyname = 'product_scans_select_own'
  ) then
    create policy product_scans_select_own
      on public.product_scans
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- Bucket de Storage (privado) -------------------------------------------------
-- Espelha o bucket `coach-images`: PRIVADO. Upload via service role na Edge
-- Function; leitura via URL assinada (createSignedUrl). Buckets acessados só por
-- service role + signed URL NÃO precisam de policies em storage.objects (ambos
-- fazem bypass de RLS) — por isso, como no `coach-images`, nenhuma policy de
-- storage.objects é criada aqui.
-- Idempotente via `on conflict (id) do nothing`.
insert into storage.buckets (id, name, public)
values ('product-scans', 'product-scans', false)
on conflict (id) do nothing;
