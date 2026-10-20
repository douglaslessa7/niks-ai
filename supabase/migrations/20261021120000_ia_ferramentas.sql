-- ia_ferramentas + ia_custos.rodadas
-- NIKS Chat como agente (out/2026): a NIKS consulta dados do app por ferramentas
-- (estante, recomendados, escaneados, scans, rotina ideal) e recebe o resultado antes
-- de continuar a resposta. Cada consulta vira uma linha aqui — para medir quanto ela
-- consulta, quanto tempo leva e o que dá erro.
-- ia_custos.rodadas: quantas idas ao modelo a resposta precisou (1 = sem consulta).
--
-- Segurança: RLS ligado e SEM policy — só a Edge Function (service role) lê e escreve.

create table if not exists public.ia_ferramentas (
  id                 bigint generated always as identity primary key,
  created_at         timestamptz not null default now(),
  funcao             text not null,               -- ex.: 'niks-chat'
  user_id            uuid,                         -- sem FK: o log sobrevive à exclusão da conta
  ferramenta         text not null,                -- ex.: 'ver_estante'
  rodada             integer not null,             -- em qual ida ao modelo ela pediu (1, 2…)
  entrada            jsonb,                        -- argumentos que o modelo mandou
  duracao_ms         integer,
  tamanho_resultado  integer,                      -- caracteres devolvidos ao modelo
  erro               text                          -- preenchido quando a consulta falhou
);

create index if not exists ia_ferramentas_created_at_idx on public.ia_ferramentas (created_at);

alter table public.ia_ferramentas enable row level security;

alter table public.ia_custos add column if not exists rodadas integer;
