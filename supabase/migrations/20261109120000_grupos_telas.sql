-- Fase 3 (grupos) · 3.5 — dados que as telas do design pedem:
--   • aba Grupos (80q): o terceiro número é "Dias seguidos" (dias de sessão seguidos com
--     check-in, terminando hoje ou ontem — hoje ainda sem check-in não quebra a
--     sequência) e `primeiro_mes` (até onde a seta do calendário volta);
--   • Seus grupos (80s): `checkins_semana` ("Você está em 2º esta semana" × "Semana
--     começa com o primeiro check-in") e `ultimo_checkin_outra` (ponto rosa de novidade).
--   • Novo check-in (80w): título (vazio → "Rotina da manhã/noite", como no mural do
--     design) e descrição opcional — colunas novas em `checkins`; `publicar_checkin`
--     ganha os dois parâmetros (mantém a carta da 3.3) e o mural devolve os dois.
-- Substitui `perfil_grupos`, `grupo_detalhe`, `publicar_checkin` e `mural_grupo`.

alter table public.checkins add column if not exists titulo text check (titulo is null or char_length(titulo) <= 60);
alter table public.checkins add column if not exists descricao text check (descricao is null or char_length(descricao) <= 280);

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
    'dias', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'foto_path', foto_path) order by dia)
                        from (select distinct on (dia) dia, foto_path from public.checkins
                               where user_id = p_uid and removido_em is null
                                 and dia >= date_trunc('month', p_mes)::date
                                 and dia < (date_trunc('month', p_mes) + interval '1 month')::date
                               order by dia, capturado_em) x), '[]'::jsonb));
$$;

revoke all on function public.perfil_grupos(uuid, date) from public, anon, authenticated;
grant execute on function public.perfil_grupos(uuid, date) to service_role;

