-- ─────────────────────────────────────────────────────────────────────────────
-- Chave do pedido de avaliação da App Store no onboarding (23/nov/2026, build 1.64).
--
-- `avaliacao_onboarding`: 'brasil' = pede (no "Seu caminho") só para quem tem a conta da App Store
-- do Brasil (storefront BRA) E a região do iPhone BR; 'desligado' = ninguém vê. Vale sem build nova:
-- o app lê pela função `grupos` (ação `convidada_status`, sem login, junto com a versão mínima).
-- Sem a tabela, sem a linha ou com outro valor, o app NÃO pede.
--
-- 1 linha (id = 1), RLS sem policy: só o service role lê (a função).
--
-- Ligar/desligar: update public.avaliacao_config set avaliacao_onboarding = 'desligado' where id = 1;
-- Desfazer: drop table if exists public.avaliacao_config;
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.avaliacao_config (
  id smallint primary key default 1 check (id = 1),
  avaliacao_onboarding text not null default 'brasil'
    check (avaliacao_onboarding in ('brasil', 'desligado')),
  atualizado_em timestamptz not null default now()
);

alter table public.avaliacao_config enable row level security;

insert into public.avaliacao_config (id, avaliacao_onboarding)
values (1, 'brasil')
on conflict (id) do nothing;
