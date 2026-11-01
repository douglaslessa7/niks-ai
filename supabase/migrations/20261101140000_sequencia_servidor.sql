-- ─────────────────────────────────────────────────────────────────────────────
-- Sistema de cartas (F2): a SEQUÊNCIA passa a morar no servidor.
--
-- Até aqui ela vivia só no celular (AsyncStorage `routine_history`, lib/routineProgress).
-- Os poderes "Proteção de sequência" e "Sequência em dobro" precisam dela aqui.
--
-- Um número só: dias ativos seguidos (o dia conta com a rotina da manhã OU da noite).
-- +1 por dia ativo; +2 nos dias cobertos por "Sequência em dobro". É o número da chama
-- da home, do hub, do calendário e da tela de rotina concluída.
--
-- O DIA vira às 04:00 em Brasília, igual ao app (`sessionDate`): a rotina da noite feita
-- à 00:30 conta para o dia anterior. Ver dia_sessao().
--
-- Proteção de sequência: cobre exatamente 1 dia perdido e é consumida sozinha. Com 2 ou
-- mais dias perdidos seguidos ela é gasta e a sequência zera mesmo assim.
--
-- Só a função `cartas` (service role) grava; ela lê as próprias linhas.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rotinas_concluidas (
  user_id       uuid not null references public.users(id) on delete cascade,
  dia           date not null,                -- dia de sessão
  periodo       text not null,
  concluida_em  timestamptz not null default now(),
  origem        text not null default 'app',  -- 'app' | 'historico' (subido do celular uma vez)
  primary key (user_id, dia, periodo),
  constraint rotinas_concluidas_periodo check (periodo in ('am', 'pm')),
  constraint rotinas_concluidas_origem check (origem in ('app', 'historico'))
);

alter table public.rotinas_concluidas enable row level security;

drop policy if exists rotinas_concluidas_select_own on public.rotinas_concluidas;
create policy rotinas_concluidas_select_own on public.rotinas_concluidas
  for select to authenticated using (auth.uid() = user_id);

create table if not exists public.sequencias (
  user_id        uuid primary key references public.users(id) on delete cascade,
  atual          integer not null default 0,
  recorde        integer not null default 0,
  ultimo_dia     date,                          -- último dia que manteve a sequência
  marcos         integer[] not null default '{}', -- marcos (7/14/30) já premiados NESTA sequência
  atualizada_em  timestamptz not null default now()
);

alter table public.sequencias enable row level security;

drop policy if exists sequencias_select_own on public.sequencias;
create policy sequencias_select_own on public.sequencias
  for select to authenticated using (auth.uid() = user_id);

alter table public.users add column if not exists historico_migrado_em timestamptz;

-- Dia de sessão: vira às 04:00 em Brasília ──────────────────────────────────
create or replace function public.dia_sessao(p_quando timestamptz)
returns date
language sql
immutable
set search_path = public
as $$
  select ((p_quando at time zone 'America/Sao_Paulo') - interval '4 hours')::date
$$;

-- Aplica dias perdidos: proteção (1 dia) ou zera. Idempotente; chamada ao abrir o app
-- e antes de cada rotina nova. `p_hoje` = dia de sessão de referência.
create or replace function public.avaliar_sequencia(p_uid uuid, p_hoje date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sequencias%rowtype;
  perdidos integer;
  escudo uuid;
begin
  select * into s from public.sequencias where user_id = p_uid for update;
  if not found or s.ultimo_dia is null or s.atual = 0 then
    return;
  end if;

  perdidos := (p_hoje - s.ultimo_dia) - 1;     -- dias inteiros sem rotina entre o último e hoje
  if perdidos <= 0 then
    return;
  end if;

  select id into escudo
    from public.poderes_usuario
   where user_id = p_uid and tipo = 'protecao_sequencia' and consumido_em is null
   order by inicio
   limit 1
   for update;

  if escudo is not null then
    update public.poderes_usuario
       set consumido_em = now(),
           dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object('dia_coberto', s.ultimo_dia + 1)
     where id = escudo;
  end if;

  if escudo is not null and perdidos = 1 then
    -- O dia perdido fica coberto: a sequência segue (sem somar).
    update public.sequencias set ultimo_dia = s.ultimo_dia + 1, atualizada_em = now() where user_id = p_uid;
  else
    update public.sequencias set atual = 0, marcos = '{}', atualizada_em = now() where user_id = p_uid;
  end if;
end;
$$;

-- Registra uma rotina concluída e atualiza a sequência ───────────────────────
-- Devolve: { nova, primeira_do_dia, dia, atual, recorde, marcos_novos }.
-- Rotina de um dia ANTERIOR ao último contado (fila offline fora de ordem) só é gravada.
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
                              'atual', s.atual, 'recorde', s.recorde, 'marcos_novos', '[]'::jsonb);
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
                            'atual', s.atual, 'recorde', s.recorde, 'marcos_novos', to_jsonb(novos));
