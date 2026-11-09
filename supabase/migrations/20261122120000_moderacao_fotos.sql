-- Parte B (convidada) · Fase 2 — MODERAÇÃO DAS FOTOS DOS GRUPOS (Apple 1.2)
--
--   • Foto denunciada some do mural na hora (`oculto_em`, reversível). O ranking segue
--     contando até a revisão.
--   • Até 10 denúncias por conta em 24 h; a mesma pessoa não denuncia duas vezes o mesmo item.
--   • `revisar_denuncia`: Manter, Apagar ou Remover usuária, só para quem está em `moderadores`.
--   • Remover usuária = sai de todos os grupos e não entra nem cria outros. Conta e
--     assinatura continuam.
--   • O avatar nos grupos nunca usa a foto do scan de pele: sem foto de perfil, o app mostra a inicial.
--   • Denúncia aberta há mais de 20 h gera um push único para as moderadoras (cron de hora em hora).
--
-- O filtro automático das fotos fica na função `grupos`. Aplicar esta migration antes de
-- publicar a função.

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
    'foto', u.foto_home_url,
    'pontos', coalesce(p.total, 0),
    'nivel', (public.nivel_de(coalesce(p.total, 0)) ->> 'nivel')::int,
    'titulo', public.nivel_de(coalesce(p.total, 0)) ->> 'titulo')
  from public.users u
  left join public.pontos_usuario p on p.user_id = u.id
  where u.id = p_uid;
$$;

alter table public.checkins add column if not exists oculto_em timestamptz;
alter table public.compartilhamentos add column if not exists oculto_em timestamptz;
alter table public.denuncias add column if not exists decisao text check (decisao is null or decisao in ('manter', 'apagar', 'remover_usuaria'));
alter table public.denuncias add column if not exists decidida_por uuid references public.users (id) on delete set null;
alter table public.denuncias add column if not exists alertada_em timestamptz;