create or replace function public.grupo_detalhe(p_uid uuid, p_grupo uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (select public.dia_sessao(now()) d),
  mem as (
    select gm.user_id, gm.papel, gm.tipo, gm.entrou_em,
           exists (select 1 from public.checkins_visiveis(p_uid, p_grupo) c, hoje where c.user_id = gm.user_id and c.dia = hoje.d) fez_hoje
      from public.grupo_membros gm
     where gm.grupo_id = p_grupo and gm.saiu_em is null
       and (gm.user_id = p_uid or not exists (select 1 from public.bloqueios b where b.user_id = p_uid and b.bloqueada_id = gm.user_id))
  ),
  rk as (select r from jsonb_array_elements(public.ranking_grupo(p_uid, p_grupo, 'semana')) r)
  select case when not public.grupo_integrante(p_grupo, p_uid) then null else jsonb_build_object(
    'id', g.id, 'nome', g.nome, 'descricao', g.descricao, 'banner', g.banner, 'banner_path', g.banner_path,
    'criado_em', g.criado_em,
    'seu_papel', (select papel from mem where user_id = p_uid),
    'seu_tipo', (select tipo from mem where user_id = p_uid),
    'integrantes', (select jsonb_agg(public.perfil_curto(user_id) || jsonb_build_object(
                      'papel', papel, 'fez_hoje', fez_hoje, 'voce', user_id = p_uid) order by entrou_em) from mem),
    'feitos_hoje', (select count(*) from mem where fez_hoje),
    'total', (select count(*) from mem),
    'sua_posicao_semana', (select (r ->> 'posicao')::int from rk where (r ->> 'voce')::boolean),
    'lider_jornada', (select j -> 'nome' from jsonb_array_elements(public.jornada_grupo(p_uid, p_grupo)) j limit 1),
    -- "Você está em Nº esta semana" só faz sentido depois do 1º check-in da semana.
    'checkins_semana', (select count(*) from public.checkins_visiveis(p_uid, p_grupo) c
                         where c.dia <@ public.periodo_ranking('semana', (select d from hoje))),
    -- Ponto rosa de novidade: o app compara com quando ela abriu o grupo pela última vez.
    'ultimo_checkin_outra', (select max(c.capturado_em) from public.checkins_visiveis(p_uid, p_grupo) c
                              where c.user_id <> p_uid)) end
  from public.grupos g where g.id = p_grupo and g.apagado_em is null;
$$;

revoke all on function public.grupo_detalhe(uuid, uuid) from public, anon, authenticated;
grant execute on function public.grupo_detalhe(uuid, uuid) to service_role;

-- Check-in com título e descrição (troca a assinatura: a antiga sai).
drop function if exists public.publicar_checkin(uuid, text, text, uuid[], timestamptz);
create or replace function public.publicar_checkin(p_uid uuid, p_foto_path text, p_rotina text, p_grupos uuid[], p_hora_exibida timestamptz,
                                                   p_titulo text default null, p_descricao text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  agora timestamptz := now();
  d date := public.dia_sessao(agora);
  hx timestamptz := coalesce(p_hora_exibida, agora);
  validos uuid[];
  c uuid;
  carta uuid;
begin
  if p_rotina not in ('am', 'pm') then
    return jsonb_build_object('ok', false, 'motivo', 'rotina');
  end if;
  if p_foto_path is null or split_part(p_foto_path, '/', 1) <> p_uid::text or p_foto_path !~ '\.jpg$' then
    return jsonb_build_object('ok', false, 'motivo', 'foto');
  end if;
  select coalesce(array_agg(distinct g), '{}') into validos
    from unnest(coalesce(p_grupos, '{}')) g where public.grupo_integrante(g, p_uid);
  if cardinality(validos) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'grupos');
  end if;
  if hx > agora or public.dia_sessao(hx) <> d then
    hx := agora;
  end if;
  insert into public.checkins (user_id, foto_path, rotina, capturado_em, hora_exibida, dia, titulo, descricao)
  values (p_uid, p_foto_path, p_rotina, agora, hx, d,
          left(nullif(btrim(coalesce(p_titulo, '')), ''), 60), left(nullif(btrim(coalesce(p_descricao, '')), ''), 280))
  on conflict (user_id, dia, rotina) do nothing
  returning id into c;
  if c is null then
    return jsonb_build_object('ok', false, 'motivo', 'ja_fez');
  end if;
  insert into public.checkin_grupos (checkin_id, grupo_id) select c, g from unnest(validos) g;

  begin
    carta := public.dar_carta_acao(p_uid, 'checkin_grupo', d);
  exception when others then
    raise warning 'publicar_checkin: carta falhou (check-in % salvo mesmo assim): %', c, sqlerrm;
    carta := null;
  end;
  return jsonb_build_object('ok', true, 'checkin_id', c, 'dia', d, 'grupos', to_jsonb(validos), 'carta_id', carta);
end;
$$;

create or replace function public.mural_grupo(p_uid uuid, p_grupo uuid, p_antes timestamptz default null, p_limite integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.grupo_integrante(p_grupo, p_uid) then null else
    coalesce(jsonb_agg(jsonb_build_object(
      'checkin_id', c.id, 'user_id', c.user_id, 'rotina', c.rotina, 'dia', c.dia,
      -- Sem título, o do design: "Rotina da manhã" / "Rotina da noite".
      'titulo', coalesce(c.titulo, case c.rotina when 'am' then 'Rotina da manhã' else 'Rotina da noite' end),
      'descricao', c.descricao,
      'hora_exibida', c.hora_exibida, 'foto_path', c.foto_path, 'voce', c.user_id = p_uid,
      'autora', public.perfil_curto(c.user_id)) order by c.hora_exibida desc), '[]'::jsonb) end
  from (select * from public.checkins_visiveis(p_uid, p_grupo) v
         where p_antes is null or v.hora_exibida < p_antes
         order by v.hora_exibida desc limit least(greatest(coalesce(p_limite, 30), 1), 100)) c;
$$;

revoke all on function public.publicar_checkin(uuid, text, text, uuid[], timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.mural_grupo(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.publicar_checkin(uuid, text, text, uuid[], timestamptz, text, text) to service_role;
grant execute on function public.mural_grupo(uuid, uuid, timestamptz, integer) to service_role;
