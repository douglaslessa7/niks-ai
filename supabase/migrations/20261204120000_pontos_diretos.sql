-- ─────────────────────────────────────────────────────────────────────────────
-- PONTOS DIRETOS (20261204, build 1.62, pedido do produto): NIKS Points na hora, sem carta;
-- cartas só de PODER, para raspar e descobrir, sem pontos próprios.
--
-- QUEM USA: as contas do "modo pontos" — cartas_config.regras_v2.pontos_diretos =
-- { ativa, todas, contas: [uuid] } (muda sem deploy). Esta migration entra NEUTRA (contas
-- vazia, todas=false): nada muda para ninguém até alguém ser posto na lista. Desligar
-- (`ativa: false`) volta todas às regras v2 de antes, na hora.
--
-- NO MODO PONTOS (contas nas regras v2):
--  • 1º skincare do dia (o check-in também, que passa por concluir_rotina_v2): NIKS Points
--    na hora, evento `skincare_dia` (1 por dia), na faixa da carta Comum (regras_v2.comum:
--    10–50, curva 2,3, média ~22). Nas ocasiões que davam Rara — marco 7/14/30, campeã da
--    semana (consome a pendente), dia 7 da primeira semana, chance de 10% — ×mult_rara
--    (3 → 30–150). Pontos em dobro ativo: ×mult_dobro.
--  • Mais, se o sorteio do dia der PODER (primeira semana dias 1/3/5, Proteção com 3+ dias
--    seguidos e nenhuma guardada, Pontos em dobro 30% 1 vez a cada 7 dias): uma carta de
--    poder (acao 'dia') para raspar no fim do fluxo. Ocasião de Rara e poder valem JUNTOS.
--  • 2º skincare do dia e skincare de dia anterior (fila sem internet): `rotina:am|pm`,
--    15–30, como antes. Check-in, scan e produto no grupo: como antes.
--  • Raspar carta de PODER: 0 pontos próprios; o poder é ativado e o Pontos em dobro
--    continua dobrando os pontos já ganhos no dia (evento `dobro`). Carta de volta (2 dias
--    sem skincare, ao abrir o app) = carta de poder, sem pontos.
--  • Missões: a rara vira NIKS Points ×3 direto (evento `missoes`, 1 por conta), sem carta.
--  • Colecionáveis (Comum/Rara) deixam de ser dadas — mas CONTINUAM ativas no catálogo:
--    v2_ativo exige uma colecionável ativa (sem ela o sistema inteiro desliga).
-- Testada no PGlite (réplica do schema de produção) antes de aplicar.
-- ─────────────────────────────────────────────────────────────────────────────

-- Configuração (só acrescenta a chave se ainda não existir).
update public.cartas_config
   set regras_v2 = regras_v2 || jsonb_build_object('pontos_diretos', jsonb_build_object('ativa', true, 'todas', false, 'contas', '[]'::jsonb))
 where id = 1 and not (regras_v2 ? 'pontos_diretos');

-- Ações novas de pontos: `skincare_dia` (1º skincare do dia) e `missoes` (rara das missões).
alter table public.pontos_eventos drop constraint if exists pontos_eventos_acao;
alter table public.pontos_eventos add constraint pontos_eventos_acao check (acao = any (array[
  'rotina:am', 'rotina:pm', 'checkin_grupo', 'scan_rosto', 'produto_grupo', 'dobro', 'boas_vindas',
  'desafio:1', 'desafio:2', 'desafio:3', 'desafio:4', 'skincare_dia', 'missoes']));

