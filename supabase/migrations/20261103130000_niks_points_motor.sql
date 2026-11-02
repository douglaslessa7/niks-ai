-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 1 da gamificação — NIKS Points (funções) + ajustes do motor de cartas.
-- Aplicar DEPOIS de 20261103120000_niks_points.sql.
--
-- Mudanças no motor (substituem as regras de 20261102120000_motor_cartas.sql):
--  1. 1 carta POR AÇÃO (rotina manhã e noite, scan de rosto 1x/7 dias, marcos, volta…),
--     deduplicada pelo índice único (user_id, dia, acao). Sai o "1 carta por dia".
--  2. No máximo 1 PODER por dia. A 1ª carta do dia segue a garantia do momento
--     (em_risco = poder garantido; nova 70%; constante/padrão 50%); as seguintes têm
--     motor.poder_seguintes_pct (30%) até sair o poder do dia; depois, só pontos.
--  3. CARTA DE VOLTA (substitui o momento "voltando"): 2+ dias inteiros sem rotina →
--     ao abrir o app (estado_cartas) ela recebe Sequência em dobro. Conta como o poder do
--     dia, respeita o limite semanal do dobro, 1 por ausência.
--  4. Pontos em dobro (era "XP em dobro para o grupo"): por 2 dias as cartas dela valem
--     o dobro; no máximo 1 a cada 7 dias.
-- Pontos: sorteados no RASPAR (faixa da ação; rara ×3; Pontos em dobro ×2) e somados em
-- pontos_usuario. Nível = função do total (cartas_config.pontos.niveis).
-- Pontos retroativos: aplicar_pontos_retro (uma vez por conta; rotinas sem carta com pontos).
-- ─────────────────────────────────────────────────────────────────────────────

