-- ─────────────────────────────────────────────────────────────────────────────
-- ESTATÍSTICAS NO CHECK-IN (20261205, build 1.62, pedido do produto).
-- O check-in passa a sair SÓ do fluxo do skincare (Iniciar skincare → timer → Concluir →
-- comemoração → "Compartilhar com o grupo?" → câmera → prévia) e leva as ESTATÍSTICAS daquele
-- skincare — tempo, passos e produtos (sem NIKS Points) — que as outras integrantes veem no
-- mural e no detalhe. (A convidada continua com o check-in simplificado do grupo, sem elas.)
--
--  • checkins.estatisticas (jsonb, até 8 KB): { v, duracao_s, n_passos, n_produtos,
--    passos: [{ nome, marca, produto, img }] }.
--  • O app manda `p_estatisticas` com a REFERÊNCIA de cada produto ({ origem: catalogo |
--    estante | escaneado, id }), nunca um link: checkin_estatisticas_limpas() corta tamanhos
--    (20 passos, textos de 60/60/120, tempo até 6 h) e resolve a foto ELA MESMA — catálogo =
--    link público do produto; estante/escaneado = só se o item for DELA, como { bucket, path }
--    privado (a função `grupos` assina na leitura, como a foto do check-in).
--  • Para quem ainda está na 1.61 (que mostra título/descrição), a `descricao` é preenchida
--    com o texto das estatísticas ("Skincare noturno em 12 min · 1. Limpeza: …"), se ela não
--    mandou uma. A 1.62 mostra o bloco desenhado.
--  • publicar_checkin ganha `p_estatisticas` (opcional, no fim): é recriada (drop + create)
--    para não sobrar uma 2ª versão com o mesmo nome — quem chama sem ela segue igual.
--  • mural_grupo e checkin_detalhe devolvem `estatisticas`.
-- Testada no PGlite (réplica do schema de produção) antes de aplicar.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.checkins add column if not exists estatisticas jsonb;
alter table public.checkins drop constraint if exists checkins_estatisticas_tamanho;
alter table public.checkins add constraint checkins_estatisticas_tamanho
  check (estatisticas is null or (jsonb_typeof(estatisticas) = 'object' and pg_column_size(estatisticas) <= 8192));

-- Limpa e completa as estatísticas vindas do app (nunca confia em link vindo do aparelho).
create or replace function public.checkin_estatisticas_limpas(p_uid uuid, p_rotina text, p_est jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  dur integer;
  p jsonb;
  ref jsonb;
  rid uuid;
  img jsonb;
  passos jsonb := '[]'::jsonb;
  nprod integer := 0;
  cp record;
  marca text;
  produto text;
begin
  if p_est is null or jsonb_typeof(p_est) <> 'object' then
    return null;
  end if;
  dur := case when jsonb_typeof(p_est -> 'duracao_s') = 'number'
              then least(greatest(floor((p_est ->> 'duracao_s')::numeric)::int, 0), 21600) end;
  if jsonb_typeof(p_est -> 'passos') = 'array' then
    for p in select x from jsonb_array_elements(p_est -> 'passos') with ordinality t(x, o) where o <= 20 order by o loop
      continue when jsonb_typeof(p) <> 'object';
      img := null;
      marca := left(nullif(btrim(coalesce(p ->> 'marca', '')), ''), 60);
      produto := left(nullif(btrim(coalesce(p ->> 'produto', '')), ''), 120);
      ref := p -> 'ref';
      rid := case when jsonb_typeof(ref) = 'object' and coalesce(ref ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (ref ->> 'id')::uuid end;
      if rid is not null and ref ->> 'origem' = 'catalogo' then
        select jsonb_build_object('url', coalesce(case when pr.imagem_recorte_status = 'ok' then pr.imagem_recorte_url end, pr.imagem_url))
          into img from public.produtos pr where pr.id = rid;
      elsif rid is not null and ref ->> 'origem' = 'estante' then
        select c.produto_id, c.recorte_path, c.recorte_status, c.product_scan_id, c.imagem_url into cp
          from public.colecao_produtos c where c.id = rid and c.user_id = p_uid;
        if found then
          if cp.produto_id is not null then
            select jsonb_build_object('url', coalesce(case when pr.imagem_recorte_status = 'ok' then pr.imagem_recorte_url end, pr.imagem_url))
              into img from public.produtos pr where pr.id = cp.produto_id;
          elsif cp.recorte_path is not null and cp.recorte_status = 'ok' then
            img := jsonb_build_object('bucket', 'colecao', 'path', cp.recorte_path);
          elsif cp.product_scan_id is not null then
            select jsonb_build_object('bucket', 'product-scans', 'path', s.image_path)
              into img from public.product_scans s where s.id = cp.product_scan_id and s.user_id = p_uid;
          elsif cp.imagem_url ~ '^https://' then
            img := jsonb_build_object('url', cp.imagem_url);
          end if;
        end if;
      elsif rid is not null and ref ->> 'origem' = 'escaneado' then
        select jsonb_build_object('bucket', 'product-scans', 'path', s.image_path)
          into img from public.product_scans s where s.id = rid and s.user_id = p_uid;
      end if;
      if img is not null and coalesce(img ->> 'url', img ->> 'path') is null then
        img := null;
      end if;
      if marca is not null or produto is not null then
        nprod := nprod + 1;
      end if;
      passos := passos || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'nome', left(nullif(btrim(coalesce(p ->> 'nome', '')), ''), 60),
        'marca', marca, 'produto', produto, 'img', img)));
    end loop;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('v', 1, 'periodo', p_rotina, 'duracao_s', dur,
    'n_passos', jsonb_array_length(passos), 'n_produtos', nprod, 'passos', passos));
