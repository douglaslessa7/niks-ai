-- Tela de detalhes do check-in (09/nov/2026).
--
--   • `checkin_detalhe(p_uid, p_checkin)`: um check-in, só para quem pode vê-lo —
--       · quem fez (inclusive escondido pela moderação; removido não abre para ninguém);
--       · integrante de um grupo em que ele foi publicado, com a autora ainda no grupo, sem
--         bloqueio dela e sem `oculto_em` (escondido pela denúncia não abre para as outras).
--     Devolve `grupo_id` de um grupo em comum (a denúncia precisa dele). Convidada abre igual:
--     a regra é ser integrante, não assinante.
--   • `perfil_grupos`: cada dia do calendário ganha `checkins` = [{id, rotina}] (até 2: manhã e
--     noite), para tocar no dia e abrir o check-in. O resto da função não muda; versões antigas
--     do app ignoram o campo novo.
--
-- Só leitura. Aplicar antes de publicar a função `grupos` (ação `checkin_detalhe`).

begin;

create or replace function public.checkin_detalhe(p_uid uuid, p_checkin uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select * from public.checkins where id = p_checkin and removido_em is null
  ),
  grupo_comum as (
    select cg.grupo_id
      from c
      join public.checkin_grupos cg on cg.checkin_id = c.id
      join public.grupo_membros m on m.grupo_id = cg.grupo_id and m.user_id = c.user_id and m.saiu_em is null
     where public.grupo_integrante(cg.grupo_id, p_uid)
     order by cg.grupo_id
     limit 1
  )
  select jsonb_build_object(
      'checkin_id', c.id, 'user_id', c.user_id, 'rotina', c.rotina, 'dia', c.dia,
      'titulo', coalesce(c.titulo, case c.rotina when 'am' then 'Rotina da manhã' else 'Rotina da noite' end),
      'descricao', c.descricao, 'hora_exibida', c.hora_exibida, 'foto_path', c.foto_path,
      'voce', c.user_id = p_uid,
      'grupo_id', (select grupo_id from grupo_comum),
      'autora', public.perfil_curto(c.user_id))
    from c
   where c.user_id = p_uid
      or (c.oculto_em is null
          and exists (select 1 from grupo_comum)
          and not exists (select 1 from public.bloqueios b where b.user_id = p_uid and b.bloqueada_id = c.user_id));
$$;

revoke all on function public.checkin_detalhe(uuid, uuid) from public, anon, authenticated;
grant execute on function public.checkin_detalhe(uuid, uuid) to service_role;

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
    'dias', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'foto_path', foto_path, 'checkins', ids) order by dia)
                        from (select distinct on (x.dia) x.dia, x.foto_path,
                                     (select jsonb_agg(jsonb_build_object('id', y.id, 'rotina', y.rotina) order by y.capturado_em)
                                        from public.checkins y
                                       where y.user_id = p_uid and y.dia = x.dia and y.removido_em is null) ids
                                from public.checkins x
                               where x.user_id = p_uid and x.removido_em is null
                                 and x.dia >= date_trunc('month', p_mes)::date
                                 and x.dia < (date_trunc('month', p_mes) + interval '1 month')::date
                               order by x.dia, x.capturado_em) z), '[]'::jsonb));
$$;

commit;
