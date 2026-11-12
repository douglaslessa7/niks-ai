-- ─────────────────────────────────────────────────────────────────────────────
-- ESTATÍSTICAS DO CHECK-IN: SÓ PRODUTO RECORTADO (20261206, pedido do produto).
-- A foto de cada produto no check-in (mural e detalhe, que as outras integrantes veem) é a
-- MESMA da estante: o recorte sem fundo. Nunca a foto que ela tirou no scan (mão, pia,
-- fundo da casa). Ordem, como em lib/colecao.ts:
--   • catálogo: recorte do catálogo; sem recorte, a foto do produto do catálogo (é a foto
--     da embalagem, pública — a estante mostra a mesma);
--   • estante: recorte do catálogo → recorte do scan (product_scans.recorte_*) → recorte da
--     coleção → foto do produto do catálogo (só se ligado ao catálogo);
--   • escaneado: só o recorte do scan.
-- Sem recorte pronto: sem foto (o app mostra o ícone do passo).
-- Só troca checkin_estatisticas_limpas() (create or replace) e cria dois auxiliares.
-- ─────────────────────────────────────────────────────────────────────────────

-- Foto do produto do catálogo: o recorte (pronto) ou, com `aceita_foto`, a foto da embalagem.
create or replace function public.checkin_img_catalogo(p_id uuid, p_aceita_foto boolean)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when pr.imagem_recorte_status = 'ok' and pr.imagem_recorte_url ~ '^https://' then jsonb_build_object('url', pr.imagem_recorte_url)
    when p_aceita_foto and pr.imagem_url ~ '^https://' then jsonb_build_object('url', pr.imagem_url)
  end
  from public.produtos pr where pr.id = p_id;
$function$;

-- Recorte do scan DELA (link público, ou caminho privado que a função `grupos` assina).
create or replace function public.checkin_img_recorte_scan(p_uid uuid, p_scan uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when s.recorte_status = 'ok' and s.recorte_url ~ '^https://' then jsonb_build_object('url', s.recorte_url)
    when s.recorte_status = 'ok' and s.recorte_path is not null then jsonb_build_object('bucket', 'product-scans', 'path', s.recorte_path)
  end
  from public.product_scans s where s.id = p_scan and s.user_id = p_uid;
$function$;

revoke all on function public.checkin_img_catalogo(uuid, boolean) from public, anon, authenticated;
revoke all on function public.checkin_img_recorte_scan(uuid, uuid) from public, anon, authenticated;

-- Limpa e completa as estatísticas vindas do app (nunca confia em link vindo do aparelho).
create or replace function public.checkin_estatisticas_limpas(p_uid uuid, p_rotina text, p_est jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  dur integer;
  p jsonb;
  ref jsonb;
  rid uuid;
  img jsonb;
  passos jsonb := '[]'::jsonb;
  nprod integer := 0;
  cp record;
  marca text;
  produto text;
begin
  if p_est is null or jsonb_typeof(p_est) <> 'object' then
    return null;
  end if;
  dur := case when jsonb_typeof(p_est -> 'duracao_s') = 'number'
              then least(greatest(floor((p_est ->> 'duracao_s')::numeric)::int, 0), 21600) end;
  if jsonb_typeof(p_est -> 'passos') = 'array' then
    for p in select x from jsonb_array_elements(p_est -> 'passos') with ordinality t(x, o) where o <= 20 order by o loop
      continue when jsonb_typeof(p) <> 'object';
      img := null;
      marca := left(nullif(btrim(coalesce(p ->> 'marca', '')), ''), 60);
      produto := left(nullif(btrim(coalesce(p ->> 'produto', '')), ''), 120);
      ref := p -> 'ref';
      rid := case when jsonb_typeof(ref) = 'object' and coalesce(ref ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (ref ->> 'id')::uuid end;
      if rid is not null and ref ->> 'origem' = 'catalogo' then
        img := public.checkin_img_catalogo(rid, true);
      elsif rid is not null and ref ->> 'origem' = 'estante' then
        select c.produto_id, c.recorte_path, c.recorte_status, c.product_scan_id into cp
          from public.colecao_produtos c where c.id = rid and c.user_id = p_uid;
        if found then
          -- Como a estante mostra: recorte do catálogo → recorte do scan → recorte da coleção
          -- → (só do catálogo) a foto do produto. Nunca a foto que ela tirou.
          if cp.produto_id is not null then
            img := public.checkin_img_catalogo(cp.produto_id, false);
          end if;
          if img is null and cp.product_scan_id is not null then
            img := public.checkin_img_recorte_scan(p_uid, cp.product_scan_id);
          end if;
          if img is null and cp.recorte_path is not null and cp.recorte_status = 'ok' then
            img := jsonb_build_object('bucket', 'colecao', 'path', cp.recorte_path);
          end if;
          if img is null and cp.produto_id is not null then
            img := public.checkin_img_catalogo(cp.produto_id, true);
          end if;
        end if;
      elsif rid is not null and ref ->> 'origem' = 'escaneado' then
        img := public.checkin_img_recorte_scan(p_uid, rid);
      end if;
      if img is not null and coalesce(img ->> 'url', img ->> 'path') is null then
        img := null;
      end if;
      if marca is not null or produto is not null then
        nprod := nprod + 1;
      end if;
      passos := passos || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'nome', left(nullif(btrim(coalesce(p ->> 'nome', '')), ''), 60),
        'marca', marca, 'produto', produto, 'img', img)));
    end loop;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('v', 1, 'periodo', p_rotina, 'duracao_s', dur,
    'n_passos', jsonb_array_length(passos), 'n_produtos', nprod, 'passos', passos));
end;
$function$;