end;
$function$;

-- O texto das estatísticas (vai na `descricao` para quem ainda está na 1.61).
create or replace function public.checkin_estatisticas_texto(p_rotina text, p_est jsonb)
 returns text
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  dur integer := (p_est ->> 'duracao_s')::int;
  m integer;
  t text;
  parte text;
  p jsonb;
  i integer := 0;
  prod text;
begin
  if p_est is null then
    return null;
  end if;
  t := case when p_rotina = 'am' then 'Skincare matinal' else 'Skincare noturno' end;
  if dur is not null then
    m := round(dur / 60.0);
    t := t || ' em ' || case when m < 1 then 'menos de 1 min'
                              when m < 60 then m || ' min'
                              else (m / 60) || ' h ' || lpad((m % 60)::text, 2, '0') || ' min' end;
  end if;
  for p in select x from jsonb_array_elements(coalesce(p_est -> 'passos', '[]'::jsonb)) x loop
    i := i + 1;
    prod := nullif(btrim(concat_ws(' ', p ->> 'marca', p ->> 'produto')), '');
    parte := i || '. ' || case when p ->> 'nome' is not null and prod is not null then (p ->> 'nome') || ': ' || prod
                               else coalesce(p ->> 'nome', prod, 'Passo') end;
    if length(t || ' · ' || parte) > 278 then
      return t || ' · …';
    end if;
    t := t || ' · ' || parte;
  end loop;
  return t;
end;
$function$;


-- publicar_checkin (produção de 12/nov/2026 + estatísticas). Recriada: a assinatura muda.
drop function if exists public.publicar_checkin(uuid, text, text, uuid[], timestamptz, text, text);
CREATE OR REPLACE FUNCTION public.publicar_checkin(p_uid uuid, p_foto_path text, p_rotina text, p_grupos uuid[], p_hora_exibida timestamp with time zone, p_titulo text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_estatisticas jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  agora timestamptz := now();
  d date := public.dia_sessao(agora);
  hx timestamptz := coalesce(p_hora_exibida, agora);
  validos uuid[];
  c uuid;
  carta uuid;
  rot jsonb;
  pc jsonb;
  esp jsonb;
  est jsonb;
begin
  if p_rotina not in ('am', 'pm') then
    return jsonb_build_object('ok', false, 'motivo', 'rotina');
  end if;
  if p_foto_path is null or split_part(p_foto_path, '/', 1) <> p_uid::text or p_foto_path !~ '\.jpg$' then
    return jsonb_build_object('ok', false, 'motivo', 'foto');
  end if;
  select coalesce(array_agg(distinct g), '{}') into validos
    from unnest(coalesce(p_grupos, '{}')) g where public.grupo_integrante(g, p_uid);
  if cardinality(validos) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'grupos');
  end if;
  if hx > agora or public.dia_sessao(hx) <> d then
    hx := agora;
  end if;
  -- Estatísticas do skincare (20261205): limpas e com as fotos resolvidas aqui; sem descrição
  -- dela, o texto das estatísticas vai na `descricao` (para quem ainda está na 1.61).
  est := public.checkin_estatisticas_limpas(p_uid, p_rotina, p_estatisticas);
  insert into public.checkins (user_id, foto_path, rotina, capturado_em, hora_exibida, dia, titulo, descricao, estatisticas)
  values (p_uid, p_foto_path, p_rotina, agora, hx, d,
          left(nullif(btrim(coalesce(p_titulo, '')), ''), 60),
          coalesce(left(nullif(btrim(coalesce(p_descricao, '')), ''), 280), left(public.checkin_estatisticas_texto(p_rotina, est), 280)),
          est)
  on conflict (user_id, dia, rotina) do nothing
  returning id into c;
  if c is null then
    return jsonb_build_object('ok', false, 'motivo', 'ja_fez');
  end if;
  insert into public.checkin_grupos (checkin_id, grupo_id) select c, g from unnest(validos) g;

  if public.cartas_v2(p_uid) then
    begin
      esp := public.convidada_carta_do_checkin(p_uid, p_rotina, d, agora);
      if esp is not null then
        rot := esp;
      else
        rot := public.concluir_rotina_v2(p_uid, p_rotina, agora, agora);
      end if;
      carta := (rot ->> 'carta')::uuid;
      pc := public.v2_pontos_acao(p_uid, 'checkin_grupo', d);
    exception when others then
      raise warning 'publicar_checkin: skincare/pontos falharam (check-in % salvo mesmo assim): %', c, sqlerrm;
    end;
    return jsonb_build_object('ok', true, 'checkin_id', c, 'dia', d, 'grupos', to_jsonb(validos), 'carta_id', carta,
                              'sequencia', rot -> 'sequencia',
                              'pontos', coalesce((select jsonb_agg(x) from (values (rot -> 'pontos'), (pc)) v(x)
                                                   where x is not null and x <> 'null'::jsonb), '[]'::jsonb));
  end if;

  begin
    carta := public.dar_carta_acao(p_uid, 'checkin_grupo', d);
  exception when others then
    raise warning 'publicar_checkin: carta falhou (check-in % salvo mesmo assim): %', c, sqlerrm;
    carta := null;
  end;
  return jsonb_build_object('ok', true, 'checkin_id', c, 'dia', d, 'grupos', to_jsonb(validos), 'carta_id', carta);
