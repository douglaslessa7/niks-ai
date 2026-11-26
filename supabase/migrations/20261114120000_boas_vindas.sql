-- ─────────────────────────────────────────────────────────────────────────────
-- Boas-vindas pós-pagamento (07/nov/2026, design "NiksBoasVindas", telas 1–9).
--
-- Depois da compra, antes do cadastro, ela passa por 8 telas: entrou pro time, rotina
-- pronta, foto de partida, projeção, PACTO (segurar para selar), +100 NIKS Points,
-- sequência de 1 dia e Nível 2 "Hidratadinha". Como a conta ainda não existe nessa hora,
-- o app guarda que ela selou o pacto e, DEPOIS do cadastro (tela de espera), chama a
-- função `cartas` com `{ acao: 'boas_vindas' }`, que roda isto aqui:
--   • +100 NIKS Points (evento `boas_vindas` em `pontos_eventos`) → o nível vai a 2
--     (Hidratadinha começa em 90);
--   • pós-compra v2 (26/nov/2026): + 20 por produto de casa fotografado antes do cadastro
--     (`p_produtos`, mandado pelo app; no máximo 10 → +200). No MESMO evento (uma linha:
--     `pontos` = pacto + produtos; o detalhe em `decisao`). Builds antigas não mandam
--     `p_produtos` → 0, como antes;
--   • `nivel_visto` = o nível novo: as telas já celebraram, a home não celebra de novo;
--   • sequência de 1 dia HOJE (só se estava em 0). NÃO grava `rotinas_concluidas`: o
--     1º skincare de verdade de hoje continua dando a carta do dia (o `registrar_rotina`
--     vê o dia já contado e não soma; o `concluir_rotina_v2` dá a carta mesmo assim).
--
-- UMA VEZ POR CONTA, e só conta NOVA: sem pontos e sem rotina registrada. Conta antiga
-- que refaça o onboarding não ganha (o app também só mostra as telas sem sessão).
-- Liga/desliga e valores sem deploy: `cartas_config.boas_vindas`.
-- Só o service role executa.
-- ─────────────────────────────────────────────────────────────────────────────

-- A ação 'boas_vindas' já está na lista de `pontos_eventos_acao` desde a 20261113 (missões) e
-- continua na 20261204 (pontos diretos, que acrescentou 'skincare_dia' e 'missoes'). Esta
-- migration NÃO recria a lista (26/nov/2026): aplicada depois da 20261204, a versão antiga
-- apagaria 'skincare_dia' e 'missoes' e o banco passaria a recusar esses pontos.

alter table public.cartas_config add column if not exists boas_vindas jsonb not null default
  '{"ativa": true, "pontos": 100, "sequencia": 1, "pontos_produto": 20, "produtos_max": 10}'::jsonb;

-- Versão anterior desta migration (sem produtos), se tiver sido criada em algum banco de teste.
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
