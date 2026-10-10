-- ─────────────────────────────────────────────────────────────────────────────
-- Minha rotina (Fase 3): DIAS DA SEMANA dos passos que não são diários (decisão 4).
-- Na rotina ideal os dias vêm dentro do texto do ingrediente — "Retinol 0,3%
-- (Ter/Qui/Sáb)". A cópia passa a ler esse grupo para a coluna `dias`
-- ({Seg,Ter,Qua,Qui,Sex,Sáb,Dom}); null = todo dia.
-- Só quando há UM grupo de dias: um passo que alterna dois produtos ("Azelaico
-- (Seg/Qua/Sex) OU Retinol (Ter/Qui/Sáb)") não cabe num conjunto só → fica todo dia,
-- com o texto como está. A rotina ideal (`protocolos`) continua sem alteração.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.dias_do_ingrediente(ingrediente text)
returns text[]
language sql
immutable
as $$
  with grupos as (
    select m[1] as g
      from regexp_matches(
             coalesce(ingrediente, ''),
             '\(\s*((?:seg|ter|qua|qui|sex|s[aá]b|dom)\w*\.?(?:\s*[/,]\s*(?:seg|ter|qua|qui|sex|s[aá]b|dom)\w*\.?)*)\s*\)',
             'gi'
           ) as m
  )
  select case when (select count(*) from grupos) = 1 then (
    select array_agg(d order by array_position(array['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'], d))
      from (
        select distinct case left(translate(lower(trim(x)), 'á', 'a'), 3)
                 when 'seg' then 'Seg' when 'ter' then 'Ter' when 'qua' then 'Qua'
                 when 'qui' then 'Qui' when 'sex' then 'Sex' when 'sab' then 'Sáb' when 'dom' then 'Dom'
               end as d
          from grupos, regexp_split_to_table(grupos.g, '\s*[/,]\s*') as x
      ) dd
     where d is not null
  ) else null end
$$;

-- A cópia (criar_minha_rotina) passa a preencher `dias`. Mesmo corpo da versão
-- anterior (20261009130000) + a coluna `dias`.
create or replace function public.criar_minha_rotina()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  am jsonb;
  pm jsonb;
  sem_retinoide boolean;
  n integer := 0;
begin
  if uid is null then
    raise exception 'sem sessão';
  end if;

  perform 1 from public.users where id = uid for update;
  if exists (select 1 from public.users where id = uid and minha_rotina_criada_em is not null) then
    return 0;
  end if;

  select coalesce(u.pregnancy_status, '') in ('pregnant', 'breastfeeding', 'trying')
    into sem_retinoide
    from public.users u where u.id = uid;

  select coalesce(p.rotina_am, '[]'::jsonb), coalesce(p.rotina_pm, '[]'::jsonb)
    into am, pm
    from public.protocolos p
   where p.user_id = uid
   order by p.updated_at desc
   limit 1;

  if not found or (jsonb_array_length(am) = 0 and jsonb_array_length(pm) = 0) then
    return -1;
  end if;

  insert into public.minha_rotina_passos
    (user_id, periodo, ordem, nome, ingrediente, instrucao, como_usar, tempo_espera, cor, dias, origem, passo_ideal)
  select uid, f.per,
         row_number() over (partition by f.per order by f.o)::int,
         coalesce(nullif(trim(f.e->>'name'), ''), 'Passo'),
         f.e->>'ingredient',
         f.e->>'instruction',
         case when jsonb_typeof(f.e->'steps') = 'array' then f.e->'steps' else null end,
         f.e->>'waitTime',
         f.e->>'color',
         public.dias_do_ingrediente(f.e->>'ingredient'),
         'ideal',
         jsonb_build_object('periodo', f.per, 'indice', f.o - 1, 'id', f.e->'id', 'nome', f.e->>'name')
    from (
      select s.*
        from (
          select 'am'::text as per, t.e, t.o from jsonb_array_elements(am) with ordinality as t(e, o)
          union all
          select 'pm'::text as per, t.e, t.o from jsonb_array_elements(pm) with ordinality as t(e, o)
        ) s
       where jsonb_typeof(s.e) = 'object'
         and not (coalesce(sem_retinoide, false)
                  and public.passo_tem_retinoide(s.e->>'name', s.e->>'ingredient'))
    ) f;
  get diagnostics n = row_count;

  update public.users set minha_rotina_criada_em = now() where id = uid;
  return n;
end;
$$;

revoke all on function public.criar_minha_rotina() from public;
grant execute on function public.criar_minha_rotina() to authenticated;

-- Passos JÁ copiados da ideal (Fase 1/2) e ainda nunca editados: lê os dias do texto.
update public.minha_rotina_passos
   set dias = public.dias_do_ingrediente(ingrediente), updated_at = now()
 where origem = 'ideal' and dias is null and public.dias_do_ingrediente(ingrediente) is not null;
