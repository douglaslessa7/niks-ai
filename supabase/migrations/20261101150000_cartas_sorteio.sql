-- ─────────────────────────────────────────────────────────────────────────────
-- Sistema de cartas (F3): sorteio, raspar e poderes — tudo NO SERVIDOR.
--
-- dar_carta()        sorteia (família por peso da origem → raridade → carta) e grava.
-- concluir_rotina()  registra a rotina (F2) + carta(s) do dia (cota) + rara de marco.
-- raspar_carta()     marca como raspada e, se for Poder, aplica NA HORA.
-- estado_cartas()    o que o app precisa: sequência, cartas a raspar, poderes armados.
-- Gatilho em skin_scans: consome o "Scan antecipado".
--
-- Chances e cotas vêm de cartas_config (mudam sem deploy). Só o service role executa.
-- ─────────────────────────────────────────────────────────────────────────────

-- Sorteia e grava uma carta. Devolve o id em cartas_usuario (ou nulo se o catálogo
-- não tiver nada para dar).
--   p_familia/p_subtipo: força a família (ex.: 'conhecimento'/'pessoal' no SOS).
--   p_rara: força rara (marcos).
create or replace function public.dar_carta(
  p_uid uuid, p_origem text, p_dia date,
  p_rara boolean default null, p_familia text default null, p_subtipo text default null,
  p_conteudo jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.cartas_config%rowtype;
  tester boolean;
  pesos jsonb;
  total numeric := 0;
  sorteio numeric;
  k text;
  fam text := p_familia;
  sub text := p_subtipo;
  rara boolean := p_rara;
  ordem text[];
  carta uuid;
  novo uuid;
  f text;
begin
  select * into cfg from public.cartas_config where id = 1;
  tester := p_uid = any(cfg.testers);

  -- 1. Família pelo peso da origem.
  if fam is null then
    pesos := cfg.pesos -> p_origem;
    if pesos is null then pesos := cfg.pesos -> 'rotina'; end if;
    select coalesce(sum(value::numeric), 0) into total from jsonb_each_text(pesos);
    sorteio := random() * total;
    for k in select key from jsonb_each_text(pesos) order by key loop
      sorteio := sorteio - (pesos ->> k)::numeric;
      if sorteio < 0 then fam := k; exit; end if;
    end loop;
    if fam is null then fam := 'colecionavel'; end if;
    -- Na surpresa, 'momento' é Conhecimento do momento.
    if fam = 'momento' then fam := 'conhecimento'; sub := 'momento'; end if;
  end if;
  -- Conhecimento sorteado fora do SOS/surpresa = educativa (pessoal e momento têm origem própria).
  if fam = 'conhecimento' and sub is null then sub := 'educativa'; end if;

  -- 2. Raridade.
  if rara is null then
    rara := random() * 100 < (case when p_origem = 'grupo' then cfg.rara_grupo_pct else cfg.rara_pct end);
  end if;

  -- 3. Carta: a família sorteada; se não houver nada nela, as outras (colecionável primeiro).
  ordem := array[fam] || array_remove(array['colecionavel', 'conhecimento', 'poder'], fam);
  foreach f in array ordem loop
    select c.id into carta
      from public.cartas_catalogo c
     where c.ativa
       and (not c.apenas_teste or tester)
       and c.familia = f
       and (case
              when f = 'conhecimento' then c.subtipo = coalesce(case when f = fam then sub end, 'educativa')
              else true
            end)
     order by (c.raridade = case when rara then 'rara' else 'normal' end) desc, random()
     limit 1;
    exit when carta is not null;
    -- Família forçada (SOS, momento): não troca de família.
    exit when p_familia is not null or sub in ('pessoal', 'momento');
  end loop;

  if carta is null then
    return null;
  end if;

  insert into public.cartas_usuario (user_id, carta_id, origem, dia, conteudo)
  values (p_uid, carta, p_origem, p_dia, p_conteudo)
  returning id into novo;
  return novo;
end;
$$;

-- Poder "Carta extra" valendo no dia?
create or replace function public.tem_carta_extra(p_uid uuid, p_dia date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.poderes_usuario
     where user_id = p_uid and tipo = 'carta_extra' and (dados ->> 'dia')::date = p_dia
  )
$$;

-- Rotina concluída → sequência + carta(s) do dia + rara dos marcos ─────────────
-- Devolve: { sequencia: {...registrar_rotina}, cartas: [uuid…] }.
create or replace function public.concluir_rotina(p_uid uuid, p_periodo text, p_quando timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  seq jsonb;
  d date;
  cota integer;
  dadas integer;
  ids uuid[] := '{}';
  novo uuid;
  m jsonb;
begin
  seq := public.registrar_rotina(p_uid, p_periodo, p_quando);
  d := (seq ->> 'dia')::date;

  if (seq ->> 'nova')::boolean then
    -- Cota do dia: cartas_por_dia (+1 com "Carta extra"). A 1ª rotina leva a cota
    -- inteira; a 2ª só ganha se ainda sobrar (com cota 1, não sobra).
    select cartas_por_dia into cota from public.cartas_config where id = 1;
    if public.tem_carta_extra(p_uid, d) then cota := cota + 1; end if;
    select count(*) into dadas from public.cartas_usuario where user_id = p_uid and dia = d and origem = 'rotina';
    while dadas < cota loop
      novo := public.dar_carta(p_uid, 'rotina', d);
      exit when novo is null;
      ids := ids || novo;
      dadas := dadas + 1;
    end loop;

    -- Marcos (7, 14, 30): rara garantida.
    for m in select * from jsonb_array_elements(seq -> 'marcos_novos') loop
      novo := public.dar_carta(p_uid, 'marco', d, true, null, null, jsonb_build_object('marco', (m #>> '{}')::int));
      if novo is not null then ids := ids || novo; end if;
    end loop;
  end if;

  return jsonb_build_object('sequencia', seq, 'cartas', to_jsonb(ids));
end;
$$;

-- Raspar: marca a carta e aplica o Poder na hora ─────────────────────────────
-- Devolve { ok, poder?: { tipo, fim, dados } }.
create or replace function public.raspar_carta(p_uid uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cu public.cartas_usuario%rowtype;
  c public.cartas_catalogo%rowtype;
  hoje date := public.dia_sessao(now());
  dias integer;
  dados jsonb;
  fim timestamptz;
  p public.poderes_usuario%rowtype;
begin
  select * into cu from public.cartas_usuario where id = p_id and user_id = p_uid for update;
  if not found then
    raise exception 'carta não encontrada';
  end if;
  if cu.raspada_em is not null then
    return jsonb_build_object('ok', true, 'ja_raspada', true);
  end if;

  update public.cartas_usuario set raspada_em = now() where id = p_id;
  select * into c from public.cartas_catalogo where id = cu.carta_id;

  if c.familia <> 'poder' then
    return jsonb_build_object('ok', true);
  end if;

  dias := coalesce((c.efeito ->> 'dias')::int, 2);
  -- Fim de um dia de sessão = 04:00 do dia seguinte em Brasília.
  case c.subtipo
    when 'scan_antecipado', 'protecao_sequencia' then
      dados := '{}'::jsonb;                              -- armado até ser consumido
    when 'carta_extra' then
      dados := jsonb_build_object('dia', hoje + 1);
      fim := ((hoje + 2) + time '04:00') at time zone 'America/Sao_Paulo';
    when 'sequencia_dobro' then
      -- Os próximos N dias (o de hoje já foi contado na rotina que deu a carta).
      select jsonb_build_object('dias', jsonb_agg((hoje + g)::text)) into dados from generate_series(1, dias) g;
      fim := ((hoje + dias + 1) + time '04:00') at time zone 'America/Sao_Paulo';
    when 'xp_grupo_dobro' then
      select jsonb_build_object('dias', jsonb_agg((hoje + g)::text)) into dados from generate_series(0, dias - 1) g;
      fim := ((hoje + dias) + time '04:00') at time zone 'America/Sao_Paulo';
  end case;

  insert into public.poderes_usuario (user_id, carta_usuario_id, tipo, fim, dados)
  values (p_uid, p_id, c.subtipo, fim, dados)
  returning * into p;

  return jsonb_build_object('ok', true, 'poder', jsonb_build_object('tipo', p.tipo, 'fim', p.fim, 'dados', p.dados));
end;
$$;

-- Estado para o app ──────────────────────────────────────────────────────────
create or replace function public.estado_cartas(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := public.dia_sessao(now());
  s public.sequencias%rowtype;
  cota integer;
begin
  perform public.avaliar_sequencia(p_uid, hoje);
  select * into s from public.sequencias where user_id = p_uid;
  select cartas_por_dia into cota from public.cartas_config where id = 1;
  if public.tem_carta_extra(p_uid, hoje) then cota := cota + 1; end if;

  return jsonb_build_object(
    'hoje', hoje,
    'sequencia', jsonb_build_object(
      'atual', coalesce(s.atual, 0),
      'recorde', coalesce(s.recorde, 0),
      'ultimo_dia', s.ultimo_dia
    ),
    'rotina_hoje', exists (select 1 from public.rotinas_concluidas where user_id = p_uid and dia = hoje),
    'cartas_hoje', jsonb_build_object(
      'cota', cota,
      'dadas', (select count(*) from public.cartas_usuario where user_id = p_uid and dia = hoje and origem = 'rotina')
    ),
    'a_raspar', coalesce((
      select jsonb_agg(jsonb_build_object('id', cu.id, 'origem', cu.origem, 'ganha_em', cu.ganha_em) order by cu.ganha_em)
        from public.cartas_usuario cu
       where cu.user_id = p_uid and cu.raspada_em is null
    ), '[]'::jsonb),
    'poderes', jsonb_build_object(
      'protecao', (select count(*) from public.poderes_usuario
                    where user_id = p_uid and tipo = 'protecao_sequencia' and consumido_em is null),
      'scan_antecipado', exists (select 1 from public.poderes_usuario
                    where user_id = p_uid and tipo = 'scan_antecipado' and consumido_em is null),
      'carta_extra_amanha', public.tem_carta_extra(p_uid, hoje + 1),
      'sequencia_dobro_dias', coalesce((
        select jsonb_agg(distinct x) from public.poderes_usuario pu, jsonb_array_elements_text(pu.dados -> 'dias') x
         where pu.user_id = p_uid and pu.tipo = 'sequencia_dobro' and x::date >= hoje
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- Scan antecipado: o próximo scan salvo consome o poder ───────────────────────
-- NUNCA bloqueia o scan: qualquer erro aqui é capturado (vira só um aviso no log) e o
-- INSERT em skin_scans segue normalmente.
create or replace function public.consumir_scan_antecipado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    update public.poderes_usuario
       set consumido_em = now()
     where id = (
       select id from public.poderes_usuario
        where user_id = new.user_id and tipo = 'scan_antecipado' and consumido_em is null
        order by inicio
        limit 1
     );
  exception when others then
    raise warning 'consumir_scan_antecipado falhou (scan % salvo mesmo assim): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists skin_scans_consumir_scan_antecipado on public.skin_scans;
create trigger skin_scans_consumir_scan_antecipado
  after insert on public.skin_scans
  for each row execute function public.consumir_scan_antecipado();

revoke all on function public.dar_carta(uuid, text, date, boolean, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.tem_carta_extra(uuid, date) from public, anon, authenticated;
revoke all on function public.concluir_rotina(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.raspar_carta(uuid, uuid) from public, anon, authenticated;
revoke all on function public.estado_cartas(uuid) from public, anon, authenticated;
revoke all on function public.consumir_scan_antecipado() from public, anon, authenticated;
grant execute on function public.dar_carta(uuid, text, date, boolean, text, text, jsonb) to service_role;
grant execute on function public.tem_carta_extra(uuid, date) to service_role;
grant execute on function public.concluir_rotina(uuid, text, timestamptz) to service_role;
grant execute on function public.raspar_carta(uuid, uuid) to service_role;
grant execute on function public.estado_cartas(uuid) to service_role;
