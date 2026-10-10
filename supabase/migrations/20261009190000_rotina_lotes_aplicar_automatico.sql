-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 6 — decisão mudada (09/10): quando o lote termina, a rotina montada SUBSTITUI a
-- Minha rotina AUTOMATICAMENTE (sem "Usar essa rotina"). Quem aplica é a função
-- `montar-rotina-com-produtos` (service role), antes de marcar o lote como pronto.
--
-- `aplicar_lote_rotina(lote)` passa a:
--   · aceitar o service role (sem auth.uid(): a dona vem do próprio lote);
--   · aceitar lote 'processando' (a função aplica e SÓ DEPOIS marca 'pronto');
--   · NÃO mexer na rotina se a rotina montada não tem passos (nenhum produto serviu):
--     devolve 0 e a rotina atual dela fica como está.
-- A usuária logada continua podendo chamar só para os próprios lotes.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.aplicar_lote_rotina(p_lote uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  dona uuid;
  r jsonb;
  n integer := 0;
begin
  select l.user_id, l.resultado into dona, r
    from public.rotina_lotes l
   where l.id = p_lote and l.status in ('processando', 'pronto')
   for update;
  if dona is null or r is null then
    raise exception 'lote não encontrado ou sem resultado';
  end if;
  if uid is null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'sem sessão';
    end if;
    uid := dona;
  elsif uid <> dona then
    raise exception 'lote de outra usuária';
  end if;

  -- Rotina montada vazia (nenhum produto serviu): não apaga a rotina atual.
  if coalesce(jsonb_array_length(r->'rotina'->'am'), 0) + coalesce(jsonb_array_length(r->'rotina'->'pm'), 0) = 0 then
    return 0;
  end if;

  delete from public.minha_rotina_passos where user_id = uid;

  insert into public.minha_rotina_passos
    (user_id, periodo, ordem, nome, instrucao, dias, origem, colecao_item_id, aviso_nivel, aviso_texto)
  select uid, s.per, s.o::int,
         nullif(trim(s.e->>'passo'), ''),
         s.e->>'instrucao',
         case when jsonb_typeof(s.e->'dias') = 'array' and jsonb_array_length(s.e->'dias') > 0
              then array(select jsonb_array_elements_text(s.e->'dias')) else null end,
         'ia_produtos',
         (prod->>'colecao_item_id')::uuid,
         case when prod->>'nivel_aviso' in ('leve', 'forte') then prod->>'nivel_aviso' else 'nenhum' end,
         case when prod->>'nivel_aviso' in ('leve', 'forte') then prod->>'motivo' else null end
    from (
      select 'am'::text as per, t.e, t.o from jsonb_array_elements(coalesce(r->'rotina'->'am', '[]'::jsonb)) with ordinality as t(e, o)
      union all
      select 'pm'::text as per, t.e, t.o from jsonb_array_elements(coalesce(r->'rotina'->'pm', '[]'::jsonb)) with ordinality as t(e, o)
    ) s
    left join lateral (
      select p from jsonb_array_elements(coalesce(r->'produtos', '[]'::jsonb)) p
       where (p->>'indice')::int = (s.e->>'produto_indice')::int
       limit 1
    ) pp(prod) on true;
  get diagnostics n = row_count;

  -- A cópia da ideal (criar_minha_rotina) não pode recriar por cima depois.
  update public.users set minha_rotina_criada_em = coalesce(minha_rotina_criada_em, now()) where id = uid;
  update public.rotina_lotes set aplicado_em = now() where id = p_lote;
  return n;
end;
$$;

revoke all on function public.aplicar_lote_rotina(uuid) from public;
grant execute on function public.aplicar_lote_rotina(uuid) to authenticated, service_role;
