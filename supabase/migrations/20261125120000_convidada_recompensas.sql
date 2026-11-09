-- Parte B (convidada) · Fase 6 — RECOMPENSAS E AVISOS
--
--   • Cartas especiais no 1º, 3º, 5º e 7º check-in e depois a cada 2, alternando idade da
--     pele, produto e rotina. Dois check-ins no mesmo dia contam como dois.
--   • A especial substitui a carta do dia e rende os mesmos pontos ao ser raspada.
--   • Convidada pode ganhar a carta de campeã da semana.
--   • Grupos com 15 ou mais integrantes: um resumo às 22h de Brasília, no lugar do aviso por check-in.
--
-- As 3 cartas ficam com `ativa = false`, então o sorteio nunca as escolhe para assinantes.

alter table public.cartas_usuario drop constraint if exists cartas_usuario_origem;
alter table public.cartas_usuario add constraint cartas_usuario_origem check (origem in (
  'rotina', 'sos', 'surpresa', 'grupo', 'marco', 'volta', 'scan_rosto', 'checkin_grupo', 'produto_grupo', 'campea', 'missoes', 'convidada'
));

insert into public.cartas_catalogo (codigo, familia, subtipo, nome, ativa) values
  ('convidada-idade', 'conhecimento', 'pessoal', 'Idade da pele', false),
  ('convidada-produto', 'conhecimento', 'pessoal', 'Produto para sua pele', false),
  ('convidada-rotina', 'conhecimento', 'pessoal', 'Sua rotina', false)
on conflict (codigo) do update set ativa = false;

-- `null` = este check-in não tem carta especial e segue o caminho normal.
create or replace function public.convidada_carta_do_checkin(p_uid uuid, p_rotina text, p_dia date, p_agora timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  tipo text;
  seq jsonb;
  novo uuid;
  u public.users%rowtype;
  v_acao text;
begin
  if public.estado_acesso(p_uid) <> 'convidada' or not public.v2_ativo(p_uid) then
    return null;
  end if;
  select count(*) into n from public.checkins where user_id = p_uid and removido_em is null;
  if n % 2 = 0 then
    return null;
  end if;
  tipo := (array['idade', 'produto', 'rotina'])[((n - 1) / 2) % 3 + 1];
  select * into u from public.users where id = p_uid;
  seq := public.registrar_rotina(p_uid, p_rotina, p_agora);
  -- Primeira carta do dia: ocupa o lugar da carta do dia.
  v_acao := case when exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_dia and acao = 'dia')
                 then 'convidada:' || n else 'dia' end;
  insert into public.cartas_usuario (user_id, carta_id, origem, dia, acao, conteudo)
  select p_uid, c.id, 'convidada', p_dia, v_acao,
         jsonb_build_object('tipo', tipo, 'numero', n, 'idade', u.idade_pele_onboarding, 'preocupacoes', to_jsonb(u.concerns))
    from public.cartas_catalogo c where c.codigo = 'convidada-' || tipo
  on conflict do nothing
  returning id into novo;
  return jsonb_build_object('sequencia', seq, 'carta', novo, 'pontos', null);
end;
$$;

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
  rot jsonb;
  pc jsonb;
  esp jsonb;
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

  if public.cartas_v2(p_uid) then
    begin
      esp := public.convidada_carta_do_checkin(p_uid, p_rotina, d, agora);
      if esp is not null then
        rot := esp;
      else
        rot := public.concluir_rotina_v2(p_uid, p_rotina, agora, agora);
      end if;
      carta := (rot ->> 'carta')::uuid;
      pc := public.v2_pontos_acao(p_uid, 'checkin_grupo', d);
    exception when others then
      raise warning 'publicar_checkin: skincare/pontos falharam (check-in % salvo mesmo assim): %', c, sqlerrm;
    end;
    return jsonb_build_object('ok', true, 'checkin_id', c, 'dia', d, 'grupos', to_jsonb(validos), 'carta_id', carta,
                              'sequencia', rot -> 'sequencia',
                              'pontos', coalesce((select jsonb_agg(x) from (values (rot -> 'pontos'), (pc)) v(x)
                                                   where x is not null and x <> 'null'::jsonb), '[]'::jsonb));
  end if;

  begin
    carta := public.dar_carta_acao(p_uid, 'checkin_grupo', d);
  exception when others then
    raise warning 'publicar_checkin: carta falhou (check-in % salvo mesmo assim): %', c, sqlerrm;
    carta := null;
  end;
  return jsonb_build_object('ok', true, 'checkin_id', c, 'dia', d, 'grupos', to_jsonb(validos), 'carta_id', carta);
end;
$$;

