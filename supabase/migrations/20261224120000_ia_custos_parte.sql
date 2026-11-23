-- ia_custos.parte + ja_assinou() + gatilho (23/nov/2026)
-- Separa o custo de IA em "onboarding" e "app" sem chaves novas: toda chamada de IA
-- (OpenAI, Anthropic, Google, Replicate) grava uma linha em ia_custos, e o BANCO decide
-- a parte na hora do insert:
--   · 'app'        → a conta JÁ ASSINOU ALGUMA VEZ (qualquer linha em assinaturas_loja,
--                    em qualquer status, com as mesmas regras de sandbox da assinante(),
--                    ou conta de teste);
--   · 'onboarding' → nunca assinou, ou chamada sem conta (antes do cadastro);
--   · 'interno'    → só quando a função manda (ex.: recortar-catalogo, trabalho de admin).
-- O gatilho nunca derruba o insert: erro na decisão → parte fica null (o insert segue,
-- porque o gasto por conta da Anthropic é somado daqui).
-- As gravações já acontecem em segundo plano (EdgeRuntime.waitUntil), então o gatilho
-- não entra no tempo de resposta de nenhuma função.
--
-- Também: a conta 2 da Anthropic passa a se chamar "Conta 2 (Paulo)".
--
-- Desfazer:
--   drop trigger if exists ia_custos_parte on public.ia_custos;
--   drop function if exists public.ia_custos_definir_parte();
--   drop function if exists public.ja_assinou(uuid);
--   alter table public.ia_custos drop constraint if exists ia_custos_parte_valida;
--   alter table public.ia_custos drop column if exists parte;
--   update public.anthropic_contas set nome = 'Conta 2 (sócio)' where id = 2;

alter table public.ia_custos add column if not exists parte text;
alter table public.ia_custos drop constraint if exists ia_custos_parte_valida;
alter table public.ia_custos add constraint ia_custos_parte_valida
  check (parte is null or parte in ('onboarding', 'app', 'interno'));

comment on column public.ia_custos.parte is
  'onboarding | app | interno — decidida pelo gatilho ia_custos_parte (ja_assinou) no insert, salvo quando a função manda. provedor = empresa (anthropic, openai, google, replicate).';

-- Já assinou alguma vez (qualquer status). Mesmas regras de sandbox/teste da assinante().
create or replace function public.ja_assinou(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    exists (
      select 1 from public.assinaturas_loja a
       where a.user_id = p_uid
         and (coalesce(a.ambiente, 'PRODUCTION') <> 'SANDBOX'
              or a.comprovada_por = p_uid
              or exists (select 1 from public.cartas_config c where c.id = 1 and p_uid = any(c.testers)))
    )
    or exists (select 1 from public.contas_teste t where t.user_id = p_uid)
  );
$$;

revoke execute on function public.ja_assinou(uuid) from public, anon, authenticated;

create or replace function public.ia_custos_definir_parte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parte is null then
    begin
      new.parte := case when public.ja_assinou(new.user_id) then 'app' else 'onboarding' end;
    exception when others then
      new.parte := null;
    end;
  end if;
  return new;
end;
$$;

revoke execute on function public.ia_custos_definir_parte() from public, anon, authenticated;

drop trigger if exists ia_custos_parte on public.ia_custos;
create trigger ia_custos_parte
  before insert on public.ia_custos
  for each row execute function public.ia_custos_definir_parte();

-- Linhas antigas (niks-chat, analisar-produto, sos-espinha): pela situação de HOJE.
update public.ia_custos
   set parte = case when public.ja_assinou(user_id) then 'app' else 'onboarding' end
 where parte is null;

update public.anthropic_contas set nome = 'Conta 2 (Paulo)', atualizado_em = now() where id = 2;
