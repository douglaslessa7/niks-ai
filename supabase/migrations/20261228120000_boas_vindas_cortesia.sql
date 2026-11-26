-- ─────────────────────────────────────────────────────────────────────────────
-- Cortesia de boas-vindas (26/nov/2026, decisão do produto).
--
-- De 12 a 26/nov a função `boas_vindas` recusava quase toda conta nova (o scan do rosto do
-- cadastro já tinha dado pontos — corrigido na 20261226120000). Quem assinou nesse período viu
-- "+100 NIKS Points" e não recebeu. A cortesia credita +100 a essas contas, de forma rastreável:
--   • ação própria `boas_vindas_cortesia` em `pontos_eventos` (decisao.origem = 'cortesia');
--   • `boas_vindas_cortesia_lote`: a lista congelada ANTES do crédito, com total/nível de antes
--     (o desfazer usa exatamente estas contas — scripts/boas-vindas-cortesia/);
--   • `boas_vindas_cortesia(p_uid)`: uma vez por conta; pula quem já tem `boas_vindas` ou
--     `boas_vindas_cortesia`; soma pelo mesmo `v2_somar`. NÃO mexe em sequência, cartas nem
--     `nivel_visto` (o app celebra o nível novo na Caminhada, como em qualquer ganho de pontos).
--   • `boas_vindas` passa a pular também quem recebeu a cortesia (nunca as duas).
-- O crédito em si NÃO está aqui: é o scripts/boas-vindas-cortesia/creditar.sql (com OK).
-- Só o service role executa.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.pontos_eventos drop constraint if exists pontos_eventos_acao;
alter table public.pontos_eventos add constraint pontos_eventos_acao check (acao = any (array[
  'rotina:am', 'rotina:pm', 'checkin_grupo', 'scan_rosto', 'produto_grupo', 'dobro', 'boas_vindas',
  'desafio:1', 'desafio:2', 'desafio:3', 'desafio:4', 'skincare_dia', 'missoes', 'boas_vindas_cortesia']));

create table if not exists public.boas_vindas_cortesia_lote (
  user_id            uuid primary key references public.users(id) on delete cascade,
  total_antes        integer not null,
  nivel_antes        integer not null,
  nivel_visto_antes  integer not null,
  congelada_em       timestamptz not null default now(),
  creditada_em       timestamptz,
  vista_em           timestamptz          -- o card "Seus 100 NIKS Points chegaram" (app)
);
alter table public.boas_vindas_cortesia_lote enable row level security;

create or replace function public.boas_vindas_cortesia(p_uid uuid, p_pontos integer default 100, p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := public.dia_sessao(p_agora);
  novo uuid;
  soma jsonb;
begin
  if exists (select 1 from public.pontos_eventos where user_id = p_uid and acao in ('boas_vindas', 'boas_vindas_cortesia')) then
    raise log 'boas_vindas_cortesia pulada: ja_recebeu uid=%', p_uid;
    return jsonb_build_object('ok', false, 'motivo', 'ja_recebeu');
  end if;
  insert into public.pontos_eventos (user_id, dia, acao, pontos, base, decisao)
  values (p_uid, hoje, 'boas_vindas_cortesia', p_pontos, p_pontos,
          jsonb_build_object('origem', 'cortesia', 'motivo', 'boas-vindas recusadas 12-26/nov/2026'))
  on conflict (user_id, dia, acao) do nothing
  returning id into novo;
  if novo is null then
    return jsonb_build_object('ok', false, 'motivo', 'ja_recebeu');
  end if;
  soma := public.v2_somar(p_uid, p_pontos);
  update public.boas_vindas_cortesia_lote set creditada_em = now() where user_id = p_uid;
  return jsonb_build_object('ok', true, 'pontos', p_pontos) || soma;
end;
$$;

revoke all on function public.boas_vindas_cortesia(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.boas_vindas_cortesia(uuid, integer, timestamptz) to service_role;

-- `boas_vindas` igual à 20261226120000, pulando também quem recebeu a cortesia.
create or replace function public.boas_vindas(p_uid uuid, p_produtos integer default 0, p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  hoje date := public.dia_sessao(p_agora);
  pts integer;
  pts_pacto integer;
  n_prod integer;
  novo uuid;
  soma jsonb;
  s public.sequencias%rowtype;
begin
  select boas_vindas into cfg from public.cartas_config where id = 1;
  if cfg is null or not coalesce((cfg ->> 'ativa')::boolean, true) then
    raise log 'boas_vindas recusada: desligada uid=%', p_uid;
    return jsonb_build_object('ok', false, 'motivo', 'desligada');
  end if;
  if exists (select 1 from public.pontos_eventos where user_id = p_uid and acao in ('boas_vindas', 'boas_vindas_cortesia')) then
    raise log 'boas_vindas recusada: ja_recebeu uid=%', p_uid;
    return jsonb_build_object('ok', false, 'motivo', 'ja_recebeu');
  end if;
  -- "Conta antiga" (26/nov/2026): skincare registrado, OU algum evento de pontos que não seja o
  -- scan do rosto (o do cadastro dá pontos ANTES das boas-vindas), OU conta com mais de 7 dias.
  -- Antes era "qualquer ponto" — e desde 12/nov o scan do cadastro barrava toda conta nova.
  if exists (select 1 from public.rotinas_concluidas where user_id = p_uid)
     or exists (select 1 from public.pontos_eventos where user_id = p_uid and acao <> 'scan_rosto')
     or coalesce((select created_at from auth.users where id = p_uid) < p_agora - interval '7 days', false) then
    raise log 'boas_vindas recusada: conta_antiga uid=%', p_uid;
    return jsonb_build_object('ok', false, 'motivo', 'conta_antiga');
  end if;

  pts_pacto := greatest(coalesce((cfg ->> 'pontos')::int, 100), 0);
  n_prod := least(greatest(coalesce(p_produtos, 0), 0), greatest(coalesce((cfg ->> 'produtos_max')::int, 10), 0));
  pts := pts_pacto + n_prod * greatest(coalesce((cfg ->> 'pontos_produto')::int, 20), 0);
  insert into public.pontos_eventos (user_id, dia, acao, pontos, base, decisao)
  values (p_uid, hoje, 'boas_vindas', pts, pts,
          jsonb_build_object('origem', 'boas_vindas', 'pacto', pts_pacto, 'produtos', n_prod))
  on conflict (user_id, dia, acao) do nothing
  returning id into novo;
  if novo is null then
    raise log 'boas_vindas recusada: ja_recebeu (mesmo dia) uid=%', p_uid;
    return jsonb_build_object('ok', false, 'motivo', 'ja_recebeu');
  end if;

  soma := public.v2_somar(p_uid, pts);
  update public.pontos_usuario
     set nivel_visto = greatest(nivel_visto, nivel), atualizado_em = now()
   where user_id = p_uid;

  if coalesce((cfg ->> 'sequencia')::int, 1) > 0 then
    insert into public.sequencias (user_id) values (p_uid) on conflict do nothing;
    update public.sequencias
       set atual = 1, recorde = greatest(recorde, 1), ultimo_dia = hoje, atualizada_em = now()
     where user_id = p_uid and atual = 0
    returning * into s;
  end if;

  return jsonb_build_object('ok', true, 'pontos', pts, 'pacto', pts_pacto, 'produtos', n_prod,
                            'sequencia', coalesce(s.atual, 1)) || soma;
end;
$$;

revoke all on function public.boas_vindas(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.boas_vindas(uuid, integer, timestamptz) to service_role;
