-- ─────────────────────────────────────────────────────────────────────────────
-- Motor de cartas CALCULADO (substitui o sorteio por família na carta da rotina).
--
-- O servidor olha o MOMENTO da usuária e decide o tipo de carta que ela precisa; para ela
-- continua parecendo surpresa. A sorte fica só na raridade das colecionáveis.
--
-- Momentos (prioridade): voltando > em_risco > nova > constante > padrao
--   voltando  3+ dias inteiros sem rotina e voltou hoje → Sequência em dobro garantida
--   em_risco  faltou ≥ 1 dia nos 3 anteriores           → Poder garantido (pela necessidade)
--   nova      primeiros 7 dias desde a 1ª rotina        → 70% Poder · 30% não-poder
--   constante 7+ dias seguidos de rotina                → 50% · 50%
--   padrao    o resto                                   → 50% · 50%
-- Não-poder = 70% Colecionável · 30% Dica (Conhecimento educativa).
-- Poder pela necessidade: perdeu a sequência → dobro · sequência ≥ 3 sem proteção →
-- proteção · a 1–2 dias de um marco → carta extra · engajada com o scan travado → scan
-- antecipado · senão o recebido há mais tempo. Limites: 2 proteções armadas; 1 dobro e 1
-- scan antecipado a cada 7 dias. Bateu o limite → o próximo da lista; todos → não-poder.
-- Só a 1ª carta do dia tem garantia (a 2ª, de Carta extra, segue só a % do momento).
-- Marcos 7/14/30: Colecionável rara garantida.
-- Raridade: só colecionável pode ser rara (check no catálogo).
-- Cada carta entregue grava o MOTIVO ("em_risco:protecao") e as entradas da decisão.
-- Todos os números em cartas_config.motor (editáveis sem deploy).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.cartas_config add column if not exists motor jsonb not null default '{
  "nova":        {"dias": 7, "poder_pct": 70},
  "em_risco":    {"janela_dias": 3},
  "voltando":    {"dias_sem_rotina": 3},
  "constante":   {"dias": 7, "poder_pct": 50},
  "padrao":      {"poder_pct": 50},
  "nao_poder":   {"colecionavel": 70, "dica": 30},
  "engajada":    {"dias_ativos": 5, "janela": 7},
  "marco_perto": [1, 2],
  "limites":     {"protecao_armadas": 2, "dobro_dias": 7, "scan_dias": 7}
}'::jsonb;

alter table public.cartas_usuario add column if not exists motivo text;
alter table public.cartas_usuario add column if not exists decisao jsonb;

-- Só colecionável pode ser rara. (As cartas de teste fora disso são corrigidas antes,
-- por id; sem isso esta trava não entra.)
alter table public.cartas_catalogo drop constraint if exists cartas_catalogo_rara_so_colecionavel;
alter table public.cartas_catalogo add constraint cartas_catalogo_rara_so_colecionavel
  check (raridade = 'normal' or familia = 'colecionavel');

