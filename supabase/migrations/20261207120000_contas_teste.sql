-- ─────────────────────────────────────────────────────────────────────────────
-- CONTAS DE TESTE (20261207, build 1.62 (2), pedido do produto): contas da lista
-- `contas_teste` fazem tudo a qualquer hora e quantas vezes quiserem. Nada muda para as outras.
--  • Lista: `contas_teste (user_id, email, nota)`. Colocar/tirar = insert/delete (sem build).
--    `eh_conta_teste(conta)` é o que todas as regras consultam.
--  • "Uma vez por dia" do banco: para a conta de teste, repetir APAGA antes o registro de hoje
--    daquela mesma ação (só dela, só do dia) — conta como a primeira de novo:
--      - skincare (`concluir_rotina_v2`): a rotina do período e os pontos do skincare/rotina de
--        hoje; e o 1º do dia vale de novo (pontos + sorteio de poder). Não apaga quando é o
--        check-in que conclui a rotina (`publicar_checkin` liga `niks.sem_zerar`).
--      - pontos sem carta (`v2_pontos_acao`): sem a janela de dias (scan de rosto: 7) e com o
--        lançamento de hoje daquela ação apagado antes.
--      - carta do dia / de poder: a de hoje perde a marca `acao='dia'` (continua no álbum) e a
--        nova sai. Não apaga carta (poderes_usuario tem cascade).
--      O total de pontos (`pontos_usuario.total`) não cai: os pontos acumulam.
--  • Check-in: coluna `checkins.repeticao` (0 para todo mundo; 1, 2, 3… para a conta de teste
--    repetindo a mesma rotina no dia) e a regra única passa a ser (conta, dia, rotina, repetição).
--    Repetições (repeticao > 0) aparecem no mural mas NÃO contam no ranking (`ranking_grupo`,
--    `grupo_detalhe.checkins_semana`, `premiar_semana`).
--  • `estado_cartas_v2` devolve `conta_teste` (o app libera as travas dele com isso).
-- Backup das versões de produção: ~/Developer/niks-ai-backups/2026-11-12_conta_teste/.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.contas_teste (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nota text,
  criada_em timestamptz not null default now()
);
alter table public.contas_teste enable row level security;
revoke all on public.contas_teste from anon, authenticated;

