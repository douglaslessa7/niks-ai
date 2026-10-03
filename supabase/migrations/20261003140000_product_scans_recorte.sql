-- product_scans.recorte_* — foto do produto escaneado SEM FUNDO (Fase 3 do recorte)
-- Feito em segundo plano depois da análise (analisar-produto) ou sob demanda
-- (recortar-produto), nesta ordem:
--   1. 'catalogo'  — o produto bate com um do catálogo que já tem recorte → usa a URL
--                    pública do recorte do catálogo (recorte_url);
--   2. 'reuso'     — a mesma usuária já tem um scan recortado do mesmo produto → reaproveita;
--   3. 'replicate' — BiRefNet (Replicate) na foto do scan → WebP com transparência no
--                    bucket PRIVADO product-scans, na pasta da usuária
--                    ({user_id}/{scan_id}_recorte.webp → apagado pela delete-account).
-- O app mostra a foto original até o recorte ficar 'ok'; se falhar, fica a original.

alter table public.product_scans
  add column if not exists recorte_status text,
  add column if not exists recorte_origem text,
  add column if not exists recorte_path   text,   -- no bucket product-scans (privado)
  add column if not exists recorte_url    text,   -- URL pública (quando veio do catálogo)
  add column if not exists recorte_w      int,
  add column if not exists recorte_h      int,
  add column if not exists recorte_em     timestamptz,
  add column if not exists recorte_erro   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_scans_recorte_status_check') then
    alter table public.product_scans
      add constraint product_scans_recorte_status_check
      check (recorte_status is null or recorte_status in ('pendente', 'ok', 'falhou'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_scans_recorte_origem_check') then
    alter table public.product_scans
      add constraint product_scans_recorte_origem_check
      check (recorte_origem is null or recorte_origem in ('catalogo', 'reuso', 'replicate'));
  end if;
end $$;
