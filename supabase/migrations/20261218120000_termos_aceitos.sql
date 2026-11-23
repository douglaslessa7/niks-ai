-- ─────────────────────────────────────────────────────────────────────────────
-- Aceite dos Termos de Uso no cadastro (build 1.64) — 19/nov/2026, decisão do produto.
-- Substitui a caixinha própria de consentimento (migration 20261217120000): o cadastro mostra
-- "Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade" e o app grava
-- o aceite. A seção 4 dos Termos publicados em 19/11/2026 cobre o envio de dados de uso à
-- Apple em pedidos de reembolso; a função `apple-notificacoes` só responde por quem tem
-- `termos_aceitos_em` ANTES do pedido.
--
-- 1. users.termos_aceitos_em / termos_versao — a data é SEMPRE a do servidor no 1º aceite
--    (gatilho); gravar de novo não muda o 1º; null retira (a versão vai junto).
-- 2. Sai o que a caixinha usava e ninguém preencheu (0 contas em 19/nov/2026):
--    users.consentimento_reembolso_em / _versao e o gatilho deles.
--
-- Desfazer:
--   drop trigger if exists users_termos_aceitos_trg on public.users;
--   drop function if exists public.users_termos_aceitos();
--   alter table public.users drop column if exists termos_versao, drop column if exists termos_aceitos_em;
--   (e reaplicar a parte 5 da 20261217120000 para voltar com as colunas antigas)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Aceite dos Termos
alter table public.users add column if not exists termos_aceitos_em timestamptz;
alter table public.users add column if not exists termos_versao text;

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
  else
    new.termos_aceitos_em := now();             -- 1º aceite: a data é sempre a do servidor
  end if;
  return new;
end;
$$;
drop trigger if exists users_termos_aceitos_trg on public.users;
create trigger users_termos_aceitos_trg
  before insert or update of termos_aceitos_em on public.users
  for each row execute function public.users_termos_aceitos();

-- 2. A caixinha de consentimento saiu
drop trigger if exists users_consentimento_reembolso_trg on public.users;
drop function if exists public.users_consentimento_reembolso();
alter table public.users drop column if exists consentimento_reembolso_versao;
alter table public.users drop column if exists consentimento_reembolso_em;
