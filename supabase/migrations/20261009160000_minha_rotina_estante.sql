-- ─────────────────────────────────────────────────────────────────────────────
-- Minha rotina — ajustes da Fase 3 (out/2026):
-- 1. Nome do passo OPCIONAL: o passo precisa ter nome OU produto — regra garantida pelo
--    app, não por CHECK: se o produto sai da estante, o FK zera `colecao_item_id`, e um
--    CHECK faria a exclusão na estante falhar.
-- 2. TODO produto da rotina está na ESTANTE (muda a decisão da Fase 2, em que recomendado
--    e escaneado podiam ficar no passo sem ir à estante). Os passos que já têm produto
--    por `produto_catalogo_id` / `product_scan_id` passam a apontar para o item da
--    estante (criado se ainda não existir; existente é reaproveitado, sem duplicar).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.minha_rotina_passos alter column nome drop not null;

-- Catálogo → estante (um item por usuária+produto: índice único parcial já existe).
insert into public.colecao_produtos (user_id, origem, produto_id, nome, marca, categoria, imagem_url)
select distinct on (p.user_id, p.produto_catalogo_id)
       p.user_id, 'catalogo', pr.id, pr.nome, pr.marca, pr.categoria, pr.imagem_url
  from public.minha_rotina_passos p
  join public.produtos pr on pr.id = p.produto_catalogo_id
 where p.produto_catalogo_id is not null
   and not exists (select 1 from public.colecao_produtos c
                    where c.user_id = p.user_id and c.produto_id = p.produto_catalogo_id);

-- Escaneado → estante.
insert into public.colecao_produtos (user_id, origem, product_scan_id, nome, marca, categoria, compatibilidade, imagem_url)
select distinct on (p.user_id, p.product_scan_id)
       p.user_id, 'scan', ps.id, ps.produto_nome, ps.produto_marca,
       ps.resultado->'produto'->>'categoria',
       case when jsonb_typeof(ps.resultado->'compatibilidade') = 'number'
            then round((ps.resultado->>'compatibilidade')::numeric)::int end,
       ps.image_path
  from public.minha_rotina_passos p
  join public.product_scans ps on ps.id = p.product_scan_id
 where p.product_scan_id is not null
   and not exists (select 1 from public.colecao_produtos c
                    where c.user_id = p.user_id and c.product_scan_id = p.product_scan_id);

-- Os passos passam a apontar para a estante.
update public.minha_rotina_passos p
   set colecao_item_id = c.id, produto_catalogo_id = null, updated_at = now()
  from public.colecao_produtos c
 where p.produto_catalogo_id is not null
   and c.user_id = p.user_id and c.produto_id = p.produto_catalogo_id;

update public.minha_rotina_passos p
   set colecao_item_id = c.id, product_scan_id = null, updated_at = now()
  from public.colecao_produtos c
 where p.product_scan_id is not null
   and c.user_id = p.user_id and c.product_scan_id = p.product_scan_id;
