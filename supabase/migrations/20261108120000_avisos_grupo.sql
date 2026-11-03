-- Fase 3 (grupos) · 3.4 — AVISOS DO GRUPO (push do servidor, users.push_token)
--
--   • "Ana fez check-in 📸" — a cada check-in, para as outras integrantes dos grupos em
--     que ele saiu (um por pessoa, mesmo que estejam juntas em vários grupos). Pula quem
--     bloqueou a autora e quem não tem push_token. A função `grupos` pega a lista em
--     `destinatarias_checkin` e manda para a Expo logo depois do check-in.
--   • "Falta só você hoje 👀" — à noite, 30 min depois do horário da rotina da noite DELA
--     (`rotina_noite_horario`, fuso `rotina_fuso`; padrão 21:00 de São Paulo), se todas as
--     outras de algum grupo já fizeram check-in hoje e ela não. 1 por dia. Sai do próprio
--     banco: pg_cron a cada 15 min → `enviar_avisos_falta_voce()` → pg_net → Expo.
--     (30 min: entre o lembrete local "🌙 Boa noite" da hora e o "ainda dá tempo" de 1 h
--     depois — os três não chegam juntos.)
--   Tocar abre o grupo (`data.type` 'grupo_checkin' / 'grupo_falta' + grupo_id →
--   lib/pushToque.ts). `avisos_enviados` evita repetir. Só service role.

-- Quem recebe o aviso de um check-in (marca como enviado ao devolver: não repete). ──
create or replace function public.destinatarias_checkin(p_checkin uuid)
returns table (user_id uuid, push_token text, grupo_id uuid, grupo_nome text, autora text)
language plpgsql
security definer
set search_path = public
as $$
declare
  autora_id uuid;
  nome_autora text;
begin
  select c.user_id into autora_id from public.checkins c where c.id = p_checkin and c.removido_em is null;
  if autora_id is null then
    return;
  end if;
  nome_autora := public.perfil_curto(autora_id) ->> 'nome';
  return query
  with alvo as (
    select distinct on (m.user_id) m.user_id, u.push_token, g.id grupo_id, g.nome grupo_nome
      from public.checkin_grupos cg
      join public.grupos g on g.id = cg.grupo_id and g.apagado_em is null
      join public.grupo_membros m on m.grupo_id = cg.grupo_id and m.saiu_em is null and m.user_id <> autora_id
      join public.users u on u.id = m.user_id
     where cg.checkin_id = p_checkin
       and u.push_token is not null and u.push_token <> '' and u.push_token <> 'simulator-token'
       and not exists (select 1 from public.bloqueios b where b.user_id = m.user_id and b.bloqueada_id = autora_id)
     order by m.user_id, g.criado_em
  ),
  marcadas as (
    insert into public.avisos_enviados (user_id, tipo, chave)
    select a.user_id, 'checkin', p_checkin::text from alvo a
    on conflict do nothing
    returning avisos_enviados.user_id
  )
  select a.user_id, a.push_token, a.grupo_id, a.grupo_nome, nome_autora
    from alvo a join marcadas mk on mk.user_id = a.user_id;
end;
$$;

-- Quem recebe o "Falta só você hoje" AGORA (janela de 15 min; marca como enviado). ─
create or replace function public.avisos_falta_voce(p_agora timestamptz default now())
returns table (user_id uuid, push_token text, grupo_id uuid, grupo_nome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := public.dia_sessao(p_agora);
begin
  return query
  with candidatas as (
    select u.id, u.push_token, coalesce(nullif(u.rotina_fuso, ''), 'America/Sao_Paulo') fuso,
           coalesce(u.rotina_noite_horario, time '21:00') + interval '30 minutes' alvo
      from public.users u
     where u.push_token is not null and u.push_token <> '' and u.push_token <> 'simulator-token'
       and exists (select 1 from public.grupo_membros m where m.user_id = u.id and m.saiu_em is null)
  ),
  na_hora as (
    select c.* from candidatas c
     where ((((p_agora at time zone c.fuso)::date + c.alvo::time) at time zone c.fuso) > p_agora - interval '15 minutes')
       and ((((p_agora at time zone c.fuso)::date + c.alvo::time) at time zone c.fuso) <= p_agora)
  ),
  grupo_falta as (
    select distinct on (n.id) n.id uid, n.push_token tok, g.id gid, g.nome gnome
      from na_hora n
      join public.grupo_membros m on m.user_id = n.id and m.saiu_em is null
      join public.grupos g on g.id = m.grupo_id and g.apagado_em is null
     where not exists (select 1 from public.checkins c join public.checkin_grupos cg on cg.checkin_id = c.id
                        where c.user_id = n.id and cg.grupo_id = g.id and c.dia = d and c.removido_em is null)
       and exists (select 1 from public.grupo_membros o where o.grupo_id = g.id and o.saiu_em is null and o.user_id <> n.id)
       and not exists (select 1 from public.grupo_membros o where o.grupo_id = g.id and o.saiu_em is null and o.user_id <> n.id
                        and not exists (select 1 from public.checkins c join public.checkin_grupos cg on cg.checkin_id = c.id
                                         where c.user_id = o.user_id and cg.grupo_id = g.id and c.dia = d and c.removido_em is null))
     order by n.id, g.criado_em
  ),
  marcadas as (
    insert into public.avisos_enviados (user_id, tipo, chave)
    select gf.uid, 'falta_voce', d::text from grupo_falta gf
    on conflict do nothing
    returning avisos_enviados.user_id
  )
  select gf.uid, gf.tok, gf.gid, gf.gnome from grupo_falta gf join marcadas mk on mk.user_id = gf.uid;
end;
$$;

-- Manda os "Falta só você" desta janela pela Expo (pg_net; até 100 por pedido). ────
create or replace function public.enviar_avisos_falta_voce()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  msgs jsonb;
  total integer := 0;
  lote jsonb;
  i integer := 0;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'to', a.push_token, 'title', a.grupo_nome, 'body', 'Falta só você hoje 👀', 'sound', 'default',
           'data', jsonb_build_object('type', 'grupo_falta', 'grupo_id', a.grupo_id))), '[]'::jsonb)
    into msgs from public.avisos_falta_voce(now()) a;
  total := jsonb_array_length(msgs);
  while i < total loop
    select jsonb_agg(x) into lote from (select x from jsonb_array_elements(msgs) with ordinality e(x, n) where n > i and n <= i + 100) s;
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := lote,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
    i := i + 100;
  end loop;
  return total;
end;
$$;

revoke all on function public.destinatarias_checkin(uuid) from public, anon, authenticated;
revoke all on function public.avisos_falta_voce(timestamptz) from public, anon, authenticated;
revoke all on function public.enviar_avisos_falta_voce() from public, anon, authenticated;
grant execute on function public.destinatarias_checkin(uuid) to service_role;
grant execute on function public.avisos_falta_voce(timestamptz) to service_role;
grant execute on function public.enviar_avisos_falta_voce() to service_role;

-- A cada 15 min (o envio acontece na janela de cada uma). Idempotente.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'grupos-falta-voce';
    perform cron.schedule('grupos-falta-voce', '*/15 * * * *', 'select public.enviar_avisos_falta_voce()');
  end if;
end $$;
