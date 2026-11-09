-- ─────────────────────────────────────────────────────────────────────────────
-- Cartas — REGRAS NOVAS (v2, 05/nov/2026): "faça seu skincare, raspe a carta do dia,
-- ganhe pontos e suba de nível. No grupo, vence quem fizer mais check-ins."
--
-- QUEM USA: só as contas marcadas em `cartas_regras` (versao 2). A marca é feita pela
-- função `cartas` quando o app NOVO chama com `regras: 2`. Contas sem a marca (o app da
-- loja) seguem EXATAMENTE as regras de antes: as funções antigas ficam como estão e os
-- gatilhos/rotinas do servidor (scan, check-in, produto no grupo, campeã) só tomam o
-- caminho novo para quem está marcada.
--
-- REGRAS (todos os números em cartas_config.regras_v2, mudam sem deploy):
--  • 1 CARTA POR DIA, no 1º skincare do dia (check-in também conta como skincare). Não
--    acumula: carta não raspada vence na virada das 04:00 (só a de HOJE aparece para
--    raspar). Nunca mais de uma para raspar.
--  • Qual carta sai, em ordem: (1) Carta de volta — 2+ dias inteiros sem skincare → ao
--    abrir o app, Pontos em dobro (fora do limite semanal); é a carta do dia e o skincare
--    desse dia dá só pontos · (2) marco 7/14/30 ou campeã da semana → a carta do dia sai
--    Rara · (3) primeira semana (dias COM skincare): 1 Pontos em dobro, 3 Proteção, 5
--    Pontos em dobro (fora do limite), 7 Rara · (4) Proteção com 3+ dias seguidos e
--    nenhuma guardada (máx. 1) · (5) Pontos em dobro, 1 a cada 7 dias, 30% quando liberado
--    · (6) Rara 10% · (7) Comum.
--  • Toda carta dá NIKS Points ao raspar: Comum 10–50 (média ~22, altos mais raros),
--    Rara ×3. Pontos em dobro: 2 dias (o da carta e o seguinte), dobra TODOS os pontos,
--    inclusive a própria carta e os pontos sem carta já ganhos no dia.
--  • PONTOS SEM CARTA (sem raspar): 2º skincare do dia 15–30, check-in 10–20 (1/dia), scan
--    de rosto 40–60 (1 a cada 7 dias), produto no grupo 10–20 (1/dia) → `pontos_eventos`.
--  • Check-in registra o skincare daquele período e a sequência, se ainda não estiverem
--    registrados. Nada conta duas vezes.
--  • Catálogo: Sequência em dobro, Scan antecipado e Carta extra DESATIVADOS.
--  • Catálogo real inativo (ou sem carta para ela) = sistema desligado para ela: a
--    sequência conta, mas não sai carta nem ponto (igual às regras antigas).
-- Funções novas com `p_agora` (padrão now()) para os testes simularem dias.
-- Só o service role executa. Testado no PGlite (ver README → Sistema de cartas).
-- ─────────────────────────────────────────────────────────────────────────────

-- Configuração ────────────────────────────────────────────────────────────────────
alter table public.cartas_config add column if not exists regras_v2 jsonb not null default '{
  "comum":     {"min": 10, "max": 50, "curva": 2.3},
  "mult_rara": 3,
  "mult_dobro": 2,
  "rara_pct":  10,
  "dobro":     {"pct": 30, "janela_dias": 7, "dias": 2},
  "protecao":  {"min_sequencia": 3, "max_guardadas": 1},
  "volta":     {"ativa": true, "dias_sem_rotina": 2},
  "semana1":   {"ativa": true, "dias": {
                  "1": {"tipo": "poder", "subtipo": "pontos_dobro"},
                  "3": {"tipo": "poder", "subtipo": "protecao_sequencia"},
                  "5": {"tipo": "poder", "subtipo": "pontos_dobro", "fora_do_limite": true},
                  "7": {"tipo": "rara"}}},
  "sem_carta": {
    "rotina":        {"min": 15, "max": 30, "ativa": true},
    "checkin_grupo": {"min": 10, "max": 20, "ativa": true},
    "scan_rosto":    {"min": 40, "max": 60, "janela_dias": 7, "ativa": true},
    "produto_grupo": {"min": 10, "max": 20, "ativa": true}
  }
}'::jsonb;

