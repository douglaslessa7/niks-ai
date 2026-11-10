-- Faixa de preço OBRIGATÓRIA no catálogo (10/nov/2026; depende de 20261202120000_faixa_preco).
--   • Produto novo, troca de marca ou faixa gravada à mão: a faixa vem SEMPRE de `marcas_faixa_preco`;
--     marca fora da tabela = RECUSADO (erro). Marca nova entra em `marcas_faixa_preco` ANTES dos produtos.
--   • Marca com produtos não pode ser apagada nem renomeada em `marcas_faixa_preco` (mudar a faixa pode).
--   • `produtos.faixa_preco` passa a NOT NULL.
-- A 1.0.60 e anteriores não gravam em `produtos`: nada muda para elas. Idempotente.

-- Produto: a faixa vem da marca; sem faixa, recusa.
create or replace function public.produtos_faixa_da_marca()
returns trigger language plpgsql security definer set search_path = public as $$
declare f smallint;
begin
  select m.faixa into f from public.marcas_faixa_preco m where m.marca = lower(btrim(new.marca));
  if f is null then
    raise exception 'marca sem faixa de preço: "%" (cadastre em marcas_faixa_preco antes do produto)', new.marca
      using errcode = 'check_violation';
  end if;
  new.faixa_preco := f;
  return new;
end $$;
revoke all on function public.produtos_faixa_da_marca() from public, anon, authenticated;

-- Agora também em UPDATE de faixa_preco: gravar outra faixa à mão volta para a da marca.
drop trigger if exists produtos_faixa_da_marca_trg on public.produtos;
create trigger produtos_faixa_da_marca_trg
  before insert or update of marca, faixa_preco on public.produtos
  for each row execute function public.produtos_faixa_da_marca();

-- Marca em uso: não apaga nem renomeia.
create or replace function public.marcas_faixa_protege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' or new.marca <> old.marca)
     and exists (select 1 from public.produtos p where lower(btrim(p.marca)) = old.marca) then
    raise exception 'marca "%" tem produtos no catálogo: não pode ser apagada nem renomeada', old.marca
      using errcode = 'foreign_key_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.marcas_faixa_protege() from public, anon, authenticated;

drop trigger if exists marcas_faixa_protege_trg on public.marcas_faixa_preco;
create trigger marcas_faixa_protege_trg
  before update or delete on public.marcas_faixa_preco
  for each row execute function public.marcas_faixa_protege();

-- Propagação: só inserir/mudar faixa (apagar/renomear marca em uso já é recusado acima).
create or replace function public.marcas_faixa_aplicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.produtos set faixa_preco = new.faixa
   where lower(btrim(marca)) = new.marca and faixa_preco is distinct from new.faixa;
  return null;
end $$;
revoke all on function public.marcas_faixa_aplicar() from public, anon, authenticated;

drop trigger if exists marcas_faixa_aplicar_trg on public.marcas_faixa_preco;
create trigger marcas_faixa_aplicar_trg
  after insert or update of faixa on public.marcas_faixa_preco
  for each row execute function public.marcas_faixa_aplicar();

-- Garante tudo preenchido e torna obrigatória (falha — e não aplica nada — se sobrar produto sem faixa).
update public.produtos p set faixa_preco = m.faixa
  from public.marcas_faixa_preco m
 where m.marca = lower(btrim(p.marca)) and p.faixa_preco is distinct from m.faixa;
alter table public.produtos alter column faixa_preco set not null;
