-- chat_config + ia_custos + gasto_ia_mes()
-- NIKS Chat no Claude Sonnet 5.5 com o gpt-5.4-mini como reserva (out/2026).
--
-- chat_config: UMA linha (id = 1) lida pela niks-chat a cada 60 s. É a chave para trocar
-- de modelo SEM deploy:
--   update public.chat_config set provedor = 'openai';   -- volta ao gpt-5.4-mini
--   update public.chat_config set provedor = 'anthropic'; -- volta ao Claude
-- ia_custos: uma linha por chamada ao modelo do chat, com os tokens que a API devolveu e
-- o custo em US$. A niks-chat soma o mês (horário de Brasília) via gasto_ia_mes() e, ao
-- passar de chat_config.limite_mensal_usd, usa o gpt-5.4-mini até o dia 1º seguinte.
--
-- Segurança: RLS ligado nas duas tabelas e SEM policy — só a Edge Function (service role)
-- lê e escreve. A função SQL não é executável por anon/authenticated.

-- Tabela: chat_config ────────────────────────────────────────────────────────
create table if not exists public.chat_config (
  id                        integer primary key default 1,
  provedor                  text not null default 'anthropic',
  anthropic_modelo          text not null default 'claude-sonnet-5-5',
  esforco                   text not null default 'low',
  limite_mensal_usd         numeric(10,2) not null default 120,
  cache_ttl                 text not null default '5m',
  -- Sem nenhum texto do Claude depois deste tempo, a mensagem vai para o gpt-5.4-mini.
  espera_primeiro_texto_ms  integer not null default 20000,
  atualizado_em             timestamptz not null default now(),
  constraint chat_config_uma_linha check (id = 1),
  constraint chat_config_provedor check (provedor in ('anthropic', 'openai')),
  constraint chat_config_esforco check (esforco in ('low', 'medium', 'high', 'xhigh', 'max')),
  constraint chat_config_cache_ttl check (cache_ttl in ('5m', '1h')),
  constraint chat_config_limite check (limite_mensal_usd >= 0),
  constraint chat_config_espera check (espera_primeiro_texto_ms > 0)
);

insert into public.chat_config (id) values (1) on conflict (id) do nothing;

alter table public.chat_config enable row level security;

-- Tabela: ia_custos ──────────────────────────────────────────────────────────
create table if not exists public.ia_custos (
  id                  bigint generated always as identity primary key,
  created_at          timestamptz not null default now(),
  funcao              text not null,              -- ex.: 'niks-chat'
  user_id             uuid,                        -- sem FK: o log sobrevive à exclusão da conta
  provedor            text not null,               -- 'anthropic' | 'openai'
  modelo              text not null,
  esforco             text,
  input_tokens        integer not null default 0,  -- entrada SEM cache
  cache_write_tokens  integer not null default 0,
  cache_read_tokens   integer not null default 0,
  output_tokens       integer not null default 0,  -- inclui o raciocínio
  custo_usd           numeric(12,6) not null default 0,
  primeiro_texto_ms   integer,
  duracao_ms          integer,
  -- Preenchido quando a chamada NÃO foi a do caminho normal: o motivo da troca para o
  -- gpt-5.4-mini (na linha do gpt) ou o motivo do abandono (na linha do Claude abortado).
  fallback_motivo     text
);

create index if not exists ia_custos_created_at_idx on public.ia_custos (created_at);

alter table public.ia_custos enable row level security;

-- Gasto do mês corrente (America/Sao_Paulo) de um provedor ──────────────────
create or replace function public.gasto_ia_mes(p_provedor text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(custo_usd), 0)
  from public.ia_custos
  where provedor = p_provedor
    and created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
$$;

revoke execute on function public.gasto_ia_mes(text) from public, anon, authenticated;
