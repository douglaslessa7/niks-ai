import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PAGE = 1000; // = max_rows do PostgREST do projeto

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
  // Só o cron pode disparar: sem esta trava, qualquer um mandava push para a base inteira.
  // O segredo vem do Vault, via pg_cron. Deploy com --no-verify-jwt (o cron não tem sessão).
  const expected = Deno.env.get('SEND_NOTIFICATIONS_SECRET');
  if (!expected || req.headers.get('x-cron-secret') !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { type, user_ids, dry_run, testar_expo } = await req.json() as {
      type: NotificationType;
      user_ids?: string[];
      dry_run?: boolean;
      testar_expo?: boolean;
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

      // Paginado: o PostgREST devolve no máximo 1000 linhas por pedido (max_rows) —
      // sem isso só os 1000 scans mais recentes entravam e a maioria ficava de fora.
      const scans: { user_id: string; created_at: string }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error: scanError } = await supabase
          .from('skin_scans')
          .select('user_id, created_at')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);

        if (scanError) {
          return new Response(
            JSON.stringify({ error: scanError.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        scans.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }

      if (scans.length > 0) {
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

        // Em lotes de 100 ids: a lista inteira num `in(...)` só vira uma URL de ~15 KB,
        // que o servidor recusa (quebrou em 7/out/2026, com ~380 elegíveis).
        for (const ids of chunkArray(eligibleUserIds, 100)) {
          const { data, error } = await supabase
            .from('users')
            .select('id, push_token')
            .in('id', ids)
            .not('push_token', 'is', null)
            .neq('push_token', 'simulator-token');

          if (error) {
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
          }
          users.push(...(data ?? []));
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

    // Teste: conta quem receberia e não envia nada.
    // Com `testar_expo`, manda à Expo um lote de tokens inventados: exercita o envio daqui do
    // servidor, e a Expo recusa cada um, sem chegar a ninguém.
    if (dry_run === true) {
      const expo = testar_expo === true ? await enviarLotes([lotePontoDeTeste()]) : undefined;
      return new Response(
        JSON.stringify({ dry_run: true, would_send: users.length, type, expo }),
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

    const envio = await enviarLotes(chunkArray(messages, 100));

    return new Response(
      JSON.stringify({ ...envio, type }),
      { status: envio.sent > 0 ? 200 : 502, headers: { 'Content-Type': 'application/json' } }
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

// ── Envio à Expo ──
// Em 5–9/nov/2026 a Expo respondeu às 13:00 UTC com texto ("upstream c…") em vez de JSON, e
// o `response.json()` derrubava a função no 1º lote: ninguém recebia. Agora uma resposta ruim
// é tentada de novo e não impede os outros lotes.
const ESPERAS_EXPO_MS = [5_000, 15_000, 30_000];
const TEMPO_TOTAL_ENVIO_MS = 130_000; // abaixo do limite de execução da Edge Function
const TIMEOUT_EXPO_MS = 30_000;

type Mensagem = { to: string; title: string; body: string; sound: string; data: unknown };
type ResultadoEnvio = { sent: number; failed: number; tickets_ok: number; tickets_erro: number };

const semTokens = (texto: string) => texto.replace(/Expo(nent)?PushToken\[[^\]]*\]/g, '<token>');
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function lotePontoDeTeste(): Mensagem[] {
  const letras = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const inventado = () => Array.from({ length: 22 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
  return Array.from({ length: 100 }, () => ({
    to: `ExponentPushToken[${inventado()}]`, title: 'teste', body: 'teste', sound: 'default', data: { type: 'teste' },
  }));
}

/** Devolve os tickets do lote; `null` se a Expo não aceitou. */
async function enviarLote(
  lote: Mensagem[], numero: number, esperas: number[], limite: number,
): Promise<{ status?: string }[] | null> {
  for (let tentativa = 0; ; tentativa++) {
    let motivo: string;
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(lote),
        signal: AbortSignal.timeout(TIMEOUT_EXPO_MS),
      });
      const texto = await response.text();
      let json: { data?: { status?: string }[] } | null = null;
      try { json = JSON.parse(texto); } catch { /* resposta em texto: trata abaixo */ }
      if (response.ok && Array.isArray(json?.data)) return json!.data!;
      motivo = `HTTP ${response.status}: ${semTokens(texto).slice(0, 300)}`;
      // Recusa de verdade (4xx em JSON): repetir daria o mesmo resultado.
      if (json && response.status >= 400 && response.status < 500 && response.status !== 429) {
        console.error(`[send-notifications] lote ${numero} recusado: ${motivo}`);
        return null;
      }
    } catch (err) {
      // Estourou o tempo: a Expo pode ter recebido, e repetir mandaria o push duas vezes.
      if ((err as Error)?.name === 'TimeoutError') {
        console.error(`[send-notifications] lote ${numero} sem resposta em ${TIMEOUT_EXPO_MS} ms`);
        return null;
      }
      motivo = String(err);
    }
    const espera = esperas[tentativa];
    if (espera === undefined || Date.now() + espera >= limite) {
      console.error(`[send-notifications] lote ${numero} falhou após ${tentativa + 1} tentativa(s): ${motivo}`);
      return null;
    }
    console.warn(`[send-notifications] lote ${numero}, tentativa ${tentativa + 1}: ${motivo}`);
    await esperar(espera);
  }
}

async function enviarLotes(
  lotes: Mensagem[][], esperas = ESPERAS_EXPO_MS, tempoTotal = TEMPO_TOTAL_ENVIO_MS,
): Promise<ResultadoEnvio> {
  const limite = Date.now() + tempoTotal;
  const r: ResultadoEnvio = { sent: 0, failed: 0, tickets_ok: 0, tickets_erro: 0 };
  for (const [i, lote] of lotes.entries()) {
    const tickets = Date.now() < limite ? await enviarLote(lote, i + 1, esperas, limite) : null;
    if (!tickets) { r.failed += lote.length; continue; }
    const ok = tickets.filter((t) => t.status === 'ok').length;
    r.sent += lote.length;
    r.tickets_ok += ok;
    r.tickets_erro += tickets.length - ok;
    console.log(`[send-notifications] Expo response: lote ${i + 1}, ok ${ok}, erro ${tickets.length - ok}`);
  }
  console.log('[send-notifications] fim do envio:', JSON.stringify(r));
  return r;
}