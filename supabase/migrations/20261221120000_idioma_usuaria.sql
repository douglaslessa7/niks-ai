-- Idioma da usuária (tradução, etapa 3 — nov/2026). ⚠️ NÃO APLICADA: precisa do OK.
--
-- `users.idioma`: o idioma do celular dela, gravado pelo app ao abrir ('pt' | 'en').
-- null = conta que ainda não abriu o app novo → português, como sempre foi.
-- Escrita pela própria usuária: a tabela já dá UPDATE ao `authenticated` e a política
-- "users: editar próprio perfil" (auth.uid() = id) restringe à linha dela — nada a mudar.
--
-- Os pushes montados no BANCO passam a escolher o texto pelo idioma. Em português
-- (null ou 'pt') o texto é EXATAMENTE o de antes. As funções abaixo partem da definição
-- que estava em produção em 23/nov/2026 (pg_get_functiondef) e só mudam a escolha do texto.

alter table public.users add column if not exists idioma text;
alter table public.users drop constraint if exists users_idioma_check;
alter table public.users add constraint users_idioma_check check (idioma is null or idioma in ('pt', 'en'));
comment on column public.users.idioma is
  'Idioma do celular (pt | en), gravado pelo app. null = pt. Escolhe o idioma dos pushes e textos do servidor.';

-- ── "Falta só você hoje 👀" (grupos, a cada 15 min) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.enviar_avisos_falta_voce()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  msgs jsonb;
  total integer := 0;
  lote jsonb;
  i integer := 0;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'to', a.push_token, 'title', a.grupo_nome,
           'body', case when u.idioma = 'en' then 'You''re the only one left today 👀' else 'Falta só você hoje 👀' end,
           'sound', 'default',
           'data', jsonb_build_object('type', 'grupo_falta', 'grupo_id', a.grupo_id))), '[]'::jsonb)
    into msgs from public.avisos_falta_voce(now()) a
    left join public.users u on u.id = a.user_id;
  total := jsonb_array_length(msgs);
  while i < total loop
    select jsonb_agg(x) into lote from (select x from jsonb_array_elements(msgs) with ordinality e(x, n) where n > i and n <= i + 100) s;
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := lote,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
    i := i + 100;
  end loop;
  return total;
end;
$function$;

-- ── Resumo diário dos grupos grandes ("N amigas fizeram check-in hoje") ─────────
CREATE OR REPLACE FUNCTION public.enviar_resumo_grupos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d date := public.dia_sessao(now());
  msgs jsonb;
  total integer := 0;
  lote jsonb;
  i integer := 0;
begin
  with grandes as (
    select g.id, g.nome from public.grupos g
     where g.apagado_em is null
       and (select count(*) from public.grupo_membros m where m.grupo_id = g.id and m.saiu_em is null) >= 15
  ), alvo as (
    select m.user_id, u.push_token, u.idioma, g.id grupo_id, g.nome,
           (select count(distinct c.user_id) from public.checkins c
              join public.checkin_grupos cg on cg.checkin_id = c.id and cg.grupo_id = g.id
             where c.dia = d and c.removido_em is null and c.user_id <> m.user_id) n
      from grandes g
      join public.grupo_membros m on m.grupo_id = g.id and m.saiu_em is null
      join public.users u on u.id = m.user_id
     where u.push_token is not null and u.push_token <> '' and u.push_token <> 'simulator-token'
  ), marcadas as (
    insert into public.avisos_enviados (user_id, tipo, chave)
    select a.user_id, 'resumo_grupo', a.grupo_id::text || ':' || d::text from alvo a where a.n > 0
    on conflict do nothing
    returning avisos_enviados.user_id, avisos_enviados.chave
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'to', a.push_token, 'title', a.nome, 'sound', 'default',
           'body', case when a.idioma = 'en'
                        then a.n || case when a.n = 1 then ' friend checked in today' else ' friends checked in today' end
                        else a.n || case when a.n = 1 then ' amiga fez check-in hoje' else ' amigas fizeram check-in hoje' end
                   end,
           'data', jsonb_build_object('type', 'grupo_checkin', 'grupo_id', a.grupo_id))), '[]'::jsonb)
    into msgs
    from alvo a join marcadas k on k.user_id = a.user_id and k.chave = a.grupo_id::text || ':' || d::text;
  total := jsonb_array_length(msgs);
  while i < total loop
    select jsonb_agg(x) into lote from (select x from jsonb_array_elements(msgs) with ordinality e(x, n) where n > i and n <= i + 100) t;
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := lote,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
    i := i + 100;
  end loop;
  return total;
