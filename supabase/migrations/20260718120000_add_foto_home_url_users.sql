-- Foto da home escolhida pela usuária na galeria.
--
-- Regra: quando esta coluna está preenchida, ela tem precedência ABSOLUTA sobre
-- `skin_scans.foto_url` na tela de home. Novos scans de pele atualizam o score e as
-- métricas, mas NÃO trocam mais a foto da home. A única forma de trocar é a usuária
-- tocar na foto e escolher outra da galeria.

ALTER TABLE users ADD COLUMN IF NOT EXISTS foto_home_url text;

COMMENT ON COLUMN users.foto_home_url IS
  'Foto escolhida pela usuária na galeria para a home (signed URL do bucket `scans`, 1 ano). Precedência ABSOLUTA sobre skin_scans.foto_url — novos scans não trocam a foto da home.';