create or replace function public.premiar_semana(p_hoje date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := coalesce(p_hoje, public.dia_sessao(now()));
  v_semana date := (date_trunc('week', hoje) - interval '7 days')::date;
  v_fim date := (date_trunc('week', hoje))::date;
  r record;
  carta uuid;
  pendente boolean;
  campeas integer := 0;
  cartas integer := 0;
begin
  for r in
    with contagem as (
      select cg.grupo_id, c.user_id, count(*)::int n
        from public.checkins c
        join public.checkin_grupos cg on cg.checkin_id = c.id
        join public.grupos g on g.id = cg.grupo_id and g.apagado_em is null
        join public.grupo_membros m on m.grupo_id = cg.grupo_id and m.user_id = c.user_id and m.saiu_em is null
       where c.removido_em is null and c.dia >= v_semana and c.dia < v_fim
       group by cg.grupo_id, c.user_id
    ),
    topo as (select grupo_id, max(n) n from contagem group by grupo_id)
    select ct.grupo_id, ct.user_id, ct.n, g.nome, m.tipo
      from contagem ct
      join topo t on t.grupo_id = ct.grupo_id and t.n = ct.n
      join public.grupos g on g.id = ct.grupo_id
      join public.grupo_membros m on m.grupo_id = ct.grupo_id and m.user_id = ct.user_id
     where ct.n >= 1
       and not exists (select 1 from public.semanas_vencidas s
                        where s.grupo_id = ct.grupo_id and s.semana = v_semana and s.user_id = ct.user_id)
  loop
    carta := null;
    pendente := false;
    -- Convidada também pode ser campeã da semana (Parte B, Fase 6).
    if true then
      if public.cartas_v2(r.user_id) then
        pendente := true;
      else
        begin
          carta := public.dar_carta(r.user_id, 'campea', hoje, true, 'colecionavel', null,
                                    jsonb_build_object('grupo_id', r.grupo_id, 'grupo', r.nome, 'semana', v_semana, 'checkins', r.n),
                                    'campea:' || r.grupo_id || ':' || v_semana);
          if carta is not null then
            update public.cartas_usuario
               set motivo = 'campea:rara',
                   decisao = jsonb_build_object('grupo_id', r.grupo_id, 'semana', v_semana, 'checkins', r.n)
             where id = carta;
            cartas := cartas + 1;
          end if;
        exception when others then
          raise warning 'premiar_semana: carta falhou (grupo %, %): %', r.grupo_id, r.user_id, sqlerrm;
        end;
      end if;
    end if;
    insert into public.semanas_vencidas (grupo_id, semana, user_id, checkins, carta_id, rara_pendente)
    values (r.grupo_id, v_semana, r.user_id, r.n, carta, pendente)
    on conflict do nothing;
    campeas := campeas + 1;
  end loop;
  return jsonb_build_object('semana', v_semana, 'campeas', campeas, 'cartas', cartas);
end;
$$;

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
       -- Grupos com 15 ou mais integrantes recebem só o resumo das 22h.
       and (select count(*) from public.grupo_membros x where x.grupo_id = g.id and x.saiu_em is null) < 15
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

create or replace function public.enviar_resumo_grupos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := public.dia_sessao(now());
  msgs jsonb;
  total integer := 0;
  lote jsonb;
  i integer := 0;
begin
  with grandes as (
    select g.id, g.nome from public.grupos g
     where g.apagado_em is null
       and (select count(*) from public.grupo_membros m where m.grupo_id = g.id and m.saiu_em is null) >= 15
  ), alvo as (
    select m.user_id, u.push_token, g.id grupo_id, g.nome,
           (select count(distinct c.user_id) from public.checkins c
              join public.checkin_grupos cg on cg.checkin_id = c.id and cg.grupo_id = g.id
             where c.dia = d and c.removido_em is null and c.user_id <> m.user_id) n
      from grandes g
      join public.grupo_membros m on m.grupo_id = g.id and m.saiu_em is null
      join public.users u on u.id = m.user_id
     where u.push_token is not null and u.push_token <> '' and u.push_token <> 'simulator-token'
  ), marcadas as (
    insert into public.avisos_enviados (user_id, tipo, chave)
    select a.user_id, 'resumo_grupo', a.grupo_id::text || ':' || d::text from alvo a where a.n > 0
    on conflict do nothing
    returning avisos_enviados.user_id, avisos_enviados.chave
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'to', a.push_token, 'title', a.nome, 'sound', 'default',
           'body', a.n || case when a.n = 1 then ' amiga fez check-in hoje' else ' amigas fizeram check-in hoje' end,
           'data', jsonb_build_object('type', 'grupo_checkin', 'grupo_id', a.grupo_id))), '[]'::jsonb)
    into msgs
    from alvo a join marcadas k on k.user_id = a.user_id and k.chave = a.grupo_id::text || ':' || d::text;
  total := jsonb_array_length(msgs);
  while i < total loop
    select jsonb_agg(x) into lote from (select x from jsonb_array_elements(msgs) with ordinality e(x, n) where n > i and n <= i + 100) t;
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := lote,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
    i := i + 100;
  end loop;
  return total;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'convidada_carta_do_checkin(uuid,text,date,timestamptz)', 'publicar_checkin(uuid,text,text,uuid[],timestamptz,text,text)',
    'premiar_semana(date)', 'destinatarias_checkin(uuid)', 'enviar_resumo_grupos()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

-- 22h de Brasília = 01h UTC.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'grupos-resumo-diario';
    perform cron.schedule('grupos-resumo-diario', '0 1 * * *', 'select public.enviar_resumo_grupos()');
  end if;
end $$;
