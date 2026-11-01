-- ─────────────────────────────────────────────────────────────────────────────
-- Sistema de cartas (F1a): catálogo, séries, configuração e bucket das artes.
--
-- Famílias: 'colecionavel' (só arte, em séries), 'conhecimento' (subtipo 'educativa' =
-- texto fixo; 'pessoal' = gerada da foto, ex. SOS espinha; 'momento' = UV/clima, texto
-- com {variaveis}) e 'poder' (subtipo = o tipo do poder; vale na hora de raspar).
-- Raridade: 'normal' ou 'rara'. O catálogo cresce sem build: importar por CSV
-- (scripts/cartas/importar.mjs) com upsert por `codigo`.
--
-- `apenas_teste`: cartas de exemplo do desenvolvimento — o sorteio só as dá para quem
-- está em cartas_config.testers.
--
-- cartas_config: UMA linha (id = 1), igual à chat_config — as chances e cotas mudam sem
-- deploy (a função `cartas` relê a cada 60 s). Só o service role lê.
--
-- A leitura do catálogo pela usuária fica na migration seguinte (precisa de
-- cartas_usuario para liberar as cartas que ela já tem, mesmo desativadas).
-- ─────────────────────────────────────────────────────────────────────────────

-- Séries das colecionáveis ───────────────────────────────────────────────────
create table if not exists public.cartas_series (
  codigo        text primary key,             -- ex.: 'flores-do-niks'
  nome          text not null,                -- ex.: 'Flores do NIKS'
  ordem         integer not null default 0,
  ativa         boolean not null default true,
  criada_em     timestamptz not null default now(),
  constraint cartas_series_codigo check (codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

alter table public.cartas_series enable row level security;

drop policy if exists cartas_series_select on public.cartas_series;
create policy cartas_series_select on public.cartas_series
  for select to authenticated using (true);

-- Catálogo ───────────────────────────────────────────────────────────────────
create table if not exists public.cartas_catalogo (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,          -- chave do CSV
  familia       text not null,
  subtipo       text,
  serie         text references public.cartas_series(codigo) on update cascade,
  nome          text not null,
  raridade      text not null default 'normal',
  arte_path     text,                          -- caminho no bucket `cartas` (ex.: 'flores-do-niks/rosa.png')
  texto         text,                          -- fixo, ou modelo com {uv}, {cidade}… nas 'momento'
  efeito        jsonb,                         -- poderes: ex. {"dias": 2}
  ativa         boolean not null default true,
  apenas_teste  boolean not null default false,
  ordem         integer not null default 0,
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  constraint cartas_catalogo_codigo check (codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint cartas_catalogo_familia check (familia in ('colecionavel', 'conhecimento', 'poder')),
  constraint cartas_catalogo_raridade check (raridade in ('normal', 'rara')),
  constraint cartas_catalogo_subtipo check (
    (familia = 'colecionavel' and subtipo is null and serie is not null)
    or (familia = 'conhecimento' and subtipo in ('educativa', 'pessoal', 'momento'))
    or (familia = 'poder' and subtipo in ('xp_grupo_dobro', 'scan_antecipado', 'carta_extra', 'protecao_sequencia', 'sequencia_dobro'))
  )
);

create index if not exists cartas_catalogo_sorteio_idx
  on public.cartas_catalogo (familia, subtipo, raridade) where ativa;

alter table public.cartas_catalogo enable row level security;

-- Configuração (1 linha) ─────────────────────────────────────────────────────
create table if not exists public.cartas_config (
  id                      integer primary key default 1,
  -- Peso de cada família por origem. 'surpresa' sorteia entre 'momento' e 'poder'.
  pesos                   jsonb not null default '{
    "rotina":   {"colecionavel": 70, "conhecimento": 20, "poder": 10},
    "marco":    {"colecionavel": 70, "conhecimento": 20, "poder": 10},
    "grupo":    {"colecionavel": 70, "conhecimento": 20, "poder": 10},
    "surpresa": {"momento": 60, "poder": 40}
  }'::jsonb,
  rara_pct                numeric(5,2) not null default 10,
  rara_grupo_pct          numeric(5,2) not null default 25,
  cartas_por_dia          integer not null default 1,     -- da rotina (Carta extra soma +1)
  marcos                  integer[] not null default '{7,14,30}',
  surpresa_inicio_hora    integer not null default 10,    -- janela do horário sorteado (Brasília)
  surpresa_fim_hora       integer not null default 20,
  surpresa_validade_min   integer not null default 180,
  sos_modelo              text not null default 'gpt-5.4-mini',
  sos_por_dia             integer not null default 1,
  testers                 uuid[] not null default '{}',   -- recebem as cartas apenas_teste
  atualizado_em           timestamptz not null default now(),
  constraint cartas_config_uma_linha check (id = 1),
  constraint cartas_config_rara check (rara_pct between 0 and 100 and rara_grupo_pct between 0 and 100),
  constraint cartas_config_cota check (cartas_por_dia >= 0 and sos_por_dia >= 0),
  constraint cartas_config_janela check (surpresa_inicio_hora between 0 and 23 and surpresa_fim_hora between 1 and 24 and surpresa_inicio_hora < surpresa_fim_hora and surpresa_validade_min > 0)
);

insert into public.cartas_config (id) values (1) on conflict (id) do nothing;

alter table public.cartas_config enable row level security;

-- Bucket PÚBLICO das artes ───────────────────────────────────────────────────
-- Leitura pela URL pública; escrita só pelo service role (script de importação).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cartas', 'cartas', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
