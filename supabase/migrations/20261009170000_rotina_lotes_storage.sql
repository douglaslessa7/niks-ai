-- ─────────────────────────────────────────────────────────────────────────────
-- Scan em lote dos produtos de casa (plano da Rotina, Fase 5 — out/2026).
-- Bucket PRIVADO `rotina-lotes`: as imagens combinadas (frente + rótulo) de cada lote
-- "Montar minha rotina", em `{user_id}/{lote_id}/{n}.jpg`. O app envia; a Fase 6 (a
-- função `montar-rotina-com-produtos` em segundo plano + tabela `rotina_lotes`) lê.
-- Cada usuária só envia, lê e apaga na própria pasta. Aditivo: o app das lojas não
-- usa nada disto.
-- Excluir conta / limpeza de órfãos: `rotina-lotes` entra nas listas de buckets do
-- `delete-account` e do `cleanup-orphan-storage`.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rotina-lotes', 'rotina-lotes', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'rotina_lotes_insert_own') then
    create policy rotina_lotes_insert_own on storage.objects
      for insert to authenticated
      with check (bucket_id = 'rotina-lotes' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'rotina_lotes_read_own') then
    create policy rotina_lotes_read_own on storage.objects
      for select to authenticated
      using (bucket_id = 'rotina-lotes' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'rotina_lotes_delete_own') then
    create policy rotina_lotes_delete_own on storage.objects
      for delete to authenticated
      using (bucket_id = 'rotina-lotes' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
