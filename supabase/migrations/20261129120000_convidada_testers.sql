-- Parte B (convidada) · Fase 9 — LISTA DE CONTAS DE TESTE
--
-- Com `grupos_config.convidada_ligada` desligada, os e-mails desta lista já funcionam como
-- convidada. É por e-mail para valer também para uma conta criada na hora, durante o teste
-- do onboarding. Aplicar sozinha; não muda nada para quem não está na lista.

create table if not exists public.convidada_testers (
  email text primary key check (email = lower(email)),
  criado_em timestamptz not null default now()
);
alter table public.convidada_testers enable row level security;
revoke all on public.convidada_testers from anon, authenticated;

create or replace function public.convidada_ativa(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select convidada_ligada from public.grupos_config where id = 1), false)
      or exists (select 1 from auth.users u
                   join public.convidada_testers t on t.email = lower(u.email)
                  where u.id = p_uid);
$$;

create or replace function public.tipo_de_entrada(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.assinante(p_uid) then 'assinante'
    when public.convidada_ativa(p_uid) then 'convidada'
    else 'assinante'
  end;
$$;

create or replace function public.estado_acesso(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.assinante(p_uid) then 'assinante'
    when public.convidada_ativa(p_uid)
     and exists (select 1 from public.grupo_membros m
                   join public.grupos g on g.id = m.grupo_id and g.apagado_em is null
                  where m.user_id = p_uid and m.saiu_em is null) then 'convidada'
    else 'sem_acesso'
  end;
$$;

revoke all on function public.convidada_ativa(uuid) from public, anon, authenticated;
grant execute on function public.convidada_ativa(uuid) to service_role;
