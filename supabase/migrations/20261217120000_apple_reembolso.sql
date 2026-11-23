-- ─────────────────────────────────────────────────────────────────────────────
-- Pedidos de reembolso da Apple respondidos pelo NIKS (19/nov/2026).
-- Edge Function `apple-notificacoes`: recebe as App Store Server Notifications V2, repassa
-- todas ao Superwall e responde os CONSUMPTION_REQUEST conforme a chave abaixo.
--
-- 1. apple_reembolso_config.responder: 'desligado' (padrão) | 'sandbox' | 'ligado'.
--    Desligar na hora, sem publicar nada (o repasse continua):
--      update public.apple_reembolso_config set responder = 'desligado', atualizado_em = now() where id = 1;
-- 2. apple_notificacoes: uma linha por notificação recebida (repasse e assinatura), sem o conteúdo.
-- 3. apple_pedidos_reembolso: cada pedido, a nossa decisão, o que enviamos e o desfecho da Apple.
-- 4. apple_uso_da_conta(uid, até): retrato de uso da conta até o pedido (só service role).
-- 5. users.consentimento_reembolso_em / _versao (build 1.64): a data é SEMPRE a do servidor no
--    momento em que o app grava (gatilho) — o app não consegue registrar um aceite no passado.
-- 6. Tarefa a cada 15 min (pg_cron): pedidos pendentes dentro do prazo de 12 h. Só chama a
--    função se o segredo `apple_notificacoes_secret` existir no Vault (= APPLE_NOTIF_ADMIN_SECRET).
--
-- Desfazer (na ordem):
--   select cron.unschedule('apple-reembolso-pendentes');
--   drop function if exists public.apple_uso_da_conta(uuid, timestamptz);
--   drop trigger if exists users_consentimento_reembolso_trg on public.users;
--   drop function if exists public.users_consentimento_reembolso();
--   drop table if exists public.apple_pedidos_reembolso, public.apple_notificacoes, public.apple_reembolso_config;
--   alter table public.users drop column if exists consentimento_reembolso_versao, drop column if exists consentimento_reembolso_em;
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Chave
create table if not exists public.apple_reembolso_config (
  id smallint primary key default 1 check (id = 1),
  responder text not null default 'desligado' check (responder in ('desligado', 'sandbox', 'ligado')),
  atualizado_em timestamptz not null default now()
);
insert into public.apple_reembolso_config (id) values (1) on conflict (id) do nothing;
alter table public.apple_reembolso_config enable row level security;
revoke all on public.apple_reembolso_config from anon, authenticated;

-- 2. Notificações recebidas
create table if not exists public.apple_notificacoes (
  id bigint generated always as identity primary key,
  recebido_em timestamptz not null default now(),
  notification_uuid text,
  tipo text,
  subtipo text,
  ambiente text,
  assinatura_ok boolean not null default false,
  repasse_http integer,
  repasse_ms integer,
  original_transaction_id text
);
create index if not exists apple_notificacoes_recebido_idx on public.apple_notificacoes (recebido_em desc);
alter table public.apple_notificacoes enable row level security;
revoke all on public.apple_notificacoes from anon, authenticated;

-- 3. Pedidos de reembolso
create table if not exists public.apple_pedidos_reembolso (
  notification_uuid text primary key,
  ambiente text,
  recebido_em timestamptz not null,
  transaction_id text,
  original_transaction_id text,
  app_account_token text,
  produto text,
  motivo text,
  decisao text not null default 'pendente' check (decisao in
    ('pendente', 'desligado', 'sem_conta', 'sem_consentimento', 'nao_entregue', 'respondido', 'tentar_de_novo', 'erro')),
  user_id uuid,
  uso jsonb,
  enviado jsonb,
  http_status integer,
  resposta text,
  tentativas integer not null default 0,
  respondido_em timestamptz,
  resultado_apple text check (resultado_apple in ('concedido', 'negado', 'revertido')),
  resultado_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index if not exists apple_pedidos_tx_idx on public.apple_pedidos_reembolso (transaction_id);
create index if not exists apple_pedidos_orig_idx on public.apple_pedidos_reembolso (original_transaction_id);
create index if not exists apple_pedidos_decisao_idx on public.apple_pedidos_reembolso (decisao, recebido_em);
alter table public.apple_pedidos_reembolso enable row level security;
revoke all on public.apple_pedidos_reembolso from anon, authenticated;

-- 4. Uso da conta até o pedido
create or replace function public.apple_uso_da_conta(p_uid uuid, p_ate timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'dias_conta', (select round(extract(epoch from (p_ate - a.created_at)) / 86400.0, 1) from auth.users a where a.id = p_uid),
    'scans', (select count(*) from public.skin_scans t where t.user_id = p_uid and t.created_at <= p_ate),
    'rotinas_geradas', (select count(*) from public.protocolos t where t.user_id = p_uid and t.updated_at <= p_ate),
    'rotinas_feitas', (select count(*) from public.rotinas_concluidas t where t.user_id = p_uid and t.concluida_em <= p_ate),
    'msgs_chat', (select count(*) from public.coach_messages t where t.user_id = p_uid and t.created_at <= p_ate),
    'scans_produto', (select count(*) from public.product_scans t where t.user_id = p_uid and t.created_at <= p_ate)
  );
$$;
revoke all on function public.apple_uso_da_conta(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.apple_uso_da_conta(uuid, timestamptz) to service_role;

-- 5. Consentimento (build 1.64)
alter table public.users add column if not exists consentimento_reembolso_em timestamptz;
alter table public.users add column if not exists consentimento_reembolso_versao text;

create or replace function public.users_consentimento_reembolso()
returns trigger
language plpgsql
as $$
begin
  if new.consentimento_reembolso_em is null then
    new.consentimento_reembolso_versao := null;  -- retirou o consentimento
  elsif tg_op = 'UPDATE' and old.consentimento_reembolso_em is not null then
    -- Já tinha consentido: o app gravar de novo não muda a data nem a versão do 1º aceite.
    new.consentimento_reembolso_em := old.consentimento_reembolso_em;
    new.consentimento_reembolso_versao := old.consentimento_reembolso_versao;
  else
    new.consentimento_reembolso_em := now();     -- 1º aceite: a data é sempre a do servidor
  end if;
  return new;
end;
$$;
drop trigger if exists users_consentimento_reembolso_trg on public.users;
create trigger users_consentimento_reembolso_trg
  before insert or update of consentimento_reembolso_em on public.users
  for each row execute function public.users_consentimento_reembolso();

-- 6. Tarefa a cada 15 min
do $$
begin
  if exists (select 1 from cron.job where jobname = 'apple-reembolso-pendentes') then
    perform cron.unschedule('apple-reembolso-pendentes');
  end if;
end $$;
select cron.schedule(
  'apple-reembolso-pendentes',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url     := 'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/apple-notificacoes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-admin-secret', s.decrypted_secret),
    body    := '{"acao": "pendentes"}'::jsonb,
    timeout_milliseconds := 60000
  )
  from vault.decrypted_secrets s
  where s.name = 'apple_notificacoes_secret';
  $job$
);
