-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 1 da gamificação — NIKS Points (esquema).
--
-- Toda carta revela os NIKS Points dela ao ser raspada. O valor é sorteado no servidor
-- dentro da faixa da AÇÃO que gerou a carta (rotina, scan de rosto, marco, carta de
-- volta e, inativas até as fases delas, check-in no grupo, SOS e produto no grupo).
-- Rara ×3, Pontos em dobro ×2. O total e o nível da usuária ficam em pontos_usuario.
-- Tudo em cartas_config.pontos (editável sem deploy). As funções estão na migration
-- seguinte (20261103130000_niks_points_motor.sql).
-- ─────────────────────────────────────────────────────────────────────────────

-- Configuração dos pontos e dos níveis ─────────────────────────────────────────
-- acoes.<ação>: faixa (min–max) e teto. `por_dia` = cartas por dia de sessão;
-- `janela_dias` = 1 carta a cada N dias (scan). `ativa = false` = a ação não dá carta.
-- niveis: pontos para chegar em cada nível (1 a 11, o 11 é o Ícone). Depois do Ícone,
-- "Ícone II", "Ícone III"…: o 1º pede icone_passo e cada um seguinte +icone_incremento.
-- retro_por_rotina: pontos retroativos por rotina já registrada (média da faixa da rotina).
alter table public.cartas_config add column if not exists pontos jsonb not null default '{
  "acoes": {
    "rotina":        {"min": 15, "max": 30, "por_dia": 2, "ativa": true},
    "scan_rosto":    {"min": 40, "max": 60, "janela_dias": 7, "ativa": true},
    "marco":         {"min": 15, "max": 30, "ativa": true},
    "volta":         {"min": 15, "max": 30, "ativa": true},
    "checkin_grupo": {"min": 10, "max": 20, "por_dia": 1, "ativa": false},
    "sos":           {"min": 10, "max": 20, "por_dia": 1, "ativa": false},
    "produto_grupo": {"min": 10, "max": 20, "por_dia": 1, "ativa": false}
  },
  "mult_rara": 3,
  "mult_dobro": 2,
  "retro_por_rotina": 22.5,
  "niveis": [0, 90, 225, 405, 630, 945, 1350, 1800, 2385, 3150, 4050],
  "titulos": ["Cara Lavada", "Hidratadinha", "Inimiga da Espinha", "Sem Filtro", "Pele de Pêssego",
              "Pele de Rica", "Pele de Novela", "Glass Skin", "Inveja das Amigas", "Pele que Humilha", "Ícone"],
  "icone_passo": 945,
  "icone_incremento": 45
}'::jsonb;

-- Ajustes do motor: 30% de poder nas cartas depois da 1ª do dia, Carta de volta com 2 dias
-- sem rotina (substitui o momento "voltando"), sem dicas, limite semanal do Pontos em dobro.
update public.cartas_config
   set motor = jsonb_set(
                 (motor - 'voltando')
                   || '{"poder_seguintes_pct": 30, "volta": {"dias_sem_rotina": 2}, "nao_poder": {"colecionavel": 100, "dica": 0}}'::jsonb,
                 '{limites,pontos_dobro_dias}', '7'::jsonb, true),
       atualizado_em = now()
 where id = 1;

-- Cartas ganhas: pontos e a ação que gerou a carta ───────────────────────────────
-- `acao` deduplica (1 carta por ação): 'rotina:am', 'rotina:pm', 'rotina:extra',
-- 'scan_rosto', 'marco:7', 'volta:<último dia com rotina>'… 'legado' = carta de antes
-- dos NIKS Points (vale 0 pontos: a rotina dela já entra nos pontos retroativos).
alter table public.cartas_usuario add column if not exists pontos integer;
alter table public.cartas_usuario add column if not exists acao text;

alter table public.cartas_usuario drop constraint if exists cartas_usuario_pontos;
alter table public.cartas_usuario add constraint cartas_usuario_pontos check (pontos is null or pontos >= 0);

create unique index if not exists cartas_usuario_acao_uq
  on public.cartas_usuario (user_id, dia, acao)
  where acao is not null and acao <> 'legado';

alter table public.cartas_usuario drop constraint if exists cartas_usuario_origem;
alter table public.cartas_usuario add constraint cartas_usuario_origem check (origem in (
  'rotina', 'sos', 'surpresa', 'grupo', 'marco', 'volta', 'scan_rosto', 'checkin_grupo', 'produto_grupo'
));

-- Poder "Pontos em dobro" (era "XP em dobro para o grupo") ─────────────────────────
-- 'xp_grupo_dobro' continua aceito só para a carta de teste antiga ser convertida por id
-- depois desta migration; nada novo usa esse nome.
alter table public.cartas_catalogo drop constraint if exists cartas_catalogo_subtipo;
alter table public.cartas_catalogo add constraint cartas_catalogo_subtipo check (
  (familia = 'colecionavel' and subtipo is null and serie is not null)
  or (familia = 'conhecimento' and subtipo in ('educativa', 'pessoal', 'momento'))
  or (familia = 'poder' and subtipo in ('pontos_dobro', 'xp_grupo_dobro', 'scan_antecipado', 'carta_extra',
                                         'protecao_sequencia', 'sequencia_dobro'))
);

alter table public.poderes_usuario drop constraint if exists poderes_usuario_tipo;
alter table public.poderes_usuario add constraint poderes_usuario_tipo check (tipo in (
  'pontos_dobro', 'xp_grupo_dobro', 'scan_antecipado', 'carta_extra', 'protecao_sequencia', 'sequencia_dobro'
));

-- Total e nível da usuária ───────────────────────────────────────────────────────
-- nivel_visto = último nível que ela já viu celebrado (nivel > nivel_visto → o app
-- celebra e confirma). retro_visto = já viu a celebração dos pontos retroativos.
create table if not exists public.pontos_usuario (
  user_id       uuid primary key references public.users(id) on delete cascade,
  total         integer not null default 0,
  nivel         integer not null default 1,
  nivel_visto   integer not null default 1,
  retro_em      timestamptz,
  retro_pontos  integer,
  retro_visto   boolean not null default false,
  atualizado_em timestamptz not null default now(),
  constraint pontos_usuario_total check (total >= 0),
  constraint pontos_usuario_nivel check (nivel >= 1 and nivel_visto >= 1)
);

alter table public.pontos_usuario enable row level security;

drop policy if exists pontos_usuario_select_own on public.pontos_usuario;
create policy pontos_usuario_select_own on public.pontos_usuario
  for select to authenticated using (auth.uid() = user_id);
