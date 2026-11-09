-- Parte B (convidada) · Fase 0B — PROVA DA APPLE
--
-- A função `comprovar-assinatura` valida a transação assinada pela Apple (JWS) e chama isto.
--   • Compra sem linha: cria (ex.: anual comprado antes de 01/abr/2026, fora da importação).
--   • Compra sem dona: liga à conta.
--   • Compra de outra conta: não muda de dona; devolve conflito.
--   • Evento perdido: uma assinatura marcada como expirada volta a valer se a Apple assinou
--     depois do último evento. Reembolsada nunca volta.

create or replace function public.comprovar_compra(
  p_uid uuid, p_otid text, p_produto text, p_ambiente text, p_expira timestamptz, p_quando timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assinaturas_loja%rowtype;
begin
  select * into a from public.assinaturas_loja where original_transaction_id = p_otid for update;
  if not found then
    insert into public.assinaturas_loja (original_transaction_id, user_id, ids_rc, produto, ambiente, status, expira_em, ultimo_evento_em)
    values (p_otid, p_uid, '{}', p_produto, p_ambiente, 'ativa', p_expira, p_quando);
    return jsonb_build_object('ok', true, 'criada', true);
  end if;
  if a.user_id is not null and a.user_id <> p_uid then
    return jsonb_build_object('ok', false, 'motivo', 'compra de outra conta');
  end if;
  update public.assinaturas_loja
     set user_id = p_uid,
         status = case when a.status = 'expirada' and p_quando > a.ultimo_evento_em then 'ativa' else a.status end,
         expira_em = case when a.status = 'reembolsada' then a.expira_em
                          when a.status = 'expirada' and p_quando <= a.ultimo_evento_em then a.expira_em
                          else greatest(a.expira_em, p_expira) end,
         atualizado_em = now()
   where original_transaction_id = p_otid;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.comprovar_compra(uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.comprovar_compra(uuid, text, text, text, timestamptz, timestamptz) to service_role;
