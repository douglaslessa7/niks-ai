-- Parte B (convidada) · Fase 5 — abrir o produto compartilhado no mural.
-- Devolve só o que não depende da pele de quem escaneou: o produto e o que ele faz. Nota,
-- veredito, explicação e avisos são pessoais e NÃO saem daqui.

create or replace function public.produto_compartilhado(p_uid uuid, p_grupo uuid, p_compartilhamento uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when x.id is null or not public.grupo_integrante(p_grupo, p_uid) then jsonb_build_object('ok', false, 'motivo', 'produto')
    else jsonb_build_object(
      'ok', true,
      'foto_path', x.foto_path,
      'resultado', jsonb_build_object('status', 'ok', 'produto', s.resultado -> 'produto', 'o_que_faz', s.resultado -> 'o_que_faz'))
  end
  from (select 1) u
  left join public.compartilhamentos x on x.id = p_compartilhamento and x.grupo_id = p_grupo and x.origem = 'produto'
     and x.removido_em is null and x.oculto_em is null
     and exists (select 1 from public.grupo_membros m where m.grupo_id = p_grupo and m.user_id = x.user_id and m.saiu_em is null)
     and not exists (select 1 from public.bloqueios b where b.user_id = p_uid and b.bloqueada_id = x.user_id)
  left join public.product_scans s on s.id = x.product_scan_id;
$$;

revoke all on function public.produto_compartilhado(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.produto_compartilhado(uuid, uuid, uuid) to service_role;
