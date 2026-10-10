-- ─────────────────────────────────────────────────────────────────────────────
-- Minha rotina (Fase 2 — "Escolher produto"): o produto de um passo também pode ser um
-- produto que ela ESCANEOU (seção "Seus escaneados" da folha) sem ir para a estante —
-- escanear não quer dizer que ela tem (pode ter sido na loja). Mesmo princípio do
-- recomendado que ela ainda não tem (`produto_catalogo_id`).
-- Um passo usa no máximo UMA das três origens de produto: estante, escaneado ou catálogo.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.minha_rotina_passos
  add column if not exists product_scan_id uuid references public.product_scans(id) on delete set null;

alter table public.minha_rotina_passos
  drop constraint if exists minha_rotina_passos_um_produto;
alter table public.minha_rotina_passos
  add constraint minha_rotina_passos_um_produto check (
    (case when colecao_item_id is not null then 1 else 0 end)
  + (case when product_scan_id is not null then 1 else 0 end)
  + (case when produto_catalogo_id is not null then 1 else 0 end) <= 1
  );
