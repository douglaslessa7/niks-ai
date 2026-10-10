-- ─────────────────────────────────────────────────────────────────────────────
-- Intro de 3 telas da aba Rotina (plano da Rotina, Fase 7 — decisão 3).
-- `users.rotina_intro_status`: o que ela escolheu na intro, que aparece UMA vez por
-- conta (inclusive para quem já usava o app — decisão 2):
--   null           → ainda não viu (mostrar a intro na próxima abertura da Rotina)
--   'escanear'     → tocou "Escanear meus produtos"
--   'sem_produtos' → tocou "Não tenho produtos"
--   'depois'       → tocou "Fazer isso depois" (a Rotina mostra um caminho visível
--                    para escanear depois)
-- Aditivo: o app das lojas não lê esta coluna. A própria usuária grava (RLS de users).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.users
  add column if not exists rotina_intro_status text
  check (rotina_intro_status in ('escanear', 'sem_produtos', 'depois'));
