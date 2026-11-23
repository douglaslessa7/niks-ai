-- ─────────────────────────────────────────────────────────────────────────────
-- Aceite dos Termos registrado pelo SERVIDOR até a build 1.64 (19/nov/2026, OK do produto).
--
-- Até a 1.64 o app não grava `users.termos_aceitos_em`. As duas telas que criam conta mostram
-- a frase dos Termos desde a 1.62 — o cadastro ("Ao criar a conta, você aceita os Termos de Uso
-- e a Política de Privacidade") e o login ("Ao continuar, você concorda com nossos Termos de Uso
-- e Política de Privacidade"; o "Entrar" com Apple/Google cria conta nova) — e os Termos com a
-- cláusula da Apple (seção 4) foram publicados por volta de 16:50 UTC de 19/11/2026. A cada
-- 15 min, esta tarefa registra o aceite, com a data de criação da conta e a versão
-- 'termos-2026-11-19', de cada conta que:
--   · foi criada depois de 19/11/2026 17:00 UTC (pelo cadastro ou pelo login);
--   · não está em `contas_teste` e ainda não tem aceite.
-- Grava por id, e cada conta tocada fica em `termos_retroativo_log` (backup e desfazer).
--
-- PARA SOZINHA quando o app (1.64) passar a gravar: 3 contas fora de `contas_teste`, criadas
-- depois que a tarefa entrou, com aceite que NÃO veio dela → a tarefa se desagenda e registra
-- 'parou' em `termos_retroativo_log` (user_id nulo).
--
-- Gatilho `users_termos_aceitos`: quando o APP grava (papéis authenticated/anon), a data
-- continua sendo a do servidor no 1º aceite; quando quem grava é o próprio servidor (esta
-- tarefa, service role), vale a data enviada (a de criação da conta).
--
-- Parar na hora:   select cron.unschedule('termos-aceite-retroativo');
-- Desfazer o que a tarefa gravou (só as contas do log):
--   update public.users u set termos_aceitos_em = null, termos_versao = null
--     from public.termos_retroativo_log l where l.user_id = u.id;   -- (com o gatilho em vigor, null passa)
-- Remover tudo:    select cron.unschedule('termos-aceite-retroativo');
--   drop function if exists public.registrar_aceite_termos_retroativo(); drop table if exists public.termos_retroativo_log;
--   (e reaplicar o gatilho da 20261218120000)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Gatilho: data do servidor quando o app grava; data enviada quando o servidor grava.
create or replace function public.users_termos_aceitos()
returns trigger
language plpgsql
as $$
begin
  if new.termos_aceitos_em is null then
    new.termos_versao := null;                  -- retirou o aceite
  elsif tg_op = 'UPDATE' and old.termos_aceitos_em is not null then
    -- Já tinha aceitado: gravar de novo não muda a data nem a versão do 1º aceite.
    new.termos_aceitos_em := old.termos_aceitos_em;
    new.termos_versao := old.termos_versao;
  elsif current_user in ('authenticated', 'anon') then
    new.termos_aceitos_em := now();             -- 1º aceite pelo app: data do servidor
  end if;                                       -- servidor (tarefa): vale a data enviada
  return new;
end;
$$;

-- 2. Backup / registro do que a tarefa gravou
create table if not exists public.termos_retroativo_log (
  id bigint generated always as identity primary key,
  user_id uuid unique,
  conta_criada_em timestamptz,
  aplicado_em timestamptz not null default now(),
  origem text not null default 'tarefa'
);
alter table public.termos_retroativo_log enable row level security;
revoke all on public.termos_retroativo_log from anon, authenticated;

-- As 2 contas gravadas à mão em 19/nov/2026 (por id), para o log ficar completo.
insert into public.termos_retroativo_log (user_id, conta_criada_em, origem)
select u.id, a.created_at, 'manual-19nov'
  from public.users u join auth.users a on a.id = u.id
 where u.id in ('2ab90b64-2d49-4cab-a40d-71a1758fa2a0'::uuid, '78ba48d5-2ff4-4b4e-9083-f48d57ca87e2'::uuid)
on conflict (user_id) do nothing;

-- 3. A tarefa
create or replace function public.registrar_aceite_termos_retroativo()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  desde constant timestamptz := '2026-11-19 17:00:00+00';
  inicio timestamptz;
  pelo_app integer;
  r record;
  n integer := 0;
begin
  -- Já parou? (marca 'parou' no log)
  if exists (select 1 from public.termos_retroativo_log where origem = 'parou') then return 0; end if;

  -- O app (1.64) já grava sozinho? Contas criadas depois que a tarefa entrou, com aceite que
  -- não veio dela nem é conta de teste.
  select min(aplicado_em) into inicio from public.termos_retroativo_log where origem = 'inicio';
  if inicio is null then
    insert into public.termos_retroativo_log (origem) values ('inicio') returning aplicado_em into inicio;
  end if;
  select count(*) into pelo_app
    from public.users u join auth.users a on a.id = u.id
   where a.created_at > inicio and u.termos_aceitos_em is not null
     and u.id not in (select l.user_id from public.termos_retroativo_log l where l.user_id is not null)
     and u.id not in (select t.user_id from public.contas_teste t);
  if pelo_app >= 3 then
    insert into public.termos_retroativo_log (origem) values ('parou');
    perform cron.unschedule('termos-aceite-retroativo');
    return -1;
  end if;

  for r in
    select u.id, a.created_at
      from public.users u join auth.users a on a.id = u.id
     where a.created_at > desde
       and u.termos_aceitos_em is null
       and u.id not in (select t.user_id from public.contas_teste t)
     order by a.created_at
     limit 500
  loop
    insert into public.termos_retroativo_log (user_id, conta_criada_em) values (r.id, r.created_at)
      on conflict (user_id) do nothing;
    update public.users set termos_aceitos_em = r.created_at, termos_versao = 'termos-2026-11-19'
     where id = r.id and termos_aceitos_em is null;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.registrar_aceite_termos_retroativo() from public, anon, authenticated;
grant execute on function public.registrar_aceite_termos_retroativo() to service_role;

-- 4. A cada 15 min
do $$
begin
  if exists (select 1 from cron.job where jobname = 'termos-aceite-retroativo') then
    perform cron.unschedule('termos-aceite-retroativo');
  end if;
end $$;
select cron.schedule('termos-aceite-retroativo', '*/15 * * * *', $job$ select public.registrar_aceite_termos_retroativo(); $job$);
