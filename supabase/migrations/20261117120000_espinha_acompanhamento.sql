-- SOS espinha — acompanhamento (nov/2026)
--
--   • coach_conversations.tipo: 'geral' (padrão) ou 'espinha'. A conversa da espinha não entra
--     na retomada do chat comum e fica fixa no topo do histórico.
--   • espinha_acompanhamentos: 1 linha por espinha, com a análise e o estado dos convites.
--     Leitura só da própria conta; quem escreve é a função `sos-espinha` (service role).
--   • Convites: 12 h e 24 h depois da análise. Foto nova, ou resposta a um convite, recomeça
--     o ciclo, e o próximo convite vem 24 h depois. Para com "resolvi", com 5 dias sem
--     resposta ou aos 14 dias da análise.
--   • Push único às 24 h para quem não respondeu, entre 9h e 21h no fuso dela.
--   • Só uma espinha ativa por conta: um SOS novo encerra os convites da anterior, que
--     continua no histórico.

alter table public.coach_conversations add column if not exists tipo text not null default 'geral';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_conversations_tipo_check') then
    alter table public.coach_conversations add constraint coach_conversations_tipo_check check (tipo in ('geral', 'espinha'));
  end if;
end $$;

create table if not exists public.espinha_acompanhamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  conversation_id uuid not null unique references public.coach_conversations (id) on delete cascade,
  analise jsonb not null,
  situacao text not null default 'ativa' check (situacao in ('ativa', 'resolvida', 'encerrada')),
  motivo_fim text check (motivo_fim in ('resolvida', 'sem_resposta', 'teto', 'substituida')),
  analise_em timestamptz not null,
  base_em timestamptz not null,               -- de onde contam as 12 h / 24 h do ciclo atual
  ciclo integer not null default 0,           -- 0 = o ciclo da análise (convites de 12 h e 24 h)
  nivel_enviado integer not null default 0,   -- convites já feitos neste ciclo
  convite_pendente boolean not null default false,
  ultima_resposta_em timestamptz,
  encerrada_em timestamptz
);

create unique index if not exists espinha_uma_ativa_por_conta on public.espinha_acompanhamentos (user_id) where situacao = 'ativa';
create index if not exists espinha_ativas_idx on public.espinha_acompanhamentos (analise_em) where situacao = 'ativa';

alter table public.espinha_acompanhamentos enable row level security;
revoke all on public.espinha_acompanhamentos from anon, authenticated;
grant select on public.espinha_acompanhamentos to authenticated;
drop policy if exists "espinha le a propria" on public.espinha_acompanhamentos;
create policy "espinha le a propria" on public.espinha_acompanhamentos for select to authenticated using (auth.uid() = user_id);

create or replace function public.espinha_texto_convite()
returns text language sql immutable as $$ select 'Como está sua espinha? Manda uma foto para eu ver como está indo.'::text $$;

