-- Fase 3 (grupos) · 3.2 — GRUPOS DE VERDADE (design NiksGrupoV2, rodada 80)
--
--  Grupo sem nível nem XP: o grupo mostra quem é mais constante (check-ins). Tudo só
--  para o service role — o app fala com a Edge Function `grupos`, que confere o JWT e
--  chama estas funções com o user_id do token. Nenhuma tabela tem política para o app:
--  quem não é do grupo não vê nada, nem a foto (bucket privado `grupos`, URLs assinadas
--  geradas pela função depois de conferir que ela é integrante).
--
--   grupos / grupo_membros   integrantes ativas = saiu_em null; quem criou ('criadora')
--                            pode remover; quem sai ou apaga a conta passa a posse à
--                            integrante mais antiga; sem ninguém, o grupo é apagado.
--   convites                 token aleatório (gerado na função), por integrante; o link
--                            https…/functions/v1/convite?t=<token> abre o app.
--   checkins / checkin_grupos foto obrigatória (câmera, na hora); 1 por rotina (manhã /
--                            noite) por dia de sessão (04:00); aparece nos grupos escolhidos.
--                            `hora_exibida` é só o horário mostrado (mesmo dia, nunca futuro).
--   bloqueios / denuncias    moderação (regra 1.2 da Apple). Denúncias lidas pelo NIKSfy.
--   compartilhamentos        "Compartilhar com o grupo" (fim da rotina / scan de produto).
--   semanas_vencidas         campeãs da semana (segunda→domingo); preenchida na 3.3.
--   avisos_enviados          anti-repetição dos pushes do grupo (3.4).
--   grupos_config            `criar_sem_assinatura_servidor`: enquanto ligada, quem não é
--                            convidada cria grupo sem a assinatura confirmada no servidor
--                            (a trava do app já barra quem não paga). Desligar depois que
--                            as assinantes antigas estiverem vinculadas.

-- ── Configuração ────────────────────────────────────────────────────────────────
create table if not exists public.grupos_config (
  id integer primary key default 1 check (id = 1),
  criar_sem_assinatura_servidor boolean not null default true,
  atualizado_em timestamptz not null default now()
);
insert into public.grupos_config (id) values (1) on conflict do nothing;

-- ── Tabelas ─────────────────────────────────────────────────────────────────────
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 40),
  descricao text check (descricao is null or char_length(descricao) <= 140),
  banner text not null default 'niks-1',          -- banner do NIKS ('niks-1'…) ou 'foto'
  banner_path text,                               -- foto dela no bucket `grupos` (banner = 'foto')
  criada_por uuid references public.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  apagado_em timestamptz
);

create table if not exists public.grupo_membros (
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  papel text not null default 'integrante' check (papel in ('criadora', 'integrante')),
  tipo text not null default 'assinante' check (tipo in ('assinante', 'convidada')),
  entrou_em timestamptz not null default now(),
  saiu_em timestamptz,
  removida_por uuid references public.users (id) on delete set null,
  primary key (grupo_id, user_id)
);
create index if not exists grupo_membros_user_idx on public.grupo_membros (user_id) where saiu_em is null;

create table if not exists public.convites (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  criado_por uuid not null references public.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz
);
create index if not exists convites_grupo_idx on public.convites (grupo_id, criado_por) where revogado_em is null;

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  foto_path text not null,
  rotina text not null check (rotina in ('am', 'pm')),
  capturado_em timestamptz not null default now(),
  hora_exibida timestamptz not null,
  dia date not null,
  removido_em timestamptz,                        -- moderação (denúncia aceita)
  unique (user_id, dia, rotina)
);
create index if not exists checkins_user_dia_idx on public.checkins (user_id, dia);

create table if not exists public.checkin_grupos (
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  primary key (checkin_id, grupo_id)
);
create index if not exists checkin_grupos_grupo_idx on public.checkin_grupos (grupo_id);

create table if not exists public.bloqueios (
  user_id uuid not null references public.users (id) on delete cascade,
  bloqueada_id uuid not null references public.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (user_id, bloqueada_id),
  check (user_id <> bloqueada_id)
);

