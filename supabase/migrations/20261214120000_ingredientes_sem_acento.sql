-- Comparação de listas de ingredientes sem acento, maiúscula ou espaço sobrando (18/nov/2026).
-- Antes: "ÁCIDO CÍTRICO" × "ACIDO CITRICO" contava como ingrediente diferente e uma foto da mesma
-- lista substituía a outra. Só troca gravar_ingredientes (mesma assinatura) e cria inci_norm.

create or replace function public.inci_norm(x text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(trim(coalesce(x, ''))),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '\s+', ' ', 'g')
$$;
revoke all on function public.inci_norm(text) from public, anon, authenticated;
grant execute on function public.inci_norm(text) to service_role;

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
    select count(*)::numeric / greatest(1, (select count(distinct public.inci_norm(x)) from unnest(atual.inci || p_inci) x))
      into comum from (select public.inci_norm(x) from unnest(atual.inci) x intersect select public.inci_norm(y) from unnest(p_inci) y) t;
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

