-- ─────────────────────────────────────────────────────────────────────────────
-- Sistema de cartas (F1b): cartas ganhas, poderes e a coleção.
--
-- cartas_usuario: UMA linha por carta ganha (repetidas = várias linhas da mesma
-- carta_id). `raspada_em` vazio = ganhou e ainda não raspou. `conteudo` guarda o texto
-- gerado nas cartas pessoais / do momento. Só a função `cartas` (service role) escreve.
-- poderes_usuario: o efeito de um Poder, criado na hora em que ela raspa; `fim` = até
-- quando vale (nulo = armado até ser consumido), `consumido_em` = quando foi usado.
-- cartas_colecao: a coleção raspada, uma linha por carta com quantas vezes ela veio (o "x2").
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.cartas_usuario (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  carta_id    uuid not null references public.cartas_catalogo(id),
  origem      text not null,
  dia         date not null,                  -- dia de sessão (vira às 04:00, Brasília)
  ganha_em    timestamptz not null default now(),
  raspada_em  timestamptz,
  conteudo    jsonb,
  constraint cartas_usuario_origem check (origem in ('rotina', 'sos', 'surpresa', 'grupo', 'marco'))
);

create index if not exists cartas_usuario_user_idx on public.cartas_usuario (user_id, ganha_em desc);
create index if not exists cartas_usuario_dia_idx on public.cartas_usuario (user_id, dia, origem);

alter table public.cartas_usuario enable row level security;

drop policy if exists cartas_usuario_select_own on public.cartas_usuario;
create policy cartas_usuario_select_own on public.cartas_usuario
  for select to authenticated using (auth.uid() = user_id);

create table if not exists public.poderes_usuario (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  carta_usuario_id  uuid not null unique references public.cartas_usuario(id) on delete cascade,
  tipo              text not null,
  inicio            timestamptz not null default now(),
  fim               timestamptz,
  consumido_em      timestamptz,
  dados             jsonb,
  constraint poderes_usuario_tipo check (tipo in ('xp_grupo_dobro', 'scan_antecipado', 'carta_extra', 'protecao_sequencia', 'sequencia_dobro'))
);

create index if not exists poderes_usuario_ativos_idx on public.poderes_usuario (user_id, tipo) where consumido_em is null;

alter table public.poderes_usuario enable row level security;

drop policy if exists poderes_usuario_select_own on public.poderes_usuario;
create policy poderes_usuario_select_own on public.poderes_usuario
  for select to authenticated using (auth.uid() = user_id);

-- Catálogo: ela lê as cartas ativas (menos as de teste) e qualquer carta que já tenha
-- ganho — inclusive de teste ou desativadas, para o álbum não perder cartas.
drop policy if exists cartas_catalogo_select on public.cartas_catalogo;
create policy cartas_catalogo_select on public.cartas_catalogo
  for select to authenticated using (
    (ativa and not apenas_teste)
    or exists (select 1 from public.cartas_usuario cu where cu.carta_id = cartas_catalogo.id and cu.user_id = auth.uid())
  );

-- Coleção raspada ────────────────────────────────────────────────────────────
create or replace view public.cartas_colecao
with (security_invoker = true) as
select user_id,
       carta_id,
       count(*)::integer as vezes,
       min(raspada_em)   as primeira_em,
       max(raspada_em)   as ultima_em
  from public.cartas_usuario
 where raspada_em is not null
 group by user_id, carta_id;

grant select on public.cartas_colecao to authenticated;
