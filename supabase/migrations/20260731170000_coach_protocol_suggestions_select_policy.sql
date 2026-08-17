-- coach_protocol_suggestions: leitura das próprias linhas pelo cliente autenticado.
-- Necessário para o card de aprovação (Bloco 3): o app lê a sugestão pendente da
-- conversa (conversation_id + status='pending') para renderizar o card ancorado à
-- mensagem da NIKS. Criação e aprovação continuam SÓ por service role (Edge Functions
-- niks-chat / approve-coach-protocol-change, que fazem bypass de RLS). Sem policy de
-- INSERT/UPDATE/DELETE de propósito — o cliente só lê. Idempotente (espelha product_scans).

-- RLS -------------------------------------------------------------------------
alter table public.coach_protocol_suggestions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_protocol_suggestions'
      and policyname = 'coach_protocol_suggestions_select_own'
  ) then
    create policy coach_protocol_suggestions_select_own
      on public.coach_protocol_suggestions
      for select
      using (auth.uid() = user_id);
  end if;
end $$;
