-- recomendacoes_produtos
-- Uma recomendação de produtos por usuária, gerada UMA vez (no primeiro scan) e nunca regenerada.
-- Escrita só via service role (Edge Function recomendar-produtos); usuária lê apenas a própria linha.
-- JSON em `recomendacao`: array de passos, cada passo =
--   { categoria, passo, periodo, produtos: [ { produto_id, principal: bool, copy: string } ] }
-- Campos de exibição (marca, nome, imagem_url) vêm da tabela `produtos` pelo produto_id.

-- Tabela (idempotente) --------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'recomendacoes_produtos'
  ) then
    create table public.recomendacoes_produtos (
      id           uuid primary key default gen_random_uuid(),
      user_id      uuid not null references public.users(id) on delete cascade,
      scan_id      uuid references public.skin_scans(id) on delete set null,
      recomendacao jsonb not null default '[]'::jsonb,
      created_at   timestamptz not null default now()
    );
  end if;
end $$;

-- UNIQUE(user_id): uma linha por usuária; habilita `on conflict (user_id) do nothing`.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recomendacoes_produtos_user_id_key'
  ) then
    alter table public.recomendacoes_produtos
      add constraint recomendacoes_produtos_user_id_key unique (user_id);
  end if;
end $$;

-- RLS -------------------------------------------------------------------------
alter table public.recomendacoes_produtos enable row level security;

-- Leitura: só a própria linha. (Sem policy de INSERT/UPDATE/DELETE →
-- escrita fica restrita à service role, que faz bypass de RLS.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'recomendacoes_produtos'
      and policyname = 'recomendacoes_produtos_select_own'
  ) then
    create policy recomendacoes_produtos_select_own
      on public.recomendacoes_produtos
      for select
      using (auth.uid() = user_id);
  end if;
end $$;
