-- Tabela de ingredientes (INCI) dos produtos escaneados (RASCUNHO, 18/nov/2026 — NÃO aplicada).
-- Só o servidor lê e escreve (RLS ligada, sem política; anon/authenticated sem permissão).
-- Uma linha por produto (chave = marca + nome normalizados). A busca na internet roda no 1º scan
-- de um produto novo, uma vez só: `reservar_busca` cria a linha 'buscando' (ou nega) de forma
-- atômica e respeita o teto diário de `ingredientes_config`.

create table if not exists public.produtos_ingredientes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,                       -- marca_norm || '|' || nome_norm
  marca text not null,
  nome text not null,
  marca_norm text not null,
  nome_norm text not null,
  nomes_alternativos text[] not null default '{}',
  produto_id uuid references public.produtos(id) on delete set null,   -- quando é do catálogo
  inci text[],                                      -- na ordem do rótulo; null enquanto busca/não achou
  concentracoes jsonb not null default '[]'::jsonb, -- [{ingrediente, valor}] só quando a marca informa
  fonte text check (fonte in ('rotulo', 'site_oficial', 'base_inci', 'loja')),
  fonte_url text,
  fonte_scan_id uuid references public.product_scans(id) on delete set null,  -- rótulo lido num scan
  versao_na_fonte text,                             -- ex.: "reformulação 2022", "versão EUA"
  confianca text check (confianca in ('alta', 'media', 'baixa')),
  conferencias jsonb not null default '{}'::jsonb,  -- resultado de cada conferência do código (nome, url lida, ativos da frente, INCI, país)
  status text not null default 'buscando' check (status in ('ok', 'buscando', 'nao_encontrado', 'revisar')),
  tentativas int not null default 0,
  buscado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists produtos_ingredientes_marca_idx on public.produtos_ingredientes (marca_norm);

-- Versões anteriores (um rótulo novo com lista diferente substitui e guarda a antiga).
create table if not exists public.produtos_ingredientes_versoes (
  id bigserial primary key,
  ingrediente_id uuid not null references public.produtos_ingredientes(id) on delete cascade,
  inci text[],
  fonte text,
  fonte_url text,
  fonte_scan_id uuid,
  substituida_em timestamptz not null default now()
);

create table if not exists public.ingredientes_config (
  id int primary key default 1 check (id = 1),
  busca_ligada boolean not null default false,      -- desligada até o OK
  teto_buscas_dia int not null default 100,
  dias_para_tentar_de_novo int not null default 90
);
insert into public.ingredientes_config (id) values (1) on conflict (id) do nothing;

alter table public.produtos_ingredientes enable row level security;
alter table public.produtos_ingredientes_versoes enable row level security;
alter table public.ingredientes_config enable row level security;
revoke all on public.produtos_ingredientes, public.produtos_ingredientes_versoes, public.ingredientes_config from anon, authenticated;

