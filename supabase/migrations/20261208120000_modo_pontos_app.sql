-- ─────────────────────────────────────────────────────────────────────────────
-- MODO PONTOS PELA VERSÃO DO APP (20261208, build 1.62 (2), decisão do produto: opção b).
-- A 1.62 mostra os NIKS Points na comemoração (90a) e só carta de PODER; a 1.61 ainda espera
-- a carta do dia com pontos. Em vez de ligar o modo pontos para TODAS as contas (a 1.61 da loja
-- ficaria sem os pontos na tela), o app novo avisa o servidor que entende o modo pontos e a
-- conta entra nele sozinha:
--  • a 1.62 (2) manda `regras: 3` em toda chamada da função `cartas`; a função marca a conta
--    com `cartas_regras.app_pontos_em` (uma vez; `marcar_app_pontos`);
--  • `v2_modo_pontos` = ligado (`pontos_diretos.ativa`) E (todas OU conta na lista OU app_pontos_em).
--    O desligador geral (`ativa`) continua valendo para todo mundo.
-- Quem só usa a 1.61 não muda. Backup: ~/Developer/niks-ai-backups/2026-11-12_conta_teste/.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.cartas_regras add column if not exists app_pontos_em timestamptz;

create or replace function public.marcar_app_pontos(p_uid uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  n integer;
begin
  update public.cartas_regras set app_pontos_em = now()
   where user_id = p_uid and versao >= 2 and app_pontos_em is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$function$;
revoke all on function public.marcar_app_pontos(uuid) from public, anon, authenticated;

create or replace function public.v2_modo_pontos(p_uid uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  c jsonb;
begin
  select regras_v2 -> 'pontos_diretos' into c from public.cartas_config where id = 1;
  if c is null or not coalesce((c ->> 'ativa')::boolean, false) or not public.cartas_v2(p_uid) then
    return false;
  end if;
  return coalesce((c ->> 'todas')::boolean, false)
      or coalesce(c -> 'contas', '[]'::jsonb) ? p_uid::text
      -- App que entende o modo pontos (1.62 (2)+, `regras: 3`).
      or exists (select 1 from public.cartas_regras r where r.user_id = p_uid and r.app_pontos_em is not null);
end;
$function$;
