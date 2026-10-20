-- ia_config (teto ÚNICO da Anthropic) + analise_produto_config (chave da analisar-produto)
-- out/2026: a analisar-produto passa para o Claude Sonnet 5.5 com o gpt-5.4-mini como reserva,
-- no mesmo esquema do NIKS Chat.
--
-- ia_config: UMA linha (id = 1) com o teto mensal de TODO o gasto da Anthropic (chat +
-- analisar-produto + o que vier depois). O gasto é o de gasto_ia_mes('anthropic'), que já soma
-- todas as funções. Passou do teto → TODAS as funções usam o gpt-5.4-mini até o dia 1º seguinte
-- (mês no horário de Brasília). Mudar o teto vale em ≤ 1 min, sem deploy:
--   update public.ia_config set limite_mensal_anthropic_usd = 250;
--
-- analise_produto_config: UMA linha (id = 1) — a chave SÓ da analisar-produto, sem deploy:
--   update public.analise_produto_config set provedor = 'openai';    -- volta ao gpt-5.4-mini
--   update public.analise_produto_config set provedor = 'anthropic'; -- volta ao Claude
-- (a do chat continua em chat_config.provedor)
--
-- chat_config.limite_mensal_usd deixa de ser lida (o chat passa a usar o teto global).
--
-- Segurança: RLS ligado e SEM policy — só as Edge Functions (service role) leem.

-- Tabela: ia_config ──────────────────────────────────────────────────────────
create table if not exists public.ia_config (
  id                           integer primary key default 1,
  limite_mensal_anthropic_usd  numeric(10,2) not null default 199,
  atualizado_em                timestamptz not null default now(),
  constraint ia_config_uma_linha check (id = 1),
  constraint ia_config_limite check (limite_mensal_anthropic_usd >= 0)
);

insert into public.ia_config (id) values (1) on conflict (id) do nothing;

alter table public.ia_config enable row level security;

-- Tabela: analise_produto_config ─────────────────────────────────────────────
create table if not exists public.analise_produto_config (
  id                integer primary key default 1,
  provedor          text not null default 'anthropic',
  anthropic_modelo  text not null default 'claude-sonnet-5-5',
  esforco           text not null default 'low',
  cache_ttl         text not null default '5m',
  -- Sem a resposta do Claude depois deste tempo, a análise vai para o gpt-5.4-mini.
  espera_ms         integer not null default 30000,
  atualizado_em     timestamptz not null default now(),
  constraint analise_produto_config_uma_linha check (id = 1),
  constraint analise_produto_config_provedor check (provedor in ('anthropic', 'openai')),
  constraint analise_produto_config_esforco check (esforco in ('low', 'medium', 'high', 'xhigh', 'max')),
  constraint analise_produto_config_cache_ttl check (cache_ttl in ('5m', '1h')),
  constraint analise_produto_config_espera check (espera_ms > 0)
);

insert into public.analise_produto_config (id) values (1) on conflict (id) do nothing;

alter table public.analise_produto_config enable row level security;

comment on column public.chat_config.limite_mensal_usd is
  'NÃO É MAIS LIDA (out/2026): o teto é único para toda a Anthropic, em ia_config.limite_mensal_anthropic_usd.';
