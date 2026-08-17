-- Marcador de "a regeneração única do protocolo no 1º scan in-app já foi concluída".
-- Null = ainda não aconteceu. Setado só no SUCESSO confirmado (nunca no início), então
-- um app morto no meio simplesmente tenta de novo no próximo scan.
alter table users add column if not exists inapp_protocol_regenerated_at timestamptz;
