-- rotina_produto_fixado — o produto que a USUÁRIA escolheu para um passo da rotina.
--
-- Vem do botão "Adicionar à minha rotina", no detalhe de um produto recomendado
-- (ou de uma alternativa dele) na tela de Produtos. É diferente da Minha Coleção:
--   • Coleção          = "eu TENHO esse produto em casa" (entrou por scan, tem foto
--                        dela e compatibilidade medida);
--   • produto fixado   = "eu QUERO esse produto neste passo" (é do catálogo, ela
--                        não necessariamente tem).
-- Por isso são duas tabelas e dois botões — misturar faria o app afirmar que ela
-- tem em casa um produto que ela só escolheu.
--
-- ⚠️ A ESCOLHA DELA GANHA DA IA. `recomendar-produtos` resolve um passo nesta
-- ordem: produto fixado → produto da Coleção → recomendação do catálogo. Se ela
-- fixou um recomendado e depois um produto de casa compatível aparece para o mesmo
-- passo, a escolha dela PERMANECE — a IA não troca por baixo.

-- Tabela (idempotente) --------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'rotina_produto_fixado'
  ) then
    create table public.rotina_produto_fixado (
      id         uuid primary key default gen_random_uuid(),
      user_id    uuid not null references public.users(id) on delete cascade,
      -- Chave do passo: o NOME do passo normalizado (`normStepKey` em
      -- lib/savedProducts.ts — minúsculas, sem acento, espaços colapsados). É a
      -- mesma chave do deep-link da Rotina e do mapa de fotos dos passos.
      -- ⚠️ NÃO carrega período: `recomendar-produtos` deduplica passos por nome
      -- (um passo 'am+pm' é UM passo), então uma linha por nome é o grão certo.
      passo_key  text not null,
      -- ⚠️ SEM foreign key para `produtos`: aquela tabela foi criada pelo dashboard
      -- e não tem DDL versionada aqui — uma FK dependeria de um constraint que este
      -- repositório não garante e faria a migration falhar no remoto. Mesma
      -- tolerância de `recomendacoes_produtos`: id órfão simplesmente não resolve
      -- (o passo volta a ser escolhido pela IA), nunca vira erro.
      produto_id uuid not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end $$;

-- Uma escolha por passo: fixar de novo SUBSTITUI (upsert por esta chave).
create unique index if not exists rotina_produto_fixado_user_passo_key
  on public.rotina_produto_fixado (user_id, passo_key);

-- RLS -------------------------------------------------------------------------
-- Escrita do CLIENTE, como a Coleção: é uma escolha da usuária, não um cálculo do
-- servidor. A Edge Function (service role) só LÊ para montar a recomendação.
alter table public.rotina_produto_fixado enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'rotina_produto_fixado' and policyname = 'rotina_produto_fixado_select_own'
  ) then
    create policy rotina_produto_fixado_select_own
      on public.rotina_produto_fixado for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'rotina_produto_fixado' and policyname = 'rotina_produto_fixado_insert_own'
  ) then
    create policy rotina_produto_fixado_insert_own
      on public.rotina_produto_fixado for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'rotina_produto_fixado' and policyname = 'rotina_produto_fixado_update_own'
  ) then
    create policy rotina_produto_fixado_update_own
      on public.rotina_produto_fixado for update
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'rotina_produto_fixado' and policyname = 'rotina_produto_fixado_delete_own'
  ) then
    create policy rotina_produto_fixado_delete_own
      on public.rotina_produto_fixado for delete using (auth.uid() = user_id);
  end if;
end $$;
