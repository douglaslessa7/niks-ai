-- Fase 3 (grupos) · 3.1 — eventos de loja no formato WEBHOOKS V2 do Superwall
--
--  Todo webhook novo criado no painel do Superwall usa o V2 (api_version 2026-09-22):
--  os dados da loja vêm em `event_data` (original_transaction_id, environment,
--  expiration_at em ms, cancel_reason, is_refund…), os aliases em `subscriber.aliases`
--  e a hora em `occurred_at`. `subscriber.attributes` traz e-mail e afins — não é
--  guardado. Mesma função, agora entende os três formatos: RevenueCat (o da importação
--  do ClickHouse), legado do Superwall (camelCase) e V2. Só service role (inalterado).

create or replace function public.registrar_evento_loja(p_evento jsonb, p_origem text default 'webhook')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- V2 (atual do Superwall): os dados da loja ficam em `event_data`, os aliases em
  -- `subscriber` e a hora em `occurred_at`. Aqui vira o mesmo formato plano dos outros.
  v2 boolean := jsonb_typeof(p_evento -> 'event_data') = 'object';
  e jsonb := case
    when jsonb_typeof(p_evento -> 'event_data') = 'object' then
      (p_evento -> 'event_data') || jsonb_strip_nulls(jsonb_build_object(
        'id', p_evento -> 'id',
        'type', p_evento -> 'type',
        'app_user_id', p_evento -> 'app_user_id',
        'original_app_user_id', coalesce(p_evento #> '{event_data,original_app_user_id}', p_evento #> '{subscriber,original_app_user_id}'),
        'aliases', p_evento #> '{subscriber,aliases}',
        'occurred_at', p_evento -> 'occurred_at'))
    else coalesce(p_evento -> 'data', p_evento -> 'event', p_evento)
  end;
  v_id text;
  v_tipo text;
  v_otid text;
  v_app text;
  v_orig text;
  v_aliases text[];
  v_ids text[];
  v_amb text;
  v_prod text;
  v_motivo text;
  v_exp timestamptz;
  v_quando timestamptz;
  v_status text;
  a public.assinaturas_loja%rowtype;
  dono uuid;
begin
  v_id := coalesce(e ->> 'id', e ->> 'eventId', p_evento ->> 'id');
  v_tipo := upper(coalesce(e ->> 'type', e ->> 'name', p_evento ->> 'type', ''));
  v_otid := coalesce(e ->> 'original_transaction_id', e ->> 'originalTransactionId');
  v_app := coalesce(e ->> 'app_user_id', e ->> 'appUserId');
  v_orig := coalesce(e ->> 'original_app_user_id', e ->> 'originalAppUserId');
  v_amb := upper(coalesce(e ->> 'environment', ''));
  v_prod := coalesce(e ->> 'product_id', e ->> 'productId');
  v_motivo := upper(coalesce(e ->> 'cancel_reason', e ->> 'cancelReason', e ->> 'expiration_reason', e ->> 'expirationReason', ''));
  v_exp := case
    when (e ->> 'expiration_at_ms') ~ '^[0-9]+$' then to_timestamp((e ->> 'expiration_at_ms')::bigint / 1000.0)
    when (e ->> 'expirationAt') ~ '^[0-9]+$' then to_timestamp((e ->> 'expirationAt')::bigint / 1000.0)
    when (e ->> 'expiration_at') ~ '^[0-9]+$' then to_timestamp((e ->> 'expiration_at')::bigint / 1000.0)
  end;
  v_quando := coalesce(
    case when (e ->> 'event_timestamp_ms') ~ '^[0-9]+$' then to_timestamp((e ->> 'event_timestamp_ms')::bigint / 1000.0) end,
    case when (e ->> 'occurred_at') ~ '^[0-9]+$' then to_timestamp((e ->> 'occurred_at')::bigint / 1000.0) end,
    case when (e ->> 'ts') ~ '^[0-9]+$' then to_timestamp((e ->> 'ts')::bigint / 1000.0) end,
    case when (e ->> 'timestamp') ~ '^[0-9]+$' then to_timestamp((e ->> 'timestamp')::bigint / 1000.0) end,
    case when (p_evento ->> 'timestamp') ~ '^[0-9]+$' then to_timestamp((p_evento ->> 'timestamp')::bigint / 1000.0) end,
    now());
  select coalesce(array_agg(x), '{}') into v_aliases
    from jsonb_array_elements_text(case when jsonb_typeof(e -> 'aliases') = 'array' then e -> 'aliases' else '[]'::jsonb end) x;
  v_tipo := replace(lower(v_tipo), ' ', '_');

  if v_id is null or v_otid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem id ou original_transaction_id');
  end if;

  insert into public.loja_eventos (id, tipo, original_transaction_id, app_user_id, original_app_user_id, aliases,
                                   ambiente, produto, cancel_reason, expira_em, ocorrido_em, origem, payload)
  -- Sem os atributos de assinante (e-mail etc.): não precisamos deles para nada.
  values (v_id, v_tipo, v_otid, v_app, v_orig, v_aliases, v_amb, v_prod, v_motivo, v_exp, v_quando, p_origem,
          case when v2 then p_evento #- '{subscriber,attributes}'
               else e - 'subscriber_attributes' - 'subscriberAttributes' - 'userAttributes' end)
  on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;

  v_status := case
    when coalesce(e ->> 'is_refund', 'false') = 'true' then 'reembolsada'
    when v_tipo in ('initial_purchase', 'renewal', 'uncancellation', 'product_change', 'non_renewing_purchase', 'subscription_extended', 'temporary_entitlement_grant') then 'ativa'
    when v_tipo = 'cancellation' and v_motivo = 'CUSTOMER_SUPPORT' then 'reembolsada'
    when v_tipo = 'cancellation' then 'cancelada'
    when v_tipo = 'billing_issue' then 'problema_cobranca'
    when v_tipo = 'expiration' then 'expirada'
  end;

  v_ids := array(select distinct x from unnest(array_remove(array[v_app, v_orig], null) || v_aliases) x where x <> '');

  select * into a from public.assinaturas_loja where original_transaction_id = v_otid for update;
  if not found then
    if v_status is null then
      return jsonb_build_object('ok', true, 'ignorado', v_tipo);
    end if;
    dono := public.conta_dos_ids(v_ids);
    insert into public.assinaturas_loja (original_transaction_id, user_id, ids_rc, produto, ambiente, status, expira_em, ultimo_evento_em)
    values (v_otid, dono, v_ids, v_prod, nullif(v_amb, ''), v_status, v_exp, v_quando);
  else
    v_ids := array(select distinct x from unnest(a.ids_rc || v_ids) x);
    dono := coalesce(a.user_id, public.conta_dos_ids(v_ids));
    if v_status is not null and v_quando >= a.ultimo_evento_em then
      update public.assinaturas_loja
         set ids_rc = v_ids, user_id = dono, status = v_status,
             -- Reembolso tira o acesso na hora; nos outros, a expiração do evento (ou a anterior).
             expira_em = case when v_status = 'reembolsada' then least(coalesce(v_exp, v_quando), v_quando) else coalesce(v_exp, a.expira_em) end,
             produto = coalesce(v_prod, a.produto), ambiente = coalesce(nullif(v_amb, ''), a.ambiente),
             ultimo_evento_em = v_quando, atualizado_em = now()
       where original_transaction_id = v_otid;
    else
      update public.assinaturas_loja set ids_rc = v_ids, user_id = dono, atualizado_em = now()
       where original_transaction_id = v_otid;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'transacao', v_otid, 'status', v_status, 'conta', dono);
end;
$$;
