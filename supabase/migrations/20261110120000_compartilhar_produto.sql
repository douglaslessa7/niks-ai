-- Fase 3 (grupos) · 3.6 — "Compartilhar com o grupo?" (80o/80p).
--   • Fim da rotina: vira um CHECK-IN (Novo check-in, 80w) — nada novo aqui.
--   • Fim do scan de produto: o produto entra no MURAL do grupo como um card "Escaneou
--     <produto>" com a foto do scan (bucket privado `product-scans`, lida por URL
--     assinada pela função `grupos`). Não conta no ranking. Dá a carta `produto_grupo`
--     (1 por dia, ação ligada na 3.3).
--   • Moderação igual à do check-in: some para quem bloqueou a autora e quando ela sai;
--     `removido_em` (NIKSfy) tira do mural; "Denunciar foto" aponta para o
--     compartilhamento. Apagar o scan apaga o compartilhamento (cascade).
-- Substitui `mural_grupo` (agora junta check-ins e produtos, com `tipo`) e `denunciar`
-- (novo parâmetro `p_compartilhamento`).

alter table public.compartilhamentos add column if not exists product_scan_id uuid references public.product_scans (id) on delete cascade;
alter table public.compartilhamentos add column if not exists foto_path text;
alter table public.compartilhamentos add column if not exists titulo text check (titulo is null or char_length(titulo) <= 120);
alter table public.compartilhamentos add column if not exists removido_em timestamptz;
create unique index if not exists compartilhamentos_scan_grupo_uidx
  on public.compartilhamentos (grupo_id, product_scan_id) where product_scan_id is not null;

alter table public.denuncias add column if not exists compartilhamento_id uuid references public.compartilhamentos (id) on delete set null;

create or replace function public.compartilhar_produto(p_uid uuid, p_scan uuid, p_grupos uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  d date := public.dia_sessao(now());
  validos uuid[];
  novos uuid[];
  carta uuid;
begin
  select ps.id, ps.image_path, coalesce(nullif(btrim(ps.produto_nome), ''), 'um produto') nome
    into s from public.product_scans ps where ps.id = p_scan and ps.user_id = p_uid;
  if s.id is null or s.image_path is null then
    return jsonb_build_object('ok', false, 'motivo', 'produto');
  end if;
  select coalesce(array_agg(distinct g), '{}') into validos
    from unnest(coalesce(p_grupos, '{}')) g where public.grupo_integrante(g, p_uid);
  if cardinality(validos) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'grupos');
  end if;

  with ins as (
    insert into public.compartilhamentos (user_id, grupo_id, origem, referencia, product_scan_id, foto_path, titulo, dia)
    select p_uid, g, 'produto', s.id::text, s.id, s.image_path, left(s.nome, 120), d from unnest(validos) g
    on conflict (grupo_id, product_scan_id) where product_scan_id is not null do nothing
    returning grupo_id)
  select coalesce(array_agg(grupo_id), '{}') into novos from ins;

  if cardinality(novos) > 0 then
    begin
      carta := public.dar_carta_acao(p_uid, 'produto_grupo', d);
    exception when others then
      raise warning 'compartilhar_produto: carta falhou (scan % salvo mesmo assim): %', p_scan, sqlerrm;
      carta := null;
    end;
  end if;
  return jsonb_build_object('ok', true, 'grupos', to_jsonb(validos), 'novos', cardinality(novos), 'carta_id', carta);
end;
$$;