-- Quem já usa as regras novas ─────────────────────────────────────────────────────
create table if not exists public.cartas_regras (
  user_id  uuid primary key references public.users(id) on delete cascade,
  versao   integer not null default 2,
  desde    timestamptz not null default now(),
  constraint cartas_regras_versao check (versao in (1, 2))
);
alter table public.cartas_regras enable row level security;   -- sem política: só o service role

-- Pontos sem carta (e o bônus do Pontos em dobro sobre o que já foi ganho no dia) ───
create table if not exists public.pontos_eventos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  dia               date not null,                 -- dia de sessão (vira às 04:00)
  acao              text not null,
  pontos            integer not null,
  base              integer not null default 0,
  dobro             boolean not null default false,
  carta_usuario_id  uuid references public.cartas_usuario(id) on delete set null,
  decisao           jsonb,
  criado_em         timestamptz not null default now(),
  constraint pontos_eventos_pontos check (pontos >= 0),
  constraint pontos_eventos_acao check (acao in ('rotina:am', 'rotina:pm', 'checkin_grupo', 'scan_rosto', 'produto_grupo', 'dobro'))
);
create unique index if not exists pontos_eventos_acao_uq on public.pontos_eventos (user_id, dia, acao);
alter table public.pontos_eventos enable row level security;
drop policy if exists pontos_eventos_select_own on public.pontos_eventos;
create policy pontos_eventos_select_own on public.pontos_eventos
  for select to authenticated using (auth.uid() = user_id);

-- Campeã da semana (regras novas): a próxima carta do dia sai Rara ──────────────────
alter table public.semanas_vencidas add column if not exists rara_pendente boolean not null default false;

-- Catálogo: só Comum, Rara e os poderes Proteção e Pontos em dobro ─────────────────
-- (vale para o real e o de teste; o real continua inativo até a ativação, por id).
update public.cartas_catalogo
   set ativa = false, atualizada_em = now()
 where familia = 'poder' and subtipo in ('sequencia_dobro', 'scan_antecipado', 'carta_extra') and ativa;
update public.cartas_catalogo
   set texto = 'Por 2 dias, todos os seus pontos valem o dobro', atualizada_em = now()
 where familia = 'poder' and subtipo = 'pontos_dobro'
   and texto is distinct from 'Por 2 dias, todos os seus pontos valem o dobro';

-- ── Funções ──────────────────────────────────────────────────────────────────────

create or replace function public.cartas_v2(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.cartas_regras where user_id = p_uid and versao >= 2);
$$;

