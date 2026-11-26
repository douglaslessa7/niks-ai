-- ─────────────────────────────────────────────────────────────────────────────
-- Boas-vindas: + 20 NIKS Points por PRODUTO DE CASA (pós-compra v2, 26/nov/2026).
--
-- No pós-compra v2 ela fotografa os produtos que tem em casa ANTES do cadastro, e a barra de
-- pontos mostra +20 a cada foto (até 10). A recompensa mostra o total (pacto + produtos), então
-- o servidor credita o mesmo: depois do cadastro, a função `cartas` (ação `boas_vindas`) manda
-- `p_produtos` e esta função soma pacto + produtos NUM EVENTO SÓ (`acao = 'boas_vindas'`, o
-- detalhe em `decisao`).
--
-- Parte da 20261114120000_boas_vindas (✅ em produção desde 09/nov/2026). Muda só:
--   • `cartas_config.boas_vindas` ganha `pontos_produto` (20) e `produtos_max` (10), sem mexer
--     no que já está lá (`ativa`, `pontos`, `sequencia`);
--   • `boas_vindas(p_uid, p_agora)` → `boas_vindas(p_uid, p_produtos default 0, p_agora)`.
--     O resto é IGUAL: uma vez por conta, só conta nova, nível visto, sequência de 1 dia.
-- NÃO mexe na lista de ações de `pontos_eventos` ('boas_vindas' já está nela).
-- Compatível com a função `cartas` antiga: `rpc('boas_vindas', { p_uid })` continua valendo
-- (p_produtos = 0) — pode aplicar esta migration antes de publicar a `cartas` nova.
-- Só o service role executa.
-- ─────────────────────────────────────────────────────────────────────────────

update public.cartas_config
   set boas_vindas = jsonb_build_object('pontos_produto', 20, 'produtos_max', 10) || boas_vindas
 where id = 1
   and not (boas_vindas ? 'pontos_produto' and boas_vindas ? 'produtos_max');

alter table public.cartas_config alter column boas_vindas set default
  '{"ativa": true, "pontos": 100, "sequencia": 1, "pontos_produto": 20, "produtos_max": 10}'::jsonb;

drop function if exists public.boas_vindas(uuid, timestamptz);

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
    return jsonb_build_object('ok', false, 'motivo', 'desligada');
  end if;
  if exists (select 1 from public.pontos_eventos where user_id = p_uid and acao = 'boas_vindas') then
    return jsonb_build_object('ok', false, 'motivo', 'ja_recebeu');
  end if;
  if exists (select 1 from public.pontos_usuario where user_id = p_uid and total > 0)
     or exists (select 1 from public.rotinas_concluidas where user_id = p_uid) then
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
