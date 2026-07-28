import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type EventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'TRIAL_STARTED'
  | 'TRIAL_CONVERTED'
  | 'TRIAL_CANCELLED'
  | 'CANCELLATION'
  | 'EXPIRATION'
  | 'UNCANCELLATION';

type SubscriptionStatus = 'trial' | 'active' | 'cancelled' | 'expired';

interface RevenueCatEvent {
  type: EventType;
  app_user_id: string;
  product_id: string;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  trial_end_at_ms?: number | null;
}

interface RevenueCatPayload {
  event: RevenueCatEvent;
}

function msToIso(ms: number | null | undefined): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

function extractPlano(productId: string): string {
  if (productId.includes('anual')) return 'anual';
  return 'mensal';
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Atribuição de cupom (conversão) ──────────────────────────────────────────
// O produto de cupom tem identificador próprio, então TODA compra dele veio de cupom.
// O webhook é o lugar confiável para confirmar a conversão: sobrevive ao app fechar
// entre a compra e o signup.
const COUPON_PRODUCT_ID = 'br.com.niksai.app.anual.promo10';
// Eventos que confirmam que a assinatura de cupom aconteceu (positivos). Cancelamento
// e expiração não desfazem a atribuição — quem converteu, converteu.
const COUPON_CONVERT_TYPES = [
  'INITIAL_PURCHASE',
  'TRIAL_STARTED',
  'TRIAL_CONVERTED',
  'RENEWAL',
  'UNCANCELLATION',
];

// deno-lint-ignore no-explicit-any
async function marcarConversaoCupom(supabase: any, event: RevenueCatEvent): Promise<void> {
  try {
    if (event.product_id !== COUPON_PRODUCT_ID) return;
    if (!COUPON_CONVERT_TYPES.includes(event.type)) return;
    const rcId = event.app_user_id;
    if (!rcId) return;

    // Casa a aplicação MAIS RECENTE (= o cupom que ela de fato usou, caso tenha testado
    // mais de um) por `rc_app_user_id`. No caso comum o app_user_id da compra é o mesmo
    // id guardado na aplicação. MAS se o id do RevenueCat mudou entre aplicar e comprar
    // (um Purchases.logIn no meio), a linha ficou gravada com o id antigo e a compra vem
    // com o novo (UUID). Nesse caso o app já ligou o `user_id` = esse novo UUID, então
    // casamos também por `user_id` quando o id da compra é um UUID.
    const isUuid = !rcId.startsWith('$RCAnonymousID:') && UUID_REGEX.test(rcId);
    const filter = isUuid ? `rc_app_user_id.eq.${rcId},user_id.eq.${rcId}` : null;
    const base = supabase
      .from('cupom_aplicacoes')
      .select('id')
      .order('aplicado_em', { ascending: false })
      .limit(1);
    const { data: latest } = await (filter ? base.or(filter) : base.eq('rc_app_user_id', rcId))
      .maybeSingle();
    if (!latest) return;

    // Idempotente: o contador total_assinaturas só sobe no false→true do trigger.
    // Reprocessar o mesmo evento (ou um RENEWAL depois) não infla nada.
    const patch: Record<string, unknown> = { converteu: true };
    // Se o id da compra é UUID (usuária identificada), liga o user_id de brinde.
    if (isUuid) patch.user_id = rcId;

    const { error } = await supabase
      .from('cupom_aplicacoes')
      .update(patch)
      .eq('id', latest.id);
    if (error) console.error('[webhook] marcarConversaoCupom update falhou:', error.message);
  } catch (e) {
    // Nunca deixa a atribuição derrubar o webhook.
    console.error('[webhook] marcarConversaoCupom erro:', e);
  }
}

Deno.serve(async (req) => {
  // Validar secret
  const authHeader = req.headers.get('Authorization') ?? '';
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
  if (authHeader !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: RevenueCatPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const event = payload?.event;

  // Ignorar tipos que esta função não processa (ex.: TRANSFER, que tem estrutura
  // diferente e não traz app_user_id na raiz). Retorna 200 para o RevenueCat não
  // retentar e evita o erro "Missing event fields" desses eventos.
  const HANDLED_EVENT_TYPES = [
    'INITIAL_PURCHASE',
    'RENEWAL',
    'TRIAL_STARTED',
    'TRIAL_CONVERTED',
    'TRIAL_CANCELLED',
    'CANCELLATION',
    'EXPIRATION',
    'UNCANCELLATION',
  ];
  if (!event?.type || !HANDLED_EVENT_TYPES.includes(event.type)) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!event?.app_user_id) {
    return new Response(JSON.stringify({ error: 'Missing event fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Atribuição de cupom (conversão) — INDEPENDENTE do upsert de subscriptions abaixo.
  // Roda ANTES dos guards de anônimo/usuário-existe porque a compra de uma usuária NOVA
  // chega com id anônimo e ainda sem conta. Não quebra o fluxo (try/catch interno).
  await marcarConversaoCupom(supabase, event);

  // Mapear event type → status + campos
  let status: SubscriptionStatus | null = null;
  let extraFields: Record<string, string | null> = {};

  switch (event.type) {
    case 'INITIAL_PURCHASE':
      status = 'active';
      extraFields = {
        start_date: msToIso(event.purchased_at_ms),
        end_date: msToIso(event.expiration_at_ms),
      };
      break;
    case 'RENEWAL':
      status = 'active';
      extraFields = {
        end_date: msToIso(event.expiration_at_ms),
      };
      break;
    case 'TRIAL_STARTED':
      status = 'trial';
      extraFields = {
        start_date: msToIso(event.purchased_at_ms),
        trial_end_date: msToIso(event.trial_end_at_ms),
      };
      break;
    case 'TRIAL_CONVERTED':
      status = 'active';
      extraFields = {
        start_date: msToIso(event.purchased_at_ms),
        end_date: msToIso(event.expiration_at_ms),
      };
      break;
    case 'TRIAL_CANCELLED':
    case 'CANCELLATION':
      status = 'cancelled';
      break;
    case 'EXPIRATION':
      status = 'expired';
      break;
    case 'UNCANCELLATION':
      status = 'active';
      break;
    default:
      // Evento desconhecido — retornar 200 para o RevenueCat não retentar
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  }

  // Ignorar usuários anônimos do RevenueCat ($RCAnonymousID:...) ou qualquer
  // app_user_id que não seja um UUID válido — evita "invalid input syntax for
  // type uuid" no upsert quando a compra ocorre antes do usuário se identificar.
  // (A atribuição de cupom acima já rodou de propósito, pois ela aceita id anônimo.)
  if (
    event.app_user_id.startsWith('$RCAnonymousID:') ||
    !UUID_REGEX.test(event.app_user_id)
  ) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verificar se o usuário existe em "users" antes do upsert — eventos do
  // RevenueCat para usuários que nunca completaram o cadastro quebrariam com
  // violação da FK subscriptions_user_id_fkey.
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', event.app_user_id)
    .maybeSingle();

  if (!existingUser) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: event.app_user_id,
        rc_original_app_user_id: event.app_user_id,
        plano: extractPlano(event.product_id),
        status,
        updated_at: new Date().toISOString(),
        ...extraFields,
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('Supabase upsert error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
