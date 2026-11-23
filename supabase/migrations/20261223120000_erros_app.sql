-- ─────────────────────────────────────────────────────────────────────────────
-- erros_app (build 1.64): erros de tela pegos pelos ErrorBoundary do app
-- (`app/_layout.tsx` = 'raiz'; `components/ErroAba.tsx` = cada aba). O app grava com
-- `lib/erroApp.ts`. Motivo: uma assinante ficou presa em "Algo deu errado" e só soubemos
-- por e-mail (nov/2026).
--
-- Regras:
--   · o app SÓ insere (anon ou logada); ninguém lê, altera ou apaga pelo app — leitura só
--     pelo painel/service role;
--   · logada só grava com o próprio user_id (ou sem user_id); deslogada só sem user_id;
--   · 1 registro por erro por sessão do app: índice único em (sessao, assinatura), em que a
--     assinatura é o md5 de tela + nome + mensagem. O app já não repete; o banco garante;
--   · tamanhos limitados (o anon key é público).
-- Idempotente (pode rodar duas vezes).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.erros_app (
  id          uuid primary key default gen_random_uuid(),
  criado_em   timestamptz not null default now(),
  sessao      uuid not null,
  user_id     uuid references auth.users(id) on delete set null,
  tela        text not null check (char_length(tela) between 1 and 100),
  nome        text check (char_length(nome) <= 100),
  mensagem    text check (char_length(mensagem) <= 1000),
  stack       text check (char_length(stack) <= 4000),
  versao      text check (char_length(versao) <= 20),
  build       text check (char_length(build) <= 20),
  plataforma  text check (char_length(plataforma) <= 20),
  assinatura  text generated always as (
                md5(tela || '|' || coalesce(nome, '') || '|' || coalesce(mensagem, ''))
              ) stored
);

create unique index if not exists erros_app_sessao_assinatura_uk on public.erros_app (sessao, assinatura);
create index if not exists erros_app_criado_em_idx on public.erros_app (criado_em desc);
create index if not exists erros_app_user_idx on public.erros_app (user_id, criado_em desc) where user_id is not null;

alter table public.erros_app enable row level security;

revoke all on table public.erros_app from anon, authenticated;
grant insert (sessao, user_id, tela, nome, mensagem, stack, versao, build, plataforma)
  on table public.erros_app to anon, authenticated;

drop policy if exists erros_app_insert on public.erros_app;
create policy erros_app_insert on public.erros_app
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

comment on table public.erros_app is
  'Erros de tela pegos pelos ErrorBoundary do app (1.64). Só insert pelo app; 1 por erro por sessão (sessao, assinatura).';
