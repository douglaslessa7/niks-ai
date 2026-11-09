-- Parte B (convidada) · Fase 0A — SABER QUEM PAGA NO SERVIDOR
--
-- Em 08/nov/2026, das 436 assinaturas vigentes de produção, 188 não tinham conta ligada, e
-- nenhuma das 13 compras novas vindas pelo Superwall tinha sido ligada: elas chegam com o id
-- do Superwall ($SuperwallAlias:…) e o app só enviava o do RevenueCat.
-- A fonte continua sendo `assinaturas_loja`; o app passa a enviar os dois ids.
--
--   assinatura_divergencias   no máximo 1 linha por conta, dia e origem, quando o app e o
--                             servidor discordam, quando um id é de outra conta ou quando
--                             a trava de uma função de IA bloquearia alguém.
--                             É o relatório do critério de saída da Fase 0.
--
-- Só o service role lê e grava. Conta apagada: as linhas somem em cascata.

create table if not exists public.assinatura_divergencias (
  user_id uuid not null references public.users (id) on delete cascade,
  dia date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  origem text not null,                      -- 'abertura' ou o nome da função de IA
  app_premium boolean,                       -- null quando a chamada não veio do app
  servidor boolean not null,                 -- resultado de assinante()
  motivo_vinculo text,                       -- ex.: 'id de outra conta'
  ultimo_em timestamptz not null default now(),
  primary key (user_id, dia, origem)
);

create index if not exists assinatura_divergencias_dia_idx on public.assinatura_divergencias (dia);

alter table public.assinatura_divergencias enable row level security;

revoke all on public.assinatura_divergencias from anon, authenticated;
grant select, insert, update, delete on public.assinatura_divergencias to service_role;
