-- Backfill de imagem_url para os 15 produtos que ainda estavam sem foto
-- (categorias esfoliante, tratamento_noturno e olhos — Creamy e Principia).
-- Os 15 .webp ja foram enviados para a raiz do bucket publico `produtos`
-- (verificado: 800x800, WebP real, SHA-256 identico aos arquivos locais).
--
-- Match por id (nao por nome) para nao depender de acentuacao.
-- O guard `imagem_url IS NULL` torna o script idempotente: rodar de novo nao
-- sobrescreve nada que ja tenha sido preenchido.

begin;

update produtos as p
set    imagem_url = 'https://utpljvwmeyeqwrfulbfr.supabase.co/storage/v1/object/public/produtos/'
                    || v.arquivo
from (values
  ('15fb509f-92f8-49e1-8ff2-30401d616f31'::uuid, 'creamy-acido-glicolico-10.webp'),
  ('d0e9bce8-0b31-4604-b8e0-50d97513ec09'::uuid, 'creamy-acido-mandelico-7.webp'),
  ('eaacdc65-7de8-4803-8e6a-656b84afdb46'::uuid, 'creamy-eye-cream.webp'),
  ('e8aa5d58-f4a5-4587-958a-3812aaca8912'::uuid, 'creamy-glicointense-peel.webp'),
  ('f3e66588-d916-41da-b596-2c47d8587dbf'::uuid, 'creamy-pore-refiner.webp'),
  ('7fdeb30b-f738-4668-8f4e-d574e88d409a'::uuid, 'creamy-retinal-eye-cream.webp'),
  ('3c763259-13ee-45c2-89cf-e2cba7af5cb1'::uuid, 'creamy-retinal-serum.webp'),
  ('7340defa-8afc-43d0-bbe6-33859e08c318'::uuid, 'creamy-retinol-gel-creme.webp'),
  ('e61e42cf-e52e-4830-b5cd-e8abf252fc27'::uuid, 'creamy-serum-adapalenato.webp'),
  ('885c6c33-20af-43fb-8822-f3f2401a3985'::uuid, 'principia-co-01.webp'),
  ('f924f1a1-cc21-48af-93ac-79d4d6df9563'::uuid, 'principia-gr-2.webp'),
  ('8997f88f-75b3-4e8a-a9db-8634fad64277'::uuid, 'principia-al-10.webp'),
  ('e11a0532-3861-4d38-a8ec-4d438e6e4739'::uuid, 'principia-am-10.webp'),
  ('0a7e6e05-90f6-4494-a19b-59a4719b9958'::uuid, 'principia-rn-03.webp'),
  ('1df13518-89de-4738-aab3-81b8f0849e30'::uuid, 'principia-ag-10.webp')
) as v(id, arquivo)
where p.id = v.id
  and p.imagem_url is null;

-- Confere antes de efetivar: tem que voltar 0 linhas.
-- Se voltar qualquer coisa, rode `rollback;` em vez de `commit;`.
select count(*) as ainda_sem_foto from produtos where imagem_url is null;

commit;

-- Verificacao pos-commit (rode separado se quiser conferir).
-- select marca, nome, imagem_url from produtos
--  where id in (
--    '15fb509f-92f8-49e1-8ff2-30401d616f31','d0e9bce8-0b31-4604-b8e0-50d97513ec09',
--    'eaacdc65-7de8-4803-8e6a-656b84afdb46','e8aa5d58-f4a5-4587-958a-3812aaca8912',
--    'f3e66588-d916-41da-b596-2c47d8587dbf','7fdeb30b-f738-4668-8f4e-d574e88d409a',
--    '3c763259-13ee-45c2-89cf-e2cba7af5cb1','7340defa-8afc-43d0-bbe6-33859e08c318',
--    'e61e42cf-e52e-4830-b5cd-e8abf252fc27','885c6c33-20af-43fb-8822-f3f2401a3985',
--    'f924f1a1-cc21-48af-93ac-79d4d6df9563','8997f88f-75b3-4e8a-a9db-8634fad64277',
--    'e11a0532-3861-4d38-a8ec-4d438e6e4739','0a7e6e05-90f6-4494-a19b-59a4719b9958',
--    '1df13518-89de-4738-aab3-81b8f0849e30')
--  order by marca, nome;