end;
$function$;

-- ── SOS espinha: push de retorno 24 h depois ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enviar_pushes_espinha()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  msgs jsonb;
  total integer := 0;
  lote jsonb;
  i integer := 0;
begin
  -- Texto neutro: a notificação aparece com o celular bloqueado.
  select coalesce(jsonb_agg(jsonb_build_object(
           'to', a.push_token, 'title', 'NIKS',
           'body', case when u.idioma = 'en'
                        then 'How''s your skin? Send me a photo so I can see how it''s going.'
                        else 'Como está sua pele? Me manda uma foto para eu ver como está indo.' end,
           'sound', 'default',
           'data', jsonb_build_object('type', 'espinha_retorno', 'conversation_id', a.conversation_id))), '[]'::jsonb)
    into msgs from public.espinha_pushes_24h(now()) a
    left join public.users u on u.id = a.user_id;
  total := jsonb_array_length(msgs);
  while i < total loop
    select jsonb_agg(x) into lote from (select x from jsonb_array_elements(msgs) with ordinality e(x, n) where n > i and n <= i + 100) s;
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := lote,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
    i := i + 100;
  end loop;
  return total;
end;
$function$;

-- ── SOS espinha: mensagens que a NIKS grava na conversa ────────────────────────
-- Versão com idioma do convite. A antiga, sem argumento, continua igual (nada mais a usa,
-- mas fica para não quebrar quem a chame).
CREATE OR REPLACE FUNCTION public.espinha_texto_convite(p_idioma text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p_idioma = 'en'
              then 'How''s your breakout? Send me a photo so I can see how it''s going.'::text
              else public.espinha_texto_convite() end
$function$;
revoke all on function public.espinha_texto_convite(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.espinha_avaliar(p_user uuid, p_agora timestamp with time zone DEFAULT now())
 RETURNS TABLE(conversation_id uuid, texto text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.espinha_acompanhamentos;
  horas numeric;
  nivel integer;
  v_idioma text;
begin
  select * into a from public.espinha_acompanhamentos e where e.user_id = p_user and e.situacao = 'ativa' for update;
  if not found then
    return;
  end if;

  select u.idioma into v_idioma from public.users u where u.id = p_user;

  if p_agora >= a.analise_em + interval '14 days' then
    insert into public.coach_messages (conversation_id, user_id, role, content, created_at)
    values (a.conversation_id, p_user, 'assistant',
            case when v_idioma = 'en'
                 then 'It''s been 14 days since your analysis. If the breakout is still there, it''s worth seeing a dermatologist for a closer look.'
                 else 'Já se passaram 14 dias desde a sua análise. Se a espinha ainda estiver aí, vale procurar um dermatologista para avaliar de perto.' end,
            p_agora);
    update public.espinha_acompanhamentos e
       set situacao = 'encerrada', motivo_fim = 'teto', encerrada_em = p_agora, convite_pendente = false
     where e.id = a.id;
    return;
  end if;

  if p_agora >= coalesce(a.ultima_resposta_em, a.analise_em) + interval '5 days' then
    update public.espinha_acompanhamentos e
       set situacao = 'encerrada', motivo_fim = 'sem_resposta', encerrada_em = p_agora, convite_pendente = false
     where e.id = a.id;
    return;
  end if;

  horas := extract(epoch from (p_agora - a.base_em)) / 3600;
  if a.ciclo = 0 then
    nivel := case when horas >= 24 then 2 when horas >= 12 then 1 else 0 end;
  else
    nivel := case when horas >= 24 then 1 else 0 end;
  end if;

  if nivel > a.nivel_enviado then
    insert into public.coach_messages (conversation_id, user_id, role, content, created_at)
    values (a.conversation_id, p_user, 'assistant', public.espinha_texto_convite(v_idioma), p_agora);
    update public.espinha_acompanhamentos e
       set nivel_enviado = nivel, convite_pendente = true where e.id = a.id;
    a.convite_pendente := true;
  end if;

  if a.convite_pendente then
    conversation_id := a.conversation_id;
    texto := public.espinha_texto_convite(v_idioma);
    return next;
  end if;
end;
$function$;
-- CREATE OR REPLACE mantém os grants de antes (só postgres e service_role executam).