create table if not exists public.denuncias (
  id uuid primary key default gen_random_uuid(),
  denunciante_id uuid references public.users (id) on delete set null,
  tipo text not null check (tipo in ('foto', 'integrante')),
  grupo_id uuid references public.grupos (id) on delete set null,
  alvo_user_id uuid references public.users (id) on delete set null,
  checkin_id uuid references public.checkins (id) on delete set null,
  motivo text check (motivo is null or char_length(motivo) <= 500),
  status text not null default 'aberta' check (status in ('aberta', 'resolvida', 'descartada')),
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  nota text
);
create index if not exists denuncias_status_idx on public.denuncias (status, criado_em);

create table if not exists public.compartilhamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  origem text not null check (origem in ('rotina', 'produto', 'sos')),
  referencia text,
  dia date not null,
  criado_em timestamptz not null default now()
);
create index if not exists compartilhamentos_grupo_idx on public.compartilhamentos (grupo_id, criado_em desc);

create table if not exists public.semanas_vencidas (
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  semana date not null,                           -- segunda-feira (dia de sessão)
  user_id uuid not null references public.users (id) on delete cascade,
  checkins integer not null,
  carta_id uuid,
  criado_em timestamptz not null default now(),
  primary key (grupo_id, semana, user_id)
);

create table if not exists public.avisos_enviados (
  user_id uuid not null references public.users (id) on delete cascade,
  tipo text not null,
  chave text not null,
  enviado_em timestamptz not null default now(),
  primary key (user_id, tipo, chave)
);