-- Nível de um total de pontos ──────────────────────────────────────────────────
-- { nivel, titulo, piso, teto, titulo_proximo }. Depois do Ícone (último da lista):
-- "Ícone II", "Ícone III"…, o 1º pedindo icone_passo e cada seguinte +icone_incremento.
create or replace function public.nivel_de(p_total integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  niv integer[];
  tit text[];
  qtd integer;
  n integer := 1;
  i integer;
  piso integer;
  passo integer;
  inc integer;
  k integer;
begin
  select pontos into cfg from public.cartas_config where id = 1;
  select array_agg(x::int order by o) into niv from jsonb_array_elements_text(cfg -> 'niveis') with ordinality t(x, o);
  select array_agg(x order by o) into tit from jsonb_array_elements_text(cfg -> 'titulos') with ordinality t(x, o);
  qtd := array_length(niv, 1);
  for i in 1..qtd loop
    if coalesce(p_total, 0) >= niv[i] then n := i; end if;
  end loop;

  if n < qtd then
    return jsonb_build_object('nivel', n, 'titulo', tit[n], 'piso', niv[n], 'teto', niv[n + 1], 'titulo_proximo', tit[n + 1]);
  end if;

  k := 1;                                           -- 1 = Ícone, 2 = Ícone II…
  piso := niv[qtd];
  passo := coalesce((cfg ->> 'icone_passo')::int, 945);
  inc := coalesce((cfg ->> 'icone_incremento')::int, 45);
  while coalesce(p_total, 0) >= piso + passo loop
    piso := piso + passo;
    passo := passo + inc;
    k := k + 1;
  end loop;
  return jsonb_build_object(
    'nivel', qtd + k - 1,
    'titulo', case when k = 1 then tit[qtd] else tit[qtd] || ' ' || to_char(k, 'FMRN') end,
    'piso', piso,
    'teto', piso + passo,
    'titulo_proximo', tit[qtd] || ' ' || to_char(k + 1, 'FMRN')
  );
end;
$$;

-- dar_carta: igual à do motor, agora com a AÇÃO (deduplicação) ─────────────────
-- Devolve null se o catálogo não tem carta para ela OU se a ação já deu carta no dia.
drop function if exists public.dar_carta(uuid, text, date, boolean, text, text, jsonb);
create or replace function public.dar_carta(
  p_uid uuid, p_origem text, p_dia date,
  p_rara boolean default null, p_familia text default null, p_subtipo text default null,
  p_conteudo jsonb default null, p_acao text default null
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
    if fam = 'momento' then fam := 'conhecimento'; sub := 'momento'; end if;
  end if;
  if fam = 'conhecimento' and sub is null then sub := 'educativa'; end if;

  if rara is null then
    rara := fam = 'colecionavel'
        and random() * 100 < (case when p_origem = 'grupo' then cfg.rara_grupo_pct else cfg.rara_pct end);
  end if;

  ordem := array[fam] || array_remove(array['colecionavel', 'conhecimento', 'poder'], fam);
  foreach f in array ordem loop
    select c.id into carta
      from public.cartas_catalogo c
     where c.ativa
       and (not c.apenas_teste or tester)
       and c.familia = f
       and (case
              when f = 'conhecimento' then c.subtipo = coalesce(case when f = fam then sub end, 'educativa')
              when f = 'poder' and f = fam and sub is not null then c.subtipo = sub
              else true
            end)
     order by (c.raridade = case when rara and f = 'colecionavel' then 'rara' else 'normal' end) desc, random()
     limit 1;
    exit when carta is not null;
    exit when p_familia is not null or sub in ('pessoal', 'momento');
  end loop;

  if carta is null then
    return null;
  end if;

  insert into public.cartas_usuario (user_id, carta_id, origem, dia, conteudo, acao)
  values (p_uid, carta, p_origem, p_dia, p_conteudo, p_acao)
  on conflict (user_id, dia, acao) where acao is not null and acao <> 'legado' do nothing
  returning id into novo;
  return novo;
end;
$$;

-- O MOMENTO da usuária (sem "voltando": virou a Carta de volta) ────────────────
create or replace function public.momento_usuaria(p_uid uuid, p_dia date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  mt jsonb;
  primeiro date;
  anterior date;
  sem_rotina integer;
  faltas integer := 0;
  janela integer;
  seguidos integer := 0;
  x date;
  momento text;
begin
  select motor into mt from public.cartas_config where id = 1;
  select min(dia) into primeiro from public.rotinas_concluidas where user_id = p_uid;
  if primeiro is null then primeiro := p_dia; end if;
  select max(dia) into anterior from public.rotinas_concluidas where user_id = p_uid and dia < p_dia;
  sem_rotina := case when anterior is null then 0 else p_dia - anterior - 1 end;

  janela := coalesce((mt #>> '{em_risco,janela_dias}')::int, 3);
  select count(*) into faltas
    from generate_series(greatest(primeiro, p_dia - janela), p_dia - 1, interval '1 day') g
   where not exists (select 1 from public.rotinas_concluidas r where r.user_id = p_uid and r.dia = g::date);

  x := p_dia;
  while exists (select 1 from public.rotinas_concluidas r where r.user_id = p_uid and r.dia = x) loop
    seguidos := seguidos + 1;
    x := x - 1;
  end loop;

  momento := case
    when faltas >= 1 then 'em_risco'
    when p_dia - primeiro < coalesce((mt #>> '{nova,dias}')::int, 7) then 'nova'
    when seguidos >= coalesce((mt #>> '{constante,dias}')::int, 7) then 'constante'
    else 'padrao'
  end;

  return jsonb_build_object('momento', momento, 'dias_desde_inicio', p_dia - primeiro, 'faltas', faltas,
                            'dias_sem_rotina', sem_rotina, 'seguidos', seguidos);
end;
$$;

-- Qual PODER ela precisa (agora com Pontos em dobro) ────────────────────────────
drop function if exists public.escolher_poder(uuid, date, boolean, integer, text);
create or replace function public.escolher_poder(p_uid uuid, p_dia date, p_zerou boolean, p_atual integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.cartas_config%rowtype;
  mt jsonb;
  tester boolean;
  lista text[] := '{}';
  regras text[] := '{}';
  marcos_ganhos integer[];
  m integer;
  perto boolean := false;
  armadas integer;
  ativos integer;
  ultimo_scan date;
  scan_armado boolean;
  t text;
  i integer;
  bloqueados text[] := '{}';
begin
  select * into cfg from public.cartas_config where id = 1;
  mt := cfg.motor;
  tester := p_uid = any(cfg.testers);

  armadas := (select count(*) from public.poderes_usuario where user_id = p_uid and tipo = 'protecao_sequencia' and consumido_em is null)
           + (select count(*) from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
               where cu.user_id = p_uid and cu.raspada_em is null and c.subtipo = 'protecao_sequencia');
  select marcos into marcos_ganhos from public.sequencias where user_id = p_uid;
  foreach m in array coalesce(cfg.marcos, '{7,14,30}') loop
    if not (m = any(coalesce(marcos_ganhos, '{}'))) and (m - p_atual)::text in (select jsonb_array_elements_text(coalesce(mt -> 'marco_perto', '[1,2]'))) then
      perto := true;
    end if;
  end loop;
  select count(distinct dia) into ativos from public.rotinas_concluidas
   where user_id = p_uid and dia between p_dia - coalesce((mt #>> '{engajada,janela}')::int, 7) + 1 and p_dia;
  select max(public.dia_sessao(created_at)) into ultimo_scan from public.skin_scans where user_id = p_uid;
  scan_armado := exists (select 1 from public.poderes_usuario where user_id = p_uid and tipo = 'scan_antecipado' and consumido_em is null)
              or exists (select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
                          where cu.user_id = p_uid and cu.raspada_em is null and c.subtipo = 'scan_antecipado');

  -- A lista, em ordem de prioridade.
  if p_zerou then lista := lista || 'sequencia_dobro'::text; regras := regras || 'perdeu'::text; end if;
  if p_atual >= 3 and armadas = 0 then lista := lista || 'protecao_sequencia'::text; regras := regras || 'protecao'::text; end if;
  if perto then lista := lista || 'carta_extra'::text; regras := regras || 'marco_perto'::text; end if;
  if ativos >= coalesce((mt #>> '{engajada,dias_ativos}')::int, 5)
     and ultimo_scan is not null and p_dia - ultimo_scan < 7 and not scan_armado then
    lista := lista || 'scan_antecipado'::text; regras := regras || 'scan'::text;
  end if;
  -- O recebido há mais tempo (nunca recebido primeiro).
  for t in
    select s.sub from unnest(array['sequencia_dobro', 'protecao_sequencia', 'carta_extra', 'scan_antecipado', 'pontos_dobro'])
                      with ordinality s(sub, o)
     order by (select max(cu.dia) from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
                where cu.user_id = p_uid and c.subtipo = s.sub) asc nulls first, s.o
  loop
    lista := lista || t; regras := regras || 'mais_antigo'::text;
  end loop;

  for i in 1..array_length(lista, 1) loop
    t := lista[i];
    if t = 'protecao_sequencia' and armadas >= coalesce((mt #>> '{limites,protecao_armadas}')::int, 2) then
      bloqueados := bloqueados || t; continue;
    end if;
    if t = 'sequencia_dobro' and exists (
      select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
       where cu.user_id = p_uid and c.subtipo = 'sequencia_dobro' and cu.dia > p_dia - coalesce((mt #>> '{limites,dobro_dias}')::int, 7)
    ) then bloqueados := bloqueados || t; continue; end if;
    if t = 'scan_antecipado' and exists (
      select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
       where cu.user_id = p_uid and c.subtipo = 'scan_antecipado' and cu.dia > p_dia - coalesce((mt #>> '{limites,scan_dias}')::int, 7)
    ) then bloqueados := bloqueados || t; continue; end if;
    if t = 'pontos_dobro' and exists (
      select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
       where cu.user_id = p_uid and c.subtipo in ('pontos_dobro', 'xp_grupo_dobro')
         and cu.dia > p_dia - coalesce((mt #>> '{limites,pontos_dobro_dias}')::int, 7)
    ) then bloqueados := bloqueados || t; continue; end if;
    if not exists (select 1 from public.cartas_catalogo c where c.ativa and (not c.apenas_teste or tester)
                    and c.familia = 'poder' and c.subtipo = t) then
      bloqueados := bloqueados || t; continue;
    end if;
    return jsonb_build_object('subtipo', t, 'regra', regras[i], 'limite', i > 1 and lista[1] = any(bloqueados),
                              'bloqueados', to_jsonb(bloqueados), 'armadas', armadas, 'ativos', ativos, 'ultimo_scan', ultimo_scan);
  end loop;
  return jsonb_build_object('subtipo', null, 'bloqueados', to_jsonb(bloqueados), 'armadas', armadas);
end;
$$;

-- O motor: decide e entrega UMA carta de uma ação, gravando o motivo ───────────
-- 1 poder por dia; a 1ª carta do dia tem a garantia do momento; as seguintes 30%.
drop function if exists public.dar_carta_motor(uuid, date, boolean, boolean, integer);
create or replace function public.dar_carta_motor(
  p_uid uuid, p_dia date, p_origem text, p_acao text, p_zerou boolean, p_atual integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.cartas_config%rowtype;
  mt jsonb;
  mom jsonb;
  m text;
  primeira boolean;
  poder_hoje boolean;
  etapa text;
  garantia boolean := false;
  pct numeric;
  sorte numeric := round((random() * 100)::numeric, 2);
  sorte2 numeric;
  sorte_rara numeric;
  poder jsonb;
  quer_poder boolean := false;
  v_motivo text;
  fam text;
  sub text;
  rara boolean := false;
  novo uuid;
begin
  select * into cfg from public.cartas_config where id = 1;
  mt := cfg.motor;
  mom := public.momento_usuaria(p_uid, p_dia);
  m := mom ->> 'momento';

  -- Cartas de marco são bônus: não contam como "1ª do dia" nem como poder.
  primeira := not exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_dia and origem <> 'marco');
  poder_hoje := exists (select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
                         where cu.user_id = p_uid and cu.dia = p_dia and c.familia = 'poder');

  if poder_hoje then
    etapa := 'poder_hoje';
    pct := 0;
  elsif primeira then
    etapa := 'primeira';
    if m = 'em_risco' then
      garantia := true;
      pct := 100;
      quer_poder := true;
    else
      pct := coalesce((mt #>> array[case when m in ('nova', 'constante') then m else 'padrao' end, 'poder_pct'])::numeric, 50);
      quer_poder := sorte < pct;
    end if;
  else
    etapa := 'seguinte';
    pct := coalesce((mt ->> 'poder_seguintes_pct')::numeric, 30);
    quer_poder := sorte < pct;
  end if;

  if quer_poder then
    poder := public.escolher_poder(p_uid, p_dia, p_zerou, p_atual);
    if poder ->> 'subtipo' is not null then
      fam := 'poder'; sub := poder ->> 'subtipo';
      v_motivo := m || ':' || case when garantia then '' else 'sorte→poder:' end
              || case when (poder ->> 'limite')::boolean then 'limite→' else '' end
              || case poder ->> 'regra'
                   when 'perdeu' then 'dobro' when 'protecao' then 'protecao'
                   when 'marco_perto' then 'carta_extra' when 'scan' then 'scan'
                   else 'mais_antigo:' || sub end;
    end if;
  end if;

  if fam is null then
    sorte2 := round((random() * 100)::numeric, 2);
    fam := case when sorte2 < coalesce((mt #>> '{nao_poder,colecionavel}')::numeric, 100) then 'colecionavel' else 'conhecimento' end;
    if fam = 'colecionavel' then
      sorte_rara := round((random() * 100)::numeric, 2);
      rara := sorte_rara < cfg.rara_pct;
    end if;
    v_motivo := m || ':' || case when poder_hoje then 'poder_hoje→' when quer_poder then 'limites→' else 'sorte→' end
            || case when fam = 'colecionavel' then 'colecionavel' else 'dica' end;
  end if;

  novo := public.dar_carta(p_uid, p_origem, p_dia, rara, fam, sub, null, p_acao);
  -- Sem a família escolhida no catálogo: a outra não-poder (se não foi a ação repetida).
  if novo is null and fam <> 'poder'
     and not exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_dia and acao = p_acao) then
    fam := case when fam = 'colecionavel' then 'conhecimento' else 'colecionavel' end;
    novo := public.dar_carta(p_uid, p_origem, p_dia, false, fam, null, null, p_acao);
    v_motivo := v_motivo || ':catalogo→' || fam;
  end if;
  if novo is null then
    return null;
  end if;

  update public.cartas_usuario
     set motivo = v_motivo,
         decisao = jsonb_build_object('origem', p_origem, 'acao', p_acao, 'momento', mom, 'etapa', etapa,
                                      'garantia', garantia, 'poder_hoje', poder_hoje, 'zerou', p_zerou,
                                      'sequencia', p_atual, 'poder_pct', pct, 'sorte', sorte,
                                      'sorte_nao_poder', sorte2, 'sorte_rara', sorte_rara, 'rara_pct', cfg.rara_pct,
                                      'poder', poder)
   where id = novo;
  return novo;
end;
$$;

-- Rotina concluída → sequência + 1 carta da rotina (manhã e noite) + Carta extra + marcos.
create or replace function public.concluir_rotina(p_uid uuid, p_periodo text, p_quando timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.cartas_config%rowtype;
  acfg jsonb;
  seq jsonb;
  d date;
  zerou boolean;
  atual integer;
  ids uuid[] := '{}';
  novo uuid;
  m jsonb;
begin
  seq := public.registrar_rotina(p_uid, p_periodo, p_quando);
  d := (seq ->> 'dia')::date;
  zerou := coalesce((seq ->> 'zerou')::boolean, false);
  atual := (seq ->> 'atual')::int;

  if (seq ->> 'nova')::boolean then
    select * into cfg from public.cartas_config where id = 1;
    acfg := cfg.pontos #> '{acoes,rotina}';
    if coalesce((acfg ->> 'ativa')::boolean, true) then
      if (select count(*) from public.cartas_usuario
           where user_id = p_uid and dia = d and acao in ('rotina:am', 'rotina:pm')) < coalesce((acfg ->> 'por_dia')::int, 2) then
        novo := public.dar_carta_motor(p_uid, d, 'rotina', 'rotina:' || p_periodo, zerou, atual);
        if novo is not null then ids := ids || novo; end if;
      end if;
      -- Carta extra: +1 carta no dia em que vale (vem com a 1ª rotina do dia).
      if public.tem_carta_extra(p_uid, d) then
        novo := public.dar_carta_motor(p_uid, d, 'rotina', 'rotina:extra', false, atual);
        if novo is not null then ids := ids || novo; end if;
      end if;
    end if;

    -- Marcos (7, 14, 30): Colecionável rara garantida.
    if coalesce((cfg.pontos #>> '{acoes,marco,ativa}')::boolean, true) then
      for m in select * from jsonb_array_elements(seq -> 'marcos_novos') loop
        novo := public.dar_carta(p_uid, 'marco', d, true, 'colecionavel', null,
                                 jsonb_build_object('marco', (m #>> '{}')::int), 'marco:' || (m #>> '{}'));
        if novo is not null then
          update public.cartas_usuario set motivo = 'marco:rara', decisao = jsonb_build_object('marco', (m #>> '{}')::int) where id = novo;
          ids := ids || novo;
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object('sequencia', seq, 'cartas', to_jsonb(ids));
end;
$$;

-- Carta de uma AÇÃO que não é a rotina: scan de rosto (ativa) e, nas próximas fases,
-- check-in no grupo, SOS e produto no grupo (inativas na config). ────────────────
create or replace function public.dar_carta_acao(p_uid uuid, p_acao text, p_dia date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  acfg jsonb;
  v_atual integer;
begin
  if p_acao not in ('scan_rosto', 'checkin_grupo', 'sos', 'produto_grupo') then
    raise exception 'ação inválida';
  end if;
  select pontos #> array['acoes', p_acao] into acfg from public.cartas_config where id = 1;
  if acfg is null or not coalesce((acfg ->> 'ativa')::boolean, false) then
    return null;
  end if;

  -- Serializa com a rotina (mesma trava de registrar_rotina): "1 poder por dia" sem corrida.
  insert into public.sequencias (user_id) values (p_uid) on conflict do nothing;
  select atual into v_atual from public.sequencias where user_id = p_uid for update;

  if acfg ? 'janela_dias' then
    if exists (select 1 from public.cartas_usuario
                where user_id = p_uid and origem = p_acao and dia > p_dia - (acfg ->> 'janela_dias')::int) then
      return null;
    end if;
  elsif (select count(*) from public.cartas_usuario where user_id = p_uid and origem = p_acao and dia = p_dia)
        >= coalesce((acfg ->> 'por_dia')::int, 1) then
    return null;
  end if;

  return public.dar_carta_motor(p_uid, p_dia, p_acao, p_acao, false, coalesce(v_atual, 0));
end;
$$;

-- Carta de VOLTA: 2+ dias inteiros sem rotina → ao abrir o app, Sequência em dobro ─
-- 1 por ausência (acao 'volta:<último dia com rotina>'), conta como o poder do dia e
-- respeita o limite semanal do dobro. Devolve o id da carta nova (ou null).
create or replace function public.dar_carta_volta(p_uid uuid, p_hoje date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.cartas_config%rowtype;
  anterior date;
  sem integer;
  v_acao text;
  novo uuid;
begin
  select * into cfg from public.cartas_config where id = 1;
  if not coalesce((cfg.pontos #>> '{acoes,volta,ativa}')::boolean, false) then
    return null;
  end if;
  if exists (select 1 from public.rotinas_concluidas where user_id = p_uid and dia = p_hoje) then
    return null;
  end if;
  select max(dia) into anterior from public.rotinas_concluidas where user_id = p_uid and dia < p_hoje;
  if anterior is null then
    return null;
  end if;
  sem := p_hoje - anterior - 1;
  if sem < coalesce((cfg.motor #>> '{volta,dias_sem_rotina}')::int, 2) then
    return null;
  end if;
  v_acao := 'volta:' || anterior;
  if exists (select 1 from public.cartas_usuario where user_id = p_uid and acao = v_acao) then
    return null;
  end if;

  insert into public.sequencias (user_id) values (p_uid) on conflict do nothing;
  perform 1 from public.sequencias where user_id = p_uid for update;
  if exists (select 1 from public.cartas_usuario where user_id = p_uid and acao = v_acao) then
    return null;
  end if;
  -- Já saiu o poder do dia?
  if exists (select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
              where cu.user_id = p_uid and cu.dia = p_hoje and c.familia = 'poder') then
    return null;
  end if;
  -- Limite semanal do dobro.
  if exists (select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
              where cu.user_id = p_uid and c.subtipo = 'sequencia_dobro'
                and cu.dia > p_hoje - coalesce((cfg.motor #>> '{limites,dobro_dias}')::int, 7)) then
    return null;
  end if;

  novo := public.dar_carta(p_uid, 'volta', p_hoje, false, 'poder', 'sequencia_dobro', null, v_acao);
  if novo is not null then
    update public.cartas_usuario
       set motivo = 'volta:dobro',
           decisao = jsonb_build_object('origem', 'volta', 'acao', v_acao, 'anterior', anterior, 'dias_sem_rotina', sem)
     where id = novo;
  end if;
  return novo;
end;
$$;

-- Raspar: marca a carta, SORTEIA os pontos, soma no total e aplica o Poder ─────
-- Devolve { ok, poder?, pontos: { ganhos, base, rara, dobro, total_antes, total,
--           nivel_antes, nivel, titulo } }.
create or replace function public.raspar_carta(p_uid uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.cartas_config%rowtype;
  cu public.cartas_usuario%rowtype;
  c public.cartas_catalogo%rowtype;
  hoje date := public.dia_sessao(now());
  dias integer;
  dados jsonb;
  fim timestamptz;
  p public.poderes_usuario%rowtype;
  acfg jsonb;
  v_min integer;
  v_max integer;
  base integer := 0;
  v_rara boolean := false;
  v_dobro boolean := false;
  ganhos integer := 0;
  pu public.pontos_usuario%rowtype;
  nv jsonb;
  resultado jsonb;
begin
  select * into cu from public.cartas_usuario where id = p_id and user_id = p_uid for update;
  if not found then
    raise exception 'carta não encontrada';
  end if;
  if cu.raspada_em is not null then
    return jsonb_build_object('ok', true, 'ja_raspada', true);
  end if;

  select * into cfg from public.cartas_config where id = 1;
  select * into c from public.cartas_catalogo where id = cu.carta_id;
  update public.cartas_usuario set raspada_em = now() where id = p_id;

  -- Pontos (antes do poder: o Pontos em dobro que esta carta liga não dobra ela mesma).
  if cu.acao is distinct from 'legado' then
    acfg := coalesce(
      cfg.pontos #> array['acoes', case cu.origem when 'grupo' then 'checkin_grupo' when 'surpresa' then 'rotina' else cu.origem end],
      cfg.pontos #> '{acoes,rotina}');
    v_min := coalesce((acfg ->> 'min')::int, 15);
    v_max := greatest(coalesce((acfg ->> 'max')::int, 30), v_min);
    base := v_min + floor(random() * (v_max - v_min + 1))::int;
    v_rara := c.raridade = 'rara';
    v_dobro := exists (select 1 from public.poderes_usuario pd
                        where pd.user_id = p_uid and pd.tipo in ('pontos_dobro', 'xp_grupo_dobro')
                          and pd.dados -> 'dias' ? cu.dia::text);
    ganhos := base
            * case when v_rara then coalesce((cfg.pontos ->> 'mult_rara')::int, 3) else 1 end
            * case when v_dobro then coalesce((cfg.pontos ->> 'mult_dobro')::int, 2) else 1 end;
  end if;

  update public.cartas_usuario
     set pontos = ganhos,
         decisao = coalesce(decisao, '{}'::jsonb)
                   || jsonb_build_object('pontos', jsonb_build_object('base', base, 'faixa', jsonb_build_array(v_min, v_max),
                                                                      'rara', v_rara, 'dobro', v_dobro, 'ganhos', ganhos,
                                                                      'legado', cu.acao = 'legado'))
   where id = p_id;

  insert into public.pontos_usuario (user_id) values (p_uid) on conflict do nothing;
  select * into pu from public.pontos_usuario where user_id = p_uid for update;
  nv := public.nivel_de(pu.total + ganhos);
  update public.pontos_usuario
     set total = pu.total + ganhos, nivel = (nv ->> 'nivel')::int, atualizado_em = now()
   where user_id = p_uid;

  resultado := jsonb_build_object('ok', true, 'pontos', jsonb_build_object(
    'ganhos', ganhos, 'base', base, 'rara', v_rara, 'dobro', v_dobro,
    'total_antes', pu.total, 'total', pu.total + ganhos,
    'nivel_antes', (public.nivel_de(pu.total) ->> 'nivel')::int, 'nivel', (nv ->> 'nivel')::int, 'titulo', nv ->> 'titulo'));

  if c.familia <> 'poder' then
    return resultado;
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
    when 'pontos_dobro', 'xp_grupo_dobro' then
      -- Hoje e os próximos (N − 1) dias: as cartas desses dias valem o dobro.
      select jsonb_build_object('dias', jsonb_agg((hoje + g)::text)) into dados from generate_series(0, dias - 1) g;
      fim := ((hoje + dias) + time '04:00') at time zone 'America/Sao_Paulo';
  end case;

  insert into public.poderes_usuario (user_id, carta_usuario_id, tipo, fim, dados)
  values (p_uid, p_id, c.subtipo, fim, dados)
  returning * into p;

  return resultado || jsonb_build_object('poder', jsonb_build_object('tipo', p.tipo, 'fim', p.fim, 'dados', p.dados));
end;
$$;

-- Pontos RETROATIVOS (uma vez por conta, sem cartas) ────────────────────────────
-- média da faixa da rotina (retro_por_rotina) × rotinas já registradas que NÃO deram
-- carta com pontos (histórico do celular, rotinas de antes dos NIKS Points — cartas
-- 'legado' — e rotinas feitas com o catálogo inativo). A que deu carta 'rotina:am|pm'
-- já ganha os pontos dela ao raspar; contar de novo seria pontuar duas vezes.
create or replace function public.aplicar_pontos_retro(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  pu public.pontos_usuario%rowtype;
  n integer;
  pts integer;
  nv jsonb;
begin
  select pontos into cfg from public.cartas_config where id = 1;
  insert into public.pontos_usuario (user_id) values (p_uid) on conflict do nothing;
  select * into pu from public.pontos_usuario where user_id = p_uid for update;
  if pu.retro_em is not null then
    return jsonb_build_object('ja_aplicado', true, 'pontos', pu.retro_pontos);
  end if;

  select count(*) into n from public.rotinas_concluidas r
   where r.user_id = p_uid
     and not exists (select 1 from public.cartas_usuario cu
                      where cu.user_id = p_uid and cu.dia = r.dia and cu.acao = 'rotina:' || r.periodo);
  pts := round(n * coalesce((cfg ->> 'retro_por_rotina')::numeric, 22.5));
  nv := public.nivel_de(pu.total + pts);

  update public.pontos_usuario
     set total = pu.total + pts,
         nivel = (nv ->> 'nivel')::int,
         retro_em = now(),
         retro_pontos = pts,
         retro_visto = (nv ->> 'nivel')::int <= pu.nivel_visto,   -- nada a celebrar
         atualizado_em = now()
   where user_id = p_uid;
  return jsonb_build_object('ja_aplicado', false, 'rotinas', n, 'pontos', pts, 'nivel', (nv ->> 'nivel')::int);
end;
$$;

-- Ela viu a celebração do nível (subida ou retroativo) ─────────────────────────
create or replace function public.marcar_nivel_visto(p_uid uuid, p_nivel integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pu public.pontos_usuario%rowtype;
begin
  update public.pontos_usuario
     set nivel_visto = greatest(nivel_visto, least(coalesce(p_nivel, 1), nivel)),
         retro_visto = true,
         atualizado_em = now()
   where user_id = p_uid
  returning * into pu;
  return jsonb_build_object('nivel_visto', coalesce(pu.nivel_visto, 1));
end;
$$;

-- Estado para o app (agora com pontos, níveis e a Carta de volta) ──────────────
create or replace function public.estado_cartas(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := public.dia_sessao(now());
  cfg public.cartas_config%rowtype;
  s public.sequencias%rowtype;
  pu public.pontos_usuario%rowtype;
  nv jsonb;
  cota integer;
  volta uuid;
begin
  perform public.avaliar_sequencia(p_uid, hoje);
  volta := public.dar_carta_volta(p_uid, hoje);

  select * into cfg from public.cartas_config where id = 1;
  select * into s from public.sequencias where user_id = p_uid;
  insert into public.pontos_usuario (user_id) values (p_uid) on conflict do nothing;
  select * into pu from public.pontos_usuario where user_id = p_uid;
  nv := public.nivel_de(pu.total);

  cota := case when coalesce((cfg.pontos #>> '{acoes,rotina,ativa}')::boolean, true)
               then coalesce((cfg.pontos #>> '{acoes,rotina,por_dia}')::int, 2) else 0 end;
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
        select jsonb_agg(distinct x) from public.poderes_usuario pu2, jsonb_array_elements_text(pu2.dados -> 'dias') x
         where pu2.user_id = p_uid and pu2.tipo = 'sequencia_dobro' and x::date >= hoje
      ), '[]'::jsonb),
      'pontos_dobro_dias', coalesce((
        select jsonb_agg(distinct x) from public.poderes_usuario pu2, jsonb_array_elements_text(pu2.dados -> 'dias') x
         where pu2.user_id = p_uid and pu2.tipo in ('pontos_dobro', 'xp_grupo_dobro') and x::date >= hoje
      ), '[]'::jsonb)
    ),
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
      'retro_pontos', pu.retro_pontos
    ),
    'niveis', (
      select jsonb_agg(jsonb_build_object('n', o, 'titulo', t.titulo, 'pontos', (cfg.pontos -> 'niveis' ->> (o - 1)::int)::int) order by o)
        from jsonb_array_elements_text(cfg.pontos -> 'titulos') with ordinality t(titulo, o)
    ),
    -- Depois do Ícone: o 1º pede `passo` e cada seguinte +`incremento` (o app anima a subida).
    'icone', jsonb_build_object('passo', coalesce((cfg.pontos ->> 'icone_passo')::int, 945),
                                'incremento', coalesce((cfg.pontos ->> 'icone_incremento')::int, 45)),
    'faixas', coalesce((
      select jsonb_object_agg(a.key, jsonb_build_object('min', (a.value ->> 'min')::int, 'max', (a.value ->> 'max')::int))
        from jsonb_each(cfg.pontos -> 'acoes') a
       where coalesce((a.value ->> 'ativa')::boolean, false)
    ), '{}'::jsonb),
    'carta_volta', volta
  );
end;
$$;

-- Scan de rosto salvo → carta da ação 'scan_rosto' (1 a cada 7 dias) ───────────
-- NUNCA bloqueia o scan: qualquer erro vira só um aviso no log.
create or replace function public.dar_carta_scan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.dar_carta_acao(new.user_id, 'scan_rosto', public.dia_sessao(coalesce(new.created_at, now())));
  exception when others then
    raise warning 'dar_carta_scan falhou (scan % salvo mesmo assim): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists skin_scans_dar_carta_scan on public.skin_scans;
create trigger skin_scans_dar_carta_scan
  after insert on public.skin_scans
  for each row execute function public.dar_carta_scan();

-- Dados: cartas de antes dos NIKS Points valem 0 pontos (a rotina delas entra nos
-- pontos retroativos). Rodar de novo não muda nada: cartas novas sempre têm `acao`.
update public.cartas_usuario set acao = 'legado', pontos = coalesce(pontos, 0) where acao is null;

-- Permissões: só o service role (Edge Function `cartas`). ────────────────────────
revoke all on function public.nivel_de(integer) from public, anon, authenticated;
revoke all on function public.dar_carta(uuid, text, date, boolean, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.momento_usuaria(uuid, date) from public, anon, authenticated;
revoke all on function public.escolher_poder(uuid, date, boolean, integer) from public, anon, authenticated;
revoke all on function public.dar_carta_motor(uuid, date, text, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.concluir_rotina(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.dar_carta_acao(uuid, text, date) from public, anon, authenticated;
revoke all on function public.dar_carta_volta(uuid, date) from public, anon, authenticated;
revoke all on function public.raspar_carta(uuid, uuid) from public, anon, authenticated;
revoke all on function public.aplicar_pontos_retro(uuid) from public, anon, authenticated;
revoke all on function public.marcar_nivel_visto(uuid, integer) from public, anon, authenticated;
revoke all on function public.estado_cartas(uuid) from public, anon, authenticated;
revoke all on function public.dar_carta_scan() from public, anon, authenticated;
grant execute on function public.nivel_de(integer) to service_role;
grant execute on function public.dar_carta(uuid, text, date, boolean, text, text, jsonb, text) to service_role;
grant execute on function public.momento_usuaria(uuid, date) to service_role;
grant execute on function public.escolher_poder(uuid, date, boolean, integer) to service_role;
grant execute on function public.dar_carta_motor(uuid, date, text, text, boolean, integer) to service_role;
grant execute on function public.concluir_rotina(uuid, text, timestamptz) to service_role;
grant execute on function public.dar_carta_acao(uuid, text, date) to service_role;
grant execute on function public.dar_carta_volta(uuid, date) to service_role;
grant execute on function public.raspar_carta(uuid, uuid) to service_role;
grant execute on function public.aplicar_pontos_retro(uuid) to service_role;
grant execute on function public.marcar_nivel_visto(uuid, integer) to service_role;
grant execute on function public.estado_cartas(uuid) to service_role;
