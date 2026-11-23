-- Motor da rotina v2 (nov/2026) — peças do banco.
--
-- 1. motor_config: liga/desliga o motor novo sem deploy. Começa DESLIGADO para contas
--    novas (ativo = false); só as contas da lista `contas` usam o motor novo.
-- 2. usa_motor_novo(uid): a regra única de quem usa o motor novo. Conta criada ANTES de
--    `desde` nunca usa (a rotina de quem já tem rotina nunca é refeita), a não ser que
--    esteja na lista.
-- 3. users: orcamento_faixa, isotretinoina, dor_principal (as perguntas entram na 1.63).
-- 4. colecao_produtos.motivo_fora_rotina: por que um produto de casa ficou fora da rotina.
-- 5. minha_rotina_backup: cópia da Minha rotina antes de uma substituição.
-- 6. montar_minha_rotina_v2: grava a Minha rotina JÁ COM PRODUTO.
--
-- Idempotente. Nada muda para ninguém enquanto as Edge Functions não chamarem
-- usa_motor_novo / montar_minha_rotina_v2.

-- ── 1. motor_config ───────────────────────────────────────────────────────────────
create table if not exists public.motor_config (
  id smallint primary key default 1 check (id = 1),
  ativo boolean not null default false,
  desde timestamptz,
  contas uuid[] not null default '{}',
  atualizado_em timestamptz not null default now()
);
alter table public.motor_config enable row level security;
revoke all on public.motor_config from anon, authenticated;

insert into public.motor_config (id, ativo, desde, contas)
values (1, false, null, array['a99d58aa-9bd2-4bd6-a79c-1636a082388a']::uuid[])
on conflict (id) do nothing;