end;
$$;

-- Sobe o histórico do celular UMA vez (até 60 dias) e recalcula a sequência ──
-- `p_dias` = [{ "dia": "AAAA-MM-DD", "am": true, "pm": false }, …]. Os marcos já
-- alcançados contam como premiados (não dão cartas retroativas).
create or replace function public.sincronizar_historico(p_uid uuid, p_dias jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := public.dia_sessao(now());
  r record;
  atual integer := 0;
  recorde integer := 0;
  ultimo date;
  marcos integer[] := '{}';
  m integer;
  cfg_marcos integer[];
begin
  if (select historico_migrado_em from public.users where id = p_uid) is not null then
    return jsonb_build_object('ja_sincronizado', true);
  end if;

  insert into public.rotinas_concluidas (user_id, dia, periodo, concluida_em, origem)
  select p_uid, x.dia, x.per, (x.dia + time '12:00') at time zone 'America/Sao_Paulo', 'historico'
    from (
      select (e->>'dia')::date as dia, p.per
        from jsonb_array_elements(coalesce(p_dias, '[]'::jsonb)) e
        cross join lateral (values ('am'), ('pm')) p(per)
       where (e->>p.per)::boolean is true
         and e->>'dia' ~ '^\d{4}-\d{2}-\d{2}$'
    ) x
   where x.dia between hoje - 60 and hoje
  on conflict do nothing;

  -- Recalcula do zero, dia a dia.
  for r in select distinct dia from public.rotinas_concluidas where user_id = p_uid order by dia loop
    if ultimo is not null and r.dia - ultimo = 1 then
      atual := atual + 1;
    else
      atual := 1;
    end if;
    ultimo := r.dia;
    recorde := greatest(recorde, atual);
  end loop;

  -- Sequência quebrada antes de hoje (ontem sem rotina) = 0.
  if ultimo is null or hoje - ultimo > 1 then
    atual := 0;
  end if;

  select c.marcos into cfg_marcos from public.cartas_config c where c.id = 1;
  foreach m in array coalesce(cfg_marcos, '{7,14,30}') loop
    if atual >= m then marcos := marcos || m; end if;
  end loop;

  insert into public.sequencias (user_id, atual, recorde, ultimo_dia, marcos)
  values (p_uid, atual, recorde, ultimo, marcos)
  on conflict (user_id) do update
    set atual = excluded.atual, recorde = greatest(public.sequencias.recorde, excluded.recorde),
        ultimo_dia = excluded.ultimo_dia, marcos = excluded.marcos, atualizada_em = now();

  update public.users set historico_migrado_em = now() where id = p_uid;

  return jsonb_build_object('ja_sincronizado', false, 'atual', atual, 'recorde', recorde);
end;
$$;

revoke all on function public.avaliar_sequencia(uuid, date) from public, anon, authenticated;
revoke all on function public.registrar_rotina(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.sincronizar_historico(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.avaliar_sequencia(uuid, date) to service_role;
grant execute on function public.registrar_rotina(uuid, text, timestamptz) to service_role;
grant execute on function public.sincronizar_historico(uuid, jsonb) to service_role;
