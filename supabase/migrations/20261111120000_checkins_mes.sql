-- Fase 3 (grupos) · rodada 81 do design — aba Grupos (81a/81b): embaixo do nome do mês,
-- "18 check-ins" / "1 check-in até agora". O perfil só devolvia os DIAS com foto (um por
-- dia), e ela pode fazer 2 check-ins no mesmo dia (manhã e noite): `perfil_grupos` ganha
-- `checkins_mes`, a contagem do mês pedido (fotos removidas não contam). A função `grupos`
-- repassa o perfil inteiro — não muda.
-- Substitui `perfil_grupos` (mesma assinatura, mesmas permissões).

create or replace function public.perfil_grupos(p_uid uuid, p_mes date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with dias as (select distinct dia from public.checkins where user_id = p_uid and removido_em is null),
  hoje as (select public.dia_sessao(now()) d),
  ponta as (select case when exists (select 1 from dias, hoje where dias.dia = hoje.d) then (select d from hoje)
                        else (select d - 1 from hoje) end p),
  -- ilhas de dias consecutivos: dia − posição é constante dentro de cada sequência
  numerados as (select dia, dia - (row_number() over (order by dia))::int g from dias),
  seguidos as (select count(*) n from numerados
                where g = (select nu.g from numerados nu, ponta where nu.dia = ponta.p))
  select public.perfil_curto(p_uid) || jsonb_build_object(
    'checkins', (select count(*) from public.checkins where user_id = p_uid and removido_em is null),
    'dias_ativos', (select count(*) from dias),
    'dias_seguidos', coalesce((select n from seguidos), 0),
    'grupos', (select count(*) from public.grupo_membros gm join public.grupos g on g.id = gm.grupo_id
                where gm.user_id = p_uid and gm.saiu_em is null and g.apagado_em is null),
    'primeiro_mes', (select date_trunc('month', min(dia))::date from dias),
    'mes', date_trunc('month', p_mes)::date,
    -- Quantos check-ins no mês pedido (até 2 por dia: manhã e noite) — "18 check-ins" (81a/81b).
    'checkins_mes', (select count(*) from public.checkins
                      where user_id = p_uid and removido_em is null
                        and dia >= date_trunc('month', p_mes)::date
                        and dia < (date_trunc('month', p_mes) + interval '1 month')::date),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'foto_path', foto_path) order by dia)
                        from (select distinct on (dia) dia, foto_path from public.checkins
                               where user_id = p_uid and removido_em is null
                                 and dia >= date_trunc('month', p_mes)::date
                                 and dia < (date_trunc('month', p_mes) + interval '1 month')::date
                               order by dia, capturado_em) x), '[]'::jsonb));
$$;

revoke all on function public.perfil_grupos(uuid, date) from public, anon, authenticated;
grant execute on function public.perfil_grupos(uuid, date) to service_role;