-- A conta está no modo pontos?
create or replace function public.v2_modo_pontos(p_uid uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  c jsonb;
begin
  select regras_v2 -> 'pontos_diretos' into c from public.cartas_config where id = 1;
  if c is null or not coalesce((c ->> 'ativa')::boolean, false) or not public.cartas_v2(p_uid) then
    return false;
  end if;
  return coalesce((c ->> 'todas')::boolean, false)
      or coalesce(c -> 'contas', '[]'::jsonb) ? p_uid::text;
end;
$function$;

-- NIKS Points do 1º skincare do dia: faixa da Comum; ×3 nas ocasiões que davam Rara.
create or replace function public.v2_pontos_skincare_dia(p_uid uuid, p_dia date, p_seq jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  cfg public.cartas_config%rowtype;
  r jsonb;
  marcos jsonb := coalesce(p_seq -> 'marcos_novos', '[]'::jsonb);
  m integer;
  camp record;
  v_camp jsonb;
  rec jsonb;
  v_motivo text;
  sorte_rara numeric;
  base integer;
  v_rara boolean := false;
  v_dobro boolean;
  pts integer;
  novo uuid;
begin
  select * into cfg from public.cartas_config where id = 1;
  r := cfg.regras_v2;

  -- As ocasiões que davam Rara, na ordem de antes: marco → campeã → 1ª semana dia 7 → 10%.
  if jsonb_array_length(marcos) > 0 then
    select max(x::int) into m from jsonb_array_elements_text(marcos) x;
    v_rara := true; v_motivo := 'marco:' || m;
  end if;
  if not v_rara then
    select sv.grupo_id, sv.semana into camp
      from public.semanas_vencidas sv
     where sv.user_id = p_uid and sv.rara_pendente
     order by sv.semana, sv.grupo_id
     limit 1;
    if found then
      v_rara := true; v_motivo := 'campea';
      v_camp := jsonb_build_object('grupo_id', camp.grupo_id, 'semana', camp.semana);
    end if;
  end if;
  if not v_rara then
    rec := public.v2_semana1(p_uid, p_dia);
    if rec is not null and rec ->> 'tipo' = 'rara' then
      v_rara := true; v_motivo := 'semana1:dia' || (rec ->> 'dia');
    end if;
  end if;
  if not v_rara then
    sorte_rara := round((random() * 100)::numeric, 2);
    if sorte_rara < coalesce((r ->> 'rara_pct')::numeric, 10) then
      v_rara := true; v_motivo := 'rara:sorte';
    end if;
  end if;

  base := public.v2_pontos_comum();
  v_dobro := public.v2_dobro_ativo(p_uid, p_dia);
  pts := base * case when v_rara then coalesce((r ->> 'mult_rara')::int, 3) else 1 end
              * case when v_dobro then coalesce((r ->> 'mult_dobro')::int, 2) else 1 end;

  insert into public.pontos_eventos (user_id, dia, acao, pontos, base, dobro, decisao)
  values (p_uid, p_dia, 'skincare_dia', pts, base, v_dobro,
          jsonb_build_object('regras', 2, 'modo', 'pontos', 'rara', v_rara, 'motivo', coalesce(v_motivo, 'comum'),
                             'sorte_rara', sorte_rara, 'faixa', jsonb_build_array((r #>> '{comum,min}')::int, (r #>> '{comum,max}')::int))
          || case when v_camp is not null then jsonb_build_object('campea', v_camp) else '{}'::jsonb end
          || case when v_motivo like 'semana1:%' then jsonb_build_object('semana1', rec) else '{}'::jsonb end)
  on conflict (user_id, dia, acao) do nothing
  returning id into novo;
  if novo is null then
    return null;
  end if;
  -- A Rara da campeã foi entregue (em pontos).
  if v_camp is not null then
    update public.semanas_vencidas set rara_pendente = false
     where user_id = p_uid and grupo_id = (v_camp ->> 'grupo_id')::uuid and semana = (v_camp ->> 'semana')::date;
  end if;
  return jsonb_build_object('acao', 'skincare_dia', 'pontos', pts, 'base', base, 'dobro', v_dobro,
                            'rara', v_rara, 'motivo', coalesce(v_motivo, 'comum'))
         || public.v2_somar(p_uid, pts);
end;
$function$;

-- O PODER do dia (as mesmas regras de v2_escolher para poder), ou null.
create or replace function public.v2_escolher_poder(p_uid uuid, p_dia date, p_seq jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r jsonb;
  atual integer := coalesce((p_seq ->> 'atual')::int, 0);
  rec jsonb;
  sorte numeric;
begin
  select regras_v2 into r from public.cartas_config where id = 1;
  -- Primeira semana: dia 1 dobro · 3 Proteção · 5 dobro (fora do limite).
  rec := public.v2_semana1(p_uid, p_dia);
  if rec is not null and rec ->> 'tipo' = 'poder'
     and public.v2_poder_ok(p_uid, p_dia, rec ->> 'subtipo', coalesce((rec ->> 'fora_do_limite')::boolean, false)) then
    return jsonb_build_object('familia', 'poder', 'subtipo', rec ->> 'subtipo', 'rara', false, 'origem', 'rotina',
                              'motivo', 'semana1:dia' || (rec ->> 'dia'), 'semana1', rec);
  end if;
  -- Proteção: 3+ dias seguidos e nenhuma guardada.
  if atual >= coalesce((r #>> '{protecao,min_sequencia}')::int, 3)
     and public.v2_poder_ok(p_uid, p_dia, 'protecao_sequencia', false) then
    return jsonb_build_object('familia', 'poder', 'subtipo', 'protecao_sequencia', 'rara', false, 'origem', 'rotina',
                              'motivo', 'protecao');
  end if;
  -- Pontos em dobro: liberado (1 a cada 7 dias) → 30%.
  if public.v2_poder_ok(p_uid, p_dia, 'pontos_dobro', false) then
    sorte := round((random() * 100)::numeric, 2);
    if sorte < coalesce((r #>> '{dobro,pct}')::numeric, 30) then
      return jsonb_build_object('familia', 'poder', 'subtipo', 'pontos_dobro', 'rara', false, 'origem', 'rotina',
                                'motivo', 'dobro:sorte', 'sorte', sorte);
    end if;
  end if;
  return null;
end;
$function$;

-- A carta de PODER do dia (acao 'dia', 1 por dia — a Carta de volta também conta), ou null.
create or replace function public.v2_dar_poder_dia(p_uid uuid, p_dia date, p_seq jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  esc jsonb;
  novo uuid;
begin
  if exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_dia and acao is distinct from 'legado'
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


-- concluir_rotina_v2 (produção de 12/nov/2026 + o modo pontos)
CREATE OR REPLACE FUNCTION public.concluir_rotina_v2(p_uid uuid, p_periodo text, p_quando timestamp with time zone DEFAULT now(), p_agora timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Pontos diretos (20261204): 1º skincare de hoje = NIKS Points na hora (+ carta de poder,
  -- se o sorteio der); o resto (2º skincare, dia anterior) = 15–30, como antes.
  if public.v2_modo_pontos(p_uid) then
    if d = hoje and coalesce((seq ->> 'primeira_do_dia')::boolean, false) then
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
$function$
;


-- raspar_carta_v2 (produção de 12/nov/2026 + carta de poder sem pontos no modo pontos)
CREATE OR REPLACE FUNCTION public.raspar_carta_v2(p_uid uuid, p_id uuid, p_agora timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Pontos diretos (20261204): no modo pontos a carta de PODER não dá pontos próprios — só
  -- ativa o poder (e o Pontos em dobro segue dobrando os pontos de hoje, logo abaixo).
  if c.familia = 'poder' and public.v2_modo_pontos(p_uid) then
    base := 0;
    ganhos := 0;
  end if;

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
$function$
;


-- missoes_estado (produção de 12/nov/2026 + a rara em pontos no modo pontos)
CREATE OR REPLACE FUNCTION public.missoes_estado(p_uid uuid, p_agora timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hoje date := public.dia_sessao(p_agora);
  m public.missoes_usuario%rowtype;
  cfg jsonb;
  per jsonb;
  feitos boolean[];
  primeira boolean;
  k integer;
  chave text;
  sem_pontos boolean;
  pts integer;
  soma jsonb;
  ganhos jsonb := '[]'::jsonb;
  nova uuid;
  raspada timestamptz;
begin
  insert into public.missoes_usuario (user_id, iniciadas_em) values (p_uid, p_agora) on conflict do nothing;
  select * into m from public.missoes_usuario where user_id = p_uid for update;
  primeira := m.lido_em is null;

  -- Desafio 3, por período: passos e passos com produto.
  select coalesce(jsonb_object_agg(periodo, jsonb_build_object('passos', total, 'com_produto', com)), '{}'::jsonb)
    into per
    from (select periodo, count(*) as total,
                 count(*) filter (where colecao_item_id is not null or product_scan_id is not null
                                     or produto_catalogo_id is not null) as com
            from public.minha_rotina_passos
           where user_id = p_uid
           group by periodo) x;

  feitos := array[
    exists (select 1 from public.product_scans where user_id = p_uid),
    exists (select 1 from public.colecao_produtos where user_id = p_uid),
    exists (select 1 from jsonb_each(per) e
             where (e.value ->> 'passos')::int > 0 and (e.value ->> 'passos')::int = (e.value ->> 'com_produto')::int),
    exists (select 1 from public.rotinas_concluidas where user_id = p_uid)
  ];

  select desafios into cfg from public.cartas_config where id = 1;
  for k in 1..4 loop
    chave := k::text;
    continue when not feitos[k] or m.desafios ? chave;
    -- Já estava feito na 1ª leitura, ou a única rotina veio do histórico do celular / é antiga.
    sem_pontos := primeira or (k = 4 and not exists (
      select 1 from public.rotinas_concluidas
       where user_id = p_uid and origem = 'app' and concluida_em >= m.iniciadas_em));
    if sem_pontos then
      m.desafios := m.desafios || jsonb_build_object(chave, jsonb_build_object('em', p_agora, 'pontos', 0));
    elsif public.cartas_v2(p_uid) and public.v2_ativo(p_uid) then
      pts := greatest(coalesce((cfg ->> chave)::int, 0), 0);
      insert into public.pontos_eventos (user_id, dia, acao, pontos, base, dobro, decisao)
      values (p_uid, hoje, 'desafio:' || chave, pts, pts, false, jsonb_build_object('origem', 'desafio'))
      on conflict (user_id, dia, acao) do nothing;
      if found then
        soma := public.v2_somar(p_uid, pts);
        ganhos := ganhos || (jsonb_build_object('desafio', k, 'pontos', pts) || soma);
      end if;
      m.desafios := m.desafios || jsonb_build_object(chave, jsonb_build_object('em', p_agora, 'pontos', pts));
    end if;
  end loop;

  -- Concluído não volta atrás (ex.: tirou o produto da estante).
  for k in 1..4 loop
    feitos[k] := feitos[k] or m.desafios ? k::text;
  end loop;

  if feitos[1] and feitos[2] and feitos[3] and feitos[4] and m.concluidas_em is null then
    m.concluidas_em := p_agora;
  end if;
  update public.missoes_usuario
     set desafios = m.desafios, lido_em = coalesce(lido_em, p_agora), concluidas_em = m.concluidas_em
   where user_id = p_uid;

  -- Pontos diretos (20261204): no modo pontos a rara vira NIKS Points ×3 direto (evento
  -- `missoes`, 1 por conta), sem carta.
  if m.concluidas_em is not null and m.carta_id is null and public.cartas_v2(p_uid) and public.v2_modo_pontos(p_uid) then
    if not exists (select 1 from public.pontos_eventos where user_id = p_uid and acao = 'missoes') then
      pts := public.v2_pontos_comum()
             * coalesce((select (regras_v2 ->> 'mult_rara')::int from public.cartas_config where id = 1), 3)
             * case when public.v2_dobro_ativo(p_uid, hoje)
                    then coalesce((select (regras_v2 ->> 'mult_dobro')::int from public.cartas_config where id = 1), 2) else 1 end;
      insert into public.pontos_eventos (user_id, dia, acao, pontos, base, dobro, decisao)
      values (p_uid, hoje, 'missoes', pts, pts, public.v2_dobro_ativo(p_uid, hoje),
              jsonb_build_object('regras', 2, 'modo', 'pontos', 'origem', 'missoes', 'rara', true))
      on conflict (user_id, dia, acao) do nothing;
      if found then
        soma := public.v2_somar(p_uid, pts);
        ganhos := ganhos || (jsonb_build_object('missoes', true, 'rara', true, 'pontos', pts) || soma);
      end if;
    end if;
  -- A rara: uma vez por conta, nas regras novas.
  elsif m.concluidas_em is not null and m.carta_id is null and public.cartas_v2(p_uid) then
    nova := public.dar_carta(p_uid, 'missoes', hoje, true, 'colecionavel', null, '{"missoes": 3}'::jsonb, 'missoes');
    if nova is not null then
      update public.cartas_usuario
         set motivo = 'missoes:rara', decisao = jsonb_build_object('regras', 2, 'origem', 'missoes')
       where id = nova;
      update public.missoes_usuario set carta_id = nova where user_id = p_uid returning * into m;
    end if;
  end if;

  -- Não vence: enquanto não raspada, o dia acompanha hoje (a raspagem recusa dia passado).
  if m.carta_id is not null then
    update public.cartas_usuario set dia = hoje where id = m.carta_id and raspada_em is null and dia < hoje;
    select raspada_em into raspada from public.cartas_usuario where id = m.carta_id;
  end if;

  return jsonb_build_object(
    'iniciadas_em', m.iniciadas_em,
    'guia_visto_em', m.guia_visto_em,
    'concluidas_em', m.concluidas_em,
    'd1', feitos[1],
    'd2', feitos[2],
    'd3', feitos[3],
    'd4', feitos[4],
    'periodos', per,
    'ganhos', ganhos,
    -- Pontos diretos: o prêmio das missões em pontos (no lugar da carta), quando já saiu.
    'premio', (select jsonb_build_object('pontos', pe.pontos, 'em', pe.criado_em)
                 from public.pontos_eventos pe where pe.user_id = p_uid and pe.acao = 'missoes' limit 1),
    'carta', case when m.carta_id is null then null
                  else jsonb_build_object('id', m.carta_id, 'raspada', raspada is not null) end
  );
end;
$function$
;


-- estado_cartas_v2 (produção de 12/nov/2026 + modo_pontos, pontos_hoje, skincare_hoje)
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
    'carta_volta', volta,
    'proxima_volta', case when anterior is null then null
                          else jsonb_build_object('dia', dia_volta, 'ultimo_dia', anterior, 'ok', volta_ok) end
  );
end;
$function$
;


-- Só a service role (as funções `cartas`/`grupos` chamam com ela).
revoke all on function public.v2_modo_pontos(uuid) from public, anon, authenticated;
revoke all on function public.v2_pontos_skincare_dia(uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.v2_escolher_poder(uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.v2_dar_poder_dia(uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.concluir_rotina_v2(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.raspar_carta_v2(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.missoes_estado(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.estado_cartas_v2(uuid, timestamptz) from public, anon, authenticated;
