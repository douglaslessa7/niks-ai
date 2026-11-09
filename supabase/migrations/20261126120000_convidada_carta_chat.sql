-- Parte B (convidada): 4ª e 5ª cartas especiais (NIKS Chat e variação de produto) no revezamento.

insert into public.cartas_catalogo (codigo, familia, subtipo, nome, ativa) values
  ('convidada-chat', 'conhecimento', 'pessoal', 'Mensagem do NIKS Chat', false),
  ('convidada-produto2', 'conhecimento', 'pessoal', 'Produto para sua pele 2', false)
on conflict (codigo) do update set ativa = false;

create or replace function public.convidada_carta_do_checkin(p_uid uuid, p_rotina text, p_dia date, p_agora timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  tipo text;
  seq jsonb;
  novo uuid;
  u public.users%rowtype;
  v_acao text;
begin
  if public.estado_acesso(p_uid) <> 'convidada' or not public.v2_ativo(p_uid) then
    return null;
  end if;
  select count(*) into n from public.checkins where user_id = p_uid and removido_em is null;
  if n % 2 = 0 then
    return null;
  end if;
  tipo := (array['produto', 'idade', 'rotina', 'chat', 'produto2'])[((n - 1) / 2) % 5 + 1];
  select * into u from public.users where id = p_uid;
  seq := public.registrar_rotina(p_uid, p_rotina, p_agora);
  -- Primeira carta do dia: ocupa o lugar da carta do dia.
  v_acao := case when exists (select 1 from public.cartas_usuario where user_id = p_uid and dia = p_dia and acao = 'dia')
                 then 'convidada:' || n else 'dia' end;
  insert into public.cartas_usuario (user_id, carta_id, origem, dia, acao, conteudo)
  select p_uid, c.id, 'convidada', p_dia, v_acao,
         jsonb_build_object('tipo', tipo, 'numero', n, 'idade', u.idade_pele_onboarding, 'preocupacoes', to_jsonb(u.concerns))
    from public.cartas_catalogo c where c.codigo = 'convidada-' || tipo
  on conflict do nothing
  returning id into novo;
  return jsonb_build_object('sequencia', seq, 'carta', novo, 'pontos', null);
end;
$$;
