-- Tela 13 do onboarding novo ("Horário da rotina"): horários de manhã e de noite
-- escolhidos pela usuária + o fuso do aparelho no momento da escolha.
-- Só GRAVADOS por enquanto: o agendamento das notificações do servidor
-- (pg_cron → send-notifications, 7h/21h fixos) ainda NÃO lê estas colunas.
alter table public.users
  add column if not exists rotina_manha_horario time,
  add column if not exists rotina_noite_horario time,
  add column if not exists rotina_fuso text;  -- IANA, ex.: 'America/Sao_Paulo'
