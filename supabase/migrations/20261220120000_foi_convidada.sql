-- ─────────────────────────────────────────────────────────────────────────────
-- "Já foi convidada" guardado na conta (22/nov/2026, OK do produto; build 1.64).
--
-- Com o modo convidada ligado, a tela "Você não está em nenhum grupo" só pode aparecer para quem
-- FOI convidada de grupo de verdade e perdeu o acesso. Até aqui o app só sabia disso pelo próprio
-- aparelho; agora o servidor guarda e devolve junto com o estado de acesso (função `grupos`,
-- ação `estado` → `{ estado, foi_convidada }`), valendo em qualquer celular.
--
--   · `users.foi_convidada_em`: 1ª vez em que entrou num grupo como convidada (nunca é apagado,
--     nem quando ela sai, é removida, assina ou o grupo some);
--   · gatilho em `grupo_membros` (insert ou troca de `tipo` para 'convidada') grava a data;
--   · backfill: quem já tem linha 'convidada' em `grupo_membros` (data = entrou_em mais antiga);
--   · `foi_convidada(uid)`: a coluna OU uma linha 'convidada' (caso a linha de `users` ainda não
--     existisse quando ela entrou). Só o service role executa.
--
-- Desfazer: drop trigger if exists grupo_membros_foi_convidada on public.grupo_membros;
--   drop function if exists public.marcar_foi_convidada(); drop function if exists public.foi_convidada(uuid);
--   alter table public.users drop column if exists foi_convidada_em;
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.users add column if not exists foi_convidada_em timestamptz;

create or replace function public.marcar_foi_convidada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'convidada' then
    update public.users set foi_convidada_em = coalesce(new.entrou_em, now())
     where id = new.user_id and foi_convidada_em is null;
  end if;
  return new;
end;
$$;
revoke all on function public.marcar_foi_convidada() from public, anon, authenticated;

drop trigger if exists grupo_membros_foi_convidada on public.grupo_membros;
create trigger grupo_membros_foi_convidada
  after insert or update of tipo on public.grupo_membros
  for each row execute function public.marcar_foi_convidada();

-- Backfill (idempotente): só quem ainda não tem a data.
update public.users u
   set foi_convidada_em = m.desde
  from (select user_id, min(coalesce(entrou_em, now())) desde
          from public.grupo_membros where tipo = 'convidada' group by user_id) m
 where m.user_id = u.id and u.foi_convidada_em is null;

create or replace function public.foi_convidada(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = p_uid and foi_convidada_em is not null)
      or exists (select 1 from public.grupo_membros where user_id = p_uid and tipo = 'convidada');
$$;
revoke all on function public.foi_convidada(uuid) from public, anon, authenticated;
grant execute on function public.foi_convidada(uuid) to service_role;
