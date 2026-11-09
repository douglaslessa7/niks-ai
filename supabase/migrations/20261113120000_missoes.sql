-- ═══════════════════════════════════════════════════════════════════════════
-- Desafios práticos do primeiro acesso (08/nov/2026; primeira versão em 06/nov) + carta rara.
--
-- Depois do tour, 4 desafios guiados, medidos nos DADOS REAIS:
--   1. Escanear um produto — alguma linha em `product_scans`;
--   2. Colocar na estante — algum produto em `colecao_produtos`;
--   3. Produtos na rotina — todos os passos de UM período (manhã ou noite) com produto
--      (`minha_rotina_passos`: colecao_item_id, product_scan_id ou produto_catalogo_id);
--   4. Fazer o skincare — alguma linha em `rotinas_concluidas`.
-- O check-in no grupo saiu das missões.
--
-- PONTOS: cada desafio paga UMA vez, na hora (`cartas_config.desafios`: 20, 20, 30 e 30; sem
-- Pontos em dobro, para o total não passar de 100). O que já estava feito na PRIMEIRA leitura
-- da conta conta como concluído, sem pontos (`lido_em` marca essa leitura). A rotina que chega
-- pelo histórico do celular depois disso também não paga. Sem catálogo ativo, nenhum ponto é
-- pago (a mesma regra dos outros pontos): o desafio fica pendente e paga quando ligar.
-- Depois de concluído, o desafio não volta atrás (tirar o produto da estante não desfaz).
--
-- CARTA RARA: concluídos os 4 → UMA por conta (pk de `missoes_usuario`), na hora, como carta
-- EXTRA: `acao = 'missoes'`, fora da regra de 1 carta por dia — a carta do dia, a Carta de
-- volta e o "carta de hoje" do estado passam a ignorá-la (as 3 funções abaixo são as da
-- 20261112120000 com só esse filtro a mais). Ela não vence: enquanto não raspada, o `dia`
-- acompanha hoje. Sem carta ativa no catálogo, a rara fica pendente e sai numa chamada seguinte.
--
-- Também guarda se ela já começou os desafios (`guia_visto_em`; o tour continua em
-- `users.home_tutorial_seen_at`, só contas novas) e libera `'guiado'` em
-- `users.rotina_intro_status` (o desafio da rotina substitui a intro da aba Rotina).
-- Só service role (Edge Function `cartas`, ação `missoes`). Idempotente (roda 2× sem erro).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.missoes_usuario (
  user_id       uuid primary key references public.users (id) on delete cascade,
  iniciadas_em  timestamptz not null default now(),
  guia_visto_em timestamptz,
  concluidas_em timestamptz,
  carta_id      uuid references public.cartas_usuario (id) on delete set null,
  lido_em       timestamptz,                    -- 1ª leitura: o que já estava feito não paga
  desafios      jsonb not null default '{}'::jsonb -- {"1": {"em": …, "pontos": 20}, …}
);
alter table public.missoes_usuario enable row level security;
revoke all on public.missoes_usuario from anon, authenticated;

alter table public.cartas_usuario drop constraint if exists cartas_usuario_origem;
alter table public.cartas_usuario add constraint cartas_usuario_origem check (origem in (
  'rotina', 'sos', 'surpresa', 'grupo', 'marco', 'volta', 'scan_rosto', 'checkin_grupo', 'produto_grupo', 'campea', 'missoes'
));

-- Os pontos de cada desafio. A lista repete a da 20261114120000 (boas_vindas), que roda depois.
alter table public.pontos_eventos drop constraint if exists pontos_eventos_acao;
alter table public.pontos_eventos add constraint pontos_eventos_acao check (acao in (
  'rotina:am', 'rotina:pm', 'checkin_grupo', 'scan_rosto', 'produto_grupo', 'dobro', 'boas_vindas',
  'desafio:1', 'desafio:2', 'desafio:3', 'desafio:4'
));

-- Valores sem deploy (soma no máximo ~100).
alter table public.cartas_config add column if not exists desafios jsonb not null default
  '{"1": 20, "2": 20, "3": 30, "4": 30}'::jsonb;

alter table public.users drop constraint if exists users_rotina_intro_status_check;
alter table public.users add constraint users_rotina_intro_status_check
  check (rotina_intro_status in ('escanear', 'sem_produtos', 'depois', 'guiado'));

-- ── As 3 funções que procuram "a carta de hoje": ignoram a das missões ──────────────

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
  if exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_dia and acao is distinct from 'legado'
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
$$;

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
  if exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_hoje and acao is distinct from 'legado'
                and acao is distinct from 'missoes')
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

-- ── Missões ─────────────────────────────────────────────────────────────────────────

create or replace function public.missoes_estado(p_uid uuid, p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- A rara: uma vez por conta, nas regras novas.
  if m.concluidas_em is not null and m.carta_id is null and public.cartas_v2(p_uid) then
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
    'carta', case when m.carta_id is null then null
                  else jsonb_build_object('id', m.carta_id, 'raspada', raspada is not null) end
  );
end;
$$;

-- Ela começou os desafios ('guia'): ele não abre sozinho de novo. Idempotente (guarda
-- a 1ª vez).
create or replace function public.missoes_marcar(p_uid uuid, p_o text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_o is distinct from 'guia' then
    raise exception 'marca inválida';
  end if;
  insert into public.missoes_usuario (user_id) values (p_uid) on conflict do nothing;
  update public.missoes_usuario set guia_visto_em = coalesce(guia_visto_em, now()) where user_id = p_uid;
end;
$$;

revoke all on function public.missoes_estado(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.missoes_marcar(uuid, text) from public, anon, authenticated;
grant execute on function public.missoes_estado(uuid, timestamptz) to service_role;
grant execute on function public.missoes_marcar(uuid, text) to service_role;
