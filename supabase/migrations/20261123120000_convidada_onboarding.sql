-- Parte B (convidada) · Fase 4 — respostas do onboarding que ainda não eram salvas.
-- A convidada não compra, então estes dados precisam ficar na conta para a carta da idade
-- da pele e para a rotina de quem assinar depois. A foto do scan continua NÃO sendo guardada.
-- Aplicar antes de o app novo rodar: o cadastro grava estas colunas.

alter table public.users add column if not exists goal_desire text;
alter table public.users add column if not exists makeup text;
alter table public.users add column if not exists regioes_foco text[];
alter table public.users add column if not exists idade_pele_onboarding integer;
