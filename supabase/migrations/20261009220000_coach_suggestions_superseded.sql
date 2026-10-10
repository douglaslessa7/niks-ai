-- ─────────────────────────────────────────────────────────────────────────────
-- Chat da NIKS (out/2026): uma proposta de mudança NOVA substitui a pendente anterior
-- (a conversa não trava mais esperando uma sugestão que ela não vê). A anterior ganha
-- o status 'superseded'. Só amplia o CHECK — nenhum dado muda.
-- (A tabela foi criada fora das migrations; o CHECK original tinha só os 5 status.)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.coach_protocol_suggestions drop constraint if exists coach_protocol_suggestions_status_check;
alter table public.coach_protocol_suggestions
  add constraint coach_protocol_suggestions_status_check
  check (status in ('pending', 'approved', 'rejected', 'applied', 'expired', 'superseded'));
