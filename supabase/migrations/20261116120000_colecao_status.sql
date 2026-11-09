-- Status de cada produto da estante (08/nov/2026), trocado no selo da tela do produto:
--   tenho          = "Tenho em casa" (o que a tabela sempre significou — por isso o default);
--   quero_comprar  = ela não tem, quer comprar;
--   acabou         = ela tinha e acabou.
-- O produto continua na estante e no passo da rotina em qualquer status. Só "tenho" conta
-- como "em casa" para a escolha de produto do passo e para a IA (niks-chat, sos-espinha).
-- A RLS de update de colecao_produtos já cobre a coluna nova.

alter table public.colecao_produtos
  add column if not exists status text not null default 'tenho'
  check (status in ('tenho', 'quero_comprar', 'acabou'));
