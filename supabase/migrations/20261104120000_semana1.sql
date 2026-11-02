-- Fase 2 da gamificação — PRIMEIRA SEMANA (recompensa garantida nos 7 primeiros dias com rotina)
--
--  "Dia N" = N-ésimo dia COM rotina (pulou um dia, a recompensa espera o próximo dia com
--  rotina). A recompensa vem na 1ª carta de rotina do dia e, para ela, é uma carta comum.
--  Tudo em cartas_config.motor -> 'semana1' (muda sem deploy):
--    1 marca (só medição) · 2 +25 pontos · 3 Proteção de sequência · 4 Carta extra (3ª carta)
--    5 Pontos em dobro · 6 +25 pontos · 7 colecionável rara (ou o marco 7, se sair no dia)
--  1 poder por dia: os poderes da semana ficam reservados (o motor não os sorteia antes) e,
--  se o poder do dia já saiu ou o limite bloqueia, entra o `fallback` (+25 pontos).
--  Motivo gravado: semana1:diaN (+ ':fallback' / ':marco'); detalhes em decisao.semana1.
--
--  Também: estado_cartas devolve `proxima_volta` (gancho do push "carta misteriosa") e
--  `tipo`/`motivo` em a_raspar (medição). Sem mudança de tabela. Só o service role executa.

update public.cartas_config
   set motor = motor || jsonb_build_object('semana1', jsonb_build_object(
         'ativa', true,
         'dias', jsonb_build_object(
           '1', jsonb_build_object('tipo', 'marca'),
           '2', jsonb_build_object('tipo', 'pontos', 'pontos', 25),
           '3', jsonb_build_object('tipo', 'poder', 'subtipo', 'protecao_sequencia'),
           '4', jsonb_build_object('tipo', 'carta_extra'),
           '5', jsonb_build_object('tipo', 'poder', 'subtipo', 'pontos_dobro'),
           '6', jsonb_build_object('tipo', 'pontos', 'pontos', 25),
           '7', jsonb_build_object('tipo', 'rara')),
         'fallback', jsonb_build_object('tipo', 'pontos', 'pontos', 25)))
 where id = 1 and not (motor ? 'semana1');

