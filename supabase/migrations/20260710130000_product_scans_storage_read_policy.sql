-- product-scans (Storage): leitura das próprias fotos pela usuária
-- O bucket `product-scans` é PRIVADO. A Edge Function `analisar-produto` faz o
-- upload via service role (bypass de RLS) e guarda só o `image_path`. O app, na
-- aba "Escaneados", gera a URL assinada (createSignedUrl) do lado do cliente —
-- e para ASSINAR a URL a usuária precisa de permissão de SELECT em
-- storage.objects nas próprias fotos. Sem esta policy o createSignedUrl volta
-- vazio e a foto não aparece no card.
--
-- Convenção de path (definida na Edge Function): `{user_id}/{timestamp}.jpg`,
-- então o 1º segmento da pasta é o id da usuária. Espelha o padrão do bucket
-- `scans` (leitura por user_id). Idempotente (guard em pg_policies).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_scans_read_own'
  ) then
    create policy product_scans_read_own
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'product-scans'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