-- ── 2. usa_motor_novo ─────────────────────────────────────────────────────────────
-- p_uid null = onboarding antes da conta existir (vale o `ativo`).
create or replace function public.usa_motor_novo(p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.motor_config%rowtype;
begin
  select * into c from public.motor_config where id = 1;
  if not found then return false; end if;
  if p_uid is not null and p_uid = any(c.contas) then return true; end if;
  if not c.ativo then return false; end if;
  if p_uid is null then return true; end if;
  if c.desde is null then return false; end if;
  return exists (select 1 from auth.users a where a.id = p_uid and a.created_at >= c.desde);
end;
$$;
revoke all on function public.usa_motor_novo(uuid) from public, anon, authenticated;
grant execute on function public.usa_motor_novo(uuid) to service_role;

-- ── 3. users ──────────────────────────────────────────────────────────────────────
alter table public.users add column if not exists orcamento_faixa smallint;
alter table public.users add column if not exists isotretinoina boolean;
alter table public.users add column if not exists dor_principal text;
do $$ begin
  alter table public.users add constraint users_orcamento_faixa_check check (orcamento_faixa between 1 and 3);
exception when duplicate_object then null; end $$;

-- ── 4. colecao_produtos ───────────────────────────────────────────────────────────
alter table public.colecao_produtos add column if not exists motivo_fora_rotina text;

-- ── 5. minha_rotina_backup ────────────────────────────────────────────────────────
create table if not exists public.minha_rotina_backup (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  motivo text,
  passos jsonb not null,          -- as linhas de minha_rotina_passos, inteiras
  protocolo jsonb,                -- a linha de protocolos mais recente
  recomendacao jsonb,             -- a linha de recomendacoes_produtos
  minha_rotina_criada_em timestamptz
);
alter table public.minha_rotina_backup enable row level security;
revoke all on public.minha_rotina_backup from anon, authenticated;

-- ── 6. montar_minha_rotina_v2 ─────────────────────────────────────────────────────
-- Produto do passo → item da estante (todo produto da rotina mora na estante).
--   {colecao_id}  = produto de casa (precisa ser dela);
--   {produto_id}  = do catálogo: reaproveita o item se já existe; senão cria como
--                   "quero_comprar" (ela ainda não tem).
create or replace function public.motor_item_estante(p_uid uuid, p_prod jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r uuid;
  pid uuid;
begin
  if p_prod is null or jsonb_typeof(p_prod) <> 'object' then return null; end if;

  if p_prod ? 'colecao_id' then
    select c.id into r from public.colecao_produtos c
     where c.id = (p_prod->>'colecao_id')::uuid and c.user_id = p_uid;
    return r;
  end if;

  if p_prod ? 'produto_id' then
    pid := (p_prod->>'produto_id')::uuid;
    select c.id into r from public.colecao_produtos c where c.user_id = p_uid and c.produto_id = pid;
    if r is not null then return r; end if;
    insert into public.colecao_produtos (user_id, origem, produto_id, nome, marca, categoria, imagem_url, status)
    select p_uid, 'catalogo', pr.id, pr.nome, pr.marca, pr.categoria, pr.imagem_url, 'quero_comprar'
      from public.produtos pr where pr.id = pid
    on conflict (user_id, produto_id) where produto_id is not null do nothing
    returning id into r;
    if r is null then
      select c.id into r from public.colecao_produtos c where c.user_id = p_uid and c.produto_id = pid;
    end if;
    return r;
  end if;

  return null;
end;
$$;
revoke all on function public.motor_item_estante(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.motor_item_estante(uuid, jsonb) to service_role;

-- p_passos: [{periodo, nome, ingrediente, instrucao, como_usar, tempo_espera, cor,
--             dias (array ou null), passo_ideal, produto}]  — na ordem de cada período.
-- Sem Minha rotina → cria inteira, já com produto.
-- Com Minha rotina → só preenche passo VAZIO equivalente (mesmo período e mesmo índice
--   da rotina ideal, ou mesmo nome); nunca troca um produto que ela escolheu.
-- p_substituir (só contas de motor_config.contas, e só com backup das últimas 24 h)
--   → apaga os passos atuais, por id, e cria de novo.
-- Devolve quantos passos criou/preencheu; -1 se a usuária não existe.
create or replace function public.montar_minha_rotina_v2(p_uid uuid, p_passos jsonb, p_substituir boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ja boolean;
  n integer := 0;
  e jsonb;
  col uuid;
  alvo uuid;
  ids uuid[];
  ordem_am integer := 0;
  ordem_pm integer := 0;
  ord integer;
  dias text[];
begin
  if p_uid is null or p_passos is null or jsonb_typeof(p_passos) <> 'array' then
    raise exception 'entrada inválida';
  end if;

  perform 1 from public.users where id = p_uid for update;
  if not found then return -1; end if;
  select minha_rotina_criada_em is not null into ja from public.users where id = p_uid;

  if ja and p_substituir then
    if not exists (select 1 from public.motor_config c where c.id = 1 and p_uid = any(c.contas)) then
      raise exception 'substituir só vale para contas de motor_config.contas';
    end if;
    if not exists (select 1 from public.minha_rotina_backup b
                    where b.user_id = p_uid and b.criado_em > now() - interval '24 hours') then
      raise exception 'sem backup recente da Minha rotina';
    end if;
    select array_agg(m.id) into ids from public.minha_rotina_passos m where m.user_id = p_uid;
    if ids is not null then
      delete from public.minha_rotina_passos where id = any(ids);
    end if;
    ja := false;
  end if;

  for e in select x from jsonb_array_elements(p_passos) as t(x) loop
    if jsonb_typeof(e) <> 'object' or (e->>'periodo') not in ('am', 'pm') then continue; end if;
    dias := case when jsonb_typeof(e->'dias') = 'array' and jsonb_array_length(e->'dias') between 1 and 6
                 then array(select jsonb_array_elements_text(e->'dias')) else null end;

    if not ja then
      if e->>'periodo' = 'am' then ordem_am := ordem_am + 1; ord := ordem_am;
      else ordem_pm := ordem_pm + 1; ord := ordem_pm; end if;
      col := public.motor_item_estante(p_uid, e->'produto');
      insert into public.minha_rotina_passos
        (user_id, periodo, ordem, nome, ingrediente, instrucao, como_usar, tempo_espera, cor, dias,
         origem, passo_ideal, colecao_item_id)
      values
        (p_uid, e->>'periodo', ord, coalesce(nullif(trim(e->>'nome'), ''), 'Passo'),
         e->>'ingrediente', e->>'instrucao',
         case when jsonb_typeof(e->'como_usar') = 'array' then e->'como_usar' else null end,
         e->>'tempo_espera', e->>'cor', dias, 'ideal',
         case when jsonb_typeof(e->'passo_ideal') = 'object' then e->'passo_ideal' else null end,
         col);
      n := n + 1;
    else
      alvo := null;
      select m.id into alvo
        from public.minha_rotina_passos m
       where m.user_id = p_uid
         and m.periodo = e->>'periodo'
         and m.colecao_item_id is null and m.product_scan_id is null and m.produto_catalogo_id is null
         and ((m.passo_ideal->>'indice') = (e->'passo_ideal'->>'indice')
              or lower(trim(coalesce(m.nome, ''))) = lower(trim(coalesce(e->>'nome', ''))))
       order by ((m.passo_ideal->>'indice') = (e->'passo_ideal'->>'indice')) desc nulls last, m.ordem
       limit 1;
      if alvo is not null then
        col := public.motor_item_estante(p_uid, e->'produto');
        if col is not null then
          update public.minha_rotina_passos set colecao_item_id = col, updated_at = now() where id = alvo;
          n := n + 1;
        end if;
      end if;
    end if;
  end loop;

  if not ja then
    update public.users set minha_rotina_criada_em = now() where id = p_uid;
  end if;
  return n;
end;
$$;
revoke all on function public.montar_minha_rotina_v2(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.montar_minha_rotina_v2(uuid, jsonb, boolean) to service_role;
