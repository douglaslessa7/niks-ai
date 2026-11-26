-- ─────────────────────────────────────────────────────────────────────────────
-- Boas-vindas: regra de "conta nova" corrigida (26/nov/2026).
--
-- Desde 12/nov o scan do rosto do CADASTRO dá pontos (`scan_rosto`) e é gravado ANTES de a
-- tela de espera chamar as boas-vindas. A regra antiga ("conta antiga = tem qualquer ponto")
-- passou a recusar praticamente toda conta nova: das 622 contas criadas de 21 a 26/nov, só 1
-- recebeu. A recompensa mostrava +100 que ela não recebia.
--
-- Conta antiga passa a ser: skincare registrado (`rotinas_concluidas`), OU algum evento de
-- pontos que NÃO seja `scan_rosto`, OU conta criada há mais de 7 dias (`auth.users`). O resto da
-- função é igual à 20261225120000 (pacto + 20 por produto até 10, um evento só, nível visto,
-- sequência de 1 dia, uma vez por conta).
-- Recusa não passa mais em silêncio: cada `ok: false` grava o motivo no log do Postgres
-- (`raise log 'boas_vindas recusada: <motivo> uid=…'`); o app também manda
-- `boas_vindas_recusada` ao Mixpanel.
-- Mesma assinatura (uuid, integer, timestamptz): a função `cartas` não muda.
-- ─────────────────────────────────────────────────────────────────────────────

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
  if exists (select 1 from public.pontos_eventos where user_id = p_uid and acao = 'boas_vindas') then
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
