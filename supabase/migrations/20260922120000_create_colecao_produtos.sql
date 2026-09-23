-- colecao_produtos — "Minha Coleção": os produtos que a usuária TEM EM CASA.
--
-- Por que tabela nova e não uma flag `tem_em_casa` em `product_scans`:
--   • `product_scans` é HISTÓRICO imutável (a aba "Escaneados" mostra todo scan que
--     já rodou). Coleção é ESTADO ATUAL, mutável: ela remove, refaz a foto de um
--     produto não identificado, e a compatibilidade é recalculada contra o scan
--     vigente. Misturar os dois faria "remover da Coleção" apagar o histórico.
--   • O mesmo produto pode ter sido escaneado duas vezes (duas linhas em
--     product_scans) e ainda assim é UM item da Coleção.
--   • Produto NÃO IDENTIFICADO (`status: 'precisa_foto'` da `analisar-produto`) nem
--     chega a virar `product_scans` — a Edge Function retorna antes de persistir.
--     Ele precisa existir na Coleção mesmo assim, com a foto, para ela poder refazer.
--
-- ESCRITA É DO CLIENTE (RLS por usuária), ao contrário de `product_scans`
-- (service role). A análise continua sendo da Edge Function; o que o app grava aqui
-- é só a declaração "eu tenho isso em casa" + a cópia denormalizada do veredito.

-- Tabela (idempotente) --------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'colecao_produtos'
  ) then
    create table public.colecao_produtos (
      id                uuid primary key default gen_random_uuid(),
      user_id           uuid not null references public.users(id) on delete cascade,
      -- Scan que originou o item. `on delete set null`: apagar o histórico não pode
      -- sumir com o item da Coleção — por isso os campos de exibição são copiados.
      product_scan_id   uuid references public.product_scans(id) on delete set null,
      -- Foto DENTRO do bucket `product-scans` (mesma convenção `{user_id}/...`).
      -- Copiada do scan quando ele existe; gravada pelo app quando o produto não foi
      -- identificado (aí não há product_scan).
      -- ⚠️ TODO item da Coleção passou por uma foto que ELA tirou: a Coleção é o que
      -- ela tem em casa, e só entra por scan (câmera, share ou o lote do primeiro
      -- fluxo). Produto do CATÁLOGO não entra aqui — "Adicionar à minha rotina" fixa
      -- o produto no passo (`rotina_produto_fixado`), que é outra coisa.
      image_path        text,
      produto_nome      text,
      produto_marca     text,
      categoria         text,        -- categoria lida pela IA (texto livre da análise)
      ativos_detectados text[] not null default '{}',
      -- 0–100. NULL = não identificado (não dá para avaliar o que a IA não leu).
      compatibilidade   int,
      veredito          text,        -- pode_usar | com_ressalva | evitaria | null
      -- 'identificado'      → tem análise; pode entrar na rotina se compatível.
      -- 'nao_identificado'  → a IA não leu o produto; fica FORA da rotina até refazer a foto.
      status            text not null default 'identificado',
      -- Scan de pele contra o qual a compatibilidade foi calculada (rastreabilidade:
      -- diz se o veredito é velho em relação ao scan atual).
      skin_scan_id      uuid references public.skin_scans(id) on delete set null,
      -- Análise inteira (mesmo objeto de `product_scans.resultado`) → o detalhe da
      -- Coleção re-renderiza `components/product/ProductAnalysis` sem re-rodar IA.
      resultado         jsonb,
      created_at        timestamptz not null default now(),
      updated_at        timestamptz not null default now()
    );
  end if;
end $$;

-- Guardas de vocabulário (idempotentes) ---------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'colecao_produtos_status_check') then
    alter table public.colecao_produtos
      add constraint colecao_produtos_status_check
      check (status in ('identificado', 'nao_identificado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'colecao_produtos_compat_check') then
    alter table public.colecao_produtos
      add constraint colecao_produtos_compat_check
      check (compatibilidade is null or (compatibilidade >= 0 and compatibilidade <= 100));
  end if;
end $$;

-- Índices ---------------------------------------------------------------------
-- Grade da aba "Minha Coleção": por usuária, mais recentes primeiro.
create index if not exists colecao_produtos_user_id_created_at_idx
  on public.colecao_produtos (user_id, created_at desc);

-- Idempotência do pop-up "você tem esse produto em casa?": tocar "Sim" duas vezes
-- (ou reabrir o mesmo scan do histórico) não pode duplicar o item. Parcial porque
-- itens não identificados não têm product_scan_id e não podem colidir entre si.
create unique index if not exists colecao_produtos_user_scan_key
  on public.colecao_produtos (user_id, product_scan_id)
  where product_scan_id is not null;

-- RLS -------------------------------------------------------------------------
alter table public.colecao_produtos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'colecao_produtos' and policyname = 'colecao_produtos_select_own'
  ) then
    create policy colecao_produtos_select_own
      on public.colecao_produtos for select using (auth.uid() = user_id);
  end if;

  -- INSERT/UPDATE/DELETE pela própria usuária: é ela quem declara o que tem em casa,
  -- quem refaz a foto de um item não identificado e quem remove. `with check` no
  -- insert/update impede gravar linha no nome de outra pessoa.
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'colecao_produtos' and policyname = 'colecao_produtos_insert_own'
  ) then
    create policy colecao_produtos_insert_own
      on public.colecao_produtos for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'colecao_produtos' and policyname = 'colecao_produtos_update_own'
  ) then
    create policy colecao_produtos_update_own
      on public.colecao_produtos for update
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'colecao_produtos' and policyname = 'colecao_produtos_delete_own'
  ) then
    create policy colecao_produtos_delete_own
      on public.colecao_produtos for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Storage: a usuária passa a poder SUBIR foto na própria pasta -----------------
-- Até aqui o bucket `product-scans` só recebia upload da Edge Function (service
-- role) e a usuária só tinha SELECT (para assinar a URL). O produto NÃO
-- IDENTIFICADO nunca passa pela persistência da Edge Function — se o app não
-- puder subir a foto, o card da Coleção nasce sem imagem e ela não reconhece o que
-- precisa refotografar. Mesma convenção de path do bucket `scans`, que o app já
-- escreve client-side: o 1º segmento da pasta é o id da usuária.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
      and tablename = 'objects' and policyname = 'product_scans_insert_own'
  ) then
    create policy product_scans_insert_own
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'product-scans'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

-- users.colecao_onboarding_at -------------------------------------------------
-- Primeiro fluxo da Coleção ("você tem produtos de skincare em casa?") é UMA VEZ
-- POR CONTA. Mesma lição do tutorial da home (Sessão 64): flag de aparelho vaza
-- entre contas e some na reinstalação — a verdade mora no servidor; o store é cache.
alter table public.users
  add column if not exists colecao_onboarding_at timestamptz;

comment on column public.users.colecao_onboarding_at is
  'Primeiro fluxo da Minha Coleção concluído (null = esta conta nunca passou por ele). Verdade da regra "uma vez por conta"; os flags do store são cache do aparelho.';