do $$
declare t text;
begin
  foreach t in array array['grupos_config', 'grupos', 'grupo_membros', 'convites', 'checkins', 'checkin_grupos',
                           'bloqueios', 'denuncias', 'compartilhamentos', 'semanas_vencidas', 'avisos_enviados'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── Bucket privado das fotos (check-in e banner) ───────────────────────────────
-- Sem política de leitura/escrita para o app: upload por URL assinada de upload e
-- leitura por URL assinada, ambas geradas pela função `grupos`. Pasta = {user_id}/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grupos', 'grupos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- ── Ajudantes ───────────────────────────────────────────────────────────────────
create or replace function public.grupo_integrante(p_grupo uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.grupo_membros m join public.grupos g on g.id = m.grupo_id
                  where m.grupo_id = p_grupo and m.user_id = p_uid and m.saiu_em is null and g.apagado_em is null);
$$;

-- Foto e nome públicos DENTRO do grupo (sem abrir a tabela users).
create or replace function public.perfil_curto(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'user_id', u.id,
    'nome', coalesce(nullif(btrim(split_part(u.nome, ' ', 1)), ''), 'Amiga'),
    'foto', coalesce(u.foto_home_url,
                     (select s.foto_url from public.skin_scans s where s.user_id = u.id and s.foto_url is not null
                       order by s.created_at desc limit 1)),
    'pontos', coalesce(p.total, 0),
    'nivel', (public.nivel_de(coalesce(p.total, 0)) ->> 'nivel')::int,
    'titulo', public.nivel_de(coalesce(p.total, 0)) ->> 'titulo')
  from public.users u
  left join public.pontos_usuario p on p.user_id = u.id
  where u.id = p_uid;
$$;

-- Período do ranking em dias de sessão: semana (segunda→domingo), mês, ano, geral.
create or replace function public.periodo_ranking(p_periodo text, p_hoje date)
returns daterange
language sql
immutable
as $$
  select case p_periodo
    when 'semana' then daterange(date_trunc('week', p_hoje)::date, (date_trunc('week', p_hoje) + interval '7 days')::date)
    when 'mes' then daterange(date_trunc('month', p_hoje)::date, (date_trunc('month', p_hoje) + interval '1 month')::date)
    when 'ano' then daterange(date_trunc('year', p_hoje)::date, (date_trunc('year', p_hoje) + interval '1 year')::date)
    else daterange(null, null)
  end;
$$;

-- Ela é convidada (está em grupo como convidada e não paga)?
create or replace function public.e_convidada(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.assinante(p_uid)
     and exists (select 1 from public.grupo_membros m where m.user_id = p_uid and m.saiu_em is null and m.tipo = 'convidada');
$$;

-- ── Criar, convidar, entrar, sair, remover ─────────────────────────────────────
create or replace function public.criar_grupo(p_uid uuid, p_nome text, p_descricao text, p_banner text, p_banner_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  livre boolean;
  g uuid;
begin
  select criar_sem_assinatura_servidor into livre from public.grupos_config where id = 1;
  if not (public.assinante(p_uid) or (coalesce(livre, false) and not public.e_convidada(p_uid))) then
    return jsonb_build_object('ok', false, 'motivo', 'assinatura');
  end if;
  if p_nome is null or char_length(btrim(p_nome)) not between 1 and 40 then
    return jsonb_build_object('ok', false, 'motivo', 'nome');
  end if;
  if p_banner_path is not null and split_part(p_banner_path, '/', 1) <> p_uid::text then
    return jsonb_build_object('ok', false, 'motivo', 'banner');
  end if;
  insert into public.grupos (nome, descricao, banner, banner_path, criada_por)
  values (btrim(p_nome), nullif(btrim(coalesce(p_descricao, '')), ''),
          case when p_banner_path is not null then 'foto' else coalesce(nullif(p_banner, ''), 'niks-1') end,
          p_banner_path, p_uid)
  returning id into g;
  insert into public.grupo_membros (grupo_id, user_id, papel, tipo) values (g, p_uid, 'criadora', 'assinante');
  return jsonb_build_object('ok', true, 'grupo_id', g);
end;
$$;

-- Convite da integrante para o grupo (reaproveita o ativo; o token vem da função).
create or replace function public.convite_do_grupo(p_uid uuid, p_grupo uuid, p_token_novo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
begin
  if not public.grupo_integrante(p_grupo, p_uid) then
    return jsonb_build_object('ok', false, 'motivo', 'nao_integrante');
  end if;
  select token into t from public.convites
   where grupo_id = p_grupo and criado_por = p_uid and revogado_em is null
   order by criado_em desc limit 1;
  if t is null then
    insert into public.convites (token, grupo_id, criado_por) values (p_token_novo, p_grupo, p_uid) returning token into t;
  end if;
  return jsonb_build_object('ok', true, 'token', t);
end;
$$;

-- O que o link mostra antes de entrar (nome, banner, quem convidou, integrantes).
create or replace function public.validar_convite(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when g.id is null then jsonb_build_object('valido', false)
    else jsonb_build_object(
      'valido', true, 'grupo_id', g.id, 'nome', g.nome, 'banner', g.banner, 'banner_path', g.banner_path,
      'convidou', public.perfil_curto(c.criado_por) ->> 'nome',
      'integrantes', (select jsonb_agg(public.perfil_curto(m.user_id) order by m.entrou_em)
                        from public.grupo_membros m where m.grupo_id = g.id and m.saiu_em is null))
  end
  from (select 1) x
  left join public.convites c on c.token = p_token and c.revogado_em is null
  left join public.grupos g on g.id = c.grupo_id and g.apagado_em is null
     and public.grupo_integrante(c.grupo_id, c.criado_por);
$$;

-- Entrar pelo convite. Removida pela criadora não volta; quem saiu pode voltar.
create or replace function public.entrar_grupo(p_uid uuid, p_token text, p_tipo text default 'assinante')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := public.validar_convite(p_token);
  g uuid;
  m public.grupo_membros%rowtype;
begin
  if not coalesce((v ->> 'valido')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'convite_invalido');
  end if;
  if p_tipo not in ('assinante', 'convidada') then
    return jsonb_build_object('ok', false, 'motivo', 'tipo');
  end if;
  g := (v ->> 'grupo_id')::uuid;
  select * into m from public.grupo_membros where grupo_id = g and user_id = p_uid for update;
  if found then
    if m.removida_por is not null then
      return jsonb_build_object('ok', false, 'motivo', 'removida');
    end if;
    if m.saiu_em is null then
      return jsonb_build_object('ok', true, 'grupo_id', g, 'ja_era', true);
    end if;
    update public.grupo_membros set saiu_em = null, entrou_em = now(), papel = 'integrante', tipo = p_tipo
     where grupo_id = g and user_id = p_uid;
  else
    insert into public.grupo_membros (grupo_id, user_id, papel, tipo) values (g, p_uid, 'integrante', p_tipo);
  end if;
  return jsonb_build_object('ok', true, 'grupo_id', g, 'nome', v ->> 'nome');
end;
$$;

-- Depois que alguém deixa o grupo (saiu, removida ou conta apagada): se era a
-- criadora, a posse passa à integrante mais antiga; sem ninguém, o grupo é apagado.
create or replace function public.grupo_reorganizar(p_grupo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proxima uuid;
begin
  if exists (select 1 from public.grupo_membros where grupo_id = p_grupo and saiu_em is null and papel = 'criadora') then
    return;
  end if;
  select user_id into proxima from public.grupo_membros
   where grupo_id = p_grupo and saiu_em is null order by entrou_em, user_id limit 1;
  if proxima is null then
    update public.grupos set apagado_em = coalesce(apagado_em, now()) where id = p_grupo;
    update public.convites set revogado_em = coalesce(revogado_em, now()) where grupo_id = p_grupo;
  else
    update public.grupo_membros set papel = 'criadora' where grupo_id = p_grupo and user_id = proxima;
  end if;
end;
$$;

create or replace function public.sair_grupo(p_uid uuid, p_grupo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.grupo_membros set saiu_em = now(), papel = 'integrante'
   where grupo_id = p_grupo and user_id = p_uid and saiu_em is null;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nao_integrante');
  end if;
  update public.convites set revogado_em = now() where grupo_id = p_grupo and criado_por = p_uid and revogado_em is null;
  perform public.grupo_reorganizar(p_grupo);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remover_integrante(p_uid uuid, p_grupo uuid, p_alvo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_alvo = p_uid or not exists (select 1 from public.grupo_membros
                                    where grupo_id = p_grupo and user_id = p_uid and saiu_em is null and papel = 'criadora') then
    return jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  end if;
  update public.grupo_membros set saiu_em = now(), removida_por = p_uid
   where grupo_id = p_grupo and user_id = p_alvo and saiu_em is null;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nao_integrante');
  end if;
  update public.convites set revogado_em = now() where grupo_id = p_grupo and criado_por = p_alvo and revogado_em is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- Conta apagada: as linhas de grupo_membros somem em cascata; reorganiza os grupos dela.
create or replace function public.grupo_membros_apos_apagar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.saiu_em is null then
    perform public.grupo_reorganizar(old.grupo_id);
  end if;
  return old;
end;
$$;
drop trigger if exists grupo_membros_apos_apagar on public.grupo_membros;
create trigger grupo_membros_apos_apagar after delete on public.grupo_membros
  for each row execute function public.grupo_membros_apos_apagar();

-- ── Moderação ───────────────────────────────────────────────────────────────────
create or replace function public.bloquear(p_uid uuid, p_alvo uuid, p_bloquear boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_alvo is null or p_alvo = p_uid then
    return jsonb_build_object('ok', false, 'motivo', 'alvo');
  end if;
  if p_bloquear then
    insert into public.bloqueios (user_id, bloqueada_id) values (p_uid, p_alvo) on conflict do nothing;
  else
    delete from public.bloqueios where user_id = p_uid and bloqueada_id = p_alvo;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Só se denuncia o que se vê: a denunciante tem que ser do grupo (e a foto, dele).
create or replace function public.denunciar(p_uid uuid, p_tipo text, p_grupo uuid, p_alvo uuid, p_checkin uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo uuid := p_alvo;
  d uuid;
begin
  if p_tipo not in ('foto', 'integrante') or not public.grupo_integrante(p_grupo, p_uid) then
    return jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  end if;
  if p_tipo = 'foto' then
    select c.user_id into alvo from public.checkins c join public.checkin_grupos cg on cg.checkin_id = c.id
     where c.id = p_checkin and cg.grupo_id = p_grupo;
    if alvo is null then
      return jsonb_build_object('ok', false, 'motivo', 'foto');
    end if;
  elsif not exists (select 1 from public.grupo_membros where grupo_id = p_grupo and user_id = alvo) or alvo = p_uid then
    return jsonb_build_object('ok', false, 'motivo', 'alvo');
  end if;
  insert into public.denuncias (denunciante_id, tipo, grupo_id, alvo_user_id, checkin_id, motivo)
  values (p_uid, p_tipo, p_grupo, alvo, case when p_tipo = 'foto' then p_checkin end, left(nullif(btrim(coalesce(p_motivo, '')), ''), 500))
  returning id into d;
  return jsonb_build_object('ok', true, 'denuncia_id', d);
end;
$$;

-- ── Check-in ────────────────────────────────────────────────────────────────────
-- A foto já subiu (URL assinada de upload, pasta dela). Publica nos grupos escolhidos
-- em que ela é integrante. `hora_exibida`: só o horário mostrado (mesmo dia de sessão,
-- nunca no futuro). O dia que conta é o da foto real.
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
  return jsonb_build_object('ok', true, 'checkin_id', c, 'dia', d, 'grupos', to_jsonb(validos));
end;
$$;

-- ── Leituras (só de quem é integrante) ─────────────────────────────────────────
-- Check-ins visíveis para quem vê: do grupo, de integrante ativa, não removidos, e
-- sem a autora bloqueada por quem vê.
create or replace function public.checkins_visiveis(p_uid uuid, p_grupo uuid)
returns setof public.checkins
language sql
stable
security definer
set search_path = public
as $$
  select c.* from public.checkins c
    join public.checkin_grupos cg on cg.checkin_id = c.id and cg.grupo_id = p_grupo
    join public.grupo_membros m on m.grupo_id = p_grupo and m.user_id = c.user_id and m.saiu_em is null
   where c.removido_em is null
     and public.grupo_integrante(p_grupo, p_uid)
     and not exists (select 1 from public.bloqueios b where b.user_id = p_uid and b.bloqueada_id = c.user_id);
$$;

create or replace function public.ranking_grupo(p_uid uuid, p_grupo uuid, p_periodo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with per as (select public.periodo_ranking(p_periodo, public.dia_sessao(now())) r),
  m as (
    select gm.user_id,
           (select count(*) from public.checkins_visiveis(p_uid, p_grupo) c, per where c.user_id = gm.user_id and c.dia <@ per.r) n,
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
$$;

create or replace function public.jornada_grupo(p_uid uuid, p_grupo uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.grupo_integrante(p_grupo, p_uid) then null else
    coalesce(jsonb_agg(public.perfil_curto(gm.user_id) || jsonb_build_object('voce', gm.user_id = p_uid)
                       order by (public.perfil_curto(gm.user_id) ->> 'pontos')::int desc), '[]'::jsonb) end
  from public.grupo_membros gm
  where gm.grupo_id = p_grupo and gm.saiu_em is null
    and (gm.user_id = p_uid or not exists (select 1 from public.bloqueios b where b.user_id = p_uid and b.bloqueada_id = gm.user_id));
$$;

-- Tela do grupo: dados, integrantes (quem fez hoje), seu papel e os atalhos.
create or replace function public.grupo_detalhe(p_uid uuid, p_grupo uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
    'lider_jornada', (select j -> 'nome' from jsonb_array_elements(public.jornada_grupo(p_uid, p_grupo)) j limit 1)) end
  from public.grupos g where g.id = p_grupo and g.apagado_em is null;
$$;

create or replace function public.meus_grupos(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public.grupo_detalhe(p_uid, gm.grupo_id) order by gm.entrou_em), '[]'::jsonb)
    from public.grupo_membros gm join public.grupos g on g.id = gm.grupo_id
   where gm.user_id = p_uid and gm.saiu_em is null and g.apagado_em is null;
$$;

-- Mural: check-ins visíveis, do mais novo, em páginas (antes de um instante).
create or replace function public.mural_grupo(p_uid uuid, p_grupo uuid, p_antes timestamptz default null, p_limite integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.grupo_integrante(p_grupo, p_uid) then null else
    coalesce(jsonb_agg(jsonb_build_object(
      'checkin_id', c.id, 'user_id', c.user_id, 'rotina', c.rotina, 'dia', c.dia,
      'hora_exibida', c.hora_exibida, 'foto_path', c.foto_path, 'voce', c.user_id = p_uid,
      'autora', public.perfil_curto(c.user_id)) order by c.hora_exibida desc), '[]'::jsonb) end
  from (select * from public.checkins_visiveis(p_uid, p_grupo) v
         where p_antes is null or v.hora_exibida < p_antes
         order by v.hora_exibida desc limit least(greatest(coalesce(p_limite, 30), 1), 100)) c;
$$;

-- Aba Grupos · seu perfil (80q/80r): os números e o calendário do mês com a foto.
create or replace function public.perfil_grupos(p_uid uuid, p_mes date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.perfil_curto(p_uid) || jsonb_build_object(
    'checkins', (select count(*) from public.checkins where user_id = p_uid and removido_em is null),
    'dias_ativos', (select count(distinct dia) from public.checkins where user_id = p_uid and removido_em is null),
    'grupos', (select count(*) from public.grupo_membros gm join public.grupos g on g.id = gm.grupo_id
                where gm.user_id = p_uid and gm.saiu_em is null and g.apagado_em is null),
    'mes', date_trunc('month', p_mes)::date,
    'dias', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'foto_path', foto_path) order by dia)
                        from (select distinct on (dia) dia, foto_path from public.checkins
                               where user_id = p_uid and removido_em is null
                                 and dia >= date_trunc('month', p_mes)::date
                                 and dia < (date_trunc('month', p_mes) + interval '1 month')::date
                               order by dia, capturado_em) x), '[]'::jsonb));
$$;

-- ── Limpeza de arquivos órfãos: inclui `grupos` (e `rotina-lotes`, que faltava) ──
create or replace function public.orphan_storage_folders(min_age interval default interval '24 hours')
returns table (owner_id text, bucket_id text, files int, bytes bigint, paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  with obj as (
    select o.bucket_id,
           split_part(o.name, '/', 1)                    as owner_id,
           o.name,
           coalesce((o.metadata->>'size')::bigint, 0)    as size,
           greatest(o.created_at, o.updated_at)          as touched_at
      from storage.objects o
     where o.bucket_id in ('scans', 'product-scans', 'coach-images', 'routine-photos', 'colecao', 'rotina-lotes', 'grupos')
       and o.name like '%/%'
  ),
  orphan as (
    select obj.owner_id
      from obj
     where obj.owner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (select 1 from auth.users a where a.id::text = obj.owner_id)
     group by obj.owner_id
    having max(obj.touched_at) < now() - min_age
  )
  select obj.owner_id,
         obj.bucket_id,
         count(*)::int,
         sum(obj.size)::bigint,
         array_agg(obj.name order by obj.name)
    from obj
    join orphan using (owner_id)
   group by obj.owner_id, obj.bucket_id
   order by obj.owner_id, obj.bucket_id;
$$;
revoke execute on function public.orphan_storage_folders(interval) from public, anon, authenticated;
grant  execute on function public.orphan_storage_folders(interval) to service_role;

-- ── Permissões: só o service role (Edge Function `grupos`) ──────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'grupo_integrante(uuid,uuid)', 'perfil_curto(uuid)', 'periodo_ranking(text,date)', 'e_convidada(uuid)',
    'criar_grupo(uuid,text,text,text,text)', 'convite_do_grupo(uuid,uuid,text)', 'validar_convite(text)',
    'entrar_grupo(uuid,text,text)', 'grupo_reorganizar(uuid)', 'sair_grupo(uuid,uuid)', 'remover_integrante(uuid,uuid,uuid)',
    'grupo_membros_apos_apagar()', 'bloquear(uuid,uuid,boolean)', 'denunciar(uuid,text,uuid,uuid,uuid,text)',
    'publicar_checkin(uuid,text,text,uuid[],timestamptz)', 'checkins_visiveis(uuid,uuid)', 'ranking_grupo(uuid,uuid,text)',
    'jornada_grupo(uuid,uuid)', 'grupo_detalhe(uuid,uuid)', 'meus_grupos(uuid)', 'mural_grupo(uuid,uuid,timestamptz,integer)',
    'perfil_grupos(uuid,date)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
