-- ─────────────────────────────────────────────────────────────────────────────
-- Chave PRÓPRIA do lote "Montar minha rotina" no motor novo (19/nov/2026), separada da
-- do motor no onboarding (`motor_config.ativo`, que só liga com a 1.63 na loja).
--
-- motor_config.lote_v2:
--   'motor'     → só quem `usa_motor_novo` (o comportamento de antes; padrão);
--   'todas'     → todas as contas;
--   'desligado' → ninguém (todo lote volta para o lote antigo, na hora).
-- A Edge Function montar-rotina-com-produtos lê `usa_lote_v2(uid)` a cada lote, então
-- trocar a chave vale no próximo lote, sem publicar nada:
--   update public.motor_config set lote_v2 = 'desligado', atualizado_em = now() where id = 1;
--
-- Desfazer: drop function if exists public.usa_lote_v2(uuid);
--           alter table public.motor_config drop column if exists lote_v2;
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.motor_config add column if not exists lote_v2 text not null default 'motor';
do $$ begin
  alter table public.motor_config add constraint motor_config_lote_v2_check check (lote_v2 in ('desligado', 'motor', 'todas'));
exception when duplicate_object then null; end $$;

create or replace function public.usa_lote_v2(p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  chave text;
begin
  select c.lote_v2 into chave from public.motor_config c where c.id = 1;
  if chave is null or chave = 'desligado' then return false; end if;
  if chave = 'todas' then return true; end if;
  return public.usa_motor_novo(p_uid);
end;
$$;
revoke all on function public.usa_lote_v2(uuid) from public, anon, authenticated;
grant execute on function public.usa_lote_v2(uuid) to service_role;
