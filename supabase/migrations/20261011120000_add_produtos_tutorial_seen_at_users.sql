-- Tutorial de primeira entrada da tela de Produtos (designs 59a–59d): marcador de
-- "esta CONTA já viu". Mesmo padrão de `home_tutorial_seen_at`: aparece UMA vez por
-- conta (inclusive para quem já usava o app), na primeira abertura de Produtos.
-- Null = nunca viu. O app grava ao concluir ou pular o tutorial (lib/produtosTutorial.ts).
-- Aditivo: o app das lojas não lê esta coluna. A própria usuária grava (RLS de users).
alter table public.users add column if not exists produtos_tutorial_seen_at timestamptz;
