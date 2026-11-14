-- ─────────────────────────────────────────────────────────────────────────────
-- CARTA DE PODER SEM PONTOS (20261209, decisão do produto). No modo pontos, raspar o "Pontos
-- em dobro" dava na hora um bônus = os pontos já ganhos hoje (caso real: +226 na conta de teste,
-- parecendo que a carta de poder dava pontos). Agora, no modo pontos, a carta de poder dá 0 e o
-- dobro vale só para os pontos seguintes. Nas regras de cartas (1.61), nada muda.
-- Só troca raspar_carta_v2 (create or replace, da versão de produção de 12/nov/2026).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.raspar_carta_v2(p_uid uuid, p_id uuid, p_agora timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cfg public.cartas_config%rowtype;
  cu public.cartas_usuario%rowtype;
  c public.cartas_catalogo%rowtype;
  hoje date := public.dia_sessao(p_agora);
  dias integer;
  p public.poderes_usuario%rowtype;
  liga_dobro boolean;
  base integer;
  v_rara boolean;
  v_dobro boolean;
  ganhos integer;
  bonus integer := 0;
  ids uuid[];
  som jsonb;
  resultado jsonb;
begin
  select * into cu from public.cartas_usuario where id = p_id and user_id = p_uid for update;
  if not found then
    raise exception 'carta não encontrada';
  end if;
  if cu.raspada_em is not null then
    return jsonb_build_object('ok', true, 'ja_raspada', true);
  end if;
  if cu.dia < hoje then
    return jsonb_build_object('ok', false, 'vencida', true);
  end if;

  select * into cfg from public.cartas_config where id = 1;
  select * into c from public.cartas_catalogo where id = cu.carta_id;
  update public.cartas_usuario set raspada_em = p_agora where id = p_id;

  liga_dobro := c.familia = 'poder' and c.subtipo = 'pontos_dobro';
  dias := greatest(coalesce((cfg.regras_v2 #>> '{dobro,dias}')::int, (c.efeito ->> 'dias')::int, 2), 1);
  if c.familia = 'poder' then
    if liga_dobro then
      -- Hoje e o dia seguinte (2 dias de sessão).
      insert into public.poderes_usuario (user_id, carta_usuario_id, tipo, fim, dados)
      select p_uid, p_id, 'pontos_dobro', ((hoje + dias) + time '04:00') at time zone 'America/Sao_Paulo',
             jsonb_build_object('dias', jsonb_agg((hoje + g)::text))
        from generate_series(0, dias - 1) g
      returning * into p;
    else
      insert into public.poderes_usuario (user_id, carta_usuario_id, tipo, fim, dados)
      values (p_uid, p_id, c.subtipo, null, '{}'::jsonb)
      returning * into p;
    end if;
  end if;

  base := public.v2_pontos_comum();
  v_rara := c.raridade = 'rara';
  v_dobro := public.v2_dobro_ativo(p_uid, cu.dia);
  ganhos := base * case when v_rara then coalesce((cfg.regras_v2 ->> 'mult_rara')::int, 3) else 1 end
                 * case when v_dobro then coalesce((cfg.regras_v2 ->> 'mult_dobro')::int, 2) else 1 end;

  -- Pontos diretos (20261204): no modo pontos a carta de PODER não dá pontos próprios — só
  -- ativa o poder. (20261209: e o Pontos em dobro também não dobra os pontos já ganhos hoje —
  -- vale só para os pontos que vierem depois; ver abaixo.)
  if c.familia = 'poder' and public.v2_modo_pontos(p_uid) then
    base := 0;
    ganhos := 0;
  end if;

  -- O dobro recém-ligado vale para TODOS os pontos de hoje: os sem carta já ganhos dobram.
  -- Só nas regras de cartas (1.61). No MODO PONTOS (20261209, decisão do produto: "as cartas de
  -- poder não dão pontos"), raspar o Pontos em dobro não dá bônus nenhum na hora: ele só dobra
  -- os pontos que ela ganhar dali em diante (v2_dobro_ativo, nas ações seguintes).
  if liga_dobro and not public.v2_modo_pontos(p_uid) then
    select coalesce(sum(pontos), 0), array_agg(id) into bonus, ids
      from public.pontos_eventos
     where user_id = p_uid and dia = hoje and not dobro and acao <> 'dobro';
    bonus := bonus * (coalesce((cfg.regras_v2 ->> 'mult_dobro')::int, 2) - 1);
    if bonus > 0 then
      insert into public.pontos_eventos (user_id, dia, acao, pontos, base, dobro, carta_usuario_id, decisao)
      values (p_uid, hoje, 'dobro', bonus, bonus, true, p_id, jsonb_build_object('eventos', to_jsonb(ids)))
      on conflict (user_id, dia, acao) do nothing;
      if not found then
        bonus := 0;
      else
        update public.pontos_eventos set dobro = true where id = any(ids);
      end if;
    end if;
  end if;

  update public.cartas_usuario
     set pontos = ganhos,
         decisao = coalesce(decisao, '{}'::jsonb)
                   || jsonb_build_object('pontos', jsonb_build_object('base', base, 'rara', v_rara, 'dobro', v_dobro,
                                                                      'ganhos', ganhos, 'bonus_dobro', bonus))
   where id = p_id;
  som := public.v2_somar(p_uid, ganhos + bonus);

  resultado := jsonb_build_object('ok', true, 'pontos', jsonb_build_object(
    'ganhos', ganhos, 'base', base, 'rara', v_rara, 'dobro', v_dobro, 'bonus_dobro', bonus,
    'sem_carta_hoje', (select coalesce(sum(pontos), 0) from public.pontos_eventos where user_id = p_uid and dia = hoje))
    || som);
  if p.id is not null then
    resultado := resultado || jsonb_build_object('poder', jsonb_build_object('tipo', p.tipo, 'fim', p.fim, 'dados', p.dados));
  end if;
  return resultado;
end;
$function$;