-- registrar_rotina: igual à da F2, agora devolvendo `zerou` = começou uma sequência
-- nova tendo uma antes (perdeu a sequência, sem proteção cobrindo). ──────────────
create or replace function public.registrar_rotina(p_uid uuid, p_periodo text, p_quando timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := public.dia_sessao(p_quando);
  inserida boolean;
  primeira boolean;
  s public.sequencias%rowtype;
  inc integer := 1;
  novos integer[] := '{}';
  m integer;
  cfg_marcos integer[];
  zerou boolean := false;
begin
  if p_periodo not in ('am', 'pm') then
    raise exception 'periodo inválido';
  end if;

  insert into public.rotinas_concluidas (user_id, dia, periodo, concluida_em)
  values (p_uid, d, p_periodo, p_quando)
  on conflict do nothing;
  get diagnostics inserida = row_count;

  insert into public.sequencias (user_id) values (p_uid) on conflict do nothing;
  select * into s from public.sequencias where user_id = p_uid for update;

  primeira := inserida and not exists (
    select 1 from public.rotinas_concluidas
     where user_id = p_uid and dia = d and periodo <> p_periodo
  );

  if not primeira or (s.ultimo_dia is not null and d <= s.ultimo_dia) then
    return jsonb_build_object('nova', inserida, 'primeira_do_dia', false, 'dia', d,
                              'atual', s.atual, 'recorde', s.recorde, 'marcos_novos', '[]'::jsonb, 'zerou', false);
  end if;

  perform public.avaliar_sequencia(p_uid, d);
  select * into s from public.sequencias where user_id = p_uid;

  if exists (
    select 1 from public.poderes_usuario
     where user_id = p_uid and tipo = 'sequencia_dobro'
       and dados -> 'dias' ? d::text
  ) then
    inc := 2;
  end if;

  if s.ultimo_dia is null or s.atual = 0 or d - s.ultimo_dia > 1 then
    zerou := s.ultimo_dia is not null;
    s.atual := inc;
    s.marcos := '{}';
  else
    s.atual := s.atual + inc;
  end if;

  select marcos into cfg_marcos from public.cartas_config where id = 1;
  foreach m in array coalesce(cfg_marcos, '{7,14,30}') loop
    if s.atual >= m and not (m = any(s.marcos)) then
      novos := novos || m;
      s.marcos := s.marcos || m;
    end if;
  end loop;

  update public.sequencias
     set atual = s.atual,
         recorde = greatest(s.recorde, s.atual),
         ultimo_dia = d,
         marcos = s.marcos,
         atualizada_em = now()
   where user_id = p_uid
  returning * into s;

  return jsonb_build_object('nova', true, 'primeira_do_dia', true, 'dia', d,
                            'atual', s.atual, 'recorde', s.recorde, 'marcos_novos', to_jsonb(novos), 'zerou', zerou);
end;
$$;

-- dar_carta: agora também escolhe um PODER específico (p_subtipo) e só sorteia rara em
-- colecionável (as outras famílias são sempre normais). Usada pelo motor e pelas origens
-- futuras (surpresa, grupo, SOS), que continuam com os pesos de cartas_config.pesos. ──
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

  -- Rara: só colecionável.
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

  insert into public.cartas_usuario (user_id, carta_id, origem, dia, conteudo)
  values (p_uid, carta, p_origem, p_dia, p_conteudo)
  returning id into novo;
  return novo;
end;
$$;

-- O MOMENTO da usuária no dia de sessão `p_dia` (a rotina do dia já registrada). ──
-- Só conta dias a partir da 1ª rotina (antes de começar não é falta).
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
    when anterior is not null and sem_rotina >= coalesce((mt #>> '{voltando,dias_sem_rotina}')::int, 3) then 'voltando'
    when faltas >= 1 then 'em_risco'
    when p_dia - primeiro < coalesce((mt #>> '{nova,dias}')::int, 7) then 'nova'
    when seguidos >= coalesce((mt #>> '{constante,dias}')::int, 7) then 'constante'
    else 'padrao'
  end;

  return jsonb_build_object('momento', momento, 'dias_desde_inicio', p_dia - primeiro, 'faltas', faltas,
                            'dias_sem_rotina', sem_rotina, 'seguidos', seguidos);
end;
$$;

-- Qual PODER ela precisa, respeitando os limites e o catálogo. ───────────────────
-- Devolve { subtipo, regra, candidatos } ou subtipo nulo (todos no limite).
-- `p_primeiro` força um poder no topo da lista (Voltando → sequencia_dobro).
create or replace function public.escolher_poder(p_uid uuid, p_dia date, p_zerou boolean, p_atual integer, p_primeiro text default null)
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
  if p_primeiro is not null then lista := lista || p_primeiro; regras := regras || 'dobro'::text; end if;
  if p_zerou then lista := lista || 'sequencia_dobro'::text; regras := regras || 'perdeu'::text; end if;
  if p_atual >= 3 and armadas = 0 then lista := lista || 'protecao_sequencia'::text; regras := regras || 'protecao'::text; end if;
  if perto then lista := lista || 'carta_extra'::text; regras := regras || 'marco_perto'::text; end if;
  if ativos >= coalesce((mt #>> '{engajada,dias_ativos}')::int, 5)
     and ultimo_scan is not null and p_dia - ultimo_scan < 7 and not scan_armado then
    lista := lista || 'scan_antecipado'::text; regras := regras || 'scan'::text;
  end if;
  -- 5. O recebido há mais tempo (nunca recebido primeiro).
  for t in
    select s.sub from unnest(array['sequencia_dobro', 'protecao_sequencia', 'carta_extra', 'scan_antecipado']) with ordinality s(sub, o)
     order by (select max(cu.dia) from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
                where cu.user_id = p_uid and c.subtipo = s.sub) asc nulls first, s.o
  loop
    lista := lista || t; regras := regras || 'mais_antigo'::text;
  end loop;

  for i in 1..array_length(lista, 1) loop
    t := lista[i];
    -- Limites.
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
    -- Precisa existir no catálogo para ela.
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

-- O motor: decide e entrega UMA carta da rotina, gravando o motivo. ─────────────
create or replace function public.dar_carta_motor(p_uid uuid, p_dia date, p_garantia boolean, p_zerou boolean, p_atual integer)
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
  pct numeric;
  sorte numeric := round((random() * 100)::numeric, 2);
  sorte2 numeric;
  sorte_rara numeric;
  poder jsonb;
  quer_poder boolean;
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

  if p_garantia and m in ('voltando', 'em_risco') then
    quer_poder := true;
    pct := 100;
  else
    pct := coalesce((mt #>> array[case when m in ('nova', 'constante') then m else 'padrao' end, 'poder_pct'])::numeric, 50);
    quer_poder := sorte < pct;
  end if;

  if quer_poder then
    poder := public.escolher_poder(p_uid, p_dia, p_zerou, p_atual,
                                   case when p_garantia and m = 'voltando' then 'sequencia_dobro' end);
    if poder ->> 'subtipo' is not null then
      fam := 'poder'; sub := poder ->> 'subtipo';
      v_motivo := m || ':' || case when not (p_garantia and m in ('voltando', 'em_risco')) then 'sorte→poder:' else '' end
              || case when (poder ->> 'limite')::boolean then 'limite→' else '' end
              || case poder ->> 'regra'
                   when 'dobro' then 'dobro' when 'perdeu' then 'dobro'
                   when 'protecao' then 'protecao' when 'marco_perto' then 'carta_extra' when 'scan' then 'scan'
                   else 'mais_antigo:' || sub end;
    end if;
  end if;

  if fam is null then
    sorte2 := round((random() * 100)::numeric, 2);
    fam := case when sorte2 < coalesce((mt #>> '{nao_poder,colecionavel}')::numeric, 70) then 'colecionavel' else 'conhecimento' end;
    if fam = 'colecionavel' then
      sorte_rara := round((random() * 100)::numeric, 2);
      rara := sorte_rara < cfg.rara_pct;
    end if;
    v_motivo := m || ':' || case when quer_poder then 'limites→' else 'sorte→' end
            || case when fam = 'colecionavel' then 'colecionavel' else 'dica' end;
  end if;

  novo := public.dar_carta(p_uid, 'rotina', p_dia, rara, fam, sub);
  -- Sem a família escolhida no catálogo: a outra não-poder.
  if novo is null and fam <> 'poder' then
    fam := case when fam = 'colecionavel' then 'conhecimento' else 'colecionavel' end;
    novo := public.dar_carta(p_uid, 'rotina', p_dia, false, fam, null);
    v_motivo := v_motivo || ':catalogo→' || fam;
  end if;
  if novo is null then
    return null;
  end if;

  update public.cartas_usuario
     set motivo = v_motivo,
         decisao = jsonb_build_object('momento', mom, 'garantia', p_garantia, 'zerou', p_zerou, 'sequencia', p_atual,
                                      'poder_pct', pct, 'sorte', sorte, 'sorte_nao_poder', sorte2, 'sorte_rara', sorte_rara,
                                      'rara_pct', cfg.rara_pct, 'poder', poder)
   where id = novo;
  return novo;
end;
$$;

-- Rotina concluída → sequência + carta(s) do dia pelo MOTOR + colecionável rara nos marcos.
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
    select cartas_por_dia into cota from public.cartas_config where id = 1;
    if public.tem_carta_extra(p_uid, d) then cota := cota + 1; end if;
    select count(*) into dadas from public.cartas_usuario where user_id = p_uid and dia = d and origem = 'rotina';
    while dadas < cota loop
      -- Só a 1ª carta do dia tem a garantia do momento.
      novo := public.dar_carta_motor(p_uid, d, dadas = 0, coalesce((seq ->> 'zerou')::boolean, false), (seq ->> 'atual')::int);
      exit when novo is null;
      ids := ids || novo;
      dadas := dadas + 1;
    end loop;

    -- Marcos (7, 14, 30): Colecionável rara garantida.
    for m in select * from jsonb_array_elements(seq -> 'marcos_novos') loop
      novo := public.dar_carta(p_uid, 'marco', d, true, 'colecionavel', null, jsonb_build_object('marco', (m #>> '{}')::int));
      if novo is not null then
        update public.cartas_usuario set motivo = 'marco:rara', decisao = jsonb_build_object('marco', (m #>> '{}')::int) where id = novo;
        ids := ids || novo;
      end if;
    end loop;
  end if;

  return jsonb_build_object('sequencia', seq, 'cartas', to_jsonb(ids));
end;
$$;

revoke all on function public.registrar_rotina(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.dar_carta(uuid, text, date, boolean, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.momento_usuaria(uuid, date) from public, anon, authenticated;
revoke all on function public.escolher_poder(uuid, date, boolean, integer, text) from public, anon, authenticated;
revoke all on function public.dar_carta_motor(uuid, date, boolean, boolean, integer) from public, anon, authenticated;
revoke all on function public.concluir_rotina(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.registrar_rotina(uuid, text, timestamptz) to service_role;
grant execute on function public.dar_carta(uuid, text, date, boolean, text, text, jsonb) to service_role;
grant execute on function public.momento_usuaria(uuid, date) to service_role;
grant execute on function public.escolher_poder(uuid, date, boolean, integer, text) to service_role;
grant execute on function public.dar_carta_motor(uuid, date, boolean, boolean, integer) to service_role;
grant execute on function public.concluir_rotina(uuid, text, timestamptz) to service_role;
