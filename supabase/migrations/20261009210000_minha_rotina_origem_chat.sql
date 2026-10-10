-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 8 (plano da Rotina): o chat da NIKS passa a alterar a MINHA ROTINA (com a
-- aprovação dela, como hoje) para quem já tem Minha rotina. Os passos que o chat cria
-- ganham a origem 'chat'. Só amplia o CHECK — nenhum dado muda.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.minha_rotina_passos drop constraint if exists minha_rotina_passos_origem_check;
alter table public.minha_rotina_passos
  add constraint minha_rotina_passos_origem_check
  check (origem in ('ideal', 'ia_produtos', 'usuaria', 'scan_avulso', 'chat'));