-- O app novo chamou: a conta passa às regras novas (de vez). Devolve se mudou agora.
create or replace function public.marcar_regras_v2(p_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.cartas_regras (user_id, versao) values (p_uid, 2)
  on conflict (user_id) do update set versao = 2, desde = now() where public.cartas_regras.versao < 2;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Sistema ligado para ela: há colecionável ativa no catálogo que ela pode receber.
create or replace function public.v2_ativo(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cartas_catalogo c, public.cartas_config cfg
     where cfg.id = 1 and c.ativa and c.familia = 'colecionavel'
       and (not c.apenas_teste or p_uid = any(cfg.testers))
  );
$$;

-- Pontos de uma carta: 10–50, com os altos mais raros (min + ⌊(max−min+1)·u^curva⌋).
create or replace function public.v2_pontos_comum()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c jsonb;
  mn integer;
  mx integer;
  k numeric;
begin
  select regras_v2 -> 'comum' into c from public.cartas_config where id = 1;
  mn := coalesce((c ->> 'min')::int, 10);
  mx := greatest(coalesce((c ->> 'max')::int, 50), mn);
  k := greatest(coalesce((c ->> 'curva')::numeric, 2.3), 0.01);
  return least(mx, mn + floor((mx - mn + 1) * power(random(), k))::int);
end;
$$;

create or replace function public.v2_dobro_ativo(p_uid uuid, p_dia date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.poderes_usuario
                  where user_id = p_uid and tipo in ('pontos_dobro', 'xp_grupo_dobro') and dados -> 'dias' ? p_dia::text);
$$;

create or replace function public.v2_protecoes_guardadas(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.poderes_usuario
   where user_id = p_uid and tipo = 'protecao_sequencia' and consumido_em is null;
$$;

-- O poder pode sair hoje? (catálogo + regra própria). `p_fora_limite`: o Pontos em dobro
-- da volta e do dia 5 ignora o limite semanal (mas nunca sai com outro dobro valendo).
create or replace function public.v2_poder_ok(p_uid uuid, p_dia date, p_sub text, p_fora_limite boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.cartas_config%rowtype;
  r jsonb;
begin
  select * into cfg from public.cartas_config where id = 1;
  r := cfg.regras_v2;
  if not exists (select 1 from public.cartas_catalogo c
                  where c.ativa and (not c.apenas_teste or p_uid = any(cfg.testers))
                    and c.familia = 'poder' and c.subtipo = p_sub) then
    return false;
  end if;
  if p_sub = 'protecao_sequencia' then
    return public.v2_protecoes_guardadas(p_uid) < coalesce((r #>> '{protecao,max_guardadas}')::int, 1);
  elsif p_sub = 'pontos_dobro' then
    if public.v2_dobro_ativo(p_uid, p_dia) then
      return false;
    end if;
    return p_fora_limite or not exists (
      select 1 from public.cartas_usuario cu join public.cartas_catalogo c on c.id = cu.carta_id
       where cu.user_id = p_uid and c.subtipo in ('pontos_dobro', 'xp_grupo_dobro')
         and cu.dia > p_dia - coalesce((r #>> '{dobro,janela_dias}')::int, 7));
  end if;
  return false;
end;
$$;

-- Soma pontos no total (e o nível) ─────────────────────────────────────────────────
create or replace function public.v2_somar(p_uid uuid, p_pontos integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pu public.pontos_usuario%rowtype;
  nv jsonb;
begin
  insert into public.pontos_usuario (user_id) values (p_uid) on conflict do nothing;
  select * into pu from public.pontos_usuario where user_id = p_uid for update;
  nv := public.nivel_de(pu.total + greatest(p_pontos, 0));
  update public.pontos_usuario
     set total = pu.total + greatest(p_pontos, 0), nivel = (nv ->> 'nivel')::int, atualizado_em = now()
   where user_id = p_uid;
  return jsonb_build_object('total_antes', pu.total, 'total', pu.total + greatest(p_pontos, 0),
                            'nivel_antes', (public.nivel_de(pu.total) ->> 'nivel')::int,
                            'nivel', (nv ->> 'nivel')::int, 'titulo', nv ->> 'titulo');
end;
$$;

-- Pontos SEM carta: 2º skincare do dia, check-in, scan de rosto, produto no grupo ───
-- Devolve { acao, pontos, base, dobro, total_antes, total, nivel_antes, nivel, titulo } ou
-- null (sistema desligado, ação desligada, já ganhou no dia/janela).
create or replace function public.v2_pontos_acao(p_uid uuid, p_acao text, p_dia date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  if chave <> 'rotina' and exists (select 1 from public.cartas_usuario
                                     where user_id = p_uid and origem = chave
                                       and dia > p_dia - coalesce((acfg ->> 'janela_dias')::int, 1)) then
    return null;
  end if;
  if acfg ? 'janela_dias' and exists (select 1 from public.pontos_eventos
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
$$;

-- Primeira semana (regras novas): a recompensa de hoje, se for dia com skincare N ≤ 7
-- ainda não entregue. Usa o mesmo marcador das regras antigas (decisao.semana1.dia).
create or replace function public.v2_semana1(p_uid uuid, p_dia date)
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
  select regras_v2 -> 'semana1' into s from public.cartas_config where id = 1;
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

-- Qual carta sai (prioridades 2 a 7; a 1, Carta de volta, é dada ao abrir o app) ────
-- Devolve { familia, subtipo, rara, origem, motivo, conteudo, semana1?, campea? }.
create or replace function public.v2_escolher(p_uid uuid, p_dia date, p_seq jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cfg public.cartas_config%rowtype;
  r jsonb;
  atual integer := coalesce((p_seq ->> 'atual')::int, 0);
  marcos jsonb := coalesce(p_seq -> 'marcos_novos', '[]'::jsonb);
  m integer;
  camp record;
  rec jsonb;
  sorte numeric;
  sorte_rara numeric;
begin
  select * into cfg from public.cartas_config where id = 1;
  r := cfg.regras_v2;

  -- 2) Marco de 7, 14 ou 30 dias (o maior que saiu hoje) → Rara.
  if jsonb_array_length(marcos) > 0 then
    select max(x::int) into m from jsonb_array_elements_text(marcos) x;
    return jsonb_build_object('familia', 'colecionavel', 'rara', true, 'origem', 'marco',
                              'motivo', 'marco:' || m, 'conteudo', jsonb_build_object('marco', m));
  end if;
  -- 2) Campeã da semana (pendente) → Rara.
  select sv.grupo_id, sv.semana, sv.checkins, g.nome into camp
    from public.semanas_vencidas sv left join public.grupos g on g.id = sv.grupo_id
   where sv.user_id = p_uid and sv.rara_pendente
   order by sv.semana, sv.grupo_id
   limit 1;
  if found then
    return jsonb_build_object('familia', 'colecionavel', 'rara', true, 'origem', 'campea', 'motivo', 'campea',
                              'conteudo', jsonb_build_object('grupo_id', camp.grupo_id, 'grupo', camp.nome,
                                                             'semana', camp.semana, 'checkins', camp.checkins),
                              'campea', jsonb_build_object('grupo_id', camp.grupo_id, 'semana', camp.semana));
  end if;

  -- 3) Primeira semana (dias COM skincare): 1 dobro · 3 Proteção · 5 dobro (fora do limite) · 7 Rara.
  rec := public.v2_semana1(p_uid, p_dia);
  if rec is not null then
    if rec ->> 'tipo' = 'rara' then
      return jsonb_build_object('familia', 'colecionavel', 'rara', true, 'origem', 'rotina',
                                'motivo', 'semana1:dia' || (rec ->> 'dia'), 'semana1', rec);
    elsif rec ->> 'tipo' = 'poder'
          and public.v2_poder_ok(p_uid, p_dia, rec ->> 'subtipo', coalesce((rec ->> 'fora_do_limite')::boolean, false)) then
      return jsonb_build_object('familia', 'poder', 'subtipo', rec ->> 'subtipo', 'rara', false, 'origem', 'rotina',
                                'motivo', 'semana1:dia' || (rec ->> 'dia'), 'semana1', rec);
    end if;
  end if;

  -- 4) Proteção: 3+ dias seguidos e nenhuma guardada.
  if atual >= coalesce((r #>> '{protecao,min_sequencia}')::int, 3)
     and public.v2_poder_ok(p_uid, p_dia, 'protecao_sequencia', false) then
    return jsonb_build_object('familia', 'poder', 'subtipo', 'protecao_sequencia', 'rara', false, 'origem', 'rotina',
                              'motivo', 'protecao');
  end if;

  -- 5) Pontos em dobro: liberado (1 a cada 7 dias) → 30%.
  if public.v2_poder_ok(p_uid, p_dia, 'pontos_dobro', false) then
    sorte := round((random() * 100)::numeric, 2);
    if sorte < coalesce((r #>> '{dobro,pct}')::numeric, 30) then
      return jsonb_build_object('familia', 'poder', 'subtipo', 'pontos_dobro', 'rara', false, 'origem', 'rotina',
                                'motivo', 'dobro:sorte', 'sorte', sorte);
    end if;
  end if;

  -- 6) Rara 10% · 7) Comum.
  sorte_rara := round((random() * 100)::numeric, 2);
  if sorte_rara < coalesce((r ->> 'rara_pct')::numeric, 10) then
    return jsonb_build_object('familia', 'colecionavel', 'rara', true, 'origem', 'rotina', 'motivo', 'rara:sorte',
                              'sorte', sorte, 'sorte_rara', sorte_rara);
  end if;
  return jsonb_build_object('familia', 'colecionavel', 'rara', false, 'origem', 'rotina', 'motivo', 'comum',
                            'sorte', sorte, 'sorte_rara', sorte_rara);
end;
$$;

-- A carta do dia (1 por dia: acao 'dia', índice único). Null = já tem carta hoje ou o
-- catálogo não tem carta para ela.
create or replace function public.v2_dar_carta_dia(p_uid uuid, p_dia date, p_seq jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  esc jsonb;
  novo uuid;
  v_motivo text;
begin
  if exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_dia and acao is distinct from 'legado') then
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
$$;

-- Skincare concluído (app ou check-in) → sequência + a carta do dia (1º skincare de
-- hoje) ou os pontos do skincare sem carta. Nada conta duas vezes: o período já
-- registrado não faz nada. Rotina de um dia anterior (fila sem internet) dá só pontos.
create or replace function public.concluir_rotina_v2(p_uid uuid, p_periodo text, p_quando timestamptz default now(),
                                                     p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  seq jsonb;
  d date;
  hoje date := public.dia_sessao(p_agora);
  carta uuid;
  pts jsonb;
begin
  seq := public.registrar_rotina(p_uid, p_periodo, p_quando);
  if not coalesce((seq ->> 'nova')::boolean, false) then
    return jsonb_build_object('sequencia', seq, 'carta', null, 'pontos', null);
  end if;
  if not public.v2_ativo(p_uid) then
    return jsonb_build_object('sequencia', seq, 'carta', null, 'pontos', null);
  end if;
  d := (seq ->> 'dia')::date;
  if d = hoje then
    carta := public.v2_dar_carta_dia(p_uid, d, seq);
  end if;
  if carta is null then
    pts := public.v2_pontos_acao(p_uid, 'rotina:' || p_periodo, d);
  end if;
  return jsonb_build_object('sequencia', seq, 'carta', carta, 'pontos', pts);
end;
$$;

-- Carta de volta (prioridade 1): 2+ dias inteiros sem skincare → ao abrir o app,
-- Pontos em dobro como carta do dia (fora do limite semanal). 1 por ausência.
create or replace function public.v2_carta_volta(p_uid uuid, p_hoje date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  anterior date;
  sem integer;
  novo uuid;
begin
  select regras_v2 into r from public.cartas_config where id = 1;
  if not coalesce((r #>> '{volta,ativa}')::boolean, true) or not public.v2_ativo(p_uid) then
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
  if sem < coalesce((r #>> '{volta,dias_sem_rotina}')::int, 2) then
    return null;
  end if;

  -- Serializa com o skincare (mesma trava de registrar_rotina).
  insert into public.sequencias (user_id) values (p_uid) on conflict do nothing;
  perform 1 from public.sequencias where user_id = p_uid for update;
  if exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_hoje and acao is distinct from 'legado')
     or exists (select 1 from public.cartas_usuario
                 where user_id = p_uid and (acao = 'volta:' || anterior or (origem = 'volta' and decisao ->> 'anterior' = anterior::text))) then
    return null;
  end if;
  if not public.v2_poder_ok(p_uid, p_hoje, 'pontos_dobro', true) then
    return null;
  end if;

  novo := public.dar_carta(p_uid, 'volta', p_hoje, false, 'poder', 'pontos_dobro', null, 'dia');
  if novo is not null then
    update public.cartas_usuario
       set motivo = 'volta:dobro',
           decisao = jsonb_build_object('regras', 2, 'origem', 'volta', 'anterior', anterior, 'dias_sem_rotina', sem,
                                        'fora_do_limite', true)
     where id = novo;
  end if;
  return novo;
end;
$$;

-- Raspar (regras novas): só a carta de HOJE (a de outro dia venceu às 04:00) ─────────
-- Pontos = Comum (10–50) × Rara (3) × Pontos em dobro (2). A carta que liga o Pontos em
-- dobro também dobra, e os pontos sem carta já ganhos hoje dobram (evento 'dobro').
-- Devolve { ok, pontos: {ganhos, base, rara, dobro, bonus_dobro, sem_carta_hoje,
--           total_antes, total, nivel_antes, nivel, titulo}, poder? } ou { ok:false, vencida }.
create or replace function public.raspar_carta_v2(p_uid uuid, p_id uuid, p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.cartas_config%rowtype;
  cu public.cartas_usuario%rowtype;
  c public.cartas_catalogo%rowtype;
  hoje date := public.dia_sessao(p_agora);
  dias integer;
  p public.poderes_usuario%rowtype;
  liga_dobro boolean;
  base integer;
  v_rara boolean;
  v_dobro boolean;
  ganhos integer;
  bonus integer := 0;
  ids uuid[];
  som jsonb;
  resultado jsonb;
begin
  select * into cu from public.cartas_usuario where id = p_id and user_id = p_uid for update;
  if not found then
    raise exception 'carta não encontrada';
  end if;
  if cu.raspada_em is not null then
    return jsonb_build_object('ok', true, 'ja_raspada', true);
  end if;
  if cu.dia < hoje then
    return jsonb_build_object('ok', false, 'vencida', true);
  end if;

  select * into cfg from public.cartas_config where id = 1;
  select * into c from public.cartas_catalogo where id = cu.carta_id;
  update public.cartas_usuario set raspada_em = p_agora where id = p_id;

  liga_dobro := c.familia = 'poder' and c.subtipo = 'pontos_dobro';
  dias := greatest(coalesce((cfg.regras_v2 #>> '{dobro,dias}')::int, (c.efeito ->> 'dias')::int, 2), 1);
  if c.familia = 'poder' then
    if liga_dobro then
      -- Hoje e o dia seguinte (2 dias de sessão).
      insert into public.poderes_usuario (user_id, carta_usuario_id, tipo, fim, dados)
      select p_uid, p_id, 'pontos_dobro', ((hoje + dias) + time '04:00') at time zone 'America/Sao_Paulo',
             jsonb_build_object('dias', jsonb_agg((hoje + g)::text))
        from generate_series(0, dias - 1) g
      returning * into p;
    else
      insert into public.poderes_usuario (user_id, carta_usuario_id, tipo, fim, dados)
      values (p_uid, p_id, c.subtipo, null, '{}'::jsonb)
      returning * into p;
    end if;
  end if;

  base := public.v2_pontos_comum();
  v_rara := c.raridade = 'rara';
  v_dobro := public.v2_dobro_ativo(p_uid, cu.dia);
  ganhos := base * case when v_rara then coalesce((cfg.regras_v2 ->> 'mult_rara')::int, 3) else 1 end
                 * case when v_dobro then coalesce((cfg.regras_v2 ->> 'mult_dobro')::int, 2) else 1 end;

  -- O dobro recém-ligado vale para TODOS os pontos de hoje: os sem carta já ganhos dobram.
  if liga_dobro then
    select coalesce(sum(pontos), 0), array_agg(id) into bonus, ids
      from public.pontos_eventos
     where user_id = p_uid and dia = hoje and not dobro and acao <> 'dobro';
    bonus := bonus * (coalesce((cfg.regras_v2 ->> 'mult_dobro')::int, 2) - 1);
    if bonus > 0 then
      insert into public.pontos_eventos (user_id, dia, acao, pontos, base, dobro, carta_usuario_id, decisao)
      values (p_uid, hoje, 'dobro', bonus, bonus, true, p_id, jsonb_build_object('eventos', to_jsonb(ids)))
      on conflict (user_id, dia, acao) do nothing;
      if not found then
        bonus := 0;
      else
        update public.pontos_eventos set dobro = true where id = any(ids);
      end if;
    end if;
  end if;

  update public.cartas_usuario
     set pontos = ganhos,
         decisao = coalesce(decisao, '{}'::jsonb)
                   || jsonb_build_object('pontos', jsonb_build_object('base', base, 'rara', v_rara, 'dobro', v_dobro,
                                                                      'ganhos', ganhos, 'bonus_dobro', bonus))
   where id = p_id;
  som := public.v2_somar(p_uid, ganhos + bonus);

  resultado := jsonb_build_object('ok', true, 'pontos', jsonb_build_object(
    'ganhos', ganhos, 'base', base, 'rara', v_rara, 'dobro', v_dobro, 'bonus_dobro', bonus,
    'sem_carta_hoje', (select coalesce(sum(pontos), 0) from public.pontos_eventos where user_id = p_uid and dia = hoje))
    || som);
  if p.id is not null then
    resultado := resultado || jsonb_build_object('poder', jsonb_build_object('tipo', p.tipo, 'fim', p.fim, 'dados', p.dados));
  end if;
  return resultado;
end;
$$;

-- Estado para o app novo ───────────────────────────────────────────────────────────
-- carta_hoje.estado: 'bloqueada' (sem skincare hoje) · 'pronta' (para raspar) · 'feita'
-- (raspada, ou skincare feito sem carta). a_raspar = só a de hoje (no máximo 1).
create or replace function public.estado_cartas_v2(p_uid uuid, p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
   where cu.user_id = p_uid and cu.dia = hoje and cu.acao is distinct from 'legado'
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
    'faixas', jsonb_build_object('carta', jsonb_build_object('min', (r #>> '{comum,min}')::int, 'max', (r #>> '{comum,max}')::int))
              || coalesce((select jsonb_object_agg(a.key, jsonb_build_object('min', (a.value ->> 'min')::int, 'max', (a.value ->> 'max')::int))
                             from jsonb_each(r -> 'sem_carta') a where coalesce((a.value ->> 'ativa')::boolean, true)), '{}'::jsonb),
    'ativo', public.v2_ativo(p_uid),
    'carta_volta', volta,
    'proxima_volta', case when anterior is null then null
                          else jsonb_build_object('dia', dia_volta, 'ultimo_dia', anterior, 'ok', volta_ok) end
  );
end;
$$;

-- ── Caminhos do servidor: regras novas só para quem está marcada ─────────────────

-- Check-in: + registra o skincare do período (carta do dia ou pontos) e dá os pontos do
-- check-in (1/dia). Contas sem a marca: igual a 20261109120000.
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
      rot := public.concluir_rotina_v2(p_uid, p_rotina, agora, agora);
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

-- Produto no grupo: pontos (1/dia) no lugar da carta. Contas sem a marca: igual a 20261110120000.
create or replace function public.compartilhar_produto(p_uid uuid, p_scan uuid, p_grupos uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  d date := public.dia_sessao(now());
  validos uuid[];
  novos uuid[];
  carta uuid;
  pts jsonb;
begin
  select ps.id, ps.image_path, coalesce(nullif(btrim(ps.produto_nome), ''), 'um produto') nome
    into s from public.product_scans ps where ps.id = p_scan and ps.user_id = p_uid;
  if s.id is null or s.image_path is null then
    return jsonb_build_object('ok', false, 'motivo', 'produto');
  end if;
  select coalesce(array_agg(distinct g), '{}') into validos
    from unnest(coalesce(p_grupos, '{}')) g where public.grupo_integrante(g, p_uid);
  if cardinality(validos) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'grupos');
  end if;

  with ins as (
    insert into public.compartilhamentos (user_id, grupo_id, origem, referencia, product_scan_id, foto_path, titulo, dia)
    select p_uid, g, 'produto', s.id::text, s.id, s.image_path, left(s.nome, 120), d from unnest(validos) g
    on conflict (grupo_id, product_scan_id) where product_scan_id is not null do nothing
    returning grupo_id)
  select coalesce(array_agg(grupo_id), '{}') into novos from ins;

  if cardinality(novos) > 0 then
    if public.cartas_v2(p_uid) then
      begin
        pts := public.v2_pontos_acao(p_uid, 'produto_grupo', d);
      exception when others then
        raise warning 'compartilhar_produto: pontos falharam (scan % salvo mesmo assim): %', p_scan, sqlerrm;
      end;
      return jsonb_build_object('ok', true, 'grupos', to_jsonb(validos), 'novos', cardinality(novos), 'carta_id', null,
                                'pontos', pts);
    end if;
    begin
      carta := public.dar_carta_acao(p_uid, 'produto_grupo', d);
    exception when others then
      raise warning 'compartilhar_produto: carta falhou (scan % salvo mesmo assim): %', p_scan, sqlerrm;
      carta := null;
    end;
  end if;
  return jsonb_build_object('ok', true, 'grupos', to_jsonb(validos), 'novos', cardinality(novos), 'carta_id', carta);
end;
$$;

-- Scan de rosto: pontos (1 a cada 7 dias) no lugar da carta. NUNCA bloqueia o scan.
create or replace function public.dar_carta_scan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if public.cartas_v2(new.user_id) then
      perform public.v2_pontos_acao(new.user_id, 'scan_rosto', public.dia_sessao(coalesce(new.created_at, now())));
    else
      perform public.dar_carta_acao(new.user_id, 'scan_rosto', public.dia_sessao(coalesce(new.created_at, now())));
    end if;
  exception when others then
    raise warning 'dar_carta_scan falhou (scan % salvo mesmo assim): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Campeã da semana: com as regras novas, a próxima carta do dia dela sai Rara (sem carta
-- a mais). Contas sem a marca: igual a 20261107120000.
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
    -- Convidada (não paga): a carta dela é a de paywall, que chega na Parte B.
    if r.tipo <> 'convidada' or public.assinante(r.user_id) then
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

-- Permissões: só o service role. ─────────────────────────────────────────────────
revoke all on function public.cartas_v2(uuid) from public, anon, authenticated;
revoke all on function public.marcar_regras_v2(uuid) from public, anon, authenticated;
revoke all on function public.v2_ativo(uuid) from public, anon, authenticated;
revoke all on function public.v2_pontos_comum() from public, anon, authenticated;
revoke all on function public.v2_dobro_ativo(uuid, date) from public, anon, authenticated;
revoke all on function public.v2_protecoes_guardadas(uuid) from public, anon, authenticated;
revoke all on function public.v2_poder_ok(uuid, date, text, boolean) from public, anon, authenticated;
revoke all on function public.v2_somar(uuid, integer) from public, anon, authenticated;
revoke all on function public.v2_pontos_acao(uuid, text, date) from public, anon, authenticated;
revoke all on function public.v2_semana1(uuid, date) from public, anon, authenticated;
revoke all on function public.v2_escolher(uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.v2_dar_carta_dia(uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.concluir_rotina_v2(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.v2_carta_volta(uuid, date) from public, anon, authenticated;
revoke all on function public.raspar_carta_v2(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.estado_cartas_v2(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.publicar_checkin(uuid, text, text, uuid[], timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.compartilhar_produto(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.dar_carta_scan() from public, anon, authenticated;
revoke all on function public.premiar_semana(date) from public, anon, authenticated;
grant execute on function public.cartas_v2(uuid) to service_role;
grant execute on function public.marcar_regras_v2(uuid) to service_role;
grant execute on function public.v2_ativo(uuid) to service_role;
grant execute on function public.v2_pontos_comum() to service_role;
grant execute on function public.v2_dobro_ativo(uuid, date) to service_role;
grant execute on function public.v2_protecoes_guardadas(uuid) to service_role;
grant execute on function public.v2_poder_ok(uuid, date, text, boolean) to service_role;
grant execute on function public.v2_somar(uuid, integer) to service_role;
grant execute on function public.v2_pontos_acao(uuid, text, date) to service_role;
grant execute on function public.v2_semana1(uuid, date) to service_role;
grant execute on function public.v2_escolher(uuid, date, jsonb) to service_role;
grant execute on function public.v2_dar_carta_dia(uuid, date, jsonb) to service_role;
grant execute on function public.concluir_rotina_v2(uuid, text, timestamptz, timestamptz) to service_role;
grant execute on function public.v2_carta_volta(uuid, date) to service_role;
grant execute on function public.raspar_carta_v2(uuid, uuid, timestamptz) to service_role;
grant execute on function public.estado_cartas_v2(uuid, timestamptz) to service_role;
grant execute on function public.publicar_checkin(uuid, text, text, uuid[], timestamptz, text, text) to service_role;
grant execute on function public.compartilhar_produto(uuid, uuid, uuid[]) to service_role;
grant execute on function public.premiar_semana(date) to service_role;
