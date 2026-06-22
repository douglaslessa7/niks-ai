-- Corrige PostgreSQL 42P10 no webhook revenuecat-webhook:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- A Edge Function faz:
--   .from('subscriptions').upsert({...}, { onConflict: 'user_id' })
-- mas a coluna subscriptions.user_id só tinha NOT NULL + FOREIGN KEY,
-- sem UNIQUE. O upsert ON CONFLICT (user_id) exige um constraint UNIQUE.

-- 1) Deduplica linhas existentes por user_id (mantém a mais recente por updated_at),
--    senão a criação do UNIQUE falha se houver user_id repetido.
DELETE FROM public.subscriptions a
USING public.subscriptions b
WHERE a.user_id = b.user_id
  AND (
    a.updated_at < b.updated_at
    OR (a.updated_at = b.updated_at AND a.id < b.id)
  );

-- 2) Adiciona o constraint UNIQUE faltante na coluna correta.
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
