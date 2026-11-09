-- O que o link de convite mostra antes de entrar: nome do grupo, banner e o primeiro nome
-- de quem convidou. Sem `integrantes`: quem ainda não entrou não recebe user_id, foto,
-- pontos, nível nem nome das integrantes. O app não lia esse campo e `entrar_grupo` usa só
-- `valido`, `grupo_id` e `nome`. As demais condições da função não mudam.
create or replace function public.validar_convite(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when g.id is null then jsonb_build_object('valido', false)
    else jsonb_build_object(
      'valido', true, 'grupo_id', g.id, 'nome', g.nome, 'banner', g.banner, 'banner_path', g.banner_path,
      'convidou', public.perfil_curto(c.criado_por) ->> 'nome')
  end
  from (select 1) x
  left join public.convites c on c.token = p_token and c.revogado_em is null
  left join public.grupos g on g.id = c.grupo_id and g.apagado_em is null
     and public.grupo_integrante(c.grupo_id, c.criado_por);
$$;
