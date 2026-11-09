-- Tutorial dos Grupos: marcadores de "esta CONTA já viu". Mesmo padrão de
-- `produtos_tutorial_seen_at`; contas antigas ficam com null e veem na primeira abertura.
--   · grupos_tutorial_visto_em: tutorial inicial (com ou sem grupo);
--   · grupos_tutorial_grupo_visto_em: parte da tela do grupo. Quem fez o tutorial sem grupo
--     vê essa parte uma vez, ao entrar no primeiro grupo.
-- O app grava ao concluir (lib/gruposTutorial.ts). A própria usuária grava (RLS de users).
-- Aditivo: o app das lojas não lê estas colunas.
alter table public.users add column if not exists grupos_tutorial_visto_em timestamptz;
alter table public.users add column if not exists grupos_tutorial_grupo_visto_em timestamptz;
