-- ─────────────────────────────────────────────────────────────────────────────
-- "Montar minha rotina com meus produtos" no servidor (plano da Rotina, Fase 6).
--
-- `rotina_lotes`: um registro por pedido. O app envia as imagens combinadas para o
-- bucket `rotina-lotes` (Fase 5) e chama a função `montar-rotina-com-produtos` com os
-- caminhos; a FUNÇÃO cria a linha (status 'processando'), responde na hora e roda a
-- IA em segundo plano. No fim grava `resultado` (o JSON conferido da função, com o
-- item da estante de cada produto identificado) e status 'pronto' — ou 'erro'.
-- O resultado nunca se perde se ela fechar o app: fica aqui.
--
-- Teto: 1 lote por dia (fuso de Brasília) — conferido pela função; lote que terminou
-- em 'erro' não conta.
--
-- A Minha rotina NÃO muda sozinha: só quando ela toca "Usar essa rotina" →
-- `aplicar_lote_rotina(lote)`, que troca os passos de uma vez (numa transação).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rotina_lotes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  status        text not null default 'processando' check (status in ('processando', 'pronto', 'erro')),
  caminhos      text[] not null,          -- imagens no bucket rotina-lotes, na ordem (Produto 1, 2, …)
  tem_rotulo    boolean[] not null,
  resultado     jsonb,
  erro          text,
  criado_em     timestamptz not null default now(),
  concluido_em  timestamptz,
  notificado_em timestamptz,              -- push enviado
  visto_em      timestamptz,              -- ela abriu o resultado
  aplicado_em   timestamptz               -- ela tocou "Usar essa rotina"
);

create index if not exists rotina_lotes_user_criado_idx on public.rotina_lotes (user_id, criado_em desc);

alter table public.rotina_lotes enable row level security;

-- Ela lê os próprios lotes e marca visto/aplicado. Criar e concluir é só da função
-- (service role) — sem policy de insert/delete.
drop policy if exists rotina_lotes_select_own on public.rotina_lotes;
create policy rotina_lotes_select_own on public.rotina_lotes
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists rotina_lotes_update_own on public.rotina_lotes;
create policy rotina_lotes_update_own on public.rotina_lotes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- "Usar essa rotina": troca a Minha rotina pela rotina montada no lote.
-- Cada passo de `resultado.rotina.am/pm` ({produto_indice, passo, instrucao, dias})
-- vira um passo com origem 'ia_produtos', ligado ao item da estante do produto
-- (`resultado.produtos[i].colecao_item_id`, gravado pela função) e com o aviso dele.
-- Devolve quantos passos criou.
create or replace function public.aplicar_lote_rotina(p_lote uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r jsonb;
  n integer := 0;
begin
  if uid is null then
    raise exception 'sem sessão';
  end if;

  select l.resultado into r
    from public.rotina_lotes l
   where l.id = p_lote and l.user_id = uid and l.status = 'pronto'
   for update;
  if r is null then
    raise exception 'lote não encontrado ou não pronto';
  end if;

  delete from public.minha_rotina_passos where user_id = uid;

  insert into public.minha_rotina_passos
    (user_id, periodo, ordem, nome, instrucao, dias, origem, colecao_item_id, aviso_nivel, aviso_texto)
  select uid, s.per, s.o::int,
         nullif(trim(s.e->>'passo'), ''),
         s.e->>'instrucao',
         case when jsonb_typeof(s.e->'dias') = 'array' and jsonb_array_length(s.e->'dias') > 0
              then array(select jsonb_array_elements_text(s.e->'dias')) else null end,
         'ia_produtos',
         (prod->>'colecao_item_id')::uuid,
         case when prod->>'nivel_aviso' in ('leve', 'forte') then prod->>'nivel_aviso' else 'nenhum' end,
         case when prod->>'nivel_aviso' in ('leve', 'forte') then prod->>'motivo' else null end
    from (
      select 'am'::text as per, t.e, t.o from jsonb_array_elements(coalesce(r->'rotina'->'am', '[]'::jsonb)) with ordinality as t(e, o)
      union all
      select 'pm'::text as per, t.e, t.o from jsonb_array_elements(coalesce(r->'rotina'->'pm', '[]'::jsonb)) with ordinality as t(e, o)
    ) s
    left join lateral (
      select p from jsonb_array_elements(coalesce(r->'produtos', '[]'::jsonb)) p
       where (p->>'indice')::int = (s.e->>'produto_indice')::int
       limit 1
    ) pp(prod) on true;
  get diagnostics n = row_count;

  -- A cópia da ideal (criar_minha_rotina) não pode recriar por cima depois.
  update public.users set minha_rotina_criada_em = coalesce(minha_rotina_criada_em, now()) where id = uid;
  update public.rotina_lotes set aplicado_em = now(), visto_em = coalesce(visto_em, now()) where id = p_lote;
  return n;
end;
$$;

revoke all on function public.aplicar_lote_rotina(uuid) from public;
grant execute on function public.aplicar_lote_rotina(uuid) to authenticated;