-- Reserva a busca de um produto (atômica). true = esta chamada deve buscar.
-- Não busca: já existe (ok/buscando/revisar), "não encontrado" recente, busca desligada ou teto do dia.
create or replace function public.reservar_busca(p_chave text, p_marca text, p_nome text, p_marca_norm text, p_nome_norm text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  cfg record;
  hoje int;
  atual record;
begin
  select * into cfg from ingredientes_config where id = 1;
  if cfg is null or not cfg.busca_ligada then return false; end if;
  perform pg_advisory_xact_lock(hashtext('reservar_busca'));
  select count(*) into hoje from produtos_ingredientes
    where buscado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  if hoje >= cfg.teto_buscas_dia then return false; end if;
  select * into atual from produtos_ingredientes where chave = p_chave for update;
  if atual is null then
    insert into produtos_ingredientes (chave, marca, nome, marca_norm, nome_norm, status, tentativas, buscado_em)
      values (p_chave, p_marca, p_nome, p_marca_norm, p_nome_norm, 'buscando', 1, now());
    return true;
  end if;
  if atual.status = 'nao_encontrado' and atual.buscado_em < now() - make_interval(days => cfg.dias_para_tentar_de_novo) then
    update produtos_ingredientes set status = 'buscando', tentativas = tentativas + 1, buscado_em = now(), atualizado_em = now() where id = atual.id;
    return true;
  end if;
  return false;
end $$;

-- Grava uma lista (rótulo lido ou busca). Rótulo sempre vence; lista diferente de rótulo (< 80%
-- em comum) substitui e guarda a anterior em _versoes.
create or replace function public.gravar_ingredientes(
  p_chave text, p_marca text, p_nome text, p_marca_norm text, p_nome_norm text,
  p_inci text[], p_fonte text, p_fonte_url text, p_fonte_scan uuid, p_confianca text,
  p_concentracoes jsonb default '[]'::jsonb, p_versao text default null, p_conferencias jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  atual record;
  comum numeric;
  peso_novo int := case p_fonte when 'rotulo' then 3 when 'site_oficial' then 2 else 1 end;
  peso_atual int;
begin
  -- Só o rótulo lido pode ser "alta" (decisão de 18/nov/2026): lista da internet no máximo "media".
  if p_fonte is distinct from 'rotulo' and p_confianca = 'alta' then p_confianca := 'media'; end if;
  select * into atual from produtos_ingredientes where chave = p_chave for update;
  if atual is null then
    insert into produtos_ingredientes (chave, marca, nome, marca_norm, nome_norm, inci, concentracoes, fonte, fonte_url, fonte_scan_id, versao_na_fonte, confianca, conferencias, status, buscado_em)
      values (p_chave, p_marca, p_nome, p_marca_norm, p_nome_norm, p_inci, coalesce(p_concentracoes, '[]'), p_fonte, p_fonte_url, p_fonte_scan, p_versao, p_confianca, coalesce(p_conferencias, '{}'), case when p_inci is null then 'nao_encontrado' else 'ok' end, case when p_fonte = 'rotulo' then null else now() end);
    return 'criada';
  end if;
  if p_inci is null then
    if atual.status = 'buscando' then update produtos_ingredientes set status = 'nao_encontrado', atualizado_em = now() where id = atual.id; end if;
    return 'nao_encontrado';
  end if;
  peso_atual := case atual.fonte when 'rotulo' then 3 when 'site_oficial' then 2 when null then 0 else 1 end;
  if atual.inci is not null and peso_novo < peso_atual then return 'mantida'; end if;
  if atual.inci is not null then
    select count(*)::numeric / greatest(1, (select count(distinct lower(x)) from unnest(atual.inci || p_inci) x))
      into comum from (select lower(x) from unnest(atual.inci) x intersect select lower(y) from unnest(p_inci) y) t;
    if comum >= 0.8 and peso_novo <= peso_atual then
      update produtos_ingredientes set nomes_alternativos = coalesce((select array_agg(distinct v) from unnest(nomes_alternativos || array[p_nome]) v where v <> nome), '{}'), atualizado_em = now() where id = atual.id;
      return 'confirmada';
    end if;
    insert into produtos_ingredientes_versoes (ingrediente_id, inci, fonte, fonte_url, fonte_scan_id)
      values (atual.id, atual.inci, atual.fonte, atual.fonte_url, atual.fonte_scan_id);
  end if;
  update produtos_ingredientes set inci = p_inci, concentracoes = coalesce(p_concentracoes, '[]'), fonte = p_fonte, fonte_url = p_fonte_url,
    fonte_scan_id = p_fonte_scan, versao_na_fonte = p_versao, confianca = p_confianca, conferencias = coalesce(p_conferencias, '{}'), status = 'ok', atualizado_em = now()
    where id = atual.id;
  return case when atual.inci is null then 'preenchida' else 'atualizada' end;
end $$;

revoke all on function public.reservar_busca(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.gravar_ingredientes(text, text, text, text, text, text[], text, text, uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.reservar_busca(text, text, text, text, text) to service_role;
grant execute on function public.gravar_ingredientes(text, text, text, text, text, text[], text, text, uuid, text, jsonb, text, jsonb) to service_role;
