-- routine_photos — "Foto do dia" (designs 45a–45c)
-- Ao concluir a rotina da MANHÃ a usuária pode (opcional) tirar uma foto do rosto.
-- As fotos alimentam o antes/depois ("seu vídeo") liberado após 30 dias; até lá o app
-- não mostra as fotos antigas. Uma foto por dia (UNIQUE user_id + taken_on): refazer
-- no mesmo dia substitui a anterior.
-- A imagem fica no bucket PRIVADO `routine-photos`, path `{user_id}/{AAAA-MM-DD}.jpg`;
-- a tabela guarda só o `image_path` (URL assinada é gerada na leitura).
-- Escrita pelo próprio app (a usuária autenticada grava as próprias linhas/arquivos).

-- Tabela (idempotente) --------------------------------------------------------
create table if not exists public.routine_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  taken_on    date not null,
  image_path  text not null,
  created_at  timestamptz not null default now(),
  constraint routine_photos_user_day_key unique (user_id, taken_on)
);

create index if not exists routine_photos_user_id_taken_on_idx
  on public.routine_photos (user_id, taken_on);

-- RLS: a usuária lê e grava só as próprias linhas ------------------------------
alter table public.routine_photos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'routine_photos' and policyname = 'routine_photos_select_own') then
    create policy routine_photos_select_own on public.routine_photos
      for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'routine_photos' and policyname = 'routine_photos_insert_own') then
    create policy routine_photos_insert_own on public.routine_photos
      for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'routine_photos' and policyname = 'routine_photos_update_own') then
    create policy routine_photos_update_own on public.routine_photos
      for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Bucket privado ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('routine-photos', 'routine-photos', false)
on conflict (id) do nothing;

-- Storage: só a própria pasta ({user_id}/...) ------------------------------------
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'routine_photos_read_own') then
    create policy routine_photos_read_own on storage.objects
      for select to authenticated
      using (bucket_id = 'routine-photos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'routine_photos_insert_own') then
    create policy routine_photos_insert_own on storage.objects
      for insert to authenticated
      with check (bucket_id = 'routine-photos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'routine_photos_update_own') then
    create policy routine_photos_update_own on storage.objects
      for update to authenticated
      using (bucket_id = 'routine-photos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
