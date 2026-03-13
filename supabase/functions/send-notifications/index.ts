import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Tipos possíveis de notificação
type NotificationType =
  | 'morning_routine'
  | 'night_routine'
  | 'scan_available'
  | 'food_reminder';

// Textos de cada tipo de notificação
const MESSAGES: Record<NotificationType, { title: string; body: string }> = {
  morning_routine: {
    title: '☀️ Bom dia!',
    body: 'Hora da sua rotina matinal de skincare.',
  },
  night_routine: {
    title: '🌙 Boa noite!',
    body: 'Não esqueça sua rotina noturna antes de dormir.',
  },
  scan_available: {
    title: '📸 Seu scan está liberado!',
    body: 'Já faz 7 dias. Faça uma nova análise de pele.',
  },
  food_reminder: {
    title: '🥗 Registre sua refeição',
    body: 'Como está sua alimentação hoje? Analise agora.',
  },
};

Deno.serve(async (req) => {
  try {
    const { type, user_ids } = await req.json() as {
      type: NotificationType;
      user_ids?: string[]; // opcional — se não informado, envia para todos
    };

    if (!type || !MESSAGES[type]) {
      return new Response(
        JSON.stringify({ error: 'Tipo de notificação inválido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Cria cliente Supabase com service_role para ler todos os usuários
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Busca usuários com push_token salvo
    let query = supabase
      .from('users')
      .select('id, push_token')
      .not('push_token', 'is', null)
      .neq('push_token', 'simulator-token'); // ignora tokens do simulador

    // Se informou user_ids específicos, filtra
    if (user_ids && user_ids.length > 0) {
      query = query.in('id', user_ids);
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('[send-notifications] Erro ao buscar usuários:', error.message);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'Nenhum usuário com push_token encontrado.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Monta os payloads para a Expo Push API
    const { title, body } = MESSAGES[type];
    const messages = users.map((user) => ({
      to: user.push_token,
      title,
      body,
      sound: 'default',
      data: { type }, // dados extras que o app pode ler ao abrir pela notif
    }));

    // Envia para a Expo Push API em lotes de 100 (limite da API)
    const chunks = chunkArray(messages, 100);
    let totalSent = 0;

    for (const chunk of chunks) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      });

      const result = await response.json();
      console.log('[send-notifications] Expo response:', JSON.stringify(result));
      totalSent += chunk.length;
    }

    return new Response(
      JSON.stringify({ sent: totalSent, type }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[send-notifications] Erro inesperado:', err);
    return new Response(
      JSON.stringify({ error: 'Erro interno.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// Divide array em pedaços de N itens
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}