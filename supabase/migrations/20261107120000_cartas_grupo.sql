-- Fase 3 (grupos) · 3.3 — CARTAS DO GRUPO
--
--   • Check-in no grupo dá carta: ação `checkin_grupo` ligada (1 por dia, a do 1º check-in
--     do dia — mesmo estando em vários grupos; o teto `por_dia` e o índice único
--     (user_id, dia, acao) garantem). Passa pelo motor normal (1 poder por dia etc.).
--   • Produto compartilhado no grupo: ação `produto_grupo` ligada (1 por dia) — entregue
--     pela folha "Compartilhar com o grupo" (3.6).
--   • Campeã da semana: toda segunda 04:05 (Brasília), `premiar_semana()` olha a semana
--     anterior (segunda→domingo, dias de sessão) de cada grupo: quem fez mais check-ins
--     (≥ 1) ganha uma COLECIONÁVEL RARA (origem `campea`); empate = todas ganham. Fica em
--     `semanas_vencidas` ("N semanas vencidas" do ranking). Convidada campeã: a semana
--     conta, e a carta dela (a de paywall) chega na Parte B.
--   Catálogo real continua INATIVO para o público: sem carta ativa, nada é entregue (sem
--   erro); testers recebem as cartas de teste.

update public.cartas_config
   set pontos = jsonb_set(jsonb_set(jsonb_set(pontos,
         '{acoes,checkin_grupo,ativa}', 'true'),
         '{acoes,produto_grupo,ativa}', 'true'),
         '{acoes,campea}', coalesce(pontos #> '{acoes,campea}', '{"min": 15, "max": 30, "ativa": true}'::jsonb))
 where id = 1;

alter table public.cartas_usuario drop constraint if exists cartas_usuario_origem;
alter table public.cartas_usuario add constraint cartas_usuario_origem check (origem in (
  'rotina', 'sos', 'surpresa', 'grupo', 'marco', 'volta', 'scan_rosto', 'checkin_grupo', 'produto_grupo', 'campea'
));

-- Check-in (3.2) + a carta do dia do check-in. A carta nunca derruba o check-in.
create or replace function public.publicar_checkin(p_uid uuid, p_foto_path text, p_rotina text, p_grupos uuid[], p_hora_exibida timestamptz)
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
  insert into public.checkins (user_id, foto_path, rotina, capturado_em, hora_exibida, dia)
  values (p_uid, p_foto_path, p_rotina, agora, hx, d)
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

-- Campeãs da semana anterior a `p_hoje` (por padrão, a de hoje em dia de sessão). ──
-- Idempotente: rodar de novo não dá outra carta nem outra semana vencida.
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
    -- Convidada (não paga): a carta dela é a de paywall, que chega na Parte B.
    if r.tipo <> 'convidada' or public.assinante(r.user_id) then
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
    insert into public.semanas_vencidas (grupo_id, semana, user_id, checkins, carta_id)
    values (r.grupo_id, v_semana, r.user_id, r.n, carta)
    on conflict do nothing;
    campeas := campeas + 1;
  end loop;
  return jsonb_build_object('semana', v_semana, 'campeas', campeas, 'cartas', cartas);
end;
$$;

revoke all on function public.publicar_checkin(uuid, text, text, uuid[], timestamptz) from public, anon, authenticated;
revoke all on function public.premiar_semana(date) from public, anon, authenticated;
grant execute on function public.publicar_checkin(uuid, text, text, uuid[], timestamptz) to service_role;
grant execute on function public.premiar_semana(date) to service_role;

-- Toda segunda 04:05 de Brasília (07:05 UTC). Idempotente (desagenda antes).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'premiar-semana-grupos';
    perform cron.schedule('premiar-semana-grupos', '5 7 * * 1', 'select public.premiar_semana()');
  end if;
end $$;
