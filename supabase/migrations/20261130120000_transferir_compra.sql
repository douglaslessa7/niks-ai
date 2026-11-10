-- Transferência de compra entre contas (09/nov/2026).
--
-- Antes: a compra ligada a uma conta nunca mudava de dona. Quem criava outra conta com o mesmo
-- Apple ID pagava, não entrava e não conseguia restaurar.
--   • `comprovar_compra`: com `p_transferir`, a compra passa para a conta que mostrou a prova da
--     Apple. A conta antiga perde o acesso. Cada troca fica em `assinatura_transferencias`.
--   • `comprovada_por`: a conta que provou a compra com o JWS. Só `comprovar_compra` grava.
--   • `assinante()`: compra Sandbox vale para a conta que a provou (revisor da Apple e TestFlight).
--     Evento de webhook e id anônimo não bastam. `cartas_config.testers` continua valendo.
--   • `vincular_rc`: ids comparados sem diferenciar maiúsculas (o Superwall manda os dois jeitos).
--   • `assinatura_divergencias.original_transaction_id`: qual compra deu conflito.

begin;

alter table public.assinaturas_loja
  add column if not exists comprovada_por uuid references public.users(id) on delete set null;

alter table public.assinatura_divergencias
  add column if not exists original_transaction_id text;

create table if not exists public.assinatura_transferencias (
  id bigint generated always as identity primary key,
  original_transaction_id text not null,
  de_user_id uuid not null,
  para_user_id uuid not null,
  origem text,
  ambiente text,
  produto text,
  criado_em timestamptz not null default now()
);
create index if not exists assinatura_transferencias_otid_idx
  on public.assinatura_transferencias (original_transaction_id);

alter table public.assinatura_transferencias enable row level security;
revoke all on public.assinatura_transferencias from anon, authenticated;
grant select, insert on public.assinatura_transferencias to service_role;

-- Assinatura nova (8 argumentos): a antiga sai para a chamada de 6 argumentos da função no ar não
-- ficar ambígua. Essa chamada continua funcionando pelos valores padrão.
drop function if exists public.comprovar_compra(uuid, text, text, text, timestamptz, timestamptz);

create function public.comprovar_compra(
  p_uid uuid, p_otid text, p_produto text, p_ambiente text, p_expira timestamptz, p_quando timestamptz,
  p_transferir boolean default false, p_origem text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assinaturas_loja%rowtype;
  transferida boolean := false;
begin
  select * into a from public.assinaturas_loja where original_transaction_id = p_otid for update;
  if not found then
    insert into public.assinaturas_loja (original_transaction_id, user_id, comprovada_por, ids_rc, produto, ambiente, status, expira_em, ultimo_evento_em)
    values (p_otid, p_uid, p_uid, '{}', p_produto, p_ambiente, 'ativa', p_expira, p_quando);
    return jsonb_build_object('ok', true, 'criada', true);
  end if;
  if a.user_id is not null and a.user_id <> p_uid then
    if not coalesce(p_transferir, false) then
      return jsonb_build_object('ok', false, 'motivo', 'compra de outra conta');
    end if;
    insert into public.assinatura_transferencias (original_transaction_id, de_user_id, para_user_id, origem, ambiente, produto)
    values (p_otid, a.user_id, p_uid, p_origem, coalesce(a.ambiente, p_ambiente), coalesce(a.produto, p_produto));
    transferida := true;
  end if;
  update public.assinaturas_loja
     set user_id = p_uid,
         comprovada_por = p_uid,
         status = case when a.status = 'expirada' and p_quando > a.ultimo_evento_em then 'ativa' else a.status end,
         expira_em = case when a.status = 'reembolsada' then a.expira_em
                          when a.status = 'expirada' and p_quando <= a.ultimo_evento_em then a.expira_em
                          else greatest(a.expira_em, p_expira) end,
         atualizado_em = now()
   where original_transaction_id = p_otid;
  return jsonb_build_object('ok', true, 'transferida', transferida);
end;
$$;

revoke all on function public.comprovar_compra(uuid, text, text, text, timestamptz, timestamptz, boolean, text) from public, anon, authenticated;
grant execute on function public.comprovar_compra(uuid, text, text, text, timestamptz, timestamptz, boolean, text) to service_role;

create or replace function public.assinante(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assinaturas_loja a
     where a.user_id = p_uid
       and a.status in ('ativa', 'cancelada', 'problema_cobranca')
       and a.expira_em > now()
       and (coalesce(a.ambiente, 'PRODUCTION') <> 'SANDBOX'
            or a.comprovada_por = p_uid
            or exists (select 1 from public.cartas_config c where c.id = 1 and p_uid = any(c.testers)))
  );
$$;

create or replace function public.vincular_rc(p_uid uuid, p_rc_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  atual uuid;
  n integer := 0;
begin
  if p_rc_id is null or length(p_rc_id) < 8 or length(p_rc_id) > 200 then
    return jsonb_build_object('ok', false, 'motivo', 'id inválido');
  end if;
  -- O mais antigo manda: o mesmo id em outra caixa não muda de dona.
  select user_id into atual from public.contas_rc
   where lower(rc_id) = lower(p_rc_id) order by criado_em limit 1;
  if atual is null then
    insert into public.contas_rc (rc_id, user_id) values (p_rc_id, p_uid) on conflict (rc_id) do nothing;
    select user_id into atual from public.contas_rc where rc_id = p_rc_id;
  end if;
  if atual <> p_uid then
    return jsonb_build_object('ok', false, 'motivo', 'id de outra conta');
  end if;
  update public.assinaturas_loja set user_id = p_uid, atualizado_em = now()
   where user_id is null
     and exists (select 1 from unnest(ids_rc) x where lower(x) = lower(p_rc_id));
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'vinculadas', n, 'assinante', public.assinante(p_uid));
end;
$$;

commit;