create or replace function public.eh_conta_teste(p_uid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p_uid is not null and exists (select 1 from public.contas_teste t where t.user_id = p_uid);
$function$;
revoke all on function public.eh_conta_teste(uuid) from public, anon, authenticated;

-- Check-in: repetição (0 = normal).
alter table public.checkins add column if not exists repeticao integer not null default 0;
alter table public.checkins drop constraint if exists checkins_user_id_dia_rotina_key;
alter table public.checkins drop constraint if exists checkins_user_id_dia_rotina_repeticao_key;
alter table public.checkins add constraint checkins_user_id_dia_rotina_repeticao_key unique (user_id, dia, rotina, repeticao);

CREATE OR REPLACE FUNCTION public.checkins_visiveis(p_uid uuid, p_grupo uuid)
 RETURNS SETOF checkins
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.* from public.checkins c
    join public.checkin_grupos cg on cg.checkin_id = c.id and cg.grupo_id = p_grupo
    join public.grupo_membros m on m.grupo_id = p_grupo and m.user_id = c.user_id and m.saiu_em is null
   where c.removido_em is null
     and public.grupo_integrante(p_grupo, p_uid)
     and not exists (select 1 from public.bloqueios b where b.user_id = p_uid and b.bloqueada_id = c.user_id);
$function$;

CREATE OR REPLACE FUNCTION public.ranking_grupo(p_uid uuid, p_grupo uuid, p_periodo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (select public.periodo_ranking(p_periodo, public.dia_sessao(now())) r),
  m as (
    select gm.user_id,
           (select count(*) from public.checkins_visiveis(p_uid, p_grupo) c, per where c.user_id = gm.user_id and c.dia <@ per.r and c.repeticao = 0) n,
           (select count(*) from public.semanas_vencidas s where s.grupo_id = p_grupo and s.user_id = gm.user_id) semanas
      from public.grupo_membros gm
     where gm.grupo_id = p_grupo and gm.saiu_em is null
       and (gm.user_id = p_uid or not exists (select 1 from public.bloqueios b where b.user_id = p_uid and b.bloqueada_id = gm.user_id))
  )
  select case when not public.grupo_integrante(p_grupo, p_uid) then null else
    coalesce(jsonb_agg(jsonb_build_object(
      'posicao', posicao, 'checkins', n, 'semanas_vencidas', semanas, 'voce', user_id = p_uid)
      || public.perfil_curto(user_id) order by posicao, nome), '[]'::jsonb) end
  from (select m.*, dense_rank() over (order by n desc) posicao, public.perfil_curto(m.user_id) ->> 'nome' nome from m) x;
$function$;

CREATE OR REPLACE FUNCTION public.grupo_detalhe(p_uid uuid, p_grupo uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                         where c.repeticao = 0 and c.dia <@ public.periodo_ranking('semana', (select d from hoje))),
    -- Ponto rosa de novidade: o app compara com quando ela abriu o grupo pela última vez.
    'ultimo_checkin_outra', (select max(c.capturado_em) from public.checkins_visiveis(p_uid, p_grupo) c
                              where c.user_id <> p_uid)) end
  from public.grupos g where g.id = p_grupo and g.apagado_em is null;
$function$;

CREATE OR REPLACE FUNCTION public.premiar_semana(p_hoje date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       where c.removido_em is null and c.repeticao = 0 and c.dia >= v_semana and c.dia < v_fim
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
$function$;

CREATE OR REPLACE FUNCTION public.publicar_checkin(p_uid uuid, p_foto_path text, p_rotina text, p_grupos uuid[], p_hora_exibida timestamp with time zone, p_titulo text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_estatisticas jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rep integer := 0;
  agora timestamptz := now();
  d date := public.dia_sessao(agora);
  hx timestamptz := coalesce(p_hora_exibida, agora);
  validos uuid[];
  c uuid;
  carta uuid;
  rot jsonb;
  pc jsonb;
  esp jsonb;
  est jsonb;
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
  -- Estatísticas do skincare (20261205): limpas e com as fotos resolvidas aqui; sem descrição
  -- dela, o texto das estatísticas vai na `descricao` (para quem ainda está na 1.61).
  est := public.checkin_estatisticas_limpas(p_uid, p_rotina, p_estatisticas);
  -- Conta de teste (20261207): repetir a mesma rotina no dia vira a próxima repetição.
  if public.eh_conta_teste(p_uid) then
    select coalesce(max(repeticao) + 1, 0) into v_rep from public.checkins where user_id = p_uid and dia = d and rotina = p_rotina;
  end if;
  insert into public.checkins (user_id, foto_path, rotina, capturado_em, hora_exibida, dia, titulo, descricao, estatisticas, repeticao)
  values (p_uid, p_foto_path, p_rotina, agora, hx, d,
          left(nullif(btrim(coalesce(p_titulo, '')), ''), 60),
          coalesce(left(nullif(btrim(coalesce(p_descricao, '')), ''), 280), left(public.checkin_estatisticas_texto(p_rotina, est), 280)),
          est, v_rep)
  on conflict (user_id, dia, rotina, repeticao) do nothing
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
        -- O check-in não zera o skincare de hoje da conta de teste (só o skincare zera).
        perform set_config('niks.sem_zerar', '1', true);
        rot := public.concluir_rotina_v2(p_uid, p_rotina, agora, agora);
        perform set_config('niks.sem_zerar', '', true);
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
$function$;

CREATE OR REPLACE FUNCTION public.concluir_rotina_v2(p_uid uuid, p_periodo text, p_quando timestamp with time zone DEFAULT now(), p_agora timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_teste boolean := false;
  seq jsonb;
  d date;
  hoje date := public.dia_sessao(p_agora);
  carta uuid;
  pts jsonb;
begin
  -- Conta de teste (20261207): o skincare de hoje daquele período é apagado antes — conta
  -- como o 1º de novo (rotina, pontos do skincare e da rotina). O check-in não zera.
  v_teste := public.eh_conta_teste(p_uid);
  if v_teste and coalesce(current_setting('niks.sem_zerar', true), '') <> '1' then
    delete from public.rotinas_concluidas where user_id = p_uid and dia = public.dia_sessao(p_quando) and periodo = p_periodo;
    delete from public.pontos_eventos where user_id = p_uid and dia = public.dia_sessao(p_quando)
       and acao in ('skincare_dia', 'rotina:' || p_periodo);
  end if;
  seq := public.registrar_rotina(p_uid, p_periodo, p_quando);
  if not coalesce((seq ->> 'nova')::boolean, false) then
    return jsonb_build_object('sequencia', seq, 'carta', null, 'pontos', null);
  end if;
  if not public.v2_ativo(p_uid) then
    return jsonb_build_object('sequencia', seq, 'carta', null, 'pontos', null);
  end if;
  d := (seq ->> 'dia')::date;
  -- Pontos diretos (20261204): 1º skincare de hoje = NIKS Points na hora (+ carta de poder,
  -- se o sorteio der); o resto (2º skincare, dia anterior) = 15–30, como antes.
  if public.v2_modo_pontos(p_uid) then
    if d = hoje and (coalesce((seq ->> 'primeira_do_dia')::boolean, false) or v_teste) then
      pts := public.v2_pontos_skincare_dia(p_uid, d, seq);
      carta := public.v2_dar_poder_dia(p_uid, d, seq);
    end if;
    if pts is null then
      pts := public.v2_pontos_acao(p_uid, 'rotina:' || p_periodo, d);
    end if;
    return jsonb_build_object('sequencia', seq, 'carta', carta, 'pontos', pts);
  end if;
  if d = hoje then
    carta := public.v2_dar_carta_dia(p_uid, d, seq);
  end if;
  if carta is null then
    pts := public.v2_pontos_acao(p_uid, 'rotina:' || p_periodo, d);
  end if;
  return jsonb_build_object('sequencia', seq, 'carta', carta, 'pontos', pts);
end;
$function$;

CREATE OR REPLACE FUNCTION public.v2_pontos_acao(p_uid uuid, p_acao text, p_dia date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cfg public.cartas_config%rowtype;
  chave text;
  acfg jsonb;
  mn integer;
  mx integer;
  base integer;
  v_dobro boolean;
  pts integer;
  novo uuid;
begin
  if p_acao not in ('rotina:am', 'rotina:pm', 'checkin_grupo', 'scan_rosto', 'produto_grupo') then
    raise exception 'ação inválida';
  end if;
  if not public.v2_ativo(p_uid) then
    return null;
  end if;
  select * into cfg from public.cartas_config where id = 1;
  chave := case when p_acao like 'rotina:%' then 'rotina' else p_acao end;
  acfg := cfg.regras_v2 #> array['sem_carta', chave];
  if acfg is null or not coalesce((acfg ->> 'ativa')::boolean, true) then
    return null;
  end if;

  -- 1 por dia (índice único) — e, na troca de regras no meio do dia, a carta antiga da
  -- mesma ação também conta. Scan: 1 a cada `janela_dias`.
  -- Conta de teste (20261207): sem janela de dias e com o lançamento de hoje apagado antes.
  if public.eh_conta_teste(p_uid) then
    delete from public.pontos_eventos where user_id = p_uid and dia = p_dia and acao = p_acao;
  elsif chave <> 'rotina' and exists (select 1 from public.cartas_usuario
                                     where user_id = p_uid and origem = chave
                                       and dia > p_dia - coalesce((acfg ->> 'janela_dias')::int, 1)) then
    return null;
  end if;
  if not public.eh_conta_teste(p_uid) and acfg ? 'janela_dias' and exists (select 1 from public.pontos_eventos
                                        where user_id = p_uid and acao = p_acao
                                          and dia > p_dia - (acfg ->> 'janela_dias')::int) then
    return null;
  end if;

  mn := coalesce((acfg ->> 'min')::int, 10);
  mx := greatest(coalesce((acfg ->> 'max')::int, mn), mn);
  base := mn + floor(random() * (mx - mn + 1))::int;
  v_dobro := public.v2_dobro_ativo(p_uid, p_dia);
  pts := base * case when v_dobro then coalesce((cfg.regras_v2 ->> 'mult_dobro')::int, 2) else 1 end;

  insert into public.pontos_eventos (user_id, dia, acao, pontos, base, dobro, decisao)
  values (p_uid, p_dia, p_acao, pts, base, v_dobro, jsonb_build_object('faixa', jsonb_build_array(mn, mx)))
  on conflict (user_id, dia, acao) do nothing
  returning id into novo;
  if novo is null then
    return null;
  end if;
  return jsonb_build_object('acao', p_acao, 'pontos', pts, 'base', base, 'dobro', v_dobro) || public.v2_somar(p_uid, pts);
end;
$function$;

CREATE OR REPLACE FUNCTION public.v2_dar_poder_dia(p_uid uuid, p_dia date, p_seq jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  esc jsonb;
  novo uuid;
begin
  -- Conta de teste (20261207): a carta de hoje perde a marca do dia (fica no álbum) e sai outra.
  if public.eh_conta_teste(p_uid) then
    update public.cartas_usuario set acao = null where user_id = p_uid and dia = p_dia and acao = 'dia';
  elsif exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_dia and acao is distinct from 'legado'
                and acao is distinct from 'missoes') then
    return null;
  end if;
  esc := public.v2_escolher_poder(p_uid, p_dia, p_seq);
  if esc is null then
    return null;
  end if;
  novo := public.dar_carta(p_uid, esc ->> 'origem', p_dia, false, 'poder', esc ->> 'subtipo', null, 'dia');
  if novo is null then
    return null;   -- poder fora do catálogo: no modo pontos não há carta "vazia" no lugar
  end if;
  update public.cartas_usuario
     set motivo = esc ->> 'motivo',
         decisao = jsonb_build_object('regras', 2, 'modo', 'pontos', 'escolha', esc, 'sequencia', p_seq -> 'atual')
                   || case when esc ? 'semana1' then jsonb_build_object('semana1', esc -> 'semana1') else '{}'::jsonb end
   where id = novo;
  return novo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.v2_dar_carta_dia(p_uid uuid, p_dia date, p_seq jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  esc jsonb;
  novo uuid;
  v_motivo text;
begin
  -- Conta de teste (20261207): a carta de hoje perde a marca do dia (fica no álbum) e sai outra.
  if public.eh_conta_teste(p_uid) then
    update public.cartas_usuario set acao = null where user_id = p_uid and dia = p_dia and acao = 'dia';
  elsif exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_dia and acao is distinct from 'legado'
                and acao is distinct from 'missoes') then
    return null;
  end if;
  esc := public.v2_escolher(p_uid, p_dia, p_seq);
  v_motivo := esc ->> 'motivo';
  novo := public.dar_carta(p_uid, esc ->> 'origem', p_dia, (esc ->> 'rara')::boolean, esc ->> 'familia',
                           esc ->> 'subtipo', esc -> 'conteudo', 'dia');
  -- Poder fora do catálogo (corrida): Comum.
  if novo is null and esc ->> 'familia' = 'poder'
     and not exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_dia and acao = 'dia') then
    novo := public.dar_carta(p_uid, 'rotina', p_dia, false, 'colecionavel', null, null, 'dia');
    v_motivo := v_motivo || ':catalogo→comum';
  end if;
  if novo is null then
    return null;
  end if;

  update public.cartas_usuario
     set motivo = v_motivo,
         decisao = jsonb_build_object('regras', 2, 'escolha', esc, 'sequencia', p_seq -> 'atual')
                   || case when esc ? 'semana1' then jsonb_build_object('semana1', esc -> 'semana1') else '{}'::jsonb end
   where id = novo;
  if esc ? 'campea' then
    update public.semanas_vencidas
       set rara_pendente = false, carta_id = novo
     where user_id = p_uid and grupo_id = (esc #>> '{campea,grupo_id}')::uuid
       and semana = (esc #>> '{campea,semana}')::date;
  end if;
  return novo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.estado_cartas_v2(p_uid uuid, p_agora timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hoje date := public.dia_sessao(p_agora);
  cfg public.cartas_config%rowtype;
  r jsonb;
  s public.sequencias%rowtype;
  pu public.pontos_usuario%rowtype;
  nv jsonb;
  volta uuid;
  cartaq record;
  v_rotina_hoje boolean;
  v_estado text;
  anterior date;
  dia_volta date;
  volta_ok boolean;
  dobro_dias jsonb;
begin
  perform public.avaliar_sequencia(p_uid, hoje);
  volta := public.v2_carta_volta(p_uid, hoje);

  select * into cfg from public.cartas_config where id = 1;
  r := cfg.regras_v2;
  select * into s from public.sequencias where user_id = p_uid;
  insert into public.pontos_usuario (user_id) values (p_uid) on conflict do nothing;
  select * into pu from public.pontos_usuario where user_id = p_uid;
  nv := public.nivel_de(pu.total);
  v_rotina_hoje := exists (select 1 from public.rotinas_concluidas where user_id = p_uid and dia = hoje);

  -- A carta de hoje: a não raspada primeiro (na troca de regras no meio do dia pode haver mais).
  select cu.id, cu.origem, cu.raspada_em, cu.motivo, c.familia, c.subtipo, c.raridade into cartaq
    from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
   where cu.user_id = p_uid and cu.dia = hoje and cu.acao is distinct from 'legado' and cu.acao is distinct from 'missoes'
   order by (cu.raspada_em is null) desc, cu.ganha_em
   limit 1;
  v_estado := case when cartaq.id is not null and cartaq.raspada_em is null then 'pronta'
                   when cartaq.id is not null or v_rotina_hoje then 'feita'
                   else 'bloqueada' end;

  select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into dobro_dias
    from public.poderes_usuario pu2, jsonb_array_elements_text(pu2.dados -> 'dias') x
   where pu2.user_id = p_uid and pu2.tipo in ('pontos_dobro', 'xp_grupo_dobro') and x::date >= hoje;

  -- Próxima Carta de volta (o app agenda o aviso "carta misteriosa" com isso).
  select max(dia) into anterior from public.rotinas_concluidas where user_id = p_uid;
  if anterior is not null then
    dia_volta := anterior + coalesce((r #>> '{volta,dias_sem_rotina}')::int, 2) + 1;
    volta_ok := coalesce((r #>> '{volta,ativa}')::boolean, true)
      and public.v2_ativo(p_uid)
      and exists (select 1 from public.cartas_catalogo c where c.ativa and (not c.apenas_teste or p_uid = any(cfg.testers))
                   and c.familia = 'poder' and c.subtipo = 'pontos_dobro')
      and not exists (select 1 from public.cartas_usuario
                       where user_id = p_uid and raspada_em is not null
                         and (acao = 'volta:' || anterior or (origem = 'volta' and decisao ->> 'anterior' = anterior::text)));
  end if;

  return jsonb_build_object(
    'regras', 2,
    'hoje', hoje,
    'sequencia', jsonb_build_object('atual', coalesce(s.atual, 0), 'recorde', coalesce(s.recorde, 0), 'ultimo_dia', s.ultimo_dia),
    'rotina_hoje', v_rotina_hoje,
    'carta_hoje', jsonb_build_object(
      'estado', v_estado,
      'id', cartaq.id,
      'origem', cartaq.origem,
      'tipo', case when cartaq.id is null then null
                   when cartaq.familia = 'poder' then 'poder:' || cartaq.subtipo
                   when cartaq.raridade = 'rara' then 'rara' else 'comum' end),
    'a_raspar', case when v_estado = 'pronta'
                     then jsonb_build_array(jsonb_build_object('id', cartaq.id, 'origem', cartaq.origem, 'motivo', cartaq.motivo,
                            'tipo', case when cartaq.familia = 'poder' then 'poder:' || cartaq.subtipo
                                         when cartaq.raridade = 'rara' then 'rara' else 'comum' end))
                     else '[]'::jsonb end,
    'poderes', jsonb_build_object(
      'protecao', public.v2_protecoes_guardadas(p_uid),
      'pontos_dobro_dias', dobro_dias,
      'pontos_dobro_ate', (select max(x::date) from jsonb_array_elements_text(dobro_dias) x)),
    'pontos', jsonb_build_object(
      'total', pu.total,
      'nivel', (nv ->> 'nivel')::int,
      'titulo', nv ->> 'titulo',
      'piso', (nv ->> 'piso')::int,
      'teto', (nv ->> 'teto')::int,
      'titulo_proximo', nv ->> 'titulo_proximo',
      'nivel_visto', pu.nivel_visto,
      'celebrar', (nv ->> 'nivel')::int > pu.nivel_visto,
      'retro', pu.retro_em is not null and not pu.retro_visto,
      'retro_pontos', pu.retro_pontos),
    'niveis', (
      select jsonb_agg(jsonb_build_object('n', o, 'titulo', t.titulo, 'pontos', (cfg.pontos -> 'niveis' ->> (o - 1)::int)::int) order by o)
        from jsonb_array_elements_text(cfg.pontos -> 'titulos') with ordinality t(titulo, o)),
    'icone', jsonb_build_object('passo', coalesce((cfg.pontos ->> 'icone_passo')::int, 945),
                                'incremento', coalesce((cfg.pontos ->> 'icone_incremento')::int, 45)),
    -- Faixas para "Como ganhar NIKS Points": a carta e os pontos sem carta.
    'faixas', jsonb_build_object('carta', jsonb_build_object('min', (r #>> '{comum,min}')::int, 'max', (r #>> '{comum,max}')::int),
                                 'skincare_dia', jsonb_build_object('min', (r #>> '{comum,min}')::int, 'max', (r #>> '{comum,max}')::int))
              || coalesce((select jsonb_object_agg(a.key, jsonb_build_object('min', (a.value ->> 'min')::int, 'max', (a.value ->> 'max')::int))
                             from jsonb_each(r -> 'sem_carta') a where coalesce((a.value ->> 'ativa')::boolean, true)), '{}'::jsonb),
    'ativo', public.v2_ativo(p_uid),
    -- Pontos diretos (20261204): o modo e os pontos de hoje (card "NIKS Points do dia").
    'modo_pontos', public.v2_modo_pontos(p_uid),
    'pontos_hoje', (select coalesce(sum(pe.pontos), 0) from public.pontos_eventos pe where pe.user_id = p_uid and pe.dia = hoje),
    'skincare_hoje', (select pe.pontos from public.pontos_eventos pe where pe.user_id = p_uid and pe.dia = hoje and pe.acao = 'skincare_dia'),
    -- Conta de teste (20261207): o app libera as travas dele.
    'conta_teste', public.eh_conta_teste(p_uid),
    'carta_volta', volta,
    'proxima_volta', case when anterior is null then null
                          else jsonb_build_object('dia', dia_volta, 'ultimo_dia', anterior, 'ok', volta_ok) end
  );
end;
$function$;


revoke all on function public.publicar_checkin(uuid, text, text, uuid[], timestamptz, text, text, jsonb) from public, anon, authenticated;
