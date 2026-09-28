import { supabase } from './supabase';
import { ScanResult, ProtocolResult, OnboardingData } from '../store/onboarding';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI';

// Só a chamada à IA (com as tentativas), sem gravar nada. Separada de `saveProtocol`
// para o onboarding poder gerar a rotina ANTES da conta existir (lib/onboardingPrefetch.ts)
// e gravá-la só no signup, com o user_id. Devolve null na falha (já logada).
export async function fetchProtocol(
  scanResult: ScanResult,
  onboardingData: OnboardingData,
): Promise<ProtocolResult | null> {
  let data: any = null;
  let lastError: any = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(
        'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/generate-protocol',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({ scanResult, onboardingData }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        const is503 = response.status === 503 || errorBody.includes('UNAVAILABLE') || errorBody.includes('high demand');
        if (is503 && attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
        lastError = new Error(`generate-protocol error: ${response.status} ${errorBody}`);
        break;
      }

      data = JSON.parse(await response.text());
      lastError = null;
      break;
    } catch (fetchErr) {
      lastError = fetchErr;
      break;
    }
  }

  if (lastError || !data) {
    console.error('[generateProtocol] Failed:', lastError);
    return null;
  }
  return data as ProtocolResult;
}

// Grava a rotina em `protocolos` e encadeia `recomendar-produtos` (que lê o protocolo
// no banco). Exige conta: é o que o onboarding adia até o signup.
export async function saveProtocol({
  data,
  userId,
  skinScanId,
  regenerate,
}: {
  data: ProtocolResult;
  userId: string;
  skinScanId: string | null;
  regenerate?: boolean;
}) {
  const dicas = [
    data.introduction_warnings ?? null,
    data.expected_timeline?.two_weeks ?? null,
    data.expected_timeline?.one_month ?? null,
    data.expected_timeline?.three_months ?? null,
    data.introduction_schedule ?? null,
  ];

  await supabase.from('protocolos').insert({
    user_id: userId,
    skin_scan_id: skinScanId ?? null,
    rotina_am: data.morning,
    rotina_pm: data.night,
    dicas,
    updated_at: new Date().toISOString(), // linha nova é inequivocamente a mais recente
  });

  // Encadeia a recomendação de produtos reais. A função é auto-guardada
  // (gera só no primeiro scan), então é seguro chamar sempre. Roda aqui —
  // depois do insert do protocolo — porque `recomendar-produtos` lê o
  // protocolo no banco. Falha aqui não pode quebrar o fluxo do protocolo.
  try {
    const recRes = await fetch(
      'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/recomendar-produtos',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ user_id: userId, scan_id: skinScanId ?? null, regenerate: regenerate ?? false }),
      }
    );
    // Continua NÃO bloqueante (regra mantida) — só deixa de ser invisível. O `catch`
    // abaixo só pega erro de rede: um 409 ("protocolo ainda não disponível") ou um 500
    // são respostas bem-sucedidas para o fetch e passavam reto, sem log nem retry.
    // 409 aqui significa que o insert em `protocolos` não landou antes desta chamada.
    if (!recRes.ok) {
      const body = await recRes.text().catch(() => '');
      console.error('[generateProtocol] recomendar-produtos HTTP', recRes.status, body.slice(0, 300));
    }
  } catch (recErr) {
    console.error('[generateProtocol] recomendar-produtos falhou (rede, não bloqueante):', recErr);
  }
}

export async function generateAndSaveProtocol({
  scanResult,
  onboardingData,
  skinScanId,
  userId,
  regenerate,
  onSuccess,
  onFinally,
}: {
  scanResult: ScanResult;
  onboardingData: OnboardingData;
  skinScanId: string | null;
  userId: string;
  regenerate?: boolean;
  onSuccess: (result: ProtocolResult) => void;
  onFinally: () => void;
}) {
  try {
    const data = await fetchProtocol(scanResult, onboardingData);
    if (!data) return;
    onSuccess(data);
    await saveProtocol({ data, userId, skinScanId, regenerate });
  } catch (err) {
    console.error('[generateProtocol] Unexpected error:', err);
  } finally {
    onFinally();
  }
}
