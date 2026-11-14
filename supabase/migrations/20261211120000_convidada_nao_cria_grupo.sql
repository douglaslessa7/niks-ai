-- Convidada não cria grupo — trava no SERVIDOR (13/nov/2026, Parte B, Fase 9; pedido do produto).
--
-- Até aqui só o app tinha o cadeado. Com `criar_sem_assinatura_servidor = true`, a função deixava
-- criar qualquer conta sem assinatura que não tivesse ENTRADO como convidada (`e_convidada`): quem
-- virou convidada depois (assinatura vencida, ainda no grupo) passava. Agora, além da regra de
-- antes, quem está no estado `convidada` (`estado_acesso`) recebe `{ ok: false, motivo: 'assinatura' }`
-- — a recusa que o app já trata ("Não conseguimos confirmar sua assinatura agora").
--
-- Quem não é convidada: idêntico. Com `convidada_ligada = false`, só contas de `convidada_testers`
-- podem estar no estado `convidada` (simulado em 13/nov/2026: 1 de 3.392 contas muda, da lista de
-- teste). Volta: ~/Developer/niks-ai-backups/2026-11-13_convidada_nao_cria_grupo/VOLTA.sql

create or replace function public.criar_grupo(p_uid uuid, p_nome text, p_descricao text, p_banner text, p_banner_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  livre boolean;
  g uuid;
begin
  if exists (select 1 from public.grupos_banidas where user_id = p_uid) then
    return jsonb_build_object('ok', false, 'motivo', 'banida');
  end if;
  select criar_sem_assinatura_servidor into livre from public.grupos_config where id = 1;
  if not (public.assinante(p_uid) or (coalesce(livre, false) and not public.e_convidada(p_uid))) then
    return jsonb_build_object('ok', false, 'motivo', 'assinatura');
  end if;
  -- Nova (Fase 9): convidada nunca cria grupo, mesmo com a criação liberada sem assinatura.
  if public.estado_acesso(p_uid) = 'convidada' then
    return jsonb_build_object('ok', false, 'motivo', 'assinatura');
  end if;
  if p_nome is null or char_length(btrim(p_nome)) not between 1 and 40 then
    return jsonb_build_object('ok', false, 'motivo', 'nome');
  end if;
  if p_banner_path is not null and split_part(p_banner_path, '/', 1) <> p_uid::text then
    return jsonb_build_object('ok', false, 'motivo', 'banner');
  end if;
  insert into public.grupos (nome, descricao, banner, banner_path, criada_por)
  values (btrim(p_nome), nullif(btrim(coalesce(p_descricao, '')), ''),
          case when p_banner_path is not null then 'foto' else coalesce(nullif(p_banner, ''), 'niks-1') end,
          p_banner_path, p_uid)
  returning id into g;
  insert into public.grupo_membros (grupo_id, user_id, papel, tipo) values (g, p_uid, 'criadora', 'assinante');
  return jsonb_build_object('ok', true, 'grupo_id', g);
end;
$$;
