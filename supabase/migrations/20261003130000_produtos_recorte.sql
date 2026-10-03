-- produtos.imagem_recorte_* — foto do catálogo SEM FUNDO (Fase 2 do recorte)
-- Gerada em lote pela Edge Function `recortar-catalogo` (BiRefNet no Replicate,
-- `sprited/birefnet`) e guardada como WebP com transparência (qualidade 90, máx.
-- 1024px, bordas transparentes cortadas com folga) em produtos/recortes/{id}.webp
-- (bucket público, o mesmo das fotos do catálogo). A `imagem_url` original continua
-- como reserva: o app usa o recorte quando o status é 'ok' e cai na original senão.

alter table public.produtos
  add column if not exists imagem_recorte_url    text,
  add column if not exists imagem_recorte_status text,
  add column if not exists imagem_recorte_w      int,
  add column if not exists imagem_recorte_h      int,
  add column if not exists imagem_recorte_em     timestamptz,
  add column if not exists imagem_recorte_erro   text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'produtos_imagem_recorte_status_check'
  ) then
    alter table public.produtos
      add constraint produtos_imagem_recorte_status_check
      check (imagem_recorte_status is null or imagem_recorte_status in ('ok', 'falhou'));
  end if;
end $$;