-- O poder está bloqueado por limite (ou fora do catálogo) neste dia? ────────────
create or replace function public.poder_limitado(p_uid uuid, p_dia date, p_sub text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.cartas_config%rowtype;
  mt jsonb;
  tester boolean;
  armadas integer;
begin
  select * into cfg from public.cartas_config where id = 1;
  mt := cfg.motor;
  tester := p_uid = any(cfg.testers);

  if p_sub = 'protecao_sequencia' then
    armadas := (select count(*) from public.poderes_usuario where user_id = p_uid and tipo = 'protecao_sequencia' and consumido_em is null)
             + (select count(*) from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
                 where cu.user_id = p_uid and cu.raspada_em is null and c.subtipo = 'protecao_sequencia');
    if armadas >= coalesce((mt #>> '{limites,protecao_armadas}')::int, 2) then return true; end if;
  elsif p_sub = 'sequencia_dobro' then
    if exists (select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
                where cu.user_id = p_uid and c.subtipo = 'sequencia_dobro'
                  and cu.dia > p_dia - coalesce((mt #>> '{limites,dobro_dias}')::int, 7)) then return true; end if;
  elsif p_sub = 'scan_antecipado' then
    if exists (select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
                where cu.user_id = p_uid and c.subtipo = 'scan_antecipado'
                  and cu.dia > p_dia - coalesce((mt #>> '{limites,scan_dias}')::int, 7)) then return true; end if;
  elsif p_sub = 'pontos_dobro' then
    if exists (select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
                where cu.user_id = p_uid and c.subtipo in ('pontos_dobro', 'xp_grupo_dobro')
                  and cu.dia > p_dia - coalesce((mt #>> '{limites,pontos_dobro_dias}')::int, 7)) then return true; end if;
  end if;

  return not exists (select 1 from public.cartas_catalogo c where c.ativa and (not c.apenas_teste or tester)
                      and c.familia = 'poder' and c.subtipo = p_sub);
end;
$$;

-- Primeira semana: quantos dias COM rotina até este dia (inclusive) ───────────────
create or replace function public.semana1_dia(p_uid uuid, p_dia date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct dia)::int from public.rotinas_concluidas where user_id = p_uid and dia <= p_dia;
$$;

-- A recompensa de hoje (dia com rotina, N ≤ 7, ainda não entregue) ou null ──────
create or replace function public.semana1_recompensa(p_uid uuid, p_dia date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s jsonb;
  n integer;
  r jsonb;
begin
  select motor -> 'semana1' into s from public.cartas_config where id = 1;
  if s is null or not coalesce((s ->> 'ativa')::boolean, false) then
    return null;
  end if;
  if not exists (select 1 from public.rotinas_concluidas where user_id = p_uid and dia = p_dia) then
    return null;
  end if;
  n := public.semana1_dia(p_uid, p_dia);
  r := s -> 'dias' -> n::text;
  if n < 1 or n > 7 or r is null then
    return null;
  end if;
  if exists (select 1 from public.cartas_usuario where user_id = p_uid and decisao #>> '{semana1,dia}' = n::text) then
    return null;
  end if;
  return r || jsonb_build_object('dia', n);
end;
$$;

-- Poderes reservados para recompensas da semana que ainda não chegaram ──────────
-- (o motor não os sorteia antes: a Proteção do dia 3 não vem repetida no dia 2).
create or replace function public.semana1_reservados(p_uid uuid, p_dia date)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s jsonb;
  n integer;
begin
  select motor -> 'semana1' into s from public.cartas_config where id = 1;
  if s is null or not coalesce((s ->> 'ativa')::boolean, false) then
    return '{}';
  end if;
  n := public.semana1_dia(p_uid, p_dia);
  if n > 7 then
    return '{}';
  end if;
  return coalesce((
    select array_agg(distinct d.value ->> 'subtipo')
      from jsonb_each(s -> 'dias') d
     where d.value ->> 'tipo' = 'poder'
       and d.key ~ '^[0-9]+$' and d.key::int between greatest(n, 1) and 7
       and not exists (select 1 from public.cartas_usuario cu
                        where cu.user_id = p_uid and cu.decisao #>> '{semana1,dia}' = d.key)
  ), '{}');
end;
$$;

-- Hoje (ainda sem rotina) é dia de poder da semana? Então scan/ações não sorteiam
-- poder: o poder do dia fica guardado para a recompensa da rotina. ──────────────
create or replace function public.semana1_guarda_poder(p_uid uuid, p_dia date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s jsonb;
  n integer;
begin
  select motor -> 'semana1' into s from public.cartas_config where id = 1;
  if s is null or not coalesce((s ->> 'ativa')::boolean, false) then
    return false;
  end if;
  if exists (select 1 from public.rotinas_concluidas where user_id = p_uid and dia = p_dia) then
    return false;
  end if;
  n := public.semana1_dia(p_uid, p_dia) + 1;
  return n <= 7 and s #>> array['dias', n::text, 'tipo'] = 'poder';
end;
$$;

-- Grava a recompensa na carta (motivo + decisao.semana1) ─────────────────────────
create or replace function public.semana1_marcar(p_id uuid, p_rec jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.cartas_usuario
     set motivo = 'semana1:dia' || (p_rec ->> 'dia')
                  || case when (p_rec ->> 'fallback')::boolean then ':fallback'
                          when (p_rec ->> 'marco')::boolean then ':marco' else '' end,
         decisao = coalesce(decisao, '{}'::jsonb) || jsonb_build_object('semana1', p_rec)
   where id = p_id;
$$;

-- Qual PODER ela precisa (agora respeitando os poderes reservados da semana 1) ──
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
  reservados text[];
begin
  select * into cfg from public.cartas_config where id = 1;
  mt := cfg.motor;
  reservados := public.semana1_reservados(p_uid, p_dia);

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
    if t = any(reservados) then
      continue;
    end if;
    if public.poder_limitado(p_uid, p_dia, t) then
      bloqueados := bloqueados || t; continue;
    end if;
    return jsonb_build_object('subtipo', t, 'regra', regras[i], 'limite', i > 1 and lista[1] = any(bloqueados),
                              'bloqueados', to_jsonb(bloqueados), 'reservados', to_jsonb(reservados),
                              'armadas', armadas, 'ativos', ativos, 'ultimo_scan', ultimo_scan);
  end loop;
  return jsonb_build_object('subtipo', null, 'bloqueados', to_jsonb(bloqueados), 'reservados', to_jsonb(reservados), 'armadas', armadas);
end;
$$;

-- O motor (igual à fase 1 + a guarda do poder no dia de poder da semana 1) ──────
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
  guarda boolean;
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
  guarda := p_origem <> 'rotina' and public.semana1_guarda_poder(p_uid, p_dia);

  if poder_hoje then
    etapa := 'poder_hoje';
    pct := 0;
  elsif guarda then
    etapa := 'semana1_reserva';
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
    v_motivo := m || ':' || case when poder_hoje then 'poder_hoje→' when guarda then 'semana1_reserva→'
                                 when quer_poder then 'limites→' else 'sorte→' end
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

-- Carta FORÇADA da semana 1 (poder do dia ou rara). Null = não deu (o chamador cai
-- no motor e, se era poder, no fallback). ────────────────────────────────────────
create or replace function public.semana1_carta(p_uid uuid, p_dia date, p_acao text, p_rec jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sub text := p_rec ->> 'subtipo';
  novo uuid;
begin
  if p_rec ->> 'tipo' = 'poder' then
    if exists (select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
                where cu.user_id = p_uid and cu.dia = p_dia and c.familia = 'poder')
       or public.poder_limitado(p_uid, p_dia, sub) then
      return null;
    end if;
    novo := public.dar_carta(p_uid, 'rotina', p_dia, false, 'poder', sub, null, p_acao);
  elsif p_rec ->> 'tipo' = 'rara' then
    novo := public.dar_carta(p_uid, 'rotina', p_dia, true, 'colecionavel', null, null, p_acao);
  end if;
  if novo is not null then
    update public.cartas_usuario
       set decisao = jsonb_build_object('origem', 'rotina', 'acao', p_acao, 'etapa', 'semana1',
                                        'momento', public.momento_usuaria(p_uid, p_dia))
     where id = novo;
  end if;
  return novo;
end;
$$;

-- Rotina concluída → sequência + carta da rotina (com a recompensa da semana 1) +
-- Carta extra + marcos. ─────────────────────────────────────────────────────────
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
  rec jsonb;
  tipo text;
  v_acao text;
  com_marco boolean;
begin
  seq := public.registrar_rotina(p_uid, p_periodo, p_quando);
  d := (seq ->> 'dia')::date;
  zerou := coalesce((seq ->> 'zerou')::boolean, false);
  atual := (seq ->> 'atual')::int;

  if (seq ->> 'nova')::boolean then
    select * into cfg from public.cartas_config where id = 1;
    acfg := cfg.pontos #> '{acoes,rotina}';
    com_marco := jsonb_array_length(coalesce(seq -> 'marcos_novos', '[]'::jsonb)) > 0
                 and coalesce((cfg.pontos #>> '{acoes,marco,ativa}')::boolean, true);
    if coalesce((acfg ->> 'ativa')::boolean, true) then
      if (select count(*) from public.cartas_usuario
           where user_id = p_uid and dia = d and acao in ('rotina:am', 'rotina:pm')) < coalesce((acfg ->> 'por_dia')::int, 2) then
        v_acao := 'rotina:' || p_periodo;
        rec := public.semana1_recompensa(p_uid, d);
        tipo := rec ->> 'tipo';
        novo := null;
        if tipo = 'poder' or (tipo = 'rara' and not com_marco) then
          novo := public.semana1_carta(p_uid, d, v_acao, rec);
          if novo is null and tipo = 'poder' then
            -- Poder do dia já saiu, limite ou fora do catálogo: o fallback (pontos extras).
            rec := (cfg.motor #> '{semana1,fallback}')
                   || jsonb_build_object('dia', rec -> 'dia', 'fallback', true, 'original', rec ->> 'subtipo');
            tipo := rec ->> 'tipo';
          end if;
        end if;
        if novo is null then
          novo := public.dar_carta_motor(p_uid, d, 'rotina', v_acao, zerou, atual);
        end if;
        if novo is not null then
          ids := ids || novo;
          if rec is not null and tipo not in ('carta_extra', 'rara') or (tipo = 'rara' and not com_marco) then
            perform public.semana1_marcar(novo, rec);
          end if;
          -- Carta extra da semana: uma 3ª carta hoje, pelo motor normal.
          if tipo = 'carta_extra' then
            novo := public.dar_carta_motor(p_uid, d, 'rotina', 'semana1:extra', false, atual);
            if novo is not null then
              ids := ids || novo;
              perform public.semana1_marcar(novo, rec);
            end if;
          end if;
        end if;
      end if;
      -- Carta extra (poder): +1 carta no dia em que vale (vem com a 1ª rotina do dia).
      if public.tem_carta_extra(p_uid, d) then
        novo := public.dar_carta_motor(p_uid, d, 'rotina', 'rotina:extra', false, atual);
        if novo is not null then ids := ids || novo; end if;
      end if;
    end if;

    -- Marcos (7, 14, 30): Colecionável rara garantida. No 7º dia da semana 1, a rara do
    -- marco É a recompensa (sem 2ª rara).
    if coalesce((cfg.pontos #>> '{acoes,marco,ativa}')::boolean, true) then
      for m in select * from jsonb_array_elements(seq -> 'marcos_novos') loop
        novo := public.dar_carta(p_uid, 'marco', d, true, 'colecionavel', null,
                                 jsonb_build_object('marco', (m #>> '{}')::int), 'marco:' || (m #>> '{}'));
        if novo is not null then
          update public.cartas_usuario set motivo = 'marco:rara', decisao = jsonb_build_object('marco', (m #>> '{}')::int) where id = novo;
          ids := ids || novo;
          if tipo = 'rara' and com_marco then
            perform public.semana1_marcar(novo, rec || jsonb_build_object('marco', true));
            tipo := null;
          end if;
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object('sequencia', seq, 'cartas', to_jsonb(ids));
end;
$$;

-- Raspar: igual à fase 1 + os pontos extras da semana 1 ─────────────────────────
-- ganhos = (base × rara + bônus) × dobro. `pontos` devolve também bonus e semana1.
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
  bonus integer := 0;
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
    if cu.decisao #>> '{semana1,tipo}' = 'pontos' then
      bonus := greatest(coalesce((cu.decisao #>> '{semana1,pontos}')::int, 0), 0);
    end if;
    v_rara := c.raridade = 'rara';
    v_dobro := exists (select 1 from public.poderes_usuario pd
                        where pd.user_id = p_uid and pd.tipo in ('pontos_dobro', 'xp_grupo_dobro')
                          and pd.dados -> 'dias' ? cu.dia::text);
    ganhos := (base * case when v_rara then coalesce((cfg.pontos ->> 'mult_rara')::int, 3) else 1 end + bonus)
            * case when v_dobro then coalesce((cfg.pontos ->> 'mult_dobro')::int, 2) else 1 end;
  end if;

  update public.cartas_usuario
     set pontos = ganhos,
         decisao = coalesce(decisao, '{}'::jsonb)
                   || jsonb_build_object('pontos', jsonb_build_object('base', base, 'faixa', jsonb_build_array(v_min, v_max),
                                                                      'rara', v_rara, 'dobro', v_dobro, 'bonus', bonus,
                                                                      'ganhos', ganhos, 'legado', cu.acao = 'legado'))
   where id = p_id;

  insert into public.pontos_usuario (user_id) values (p_uid) on conflict do nothing;
  select * into pu from public.pontos_usuario where user_id = p_uid for update;
  nv := public.nivel_de(pu.total + ganhos);
  update public.pontos_usuario
     set total = pu.total + ganhos, nivel = (nv ->> 'nivel')::int, atualizado_em = now()
   where user_id = p_uid;

  resultado := jsonb_build_object('ok', true, 'pontos', jsonb_build_object(
    'ganhos', ganhos, 'base', base, 'rara', v_rara, 'dobro', v_dobro, 'bonus', bonus,
    'semana1', cu.decisao -> 'semana1',
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

-- Estado para o app: + proxima_volta (push "carta misteriosa"), tipo/motivo em
-- a_raspar (medição) e a cota com a Carta extra da semana 1. ────────────────────
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
  anterior date;
  dia_volta date;
  volta_ok boolean;
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
  cota := cota + (select count(*) from public.cartas_usuario where user_id = p_uid and dia = hoje and acao = 'semana1:extra');

  -- Próxima Carta de volta: o 1º dia em que ela sai se não houver rotina até lá, e se
  -- ela de fato sairia (ação ativa, Sequência em dobro no catálogo, limite livre e a
  -- desta ausência ainda não raspada). O app agenda o push local com isso.
  select max(dia) into anterior from public.rotinas_concluidas where user_id = p_uid;
  if anterior is not null then
    dia_volta := anterior + coalesce((cfg.motor #>> '{volta,dias_sem_rotina}')::int, 2) + 1;
    volta_ok := coalesce((cfg.pontos #>> '{acoes,volta,ativa}')::boolean, false)
      and exists (select 1 from public.cartas_catalogo c where c.ativa and (not c.apenas_teste or p_uid = any(cfg.testers))
                   and c.familia = 'poder' and c.subtipo = 'sequencia_dobro')
      and not exists (select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
                       where cu.user_id = p_uid and c.subtipo = 'sequencia_dobro'
                         and cu.acao is distinct from 'volta:' || anterior
                         and cu.dia > dia_volta - coalesce((cfg.motor #>> '{limites,dobro_dias}')::int, 7))
      and not exists (select 1 from public.cartas_usuario
                       where user_id = p_uid and acao = 'volta:' || anterior and raspada_em is not null);
  end if;

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
      select jsonb_agg(jsonb_build_object('id', cu.id, 'origem', cu.origem, 'ganha_em', cu.ganha_em,
                                          'tipo', c.familia || coalesce(':' || c.subtipo, '') || case when c.raridade = 'rara' then ':rara' else '' end,
                                          'motivo', cu.motivo) order by cu.ganha_em)
        from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
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
    'carta_volta', volta,
    'proxima_volta', case when anterior is null then null
                          else jsonb_build_object('dia', dia_volta, 'ultimo_dia', anterior, 'ok', volta_ok) end
  );
end;
$$;

-- Permissões: só o service role (Edge Function `cartas`). ────────────────────────
revoke all on function public.poder_limitado(uuid, date, text) from public, anon, authenticated;
revoke all on function public.semana1_dia(uuid, date) from public, anon, authenticated;
revoke all on function public.semana1_recompensa(uuid, date) from public, anon, authenticated;
revoke all on function public.semana1_reservados(uuid, date) from public, anon, authenticated;
revoke all on function public.semana1_guarda_poder(uuid, date) from public, anon, authenticated;
revoke all on function public.semana1_marcar(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.semana1_carta(uuid, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.escolher_poder(uuid, date, boolean, integer) from public, anon, authenticated;
revoke all on function public.dar_carta_motor(uuid, date, text, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.concluir_rotina(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.raspar_carta(uuid, uuid) from public, anon, authenticated;
revoke all on function public.estado_cartas(uuid) from public, anon, authenticated;
grant execute on function public.poder_limitado(uuid, date, text) to service_role;
grant execute on function public.semana1_dia(uuid, date) to service_role;
grant execute on function public.semana1_recompensa(uuid, date) to service_role;
grant execute on function public.semana1_reservados(uuid, date) to service_role;
grant execute on function public.semana1_guarda_poder(uuid, date) to service_role;
grant execute on function public.semana1_marcar(uuid, jsonb) to service_role;
grant execute on function public.semana1_carta(uuid, date, text, jsonb) to service_role;
grant execute on function public.escolher_poder(uuid, date, boolean, integer) to service_role;
grant execute on function public.dar_carta_motor(uuid, date, text, text, boolean, integer) to service_role;
grant execute on function public.concluir_rotina(uuid, text, timestamptz) to service_role;
grant execute on function public.raspar_carta(uuid, uuid) to service_role;
grant execute on function public.estado_cartas(uuid) to service_role;
