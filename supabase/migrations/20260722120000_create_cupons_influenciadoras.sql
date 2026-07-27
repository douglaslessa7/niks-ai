-- cupons + cupom_aplicacoes
-- Base do sistema de cupons de influenciadoras.
--
-- Fluxo (importante): no onboarding o paywall vem ANTES do signup. Quando a usuária
-- digita o cupom ela AINDA NÃO tem sessão no Supabase e o RevenueCat está anônimo.
-- Por isso a aplicação é registrada com o `rc_app_user_id` (identificador do RevenueCat
-- no momento da aplicação, anônimo) e o `user_id` fica NULL — preenchido depois, no signup.
--
-- Segurança: RLS ligado nas DUAS tabelas e SEM NENHUMA policy. O app nunca lê a lista
-- de cupons direto — só a Edge Function `validar-cupom` (service role, que faz bypass de RLS)
-- toca nessas tabelas.

-- Tabela: cupons ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'cupons'
  ) then
    create table public.cupons (
      id                 uuid primary key default gen_random_uuid(),
      -- Código único, SEMPRE em maiúsculas (garantido pelo CHECK abaixo + normalização na Edge Function).
      codigo             text not null unique,
      influenciadora     text not null,
      ativo              boolean not null default true,
      expira_em          timestamptz,               -- opcional; NULL = nunca expira
      max_usos           integer,                   -- opcional; NULL = ilimitado
      total_aplicacoes   integer not null default 0, -- quantas vezes o cupom foi aplicado
      total_assinaturas  integer not null default 0, -- quantas aplicações viraram assinatura
      created_at         timestamptz not null default now(),
      constraint cupons_codigo_maiusculo check (codigo = upper(codigo)),
      constraint cupons_max_usos_nao_negativo check (max_usos is null or max_usos >= 0)
    );
  end if;
end $$;

-- Tabela: cupom_aplicacoes ────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'cupom_aplicacoes'
  ) then
    create table public.cupom_aplicacoes (
      id              uuid primary key default gen_random_uuid(),
      cupom_id        uuid not null references public.cupons(id) on delete cascade,
      -- Identificador do RevenueCat NO MOMENTO da aplicação (anônimo). É a identidade
      -- provisória enquanto não há sessão. Usado para deduplicar aplicações repetidas.
      rc_app_user_id  text not null,
      -- Preenchido depois, no signup, quando a identidade real é resolvida. NULL no começo.
      user_id         uuid references public.users(id) on delete set null,
      aplicado_em     timestamptz not null default now(),
      converteu       boolean not null default false, -- virou compra?
      -- Uma pessoa (mesmo rc_app_user_id) só conta UMA vez por cupom.
      constraint cupom_aplicacoes_dedup unique (cupom_id, rc_app_user_id)
    );
  end if;
end $$;

-- Índice para resolver a identidade no signup (buscar aplicações por user_id).
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'cupom_aplicacoes_user_id_idx'
  ) then
    create index cupom_aplicacoes_user_id_idx on public.cupom_aplicacoes (user_id);
  end if;
end $$;

-- Contadores automáticos (trigger) ───────────────────────────────────────────
-- Mantém cupons.total_aplicacoes e cupons.total_assinaturas em sincronia de forma
-- ATÔMICA e à prova de corrida: o INSERT só acontece quando NÃO é aplicação repetida
-- (a constraint de dedup vira `on conflict do nothing` na Edge Function), então o
-- contador nunca conta duas vezes a mesma pessoa.
create or replace function public.cupom_aplicacoes_contadores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.cupons set total_aplicacoes = total_aplicacoes + 1 where id = new.cupom_id;
    if new.converteu then
      update public.cupons set total_assinaturas = total_assinaturas + 1 where id = new.cupom_id;
    end if;
  elsif tg_op = 'UPDATE' then
    -- converteu: false → true incrementa; true → false decrementa (idempotente).
    if new.converteu and not old.converteu then
      update public.cupons set total_assinaturas = total_assinaturas + 1 where id = new.cupom_id;
    elsif old.converteu and not new.converteu then
      update public.cupons set total_assinaturas = total_assinaturas - 1 where id = new.cupom_id;
    end if;
  end if;
  return new;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cupom_aplicacoes_contadores_trg'
  ) then
    create trigger cupom_aplicacoes_contadores_trg
      after insert or update on public.cupom_aplicacoes
      for each row execute function public.cupom_aplicacoes_contadores();
  end if;
end $$;

-- RLS: ligado nas duas, SEM nenhuma policy (só service role acessa) ────────────
alter table public.cupons           enable row level security;
alter table public.cupom_aplicacoes enable row level security;

-- Seeds ──────────────────────────────────────────────────────────────────────
-- MAISENA10 = primeiro cupom real. Os TESTE* existem só para validar no simulador
-- as 4 mensagens de erro distintas; podem ser apagados quando não forem mais úteis.
insert into public.cupons (codigo, influenciadora, ativo, expira_em, max_usos, total_aplicacoes) values
  ('MAISENA10',   'Maisena',       true,  null,                     null, 0),  -- válido
  ('TESTE10',     'Teste QA',      true,  null,                     null, 0),  -- válido (teste)
  ('TESTEOFF',    'Teste QA',      false, null,                     null, 0),  -- desativado
  ('TESTEEXP',    'Teste QA',      true,  '2020-01-01T00:00:00Z',   null, 0),  -- expirado
  ('TESTELIMITE', 'Teste QA',      true,  null,                     1,    1)   -- limite atingido
on conflict (codigo) do nothing;
