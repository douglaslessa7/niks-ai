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
  if (!event?.type || !event?.app_user_id) {
    return new Response(JSON.stringify({ error: 'Missing event fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

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
