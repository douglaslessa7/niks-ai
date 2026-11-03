-- Fase 3 (grupos) · 3.1 — ASSINATURA CONFERIDA NO SERVIDOR
--
--  Até aqui o servidor não sabia quem paga: a compra acontece ANTES da conta (RevenueCat
--  anônimo) e a tabela `subscriptions` não é prova de pagamento (README). Agora:
--   • Edge Function `superwall-webhook` (assinada pelo Svix) recebe os eventos de loja do
--     Superwall — no formato do RevenueCat: type INITIAL_PURCHASE/RENEWAL/CANCELLATION/
--     EXPIRATION/…, original_transaction_id, app_user_id, original_app_user_id, aliases,
--     expiration_at_ms, environment, cancel_reason — e chama `registrar_evento_loja`.
--   • A importação única (histórico do ClickHouse do Superwall, desde 01/04/2026) passa
--     pela MESMA função, evento a evento.
--   • Quem é a dona: UUID da conta no app_user_id/aliases (depois do Purchases.logIn do
--     cadastro) ou, para a compra feita antes da conta, o id anônimo do RevenueCat que o
--     app manda em `vincular_rc` (customerInfo.originalAppUserId).
--   • `assinante(uid)`: tem transação ativa (expira no futuro, não reembolsada). SANDBOX
--     só vale para testers (cartas_config.testers).
--  Tudo só para o service role.

create table if not exists public.loja_eventos (
  id text primary key,                       -- id do evento (props.id) — idempotência
  tipo text not null,
  original_transaction_id text,
  app_user_id text,
  original_app_user_id text,
  aliases text[] not null default '{}',
  ambiente text,
  produto text,
  cancel_reason text,
  expira_em timestamptz,
  ocorrido_em timestamptz not null,
  origem text not null default 'webhook' check (origem in ('webhook', 'importacao')),
  payload jsonb not null,
  recebido_em timestamptz not null default now()
);
create index if not exists loja_eventos_otid_idx on public.loja_eventos (original_transaction_id);

create table if not exists public.assinaturas_loja (
  original_transaction_id text primary key,
  user_id uuid references public.users (id) on delete set null,
  ids_rc text[] not null default '{}',       -- app_user_id, original_app_user_id e aliases vistos
  produto text,
  ambiente text,
  status text not null check (status in ('ativa', 'cancelada', 'problema_cobranca', 'expirada', 'reembolsada')),
  expira_em timestamptz,
  ultimo_evento_em timestamptz not null,
  atualizado_em timestamptz not null default now()
);
create index if not exists assinaturas_loja_user_idx on public.assinaturas_loja (user_id);
create index if not exists assinaturas_loja_ids_idx on public.assinaturas_loja using gin (ids_rc);

-- Id anônimo do RevenueCat → conta (o app manda depois do cadastro / a cada abertura).
create table if not exists public.contas_rc (
  rc_id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index if not exists contas_rc_user_idx on public.contas_rc (user_id);

alter table public.loja_eventos enable row level security;
alter table public.assinaturas_loja enable row level security;
alter table public.contas_rc enable row level security;
revoke all on public.loja_eventos, public.assinaturas_loja, public.contas_rc from anon, authenticated;

-- UUID da conta entre os ids do RevenueCat (só se a conta existir) ────────────────
create or replace function public.conta_dos_ids(p_ids text[])
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.id from public.users u
      where u.id::text = any(p_ids) limit 1),
    (select c.user_id from public.contas_rc c where c.rc_id = any(p_ids) limit 1)
  );
$$;

-- Um evento de loja (formato RevenueCat; aceita também o camelCase do Superwall) ──
-- Idempotente pelo id. O estado da transação só anda para a frente: um evento mais
-- antigo que o último aplicado não muda status/expiração (só soma ids).
create or replace function public.registrar_evento_loja(p_evento jsonb, p_origem text default 'webhook')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e jsonb := coalesce(p_evento -> 'data', p_evento -> 'event', p_evento);
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
  end;
  v_quando := coalesce(
    case when (e ->> 'event_timestamp_ms') ~ '^[0-9]+$' then to_timestamp((e ->> 'event_timestamp_ms')::bigint / 1000.0) end,
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
          e - 'subscriber_attributes' - 'subscriberAttributes' - 'userAttributes')
  on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;

  v_status := case
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

-- O app manda o id anônimo do RevenueCat da usuária logada ────────────────────────
-- Um id já ligado a OUTRA conta não muda de dona (devolve conflito).
create or replace function public.vincular_rc(p_uid uuid, p_rc_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  atual uuid;
  n integer := 0;
begin
  if p_rc_id is null or length(p_rc_id) < 8 or length(p_rc_id) > 200 then
    return jsonb_build_object('ok', false, 'motivo', 'id inválido');
  end if;
  insert into public.contas_rc (rc_id, user_id) values (p_rc_id, p_uid) on conflict (rc_id) do nothing;
  select user_id into atual from public.contas_rc where rc_id = p_rc_id;
  if atual <> p_uid then
    return jsonb_build_object('ok', false, 'motivo', 'id de outra conta');
  end if;
  update public.assinaturas_loja set user_id = p_uid, atualizado_em = now()
   where user_id is null and p_rc_id = any(ids_rc);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'vinculadas', n, 'assinante', public.assinante(p_uid));
end;
$$;

-- Ela paga? (fonte da verdade do servidor) ───────────────────────────────────────
create or replace function public.assinante(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assinaturas_loja a
     where a.user_id = p_uid
       and a.status in ('ativa', 'cancelada', 'problema_cobranca')
       and a.expira_em > now()
       and (coalesce(a.ambiente, 'PRODUCTION') <> 'SANDBOX'
            or exists (select 1 from public.cartas_config c where c.id = 1 and p_uid = any(c.testers)))
  );
$$;

revoke all on function public.conta_dos_ids(text[]) from public, anon, authenticated;
revoke all on function public.registrar_evento_loja(jsonb, text) from public, anon, authenticated;
revoke all on function public.vincular_rc(uuid, text) from public, anon, authenticated;
revoke all on function public.assinante(uuid) from public, anon, authenticated;
grant execute on function public.conta_dos_ids(text[]) to service_role;
grant execute on function public.registrar_evento_loja(jsonb, text) to service_role;
grant execute on function public.vincular_rc(uuid, text) to service_role;
grant execute on function public.assinante(uuid) to service_role;
