-- ─────────────────────────────────────────────────────────────────────────────
-- Compra que o aparelho não confirma (correção 2b, 26/nov/2026, próxima build).
--
-- Às vezes o Superwall devolve "comprou", mas no aparelho o status continua INACTIVE e o
-- RevenueCat também não vê (caso da assinatura sandbox travada do TestFlight; em produção,
-- atraso da loja). Hoje ela volta ao paywall depois de pagar. O webhook do Superwall, porém,
-- chega ao servidor em ~10 s com o id anônimo deste aparelho (`$superwallalias:<uuid>`).
--
-- `compra_recente_superwall(p_alias)`: houve compra (ou renovação, troca de plano, reativação)
-- feita COM ESTE id nos últimos minutos, e a assinatura está ativa? Só lê.
--   • "com este id" = `app_user_id` ou `original_app_user_id` do evento, sem diferenciar
--     maiúsculas. A lista `aliases` NÃO conta: ela junta os ids de todos os aparelhos do mesmo
--     Apple ID, e o que se quer saber é se a compra saiu DESTE aparelho.
--   • Janela (`p_minutos`, de 1 a 60): a função usa 15 min sem conta (logo depois de pagar) e
--     60 min com conta (o pós-compra vem antes do cadastro e leva alguns minutos).
--   • Devolve `{ confirmado, produto, otid, ambiente, expira_em }`.
-- Quem chama é a Edge Function `confirmar-compra` (service role). Sem conta ela só responde
-- `{ confirmado, produto }`; com conta, liga a compra pela `comprovar_compra` (já existe).
--
-- Índice novo em `loja_eventos(recebido_em)`: a busca começa pelos eventos recentes.
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists loja_eventos_recebido_idx on public.loja_eventos (recebido_em);

create or replace function public.compra_recente_superwall(p_alias text, p_minutos integer default 15)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  alias text := lower(btrim(coalesce(p_alias, '')));
  r record;
begin
  if alias !~ '^\$superwallalias:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('confirmado', false, 'motivo', 'id inválido');
  end if;

  select a.original_transaction_id, a.produto, a.ambiente, a.expira_em
    into r
    from public.loja_eventos e
    join public.assinaturas_loja a on a.original_transaction_id = e.original_transaction_id
   where e.recebido_em > now() - make_interval(mins => least(greatest(coalesce(p_minutos, 15), 1), 60))
     and e.tipo in ('initial_purchase', 'renewal', 'product_change', 'uncancellation')
     and (lower(e.app_user_id) = alias or lower(e.original_app_user_id) = alias)
     and a.status in ('ativa', 'cancelada', 'problema_cobranca')
     and a.expira_em > now()
   order by e.recebido_em desc
   limit 1;

  if not found then
    return jsonb_build_object('confirmado', false, 'motivo', 'sem compra recente');
  end if;
  return jsonb_build_object('confirmado', true, 'produto', r.produto, 'otid', r.original_transaction_id,
                            'ambiente', r.ambiente, 'expira_em', r.expira_em);
end;
$$;

revoke all on function public.compra_recente_superwall(text, integer) from public, anon, authenticated;
grant execute on function public.compra_recente_superwall(text, integer) to service_role;
