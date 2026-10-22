-- ia_custos.uso_estimado (out/2026)
-- Resposta que ninguém lê (a usuária fechou o chat, ou o roteador desistiu dela e foi para o
-- gpt-5.4-mini) não é mais cortada: termina em segundo plano e a linha tem o uso que a API
-- informou. Só quando passa do limite (60 s a mais) ela é cortada — aí a API não chega a
-- informar o uso, os tokens da linha são uma estimativa (piso) e esta coluna fica true.
-- Antes, essas linhas ficavam com 0 tokens e US$ 0, e o teto mensal subestimava o gasto.

alter table public.ia_custos add column if not exists uso_estimado boolean not null default false;
