-- Fotos de 3 produtos do catálogo que estavam sem imagem
-- • COSRX Advanced Snail Radiance Dual Essence e COSRX AHA 7 Whitehead Power Liquid:
--   a imagem_url apontava para um arquivo que nunca existiu no bucket `produtos` (404)
--   — o recorte falhou por isso ("Input validation error"). As fotos oficiais (cosrx.com)
--   foram subidas NO MESMO endereço; a imagem_url não muda.
-- • La Roche-Posay Effaclar Adapaleno: não tinha foto. Foto oficial (laroche-posay.us),
--   só o tubo, em produtos/lrp-effaclar-adapaleno.webp.
-- Padrão das 3: recorte BiRefNet, fundo #FFFFFF puro, 800×800, WebP sem perdas.
-- O recorte volta a pendente (null) para a recortar-catalogo refazer só esses 3.
-- Só por id (regra do projeto).

update public.produtos
   set imagem_url = 'https://utpljvwmeyeqwrfulbfr.supabase.co/storage/v1/object/public/produtos/lrp-effaclar-adapaleno.webp'
 where id = '91b902f7-a62f-4a6a-9074-4820cba7eb34';

update public.produtos
   set imagem_recorte_status = null,
       imagem_recorte_erro   = null
 where id in (
   '4d6034c5-1603-4bfb-a107-2a9c8a556de6',  -- COSRX Advanced Snail Radiance Dual Essence
   'fdeb30eb-74fc-42c4-ab71-4d7d70cd1314',  -- COSRX AHA 7 Whitehead Power Liquid
   '91b902f7-a62f-4a6a-9074-4820cba7eb34'   -- La Roche-Posay Effaclar Adapaleno
 )
   and imagem_recorte_status is distinct from 'ok';
