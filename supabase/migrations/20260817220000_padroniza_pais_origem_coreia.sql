-- Padroniza pais_origem: 'Coreia do Sul' -> 'Coreia'.
--
-- Contexto: os 20 produtos Medicube inseridos em 2026-08-17 entraram como
-- 'Coreia do Sul', enquanto os outros 28 produtos coreanos do catalogo (12
-- marcas, incluindo o Medicube pre-existente) ja usavam 'Coreia'. O catalogo
-- tambem usa forma curta e sem acento nos demais paises (Franca, Japao, Canada).
--
-- Sem filtro de marca de proposito: hoje 'Coreia do Sul' so existe nesses 20,
-- entao o efeito e identico a filtrar por Medicube, e assim pega qualquer outra
-- linha que tenha entrado com a mesma grafia.
-- Idempotente: rodar de novo nao afeta nada.

begin;

update produtos
set    pais_origem = 'Coreia'
where  pais_origem = 'Coreia do Sul';

-- Conferencia: tem que voltar 0.
-- Se voltar qualquer outra coisa, rode `rollback;` em vez do `commit;`.
select count(*) as ainda_coreia_do_sul
from   produtos
where  pais_origem = 'Coreia do Sul';

commit;

-- Verificacao pos-commit (rode separado):
-- select pais_origem, count(*) from produtos group by pais_origem order by 2 desc;
--   -> esperado: Brasil 49, Coreia 48, Canada 7, Franca 4, EUA 3, Japao 1 (total 112)
-- select pais_origem, count(*) from produtos where marca = 'Medicube' group by pais_origem;
--   -> esperado: uma unica linha, Coreia 21
