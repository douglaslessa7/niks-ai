-- anthropic_contas + anthropic_contas_status() + ia_custos.anthropic_conta (out/2026)
-- Duas organizações da Anthropic, cada uma com US$ 100 de crédito por ciclo, usadas em
-- sequência pelo niks-chat e pela analisar-produto (_shared/anthropic-contas.ts):
--   · usa uma conta até o gasto dela NO CICLO chegar a `limite_ciclo_usd` (US$ 99), depois a
--     outra; as duas esgotadas → gpt-5.4-mini;
--   · erro de crédito insuficiente → a conta fica fora até o ciclo dela virar;
--   · chave inválida/revogada → a conta fica fora por 10 min (volta sozinha quando o segredo
--     for corrigido);
--   · ordem: `ia_config.criterio_contas` = 'ciclo_termina_antes' (padrão: primeiro a conta cujo
--     ciclo vence antes, para não deixar crédito vencer) ou 'ordem_fixa' (pela coluna `ordem`).
-- O ciclo começa à meia-noite (Brasília) do `dia_renovacao`; mês sem esse dia → último dia.
-- Tudo aqui muda sem deploy e vale em ≤ 1 min, ex.:
--   update public.anthropic_contas set dia_renovacao = 5 where id = 2;
--   update public.anthropic_contas set sem_credito_em = null where id = 1; -- recarregou créditos
--   update public.ia_config set criterio_contas = 'ordem_fixa';
-- O teto global ia_config.limite_mensal_anthropic_usd deixa de ser lido (os limites por conta
-- o substituem).
--
-- Segurança: RLS ligado e SEM policy — só as Edge Functions (service role) leem. A coluna
-- `segredo` só aceita nomes ANTHROPIC_API_KEY…, para nenhuma linha apontar para outro segredo.

create table if not exists public.anthropic_contas (
  id                smallint primary key,
  nome              text not null,
  segredo           text not null,
  ordem             smallint not null,
  limite_ciclo_usd  numeric(10,2) not null default 99,
  dia_renovacao     smallint not null,
  ativa             boolean not null default true,
  -- Preenchidos pelas funções: último erro de crédito / de chave e o detalhe.
  sem_credito_em    timestamptz,
  chave_invalida_em timestamptz,
  ultimo_erro       text,
  atualizado_em     timestamptz not null default now(),
  constraint anthropic_contas_segredo check (segredo ~ '^ANTHROPIC_API_KEY(_[0-9]+)?$'),
  constraint anthropic_contas_dia check (dia_renovacao between 1 and 31),
  constraint anthropic_contas_limite check (limite_ciclo_usd >= 0)
);

insert into public.anthropic_contas (id, nome, segredo, ordem, limite_ciclo_usd, dia_renovacao) values
  (1, 'Conta 1 (Douglas)', 'ANTHROPIC_API_KEY', 1, 99, 17),
  (2, 'Conta 2 (sócio)', 'ANTHROPIC_API_KEY_2', 2, 99, 30)
on conflict (id) do nothing;

alter table public.anthropic_contas enable row level security;

alter table public.ia_config add column if not exists criterio_contas text not null default 'ciclo_termina_antes';
alter table public.ia_config drop constraint if exists ia_config_criterio_contas;
alter table public.ia_config add constraint ia_config_criterio_contas
  check (criterio_contas in ('ciclo_termina_antes', 'ordem_fixa'));

comment on column public.ia_config.limite_mensal_anthropic_usd is
  'NÃO É MAIS LIDA (out/2026): o limite agora é por conta, em anthropic_contas.limite_ciclo_usd.';

-- Em qual conta da Anthropic cada chamada foi feita (null no gpt). As linhas anteriores
-- são todas da conta 1 (a única usada até aqui).
alter table public.ia_custos add column if not exists anthropic_conta smallint;
update public.ia_custos set anthropic_conta = 1 where provedor = 'anthropic' and anthropic_conta is null;
create index if not exists ia_custos_conta_created_at_idx on public.ia_custos (anthropic_conta, created_at);

-- Dia `p_dia` no mês que começa em `p_mes` (mês sem esse dia → último dia do mês).
create or replace function public.dia_no_mes(p_mes date, p_dia int)
returns date
language sql
immutable
as $$
  select (date_trunc('month', p_mes)::date
    + (least(p_dia, extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int) - 1))::date
$$;

-- Situação de cada conta no ciclo atual dela (horário de Brasília).
create or replace function public.anthropic_contas_status()
returns table (
  id smallint, segredo text, ordem smallint, ativa boolean, limite_ciclo_usd numeric,
  ciclo_inicio timestamptz, ciclo_fim timestamptz, gasto_ciclo_usd numeric,
  sem_credito boolean, chave_invalida boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  ciclo as (
    select c.*,
      case when h.d >= public.dia_no_mes(h.d, c.dia_renovacao)
        then public.dia_no_mes(h.d, c.dia_renovacao)
        else public.dia_no_mes((h.d - interval '1 month')::date, c.dia_renovacao)
      end as inicio_d
    from public.anthropic_contas c, hoje h
  ),
  limites as (
    select ciclo.*,
      (inicio_d::timestamp at time zone 'America/Sao_Paulo') as ini,
      (public.dia_no_mes((inicio_d + interval '1 month')::date, dia_renovacao)::timestamp at time zone 'America/Sao_Paulo') as fim
    from ciclo
  )
  select l.id, l.segredo, l.ordem, l.ativa, l.limite_ciclo_usd, l.ini, l.fim,
    coalesce((select sum(x.custo_usd) from public.ia_custos x
              where x.anthropic_conta = l.id and x.created_at >= l.ini), 0),
    coalesce(l.sem_credito_em >= l.ini, false),
    coalesce(l.chave_invalida_em > now() - interval '10 minutes', false)
  from limites l
$$;

revoke execute on function public.anthropic_contas_status() from public, anon, authenticated;
