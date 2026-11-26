-- ─────────────────────────────────────────────────────────────────────────────
-- Sequência das boas-vindas não some mais na 1ª sincronização (26/nov/2026).
--
-- A função `boas_vindas` dá a sequência de 1 dia SEM registrar skincare (de propósito: o 1º
-- skincare de verdade continua dando a carta do dia). Logo depois do cadastro, a 1ª consulta do
-- app chama `sincronizar_historico`, que recalcula a sequência do zero a partir de
-- `rotinas_concluidas` — e como não há nenhuma, zerava a sequência das boas-vindas (atual 0,
-- recorde 1). Das 8 contas creditadas até 26/nov, pelo menos 2 ficaram assim.
--
-- A função é a mesma da 20261101140000_sequencia_servidor (conferida igual à de produção em
-- 26/nov/2026), com um acréscimo no fim do recálculo: se ela recebeu as boas-vindas hoje ou ontem
-- (dia de sessão) e o recálculo não chegou até esse dia, o dia das boas-vindas conta. Nenhuma
-- outra conta muda. Permissões iguais (só o service role).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.sincronizar_historico(p_uid uuid, p_dias jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := public.dia_sessao(now());
  r record;
  atual integer := 0;
  recorde integer := 0;
  ultimo date;
  marcos integer[] := '{}';
  m integer;
  cfg_marcos integer[];
  bv_dia date;
begin
  if (select historico_migrado_em from public.users where id = p_uid) is not null then
    return jsonb_build_object('ja_sincronizado', true);
  end if;

  insert into public.rotinas_concluidas (user_id, dia, periodo, concluida_em, origem)
  select p_uid, x.dia, x.per, (x.dia + time '12:00') at time zone 'America/Sao_Paulo', 'historico'
    from (
      select (e->>'dia')::date as dia, p.per
        from jsonb_array_elements(coalesce(p_dias, '[]'::jsonb)) e
        cross join lateral (values ('am'), ('pm')) p(per)
       where (e->>p.per)::boolean is true
         and e->>'dia' ~ '^\d{4}-\d{2}-\d{2}$'
    ) x
   where x.dia between hoje - 60 and hoje
  on conflict do nothing;

  -- Recalcula do zero, dia a dia.
  for r in select distinct dia from public.rotinas_concluidas where user_id = p_uid order by dia loop
    if ultimo is not null and r.dia - ultimo = 1 then
      atual := atual + 1;
    else
      atual := 1;
    end if;
    ultimo := r.dia;
    recorde := greatest(recorde, atual);
  end loop;

  -- Sequência quebrada antes de hoje (ontem sem rotina) = 0.
  if ultimo is null or hoje - ultimo > 1 then
    atual := 0;
  end if;

  -- Boas-vindas (20261227120000): elas dão a sequência de 1 dia SEM registrar skincare (para não
  -- tirar a carta do 1º skincare do dia). Sem isto, este recálculo — que roda na 1ª consulta do
  -- app depois do cadastro — apagava essa sequência. Se ela recebeu as boas-vindas hoje ou ontem
  -- (dia de sessão) e o recálculo não chegou até esse dia, o dia das boas-vindas conta.
  select e.dia into bv_dia
    from public.pontos_eventos e
   where e.user_id = p_uid and e.acao = 'boas_vindas' and e.dia >= hoje - 1
   order by e.dia desc
   limit 1;
  if bv_dia is not null and (ultimo is null or ultimo < bv_dia) then
    if ultimo is not null and bv_dia - ultimo = 1 and atual > 0 then
      atual := atual + 1;
    else
      atual := 1;
    end if;
    ultimo := bv_dia;
    recorde := greatest(recorde, atual);
  end if;

  select c.marcos into cfg_marcos from public.cartas_config c where c.id = 1;
  foreach m in array coalesce(cfg_marcos, '{7,14,30}') loop
    if atual >= m then marcos := marcos || m; end if;
  end loop;

  insert into public.sequencias (user_id, atual, recorde, ultimo_dia, marcos)
  values (p_uid, atual, recorde, ultimo, marcos)
  on conflict (user_id) do update
    set atual = excluded.atual, recorde = greatest(public.sequencias.recorde, excluded.recorde),
        ultimo_dia = excluded.ultimo_dia, marcos = excluded.marcos, atualizada_em = now();

  update public.users set historico_migrado_em = now() where id = p_uid;

  return jsonb_build_object('ja_sincronizado', false, 'atual', atual, 'recorde', recorde);
end;
$$;

revoke all on function public.sincronizar_historico(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sincronizar_historico(uuid, jsonb) to service_role;
