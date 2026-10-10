-- ─────────────────────────────────────────────────────────────────────────────
-- "Minha rotina" (plano da Rotina, Fase 1 — out/2026).
-- A rotina que a usuária FAZ no dia a dia (Iniciar rotina, checklist, sequência) e que
-- ela vai poder editar. Separada da ROTINA IDEAL (`protocolos`), que é só referência e
-- NUNCA é alterada por esta migração nem pela função abaixo — a Minha rotina nasce
-- como uma CÓPIA nova dos passos da ideal mais recente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.minha_rotina_passos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  periodo text not null check (periodo in ('am', 'pm')),
  ordem int not null,
  nome text not null,
  -- Campos copiados do passo da ideal (exibidos como hoje). Passos criados por ela
  -- (Fase 3) podem ter só o nome.
  ingrediente text,
  instrucao text,
  como_usar jsonb,            -- passo a passo do guia (array de frases), ou null
  tempo_espera text,
  cor text,
  -- null = todo dia; senão ex.: {Seg,Qua,Sex}. A cópia da ideal deixa null: lá os dias
  -- vêm dentro do texto do ingrediente, às vezes alternando 2 produtos no mesmo passo
  -- ("Azelaico (Seg/Qua/Sex) OU Retinol (Ter/Qui/Sáb)") — tratado na Fase 3.
  dias text[],
  origem text not null check (origem in ('ideal', 'ia_produtos', 'usuaria', 'scan_avulso')),
  -- De qual passo da ideal este veio / qual ele cobre: {periodo, indice, id, nome}.
  passo_ideal jsonb,
  -- Produto do passo: da estante dela (colecao_produtos) OU um recomendado do catálogo
  -- que ela ainda não tem (decisão de produto: pode entrar no passo sem ir à estante).
  colecao_item_id uuid references public.colecao_produtos(id) on delete set null,
  produto_catalogo_id uuid references public.produtos(id) on delete set null,
  aviso_nivel text not null default 'nenhum' check (aviso_nivel in ('nenhum', 'leve', 'forte')),
  aviso_texto text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists minha_rotina_passos_user_idx
  on public.minha_rotina_passos (user_id, periodo, ordem);

alter table public.minha_rotina_passos enable row level security;

drop policy if exists "minha_rotina_select_own" on public.minha_rotina_passos;
create policy "minha_rotina_select_own" on public.minha_rotina_passos
  for select using (auth.uid() = user_id);
drop policy if exists "minha_rotina_insert_own" on public.minha_rotina_passos;
create policy "minha_rotina_insert_own" on public.minha_rotina_passos
  for insert with check (auth.uid() = user_id);
drop policy if exists "minha_rotina_update_own" on public.minha_rotina_passos;
create policy "minha_rotina_update_own" on public.minha_rotina_passos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "minha_rotina_delete_own" on public.minha_rotina_passos;
create policy "minha_rotina_delete_own" on public.minha_rotina_passos
  for delete using (auth.uid() = user_id);

-- Marca de "a Minha rotina já foi criada" — impede recriar a cópia depois que ela
-- editar (ex.: se remover todos os passos, a rotina NÃO volta sozinha).
alter table public.users add column if not exists minha_rotina_criada_em timestamptz;

-- Cria a Minha rotina da usuária logada como CÓPIA da rotina ideal mais recente.
-- Idempotente e à prova de corrida (trava a linha dela em `users`):
--   n > 0  → criou n passos agora
--   0      → já existia (não mexe em nada)
--   -1     → ainda não há rotina ideal com passos (tenta de novo depois; não marca)
-- Só LÊ `protocolos`.
create or replace function public.criar_minha_rotina()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  am jsonb;
  pm jsonb;
  n integer := 0;
begin
  if uid is null then
    raise exception 'sem sessão';
  end if;

  perform 1 from public.users where id = uid for update;
  if exists (select 1 from public.users where id = uid and minha_rotina_criada_em is not null) then
    return 0;
  end if;

  select coalesce(p.rotina_am, '[]'::jsonb), coalesce(p.rotina_pm, '[]'::jsonb)
    into am, pm
    from public.protocolos p
   where p.user_id = uid
   order by p.updated_at desc
   limit 1;

  if not found or (jsonb_array_length(am) = 0 and jsonb_array_length(pm) = 0) then
    return -1;
  end if;

  insert into public.minha_rotina_passos
    (user_id, periodo, ordem, nome, ingrediente, instrucao, como_usar, tempo_espera, cor, origem, passo_ideal)
  select uid, s.per, s.o::int,
         coalesce(nullif(trim(s.e->>'name'), ''), 'Passo'),
         s.e->>'ingredient',
         s.e->>'instruction',
         case when jsonb_typeof(s.e->'steps') = 'array' then s.e->'steps' else null end,
         s.e->>'waitTime',
         s.e->>'color',
         'ideal',
         jsonb_build_object('periodo', s.per, 'indice', s.o - 1, 'id', s.e->'id', 'nome', s.e->>'name')
    from (
      select 'am'::text as per, t.e, t.o from jsonb_array_elements(am) with ordinality as t(e, o)
      union all
      select 'pm'::text as per, t.e, t.o from jsonb_array_elements(pm) with ordinality as t(e, o)
    ) s
   where jsonb_typeof(s.e) = 'object';
  get diagnostics n = row_count;

  update public.users set minha_rotina_criada_em = now() where id = uid;
  return n;
end;
$$;

revoke all on function public.criar_minha_rotina() from public;
grant execute on function public.criar_minha_rotina() to authenticated;
