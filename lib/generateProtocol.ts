import { supabase } from './supabase';
import { ScanResult, ProtocolResult, OnboardingData } from '../store/onboarding';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI';

export async function generateAndSaveProtocol({
  scanResult,
  onboardingData,
  skinScanId,
  userId,
  onSuccess,
  onFinally,
}: {
  scanResult: ScanResult;
  onboardingData: OnboardingData;
  skinScanId: string | null;
  userId: string;
  onSuccess: (result: ProtocolResult) => void;
  onFinally: () => void;
}) {
  try {
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
      return;
    }

    onSuccess(data as ProtocolResult);

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
    });

    // Encadeia a recomendação de produtos reais. A função é auto-guardada
    // (gera só no primeiro scan), então é seguro chamar sempre. Roda aqui —
    // depois do insert do protocolo — porque `recomendar-produtos` lê o
    // protocolo no banco. Falha aqui não pode quebrar o fluxo do protocolo.
    try {
      await fetch(
        'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/recomendar-produtos',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({ user_id: userId, scan_id: skinScanId ?? null }),
        }
      );
    } catch (recErr) {
      console.warn('[generateProtocol] recomendar-produtos falhou (não bloqueante):', recErr);
    }
  } catch (err) {
    console.error('[generateProtocol] Unexpected error:', err);
  } finally {
    onFinally();
  }
}