-- Cria a conversa já com a foto e a análise, e encerra os convites da espinha anterior. ─
create or replace function public.espinha_criar(
  p_user uuid, p_foto text, p_analise jsonb, p_texto text, p_agora timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv uuid;
  meses text[] := array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  local timestamp := p_agora at time zone 'America/Sao_Paulo';
begin
  update public.espinha_acompanhamentos
     set situacao = 'encerrada', motivo_fim = 'substituida', encerrada_em = p_agora, convite_pendente = false
   where user_id = p_user and situacao = 'ativa';

  insert into public.coach_conversations (user_id, title, tipo)
  values (p_user, 'Espinha · ' || extract(day from local)::int || ' ' || meses[extract(month from local)::int], 'espinha')
  returning id into conv;

  insert into public.coach_messages (conversation_id, user_id, role, content, image_url, created_at) values
    (conv, p_user, 'user', '', p_foto, p_agora),
    (conv, p_user, 'assistant', p_texto, null, p_agora + interval '1 millisecond');

  insert into public.espinha_acompanhamentos (user_id, conversation_id, analise, analise_em, base_em)
  values (p_user, conv, p_analise, p_agora, p_agora);
  return conv;
end;
$$;

-- Avalia a espinha ativa: encerra se passou do prazo, grava o convite quando chega a hora
-- e devolve o convite que está esperando. Pode rodar quantas vezes for: não repete.
create or replace function public.espinha_avaliar(p_user uuid, p_agora timestamptz default now())
returns table (conversation_id uuid, texto text)
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.espinha_acompanhamentos;
  horas numeric;
  nivel integer;
begin
  select * into a from public.espinha_acompanhamentos e where e.user_id = p_user and e.situacao = 'ativa' for update;
  if not found then
    return;
  end if;

  if p_agora >= a.analise_em + interval '14 days' then
    insert into public.coach_messages (conversation_id, user_id, role, content, created_at)
    values (a.conversation_id, p_user, 'assistant',
            'Já se passaram 14 dias desde a sua análise. Se a espinha ainda estiver aí, vale procurar um dermatologista para avaliar de perto.', p_agora);
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
    values (a.conversation_id, p_user, 'assistant', public.espinha_texto_convite(), p_agora);
    update public.espinha_acompanhamentos e
       set nivel_enviado = nivel, convite_pendente = true where e.id = a.id;
    a.convite_pendente := true;
  end if;

  if a.convite_pendente then
    conversation_id := a.conversation_id;
    texto := public.espinha_texto_convite();
    return next;
  end if;
end;
$$;

create or replace function public.espinha_convite_visto(p_user uuid, p_conversa uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.espinha_acompanhamentos
     set convite_pendente = false
   where user_id = p_user and conversation_id = p_conversa;
$$;

-- Ela escreveu: foto nova ou resposta a um convite recomeça o ciclo. Pergunta em texto antes
-- de qualquer convite só conta como atividade (os convites de 12 h e 24 h continuam de pé).
create or replace function public.espinha_registrar_mensagem(
  p_user uuid, p_conversa uuid, p_tem_foto boolean, p_agora timestamptz default now()
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.espinha_acompanhamentos
     set ultima_resposta_em = p_agora,
         convite_pendente = false,
         ciclo = case when p_tem_foto or nivel_enviado > 0 then ciclo + 1 else ciclo end,
         base_em = case when p_tem_foto or nivel_enviado > 0 then p_agora else base_em end,
         nivel_enviado = case when p_tem_foto or nivel_enviado > 0 then 0 else nivel_enviado end
   where user_id = p_user and conversation_id = p_conversa and situacao = 'ativa';
$$;

create or replace function public.espinha_marcar_resolvida(p_user uuid, p_conversa uuid, p_agora timestamptz default now())
returns void
language sql
security definer
set search_path = public
as $$
  update public.espinha_acompanhamentos
     set situacao = 'resolvida', motivo_fim = 'resolvida', encerrada_em = p_agora, convite_pendente = false
   where user_id = p_user and conversation_id = p_conversa and situacao = 'ativa';
$$;

-- Quem recebe o push de 24 h AGORA (marca como enviado ao devolver: não repete). ───────
create or replace function public.espinha_pushes_24h(p_agora timestamptz default now())
returns table (user_id uuid, push_token text, conversation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select a.user_id uid, u.push_token tok, a.conversation_id conv
      from public.espinha_acompanhamentos a
      join public.users u on u.id = a.user_id
     where a.situacao = 'ativa' and a.ciclo = 0 and a.ultima_resposta_em is null
       and p_agora >= a.analise_em + interval '24 hours'
       and p_agora < a.analise_em + interval '5 days'
       and u.push_token is not null and u.push_token <> '' and u.push_token <> 'simulator-token'
       and extract(hour from p_agora at time zone coalesce(nullif(u.rotina_fuso, ''), 'America/Sao_Paulo')) >= 9
       and extract(hour from p_agora at time zone coalesce(nullif(u.rotina_fuso, ''), 'America/Sao_Paulo')) < 21
  loop
    insert into public.avisos_enviados (user_id, tipo, chave) values (r.uid, 'espinha_24h', r.conv::text) on conflict do nothing;
    if found then
      -- Grava a pergunta da NIKS antes do push: ao tocar, ela já está na conversa.
      perform public.espinha_avaliar(r.uid, p_agora);
      user_id := r.uid;
      push_token := r.tok;
      conversation_id := r.conv;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.enviar_pushes_espinha()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  msgs jsonb;
  total integer := 0;
  lote jsonb;
  i integer := 0;
begin
  -- Texto neutro: a notificação aparece com o celular bloqueado.
  select coalesce(jsonb_agg(jsonb_build_object(
           'to', a.push_token, 'title', 'NIKS', 'body', 'Como está sua pele? Me manda uma foto para eu ver como está indo.', 'sound', 'default',
           'data', jsonb_build_object('type', 'espinha_retorno', 'conversation_id', a.conversation_id))), '[]'::jsonb)
    into msgs from public.espinha_pushes_24h(now()) a;
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
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'espinha_criar(uuid, text, jsonb, text, timestamptz)',
    'espinha_avaliar(uuid, timestamptz)',
    'espinha_convite_visto(uuid, uuid)',
    'espinha_registrar_mensagem(uuid, uuid, boolean, timestamptz)',
    'espinha_marcar_resolvida(uuid, uuid, timestamptz)',
    'espinha_pushes_24h(timestamptz)',
    'enviar_pushes_espinha()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('espinha-retorno', '*/15 * * * *', 'select public.enviar_pushes_espinha()');
  end if;
end $$;
