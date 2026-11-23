-- ─────────────────────────────────────────────────────────────────────────────
-- Lote "Montar minha rotina com o que eu tenho" no MOTOR NOVO (19/nov/2026).
--
-- aplicar_lote_rotina_v2(lote, passos): troca a Minha rotina pela montada pelo motor
-- (passos de casa E do catálogo, no formato de montar_minha_rotina_v2), com cópia da rotina
-- anterior em minha_rotina_backup ANTES de apagar. Só o service role (a Edge Function
-- montar-rotina-com-produtos) chama; a dona vem do próprio lote, que precisa estar
-- 'processando'. Passos vazios → não mexe em nada (devolve 0).
--
-- Não muda nenhuma função existente: montar_minha_rotina_v2 é chamada sem p_substituir
-- (a rotina antiga já foi apagada aqui, por id, depois da cópia).
--
-- Desfazer: drop function if exists public.aplicar_lote_rotina_v2(uuid, jsonb);
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.aplicar_lote_rotina_v2(p_lote uuid, p_passos jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  dona uuid;
  ids uuid[];
  b_passos jsonb;
  b_proto jsonb;
  b_rec jsonb;
  b_criada timestamptz;
  n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'só o service role';
  end if;
  if p_passos is null or jsonb_typeof(p_passos) <> 'array' then
    raise exception 'entrada inválida';
  end if;

  select l.user_id into dona
    from public.rotina_lotes l
   where l.id = p_lote and l.status = 'processando'
   for update;
  if dona is null then
    raise exception 'lote não encontrado ou não está processando';
  end if;

  -- Rotina montada vazia: não apaga a rotina atual.
  if jsonb_array_length(p_passos) = 0 then
    return 0;
  end if;

  perform 1 from public.users where id = dona for update;

  -- Cópia da rotina atual (passos inteiros, rotina ideal, recomendação) antes de apagar.
  select coalesce(jsonb_agg(to_jsonb(m) order by m.periodo, m.ordem), '[]'::jsonb), array_agg(m.id)
    into b_passos, ids
    from public.minha_rotina_passos m
   where m.user_id = dona;
  select to_jsonb(p) into b_proto from public.protocolos p where p.user_id = dona order by p.updated_at desc limit 1;
  select to_jsonb(r) into b_rec from public.recomendacoes_produtos r where r.user_id = dona;
  select u.minha_rotina_criada_em into b_criada from public.users u where u.id = dona;
  insert into public.minha_rotina_backup (user_id, motivo, passos, protocolo, recomendacao, minha_rotina_criada_em)
  values (dona, 'lote:' || p_lote::text, b_passos, b_proto, b_rec, b_criada);

  if ids is not null then
    delete from public.minha_rotina_passos where id = any(ids);
  end if;

  -- Sem Minha rotina → montar_minha_rotina_v2 cria a rotina inteira, já com produto,
  -- e marca minha_rotina_criada_em = now().
  update public.users set minha_rotina_criada_em = null where id = dona;
  n := public.montar_minha_rotina_v2(dona, p_passos, false);
  if n is null or n < 0 then
    raise exception 'montar_minha_rotina_v2 falhou (%)', n;
  end if;

  -- Os passos vieram do lote (mesma origem do lote antigo).
  update public.minha_rotina_passos set origem = 'ia_produtos' where user_id = dona;
  update public.rotina_lotes set aplicado_em = now() where id = p_lote;
  return n;
end;
$$;

revoke all on function public.aplicar_lote_rotina_v2(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_lote_rotina_v2(uuid, jsonb) to service_role;
