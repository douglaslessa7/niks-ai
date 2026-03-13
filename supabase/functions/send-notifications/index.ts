import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type NotificationType =
  | 'morning_routine'
  | 'night_routine'
  | 'scan_available'
  | 'food_reminder';

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
      user_ids?: string[];
    };

    if (!type || !MESSAGES[type]) {
      return new Response(
        JSON.stringify({ error: 'Tipo de notificação inválido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let users: { id: string; push_token: string }[] = [];

    if (type === 'scan_available') {
      // Lógica inteligente: notifica apenas usuários cujo último scan foi há 7+ dias
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: scans, error: scanError } = await supabase
        .from('skin_scans')
        .select('user_id, created_at')
        .order('created_at', { ascending: false });

      if (scanError) {
        return new Response(
          JSON.stringify({ error: scanError.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (scans && scans.length > 0) {
        // Pega só o scan mais recente por usuário
        const latestScanByUser = new Map<string, string>();
        for (const scan of scans) {
          if (!latestScanByUser.has(scan.user_id)) {
            latestScanByUser.set(scan.user_id, scan.created_at);
          }
        }

        // Filtra quem já pode fazer novo scan
        const eligibleUserIds = Array.from(latestScanByUser.entries())
          .filter(([, created_at]) => new Date(created_at) <= sevenDaysAgo)
          .map(([user_id]) => user_id);

        console.log(`[scan_available] ${eligibleUserIds.length} usuários elegíveis`);

        if (eligibleUserIds.length > 0) {
          const { data, error } = await supabase
            .from('users')
            .select('id, push_token')
            .in('id', eligibleUserIds)
            .not('push_token', 'is', null)
            .neq('push_token', 'simulator-token');

          if (error) {
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
          }
          users = data ?? [];
        }
      }
    } else {
      // morning_routine, night_routine, food_reminder: envia para todos
      let query = supabase
        .from('users')
        .select('id, push_token')
        .not('push_token', 'is', null)
        .neq('push_token', 'simulator-token');

      if (user_ids && user_ids.length > 0) {
        query = query.in('id', user_ids);
      }

      const { data, error } = await query;

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      users = data ?? [];
    }

    if (users.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'Nenhum usuário elegível.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { title, body } = MESSAGES[type];
    const messages = users.map((user) => ({
      to: user.push_token,
      title,
      body,
      sound: 'default',
      data: { type },
    }));

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

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}