create table if not exists public.moderadores (
  user_id uuid primary key references public.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create table if not exists public.grupos_banidas (
  user_id uuid primary key references public.users (id) on delete cascade,
  banida_em timestamptz not null default now(),
  denuncia_id uuid references public.denuncias (id) on delete set null
);
alter table public.moderadores enable row level security;
alter table public.grupos_banidas enable row level security;
revoke all on public.moderadores, public.grupos_banidas from anon, authenticated;

insert into public.moderadores (user_id)
select id from public.users where lower(email) = 'felipeesteves188@icloud.com'
on conflict do nothing;

create or replace function public.mural_grupo(p_uid uuid, p_grupo uuid, p_antes timestamptz default null, p_limite integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with itens as (
    select 'checkin'::text tipo, c.id, c.user_id, c.rotina, c.dia,
           -- Sem título, o do design: "Rotina da manhã" / "Rotina da noite".
           coalesce(c.titulo, case c.rotina when 'am' then 'Rotina da manhã' else 'Rotina da noite' end) titulo,
           c.descricao, c.hora_exibida quando, c.foto_path, 'grupos'::text bucket
      from public.checkins_visiveis(p_uid, p_grupo) c
     where c.oculto_em is null
    union all
    select 'produto', x.id, x.user_id, null, x.dia, x.titulo, null, x.criado_em, x.foto_path, 'product-scans'
      from public.compartilhamentos x
      join public.grupo_membros m on m.grupo_id = p_grupo and m.user_id = x.user_id and m.saiu_em is null
     where x.grupo_id = p_grupo and x.origem = 'produto' and x.removido_em is null and x.oculto_em is null and x.foto_path is not null
       and public.grupo_integrante(p_grupo, p_uid)
       and not exists (select 1 from public.bloqueios b where b.user_id = p_uid and b.bloqueada_id = x.user_id)
  )
  select case when not public.grupo_integrante(p_grupo, p_uid) then null else
    coalesce(jsonb_agg(jsonb_build_object(
      'tipo', i.tipo, 'id', i.id,
      'checkin_id', case when i.tipo = 'checkin' then i.id end,
      'compartilhamento_id', case when i.tipo = 'produto' then i.id end,
      'user_id', i.user_id, 'rotina', i.rotina, 'dia', i.dia, 'titulo', i.titulo, 'descricao', i.descricao,
      'hora_exibida', i.quando, 'foto_path', i.foto_path, 'foto_bucket', i.bucket, 'voce', i.user_id = p_uid,
      'autora', public.perfil_curto(i.user_id)) order by i.quando desc), '[]'::jsonb) end
  from (select * from itens where p_antes is null or itens.quando < p_antes
         order by itens.quando desc limit least(greatest(coalesce(p_limite, 30), 1), 100)) i;
$$;

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
  if exists (select 1 from public.grupos_banidas where user_id = p_uid) then
    return jsonb_build_object('ok', false, 'motivo', 'banida');
  end if;
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

create or replace function public.entrar_grupo(p_uid uuid, p_token text, p_tipo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := public.validar_convite(p_token);
  g uuid;
  m public.grupo_membros%rowtype;
  tipo_final text;
  ja_membro boolean;
begin
  if not coalesce((v ->> 'valido')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'convite_invalido');
  end if;
  if exists (select 1 from public.grupos_banidas where user_id = p_uid) then
    return jsonb_build_object('ok', false, 'motivo', 'banida');
  end if;
  if p_tipo is not null and p_tipo not in ('assinante', 'convidada') then
    return jsonb_build_object('ok', false, 'motivo', 'tipo');
  end if;
  tipo_final := coalesce(p_tipo, public.tipo_de_entrada(p_uid));
  g := (v ->> 'grupo_id')::uuid;
  -- Trava o grupo: duas entradas ao mesmo tempo não passam de 100.
  perform 1 from public.grupos where id = g for update;
  select * into m from public.grupo_membros where grupo_id = g and user_id = p_uid for update;
  ja_membro := found;
  if ja_membro then
    if m.removida_por is not null then
      return jsonb_build_object('ok', false, 'motivo', 'removida');
    end if;
    if m.saiu_em is null then
      return jsonb_build_object('ok', true, 'grupo_id', g, 'ja_era', true);
    end if;
  end if;
  if public.grupo_lotado(g) then
    return jsonb_build_object('ok', false, 'motivo', 'cheio');
  end if;
  if ja_membro then
    update public.grupo_membros set saiu_em = null, entrou_em = now(), papel = 'integrante', tipo = tipo_final
     where grupo_id = g and user_id = p_uid;
  else
    insert into public.grupo_membros (grupo_id, user_id, papel, tipo) values (g, p_uid, 'integrante', tipo_final);
  end if;
  return jsonb_build_object('ok', true, 'grupo_id', g, 'nome', v ->> 'nome');
end;
$$;

create or replace function public.denunciar(p_uid uuid, p_tipo text, p_grupo uuid, p_alvo uuid, p_checkin uuid, p_motivo text,
                                            p_compartilhamento uuid default null)
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
  if p_tipo = 'foto' and p_compartilhamento is not null then
    select x.user_id into alvo from public.compartilhamentos x where x.id = p_compartilhamento and x.grupo_id = p_grupo;
    if alvo is null then
      return jsonb_build_object('ok', false, 'motivo', 'foto');
    end if;
  elsif p_tipo = 'foto' then
    select c.user_id into alvo from public.checkins c join public.checkin_grupos cg on cg.checkin_id = c.id
     where c.id = p_checkin and cg.grupo_id = p_grupo;
    if alvo is null then
      return jsonb_build_object('ok', false, 'motivo', 'foto');
    end if;
  elsif not exists (select 1 from public.grupo_membros where grupo_id = p_grupo and user_id = alvo) then
    return jsonb_build_object('ok', false, 'motivo', 'alvo');
  end if;
  if alvo = p_uid then
    return jsonb_build_object('ok', false, 'motivo', 'alvo');
  end if;
  select id into d from public.denuncias
   where denunciante_id = p_uid and status = 'aberta' and tipo = p_tipo and grupo_id = p_grupo
     and case when p_tipo = 'integrante' then alvo_user_id = alvo
              when p_compartilhamento is not null then compartilhamento_id = p_compartilhamento
              else checkin_id = p_checkin end
   limit 1;
  if d is not null then
    return jsonb_build_object('ok', true, 'denuncia_id', d, 'ja_denunciou', true);
  end if;
  if (select count(*) from public.denuncias where denunciante_id = p_uid and criado_em > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('ok', false, 'motivo', 'limite');
  end if;
  insert into public.denuncias (denunciante_id, tipo, grupo_id, alvo_user_id, checkin_id, compartilhamento_id, motivo)
  values (p_uid, p_tipo, p_grupo, alvo,
          case when p_tipo = 'foto' and p_compartilhamento is null then p_checkin end,
          case when p_tipo = 'foto' then p_compartilhamento end,
          left(nullif(btrim(coalesce(p_motivo, '')), ''), 500))
  returning id into d;
  if p_tipo = 'foto' and p_compartilhamento is not null then
    update public.compartilhamentos set oculto_em = coalesce(oculto_em, now()) where id = p_compartilhamento;
  elsif p_tipo = 'foto' then
    update public.checkins set oculto_em = coalesce(oculto_em, now()) where id = p_checkin;
  end if;
  return jsonb_build_object('ok', true, 'denuncia_id', d);
end;
$$;

-- null = quem pediu não é moderadora.
create or replace function public.denuncias_abertas(p_mod uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not exists (select 1 from public.moderadores where user_id = p_mod) then null else
    coalesce((select jsonb_agg(l order by l.criado_em) from (
      select d.id, d.tipo, d.motivo, d.criado_em, g.nome grupo,
             public.perfil_curto(d.denunciante_id) ->> 'nome' denunciante,
             public.perfil_curto(d.alvo_user_id) ->> 'nome' alvo,
             coalesce(c.foto_path, x.foto_path) foto_path,
             case when c.id is not null then 'grupos' when x.id is not null then 'product-scans' end foto_bucket
        from public.denuncias d
        left join public.grupos g on g.id = d.grupo_id
        left join public.checkins c on c.id = d.checkin_id
        left join public.compartilhamentos x on x.id = d.compartilhamento_id
       where d.status = 'aberta'
       order by d.criado_em limit 100) l), '[]'::jsonb) end;
$$;

create or replace function public.revisar_denuncia(p_mod uuid, p_denuncia uuid, p_acao text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.denuncias%rowtype;
  gr uuid;
begin
  if not exists (select 1 from public.moderadores where user_id = p_mod) then
    return jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  end if;
  if p_acao not in ('manter', 'apagar', 'remover_usuaria') then
    return jsonb_build_object('ok', false, 'motivo', 'acao');
  end if;
  select * into d from public.denuncias where id = p_denuncia for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'denuncia');
  end if;
  if d.status <> 'aberta' then
    return jsonb_build_object('ok', false, 'motivo', 'ja_revisada');
  end if;
  if p_acao = 'apagar' and d.tipo <> 'foto' then
    return jsonb_build_object('ok', false, 'motivo', 'acao');
  end if;

  if p_acao = 'manter' then
    update public.checkins set oculto_em = null where id = d.checkin_id;
    update public.compartilhamentos set oculto_em = null where id = d.compartilhamento_id;
  else
    update public.checkins set removido_em = coalesce(removido_em, now()), oculto_em = null where id = d.checkin_id;
    update public.compartilhamentos set removido_em = coalesce(removido_em, now()), oculto_em = null where id = d.compartilhamento_id;
  end if;

  if p_acao = 'remover_usuaria' and d.alvo_user_id is not null then
    insert into public.grupos_banidas (user_id, denuncia_id) values (d.alvo_user_id, d.id) on conflict (user_id) do nothing;
    update public.convites set revogado_em = now() where criado_por = d.alvo_user_id and revogado_em is null;
    for gr in select grupo_id from public.grupo_membros where user_id = d.alvo_user_id and saiu_em is null loop
      update public.grupo_membros set saiu_em = now(), papel = 'integrante', removida_por = p_mod
       where grupo_id = gr and user_id = d.alvo_user_id;
      perform public.grupo_reorganizar(gr);
    end loop;
  end if;

  -- A decisão vale para todas as denúncias abertas do mesmo item.
  update public.denuncias
     set status = case when p_acao = 'manter' then 'descartada' else 'resolvida' end,
         decisao = p_acao, decidida_por = p_mod, resolvido_em = now()
   where status = 'aberta'
     and (id = d.id
          or (d.checkin_id is not null and checkin_id = d.checkin_id)
          or (d.compartilhamento_id is not null and compartilhamento_id = d.compartilhamento_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.tokens_moderadores()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select u.push_token from public.moderadores m join public.users u on u.id = m.user_id
   where u.push_token is not null and u.push_token <> '' and u.push_token <> 'simulator-token';
$$;

create or replace function public.enviar_alerta_denuncias()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
  msgs jsonb;
begin
  with marcadas as (
    update public.denuncias set alertada_em = now()
     where status = 'aberta' and alertada_em is null and criado_em < now() - interval '20 hours'
    returning id
  )
  select count(*) into total from marcadas;
  if total = 0 then
    return 0;
  end if;
  select jsonb_agg(jsonb_build_object(
           'to', t, 'title', 'NIKS: denúncia perto do prazo', 'sound', 'default',
           'body', total || case when total = 1 then ' denúncia aberta há mais de 20 horas.' else ' denúncias abertas há mais de 20 horas.' end,
           'data', jsonb_build_object('type', 'denuncia')))
    into msgs from public.tokens_moderadores() t;
  if msgs is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := msgs,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
  end if;
  return total;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'mural_grupo(uuid,uuid,timestamptz,integer)', 'criar_grupo(uuid,text,text,text,text)', 'entrar_grupo(uuid,text,text)',
    'denunciar(uuid,text,uuid,uuid,uuid,text,uuid)', 'denuncias_abertas(uuid)', 'revisar_denuncia(uuid,uuid,text)',
    'tokens_moderadores()', 'enviar_alerta_denuncias()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'denuncias-prazo';
    perform cron.schedule('denuncias-prazo', '7 * * * *', 'select public.enviar_alerta_denuncias()');
  end if;
end $$;
