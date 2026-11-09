-- O cron scan-available passa a enviar a senha que a Edge Function send-notifications exige.
-- O segredo fica no Vault (`send_notifications_secret`); o mesmo valor está no secret
-- SEND_NOTIFICATIONS_SECRET da função. Mesmo horário e mesmo corpo de antes.
select cron.schedule(
  'scan-available',
  '0 13 * * *',
  $job$
  select net.http_post(
    url     := 'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (select decrypted_secret
                          from vault.decrypted_secrets
                         where name = 'send_notifications_secret')
    ),
    body    := '{"type": "scan_available"}'::jsonb
  );
  $job$
);