end;
$function$
;


-- mural_grupo (produção de 12/nov/2026 + estatisticas)
CREATE OR REPLACE FUNCTION public.mural_grupo(p_uid uuid, p_grupo uuid, p_antes timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limite integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with itens as (
    select 'checkin'::text tipo, c.id, c.user_id, c.rotina, c.dia,
           -- Sem título, o do design: "Rotina da manhã" / "Rotina da noite".
           coalesce(c.titulo, case c.rotina when 'am' then 'Rotina da manhã' else 'Rotina da noite' end) titulo,
           c.descricao, c.hora_exibida quando, c.foto_path, 'grupos'::text bucket, c.estatisticas
      from public.checkins_visiveis(p_uid, p_grupo) c
     where c.oculto_em is null
    union all
    select 'produto', x.id, x.user_id, null, x.dia, x.titulo, null, x.criado_em, x.foto_path, 'product-scans', null::jsonb
      from public.compartilhamentos x
      join public.grupo_membros m on m.grupo_id = p_grupo and m.user_id = x.user_id and m.saiu_em is null
     where x.grupo_id = p_grupo and x.origem = 'produto' and x.removido_em is null and x.oculto_em is null and x.foto_path is not null
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
      'estatisticas', i.estatisticas,
      'autora', public.perfil_curto(i.user_id)) order by i.quando desc), '[]'::jsonb) end
  from (select * from itens where p_antes is null or itens.quando < p_antes
         order by itens.quando desc limit least(greatest(coalesce(p_limite, 30), 1), 100)) i;
$function$
;


-- checkin_detalhe (produção de 12/nov/2026 + estatisticas)
CREATE OR REPLACE FUNCTION public.checkin_detalhe(p_uid uuid, p_checkin uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with c as (
    select * from public.checkins where id = p_checkin and removido_em is null
  ),
  grupo_comum as (
    select cg.grupo_id
      from c
      join public.checkin_grupos cg on cg.checkin_id = c.id
      join public.grupo_membros m on m.grupo_id = cg.grupo_id and m.user_id = c.user_id and m.saiu_em is null
     where public.grupo_integrante(cg.grupo_id, p_uid)
     order by cg.grupo_id
     limit 1
  )
  select jsonb_build_object(
      'checkin_id', c.id, 'user_id', c.user_id, 'rotina', c.rotina, 'dia', c.dia,
      'titulo', coalesce(c.titulo, case c.rotina when 'am' then 'Rotina da manhã' else 'Rotina da noite' end),
      'descricao', c.descricao, 'hora_exibida', c.hora_exibida, 'foto_path', c.foto_path,
      'estatisticas', c.estatisticas,
      'voce', c.user_id = p_uid,
      'grupo_id', (select grupo_id from grupo_comum),
      'autora', public.perfil_curto(c.user_id))
    from c
   where c.user_id = p_uid
      or (c.oculto_em is null
          and exists (select 1 from grupo_comum)
          and not exists (select 1 from public.bloqueios b where b.user_id = p_uid and b.bloqueada_id = c.user_id));
$function$
;


revoke all on function public.checkin_estatisticas_limpas(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.checkin_estatisticas_texto(text, jsonb) from public, anon, authenticated;
revoke all on function public.publicar_checkin(uuid, text, text, uuid[], timestamptz, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.mural_grupo(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.checkin_detalhe(uuid, uuid) from public, anon, authenticated;
