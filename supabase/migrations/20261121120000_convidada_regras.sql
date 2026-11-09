-- Parte B (convidada) · Fase 1 — REGRAS DOS GRUPOS NO BANCO
--
--   • Código curto em todo convite (NIKS-4F7K2M: 6 caracteres, sem 0, O, 1 e I).
--   • Grupo com até 100 integrantes, valendo também para quem volta.
--   • `grupos_config.convidada_ligada` (false): tudo sai desligado até a Fase 9.
--   • Com ela desligada, ninguém vira convidada: o tipo fica como sempre foi.
--   • `tipo` em grupo_membros passa a significar só "como entrou". Quem é convidada HOJE
--     vem de `estado_acesso`, que olha a assinatura.
--   • `validar_codigo` responde sem login e só devolve nome do grupo, primeiro nome de
--     quem convidou e se está cheio.
--   • `codigo_tentativa`: limite de tentativas, para ninguém adivinhar códigos.
--
-- `criar_grupo` e `e_convidada` não mudam: a assinatura no servidor ainda não é confiável o
-- bastante para barrar quem paga (ver "Fase 0" no README). Aplicar sozinha; a função `grupos`
-- publicada antes desta migration continua funcionando, porque envia `p_tipo: 'assinante'`.

alter table public.grupos_config add column if not exists convidada_ligada boolean not null default false;
alter table public.convites add column if not exists codigo text;

create or replace function public.novo_codigo_convite()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  saida text := 'NIKS-';
begin
  -- Os 6 primeiros bytes do UUID v4 são aleatórios; 256 divide por 32 sem viés.
  for i in 0..5 loop
    saida := saida || substr(alfabeto, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return saida;
end;
$$;

-- Aceita "niks-4f7k2m", "4F7K2M", com espaço ou sem o traço. Inválido → null.
create or replace function public.normalizar_codigo(p_codigo text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when x ~ '^[2-9A-HJ-NP-Z]{6}$' then 'NIKS-' || x end
    from (select regexp_replace(regexp_replace(upper(coalesce(p_codigo, '')), '[^A-Z0-9]', '', 'g'), '^NIKS', '') x) t;
$$;

-- Convites que já existam ganham código antes de a coluna virar obrigatória.
do $$
declare
  c record;
begin
  for c in select token from public.convites where codigo is null loop
    loop
      begin
        update public.convites set codigo = public.novo_codigo_convite() where token = c.token;
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
  end loop;
end;
$$;

create unique index if not exists convites_codigo_idx on public.convites (codigo);
alter table public.convites alter column codigo set not null;
alter table public.convites drop constraint if exists convites_codigo_formato;
alter table public.convites add constraint convites_codigo_formato check (codigo ~ '^NIKS-[2-9A-HJ-NP-Z]{6}$');

-- Limite de tentativas: `chave` é o hash do IP ou o id da conta; janela de 10 minutos.
create table if not exists public.codigo_tentativas (
  chave text not null,
  janela timestamptz not null,
  n integer not null default 1,
  primary key (chave, janela)
);
alter table public.codigo_tentativas enable row level security;
revoke all on public.codigo_tentativas from anon, authenticated;

create or replace function public.codigo_tentativa(p_chave text, p_limite integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  j timestamptz := to_timestamp(floor(extract(epoch from now()) / 600) * 600);
  total integer;
begin
  delete from public.codigo_tentativas where janela < now() - interval '1 day';
  insert into public.codigo_tentativas (chave, janela) values (p_chave, j)
  on conflict (chave, janela) do update set n = public.codigo_tentativas.n + 1
  returning n into total;
  return total <= p_limite;
end;
$$;

create or replace function public.grupo_limite()
returns integer
language sql
immutable
as $$ select 100 $$;

create or replace function public.grupo_lotado(p_grupo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) >= public.grupo_limite() from public.grupo_membros where grupo_id = p_grupo and saiu_em is null;
$$;

-- O app nunca escolhe o tipo. Com a convidada desligada, tudo fica como antes.
create or replace function public.tipo_de_entrada(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.assinante(p_uid) then 'assinante'
    when coalesce((select convidada_ligada from public.grupos_config where id = 1), false) then 'convidada'
    else 'assinante'
  end;
$$;

-- 'assinante', 'convidada' ou 'sem_acesso'. Com a convidada desligada, nunca 'convidada'.
create or replace function public.estado_acesso(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.assinante(p_uid) then 'assinante'
    when coalesce((select convidada_ligada from public.grupos_config where id = 1), false)
     and exists (select 1 from public.grupo_membros m
                   join public.grupos g on g.id = m.grupo_id and g.apagado_em is null
                  where m.user_id = p_uid and m.saiu_em is null) then 'convidada'
    else 'sem_acesso'
  end;
$$;

create or replace function public.convite_do_grupo(p_uid uuid, p_grupo uuid, p_token_novo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  c text;
begin
  if not public.grupo_integrante(p_grupo, p_uid) then
    return jsonb_build_object('ok', false, 'motivo', 'nao_integrante');
  end if;
  select token, codigo into t, c from public.convites
   where grupo_id = p_grupo and criado_por = p_uid and revogado_em is null
   order by criado_em desc limit 1;
  if t is null then
    loop
      begin
        insert into public.convites (token, grupo_id, criado_por, codigo)
        values (p_token_novo, p_grupo, p_uid, public.novo_codigo_convite())
        returning token, codigo into t, c;
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'token', t, 'codigo', c);
end;
$$;

-- Público: não devolve id de grupo, foto nem integrantes.
create or replace function public.validar_codigo(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when g.id is null then jsonb_build_object('valido', false)
    else jsonb_build_object(
      'valido', true,
      'nome', g.nome,
      'convidou', public.perfil_curto(c.criado_por) ->> 'nome',
      'cheio', public.grupo_lotado(g.id))
  end
  from (select 1) x
  left join public.convites c on c.codigo = public.normalizar_codigo(p_codigo) and c.revogado_em is null
  left join public.grupos g on g.id = c.grupo_id and g.apagado_em is null
     and public.grupo_integrante(c.grupo_id, c.criado_por);
$$;

-- `p_tipo` só existe para a função publicada antes desta migration; sem ele, decide aqui.
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

create or replace function public.entrar_grupo_codigo(p_uid uuid, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
begin
  select token into t from public.convites
   where codigo = public.normalizar_codigo(p_codigo) and revogado_em is null;
  if t is null then
    return jsonb_build_object('ok', false, 'motivo', 'convite_invalido');
  end if;
  return public.entrar_grupo(p_uid, t);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'novo_codigo_convite()', 'normalizar_codigo(text)', 'codigo_tentativa(text,integer)', 'grupo_limite()',
    'grupo_lotado(uuid)', 'tipo_de_entrada(uuid)', 'estado_acesso(uuid)', 'convite_do_grupo(uuid,uuid,text)',
    'validar_codigo(text)', 'entrar_grupo(uuid,text,text)', 'entrar_grupo_codigo(uuid,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
