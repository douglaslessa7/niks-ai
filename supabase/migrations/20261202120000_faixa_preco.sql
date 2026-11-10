-- Faixa de preço dos produtos do catálogo (10/nov/2026).
-- A faixa é POR MARCA: 1 = até R$ 150 (Custo-benefício) · 2 = R$ 150 a R$ 250 (Médio) · 3 = acima de R$ 250 (Premium).
--   • `marcas_faixa_preco`: a fonte (uma linha por marca, nome em minúsculas e sem espaços nas pontas).
--   • `produtos.faixa_preco`: preenchida pelo banco a partir dela — ao inserir/mudar a marca de um
--     produto e ao inserir/mudar a faixa de uma marca. Marca fora da tabela = sem faixa (null).
-- Só ACRESCENTA (coluna que aceita null + tabela nova): as versões do app que não leem a coluna
-- (1.0.60 e anteriores) não mudam. Idempotente: pode rodar duas vezes.

create table if not exists public.marcas_faixa_preco (
  marca         text primary key check (marca = lower(btrim(marca)) and marca <> ''),
  faixa         smallint not null check (faixa between 1 and 3),
  atualizado_em timestamptz not null default now()
);
-- Só o banco e o service role leem/escrevem (o app lê a faixa direto em `produtos`).
alter table public.marcas_faixa_preco enable row level security;
revoke all on public.marcas_faixa_preco from anon, authenticated;

alter table public.produtos add column if not exists faixa_preco smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_faixa_preco_check') then
    alter table public.produtos add constraint produtos_faixa_preco_check check (faixa_preco between 1 and 3);
  end if;
end $$;

-- Marcas do catálogo em 10/nov/2026 (as 24, aprovadas). Não sobrescreve uma faixa já mudada à mão.
insert into public.marcas_faixa_preco (marca, faixa) values
  ('principia', 1), ('creamy', 1), ('cerave', 1), ('bioderma', 1), ('the ordinary', 1),
  ('la roche-posay', 1), ('cosrx', 1), ('some by mi', 1), ('biore', 1),
  ('beauty of joseon', 2), ('celimax', 2), ('medicube', 2), ('dr.althea', 2), ('mixsoon', 2),
  ('banila co', 2), ('numbuzin', 2), ('torriden', 2), ('skin1004', 2), ('anua', 2),
  ('isntree', 2), ('round lab', 2), ('pyunkang yul', 2), ('illiyoon', 2),
  ('laneige', 3)
on conflict (marca) do nothing;

-- Produto novo ou com a marca trocada: a faixa vem da marca.
create or replace function public.produtos_faixa_da_marca()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.faixa_preco := (select m.faixa from public.marcas_faixa_preco m where m.marca = lower(btrim(new.marca)));
  return new;
end $$;
revoke all on function public.produtos_faixa_da_marca() from public, anon, authenticated;

drop trigger if exists produtos_faixa_da_marca_trg on public.produtos;
create trigger produtos_faixa_da_marca_trg
  before insert or update of marca on public.produtos
  for each row execute function public.produtos_faixa_da_marca();

-- Faixa de uma marca criada/mudada/apagada: atualiza os produtos dela.
create or replace function public.marcas_faixa_aplicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.produtos set faixa_preco = null
     where lower(btrim(marca)) = old.marca and (tg_op = 'DELETE' or old.marca <> new.marca);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.produtos set faixa_preco = new.faixa
     where lower(btrim(marca)) = new.marca and faixa_preco is distinct from new.faixa;
  end if;
  return null;
end $$;
revoke all on function public.marcas_faixa_aplicar() from public, anon, authenticated;

drop trigger if exists marcas_faixa_aplicar_trg on public.marcas_faixa_preco;
create trigger marcas_faixa_aplicar_trg
  after insert or update or delete on public.marcas_faixa_preco
  for each row execute function public.marcas_faixa_aplicar();

-- Preenche os produtos que já existem.
update public.produtos p set faixa_preco = m.faixa
  from public.marcas_faixa_preco m
 where m.marca = lower(btrim(p.marca)) and p.faixa_preco is distinct from m.faixa;
