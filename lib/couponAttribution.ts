// Atribuição de cupom no app: liga o cupom aplicado ao user_id real.
//
// ⚠️ Usa o rc_app_user_id GUARDADO no store (o id anônimo do momento da aplicação),
// NÃO o Purchases.getAppUserID() atual. No signup o app faz Purchases.logIn, que troca
// o id do RevenueCat do anônimo para o identificado — se dependêssemos do id atual, a
// busca não acharia a linha. Usando o id guardado, a atribuição independe da ordem das
// chamadas de logIn/restore/saveToSupabase.
//
// A CONVERSÃO (converteu=true) é confirmada pelo revenuecat-webhook, não por aqui.
// Esta função só faz o link do user_id.
//
// NUNCA lança: atribuição falhando não pode travar o signup nem a entrada no app.
// A assinatura da usuária vale mais que a métrica.

import { useAppStore } from '../store/onboarding'

const FUNCTION_URL = 'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/atribuir-cupom'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI'

export async function attributeCouponIfAny(userId: string): Promise<void> {
  try {
    const applied = useAppStore.getState().appliedCoupon
    if (!applied || !userId) return

    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        user_id: userId,
        rc_app_user_id: applied.rcAppUserId,
        codigo: applied.codigo,
      }),
    })

    // Sucesso (ligou ou não havia o que ligar) → limpa para não repetir. É idempotente
    // de qualquer forma. Em falha de rede, mantém o cupom guardado.
    if (res.ok) {
      useAppStore.getState().setAppliedCoupon(null)
    }
  } catch {
    // Silencioso de propósito.
  }
}