create or replace function public.mural_grupo(p_uid uuid, p_grupo uuid, p_antes timestamptz default null, p_limite integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with itens as (
    select 'checkin'::text tipo, c.id, c.user_id, c.rotina, c.dia,
           -- Sem título, o do design: "Rotina da manhã" / "Rotina da noite".
           coalesce(c.titulo, case c.rotina when 'am' then 'Rotina da manhã' else 'Rotina da noite' end) titulo,
           c.descricao, c.hora_exibida quando, c.foto_path, 'grupos'::text bucket
      from public.checkins_visiveis(p_uid, p_grupo) c
    union all
    select 'produto', x.id, x.user_id, null, x.dia, x.titulo, null, x.criado_em, x.foto_path, 'product-scans'
      from public.compartilhamentos x
      join public.grupo_membros m on m.grupo_id = p_grupo and m.user_id = x.user_id and m.saiu_em is null
     where x.grupo_id = p_grupo and x.origem = 'produto' and x.removido_em is null and x.foto_path is not null
       and public.grupo_integrante(p_grupo, p_uid)
       and not exists (select 1 from public.bloqueios b where b.user_id = p_uid and b.bloqueada_id = x.user_id)
  )
  select case when not public.grupo_integrante(p_grupo, p_uid) then null else
    coalesce(jsonb_agg(jsonb_build_object(
      'tipo', i.tipo, 'id', i.id,
      'checkin_id', case when i.tipo = 'checkin' then i.id end,
      'compartilhamento_id', case when i.tipo = 'produto' then i.id end,
      'user_id', i.user_id, 'rotina', i.rotina, 'dia', i.dia, 'titulo', i.titulo, 'descricao', i.descricao,
      'hora_exibida', i.quando, 'foto_path', i.foto_path, 'foto_bucket', i.bucket, 'voce', i.user_id = p_uid,
      'autora', public.perfil_curto(i.user_id)) order by i.quando desc), '[]'::jsonb) end
  from (select * from itens where p_antes is null or itens.quando < p_antes
         order by itens.quando desc limit least(greatest(coalesce(p_limite, 30), 1), 100)) i;
$$;

drop function if exists public.denunciar(uuid, text, uuid, uuid, uuid, text);
create or replace function public.denunciar(p_uid uuid, p_tipo text, p_grupo uuid, p_alvo uuid, p_checkin uuid, p_motivo text,
                                            p_compartilhamento uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo uuid := p_alvo;
  d uuid;
begin
  if p_tipo not in ('foto', 'integrante') or not public.grupo_integrante(p_grupo, p_uid) then
    return jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  end if;
  if p_tipo = 'foto' and p_compartilhamento is not null then
    select x.user_id into alvo from public.compartilhamentos x where x.id = p_compartilhamento and x.grupo_id = p_grupo;
    if alvo is null then
      return jsonb_build_object('ok', false, 'motivo', 'foto');
    end if;
  elsif p_tipo = 'foto' then
    select c.user_id into alvo from public.checkins c join public.checkin_grupos cg on cg.checkin_id = c.id
     where c.id = p_checkin and cg.grupo_id = p_grupo;
    if alvo is null then
      return jsonb_build_object('ok', false, 'motivo', 'foto');
    end if;
  elsif not exists (select 1 from public.grupo_membros where grupo_id = p_grupo and user_id = alvo) or alvo = p_uid then
    return jsonb_build_object('ok', false, 'motivo', 'alvo');
  end if;
  insert into public.denuncias (denunciante_id, tipo, grupo_id, alvo_user_id, checkin_id, compartilhamento_id, motivo)
  values (p_uid, p_tipo, p_grupo, alvo,
          case when p_tipo = 'foto' and p_compartilhamento is null then p_checkin end,
          case when p_tipo = 'foto' then p_compartilhamento end,
          left(nullif(btrim(coalesce(p_motivo, '')), ''), 500))
  returning id into d;
  return jsonb_build_object('ok', true, 'denuncia_id', d);
end;
$$;

revoke all on function public.compartilhar_produto(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.mural_grupo(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.denunciar(uuid, text, uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.compartilhar_produto(uuid, uuid, uuid[]) to service_role;
grant execute on function public.mural_grupo(uuid, uuid, timestamptz, integer) to service_role;
grant execute on function public.denunciar(uuid, text, uuid, uuid, uuid, text, uuid) to service_role;
