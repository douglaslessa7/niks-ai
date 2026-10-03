-- recortar-catalogo diário — recorte sem fundo dos produtos NOVOS do catálogo
-- Até aqui a Edge Function `recortar-catalogo` só rodava à mão: produto que entrava no
-- catálogo depois do lote ficava sem recorte, e o app mostrava a foto original (com o
-- fundo que ela tiver). Agora um job do pg_cron chama a função 1x/dia; ela pega só os
-- produtos com foto e SEM recorte (`imagem_recorte_status is null`) — nunca refaz um
-- 'ok' nem insiste num 'falhou' (custo do Replicate).
-- Mesmo padrão da limpeza de órfãos (20261001130000): segredo no Vault, header lido na
-- hora da chamada, registro de cada execução numa tabela de log.
--
-- O job fica INERTE até o segredo `recortar_catalogo_secret` existir no Vault (ver
-- README → "Recorte diário do catálogo"): sem ele, a chamada nem é feita.

-- Log de cada execução --------------------------------------------------------
create table if not exists public.catalog_cutout_log (
  id           bigint generated always as identity primary key,
  run_at       timestamptz not null default now(),
  processados  int not null default 0,
  ok           int not null default 0,
  falhou       int not null default 0,
  faltam       int,                              -- sem recorte depois da execução
  ms           int,
  details      jsonb not null default '[]'::jsonb
);

-- Sem policies: só o service_role (a Edge Function e o painel) lê e grava.
alter table public.catalog_cutout_log enable row level security;
revoke all on public.catalog_cutout_log from anon, authenticated;

-- Job diário (04:15 em Brasília = 07:15 UTC) ---------------------------------
-- Idempotente: recria o job se ele já existir.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'recortar-catalogo-daily') then
    perform cron.unschedule('recortar-catalogo-daily');
  end if;
end $$;

select cron.schedule(
  'recortar-catalogo-daily',
  '15 7 * * *',
  $job$
  select net.http_post(
    url     := 'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/recortar-catalogo',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-admin-secret', s.decrypted_secret
    ),
    body    := '{"limit": 20}'::jsonb,
    timeout_milliseconds := 150000
  )
  from vault.decrypted_secrets s
  where s.name = 'recortar_catalogo_secret';
  $job$
);
