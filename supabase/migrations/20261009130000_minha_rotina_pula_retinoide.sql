-- ─────────────────────────────────────────────────────────────────────────────
-- Minha rotina (Fase 1): a CÓPIA da rotina ideal PULA os passos com retinoide para
-- quem está grávida, amamentando ou tentando engravidar (`users.pregnancy_status`
-- pregnant | breastfeeding | trying). A rotina ideal salva (`protocolos`) continua
-- sem alteração — rotinas ideais antigas, de antes da trava do generate-protocol
-- (out/2026), podem ter retinoide; a cópia é que não leva.
-- Mesmo detector da trava do generate-protocol (`isRetinoidStep`): mudou lá, mude aqui.
-- Passo que alterna retinoide com outro ativo ("Azelaico (Seg/Qua/Sex) OU Retinol
-- (Ter/Qui/Sáb)") também é pulado inteiro — na dúvida, fica de fora.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.passo_tem_retinoide(nome text, ingrediente text)
returns boolean
language sql
immutable
as $$
  select regexp_replace(
           t,
           -- "bakuchiol (alternativa ao retinol)" não é retinoide: tira a comparação.
           case when t like '%bakuchiol%' then '(alternativa|substitut\w*|similar|parecid\w*)[^,.;()]*?retin\w*' else '$^' end,
           ' ', 'g'
         ) ~ '(retinol|retinal|retinaldeido|tretinoina|isotretinoina|retinoide|retinoid|retinil|retinyl|adapalen|tazaroten|trifaroten|hidroxipinacolona|hydroxypinacolone|granactive|\mhpr\M)'
  from (
    select translate(lower(coalesce(nome, '') || ' ' || coalesce(ingrediente, '')),
                     'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as t
  ) s
$$;

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
    (user_id, periodo, ordem, nome, ingrediente, instrucao, como_usar, tempo_espera, cor, origem, passo_ideal)
  select uid, f.per,
         -- ordem renumerada depois de pular passos (sem buracos: 1, 2, 3…)
         row_number() over (partition by f.per order by f.o)::int,
         coalesce(nullif(trim(f.e->>'name'), ''), 'Passo'),
         f.e->>'ingredient',
         f.e->>'instruction',
         case when jsonb_typeof(f.e->'steps') = 'array' then f.e->'steps' else null end,
         f.e->>'waitTime',
         f.e->>'color',
         'ideal',
         -- `indice` continua sendo a posição ORIGINAL na ideal (referência para a Fase 4).
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
