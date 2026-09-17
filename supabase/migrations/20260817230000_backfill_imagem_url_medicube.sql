-- Backfill de imagem_url para os 45 produtos Medicube que estavam sem foto.
--
-- As 45 imagens ja estao na raiz do bucket publico `produtos`. Verificado antes de
-- gerar este script: as 45 respondem na URL publica, sao WebP real 800x800 e o
-- SHA-256 bate com os arquivos locais da pasta convertidas/. Nenhuma faltando.
--
-- Match produto -> arquivo por `nome` (+ marca), conforme pedido. Os nomes foram
-- extraidos direto do banco, entao batem byte a byte; nenhum tem aspa simples,
-- espaco duplo ou espaco no fim.
--
-- Guard `imagem_url IS NULL`: nao encosta em nenhum produto que ja tenha foto,
-- incluindo o Medicube 'PDRN Pink Peptide Serum' pre-existente (que usa .avif).
-- Idempotente: rodar de novo nao sobrescreve nada.
--
-- Prefixo de URL identico ao dos 92 produtos que ja tinham foto.

begin;

update produtos as p
set    imagem_url = 'https://utpljvwmeyeqwrfulbfr.supabase.co/storage/v1/object/public/produtos/'
                    || v.arquivo
from (values
  ('21% Red Succinic Acid Cleansing Booster Serum', 'medicube-red-succinic-cleansing-booster.webp'),
  ('Azelaic Acid 16 Calming Serum', 'medicube-azelaic-acid-16.webp'),
  ('Collagen Glow Booster Milk Serum', 'medicube-collagen-glow-milk-serum.webp'),
  ('Collagen Glow Bubble Serum', 'medicube-collagen-glow-bubble-serum.webp'),
  ('Collagen Niacinamide Jelly Cream', 'medicube-collagen-niacinamide-jelly-cream.webp'),
  ('Deep Reviving Bakuchiol Retinol Serum', 'medicube-deep-reviving-bakuchiol.webp'),
  ('Deep Reviving Peptide Eye Cream', 'medicube-deep-reviving-eye-cream.webp'),
  ('Deep Vita C Capsule Cream', 'medicube-deep-vita-c-capsule-cream.webp'),
  ('Deep Vita C Pads', 'medicube-deep-vita-c-pads.webp'),
  ('Exosome Cica Calming Toner Pads', 'medicube-exosome-cica-pads.webp'),
  ('Hyaluronic Acid Capsule Cream', 'medicube-hyaluronic-capsule-cream.webp'),
  ('Hyaluronic Ceramide Moisturizing Jelly Cream', 'medicube-hyaluronic-ceramide-jelly-cream.webp'),
  ('Hyaluronic Multi Peptide PDRN Serum', 'medicube-hyaluronic-multi-peptide-pdrn.webp'),
  ('Kojic Acid Turmeric Capsule Serum', 'medicube-kojic-turmeric-capsule-serum.webp'),
  ('Kojic Acid Turmeric Toner', 'medicube-kojic-turmeric-toner.webp'),
  ('Kojic Acid Turmeric Toner Pad', 'medicube-kojic-turmeric-toner-pad.webp'),
  ('No Cast Just Glow Collagen Sunscreen', 'medicube-no-cast-collagen-sunscreen.webp'),
  ('PDRN Pink Collagen Bubble Serum', 'medicube-pdrn-collagen-bubble-serum.webp'),
  ('PDRN Pink Collagen Capsule Cream', 'medicube-pdrn-collagen-capsule-cream.webp'),
  ('PDRN Pink Collagen Gel Toner Pad', 'medicube-pdrn-collagen-gel-toner-pad.webp'),
  ('PDRN Pink Gel Cleanser', 'medicube-pdrn-pink-gel-cleanser.webp'),
  ('PDRN Pink Niacinamide Milky Toner', 'medicube-pdrn-niacinamide-milky-toner.webp'),
  ('PDRN Pink One Day Serum', 'medicube-pdrn-pink-one-day-serum.webp'),
  ('PDRN Pink Peptide Cream', 'medicube-pdrn-pink-peptide-cream.webp'),
  ('PDRN Pink Peptide Eye Cream', 'medicube-pdrn-pink-peptide-eye-cream.webp'),
  ('PDRN Pink Peptide Toner', 'medicube-pdrn-pink-peptide-toner.webp'),
  ('Red Foam Cleanser', 'medicube-red-foam-cleanser.webp'),
  ('Red Serum', 'medicube-red-serum.webp'),
  ('Red Succinic Acid Panthenol Pads', 'medicube-red-succinic-panthenol-pads.webp'),
  ('Red Toner', 'medicube-red-toner.webp'),
  ('Retinol NMN Boosting Serum', 'medicube-retinol-nmn-serum.webp'),
  ('Super Cica Toner', 'medicube-super-cica-toner.webp'),
  ('TXA Niacinamide Capsule Cream', 'medicube-txa-niacinamide-capsule-cream.webp'),
  ('TXA Niacinamide Serum', 'medicube-txa-niacinamide-serum.webp'),
  ('Triple Collagen Cream', 'medicube-triple-collagen-cream.webp'),
  ('Triple Collagen Serum', 'medicube-triple-collagen-serum.webp'),
  ('Triple Collagen Toner', 'medicube-triple-collagen-toner.webp'),
  ('Zero Foam Cleanser', 'medicube-zero-foam-cleanser.webp'),
  ('Zero Pore Blackhead Deep Cleansing Oil', 'medicube-zero-pore-cleansing-oil.webp'),
  ('Zero Pore Capsule Cleansing Foam', 'medicube-zero-pore-capsule-foam.webp'),
  ('Zero Pore Madecassoside Pads', 'medicube-zero-pore-madecassoside-pads.webp'),
  ('Zero Pore One-day Cream', 'medicube-zero-pore-one-day-cream.webp'),
  ('Zero Pore One-day Peptide Serum', 'medicube-zero-pore-one-day-serum.webp'),
  ('Zero Pore Pads', 'medicube-zero-pore-pads.webp'),
  ('Zero Pore Toner', 'medicube-zero-pore-toner.webp')
) as v(nome, arquivo)
where p.marca = 'Medicube'
  and p.nome = v.nome
  and p.imagem_url is null;

-- Conferencia: tem que voltar 0.
-- Se voltar qualquer outra coisa, rode `rollback;` em vez do `commit;`.
select count(*) as medicube_ainda_sem_foto
from   produtos
where  marca = 'Medicube'
  and  imagem_url is null;

commit;

-- Verificacao pos-commit (rode separado):
-- select count(*) as catalogo_sem_foto from produtos where imagem_url is null;  -- esperado 0
-- select count(*) from produtos where marca = 'Medicube';                       -- esperado 46
