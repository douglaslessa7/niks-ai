import { supabase } from './supabase';
import { useAppStore, ScanResult, ProtocolResult } from '../store/onboarding';
import { generateAndSaveProtocol } from './generateProtocol';
import { buildOnboardingDataFromUserRow } from './buildOnboardingDataFromUserRow';
import { invalidateCache } from './cache';

// Regeneração do protocolo no PRIMEIRO scan in-app. Função de MÓDULO (não hook) → roda
// no event loop, independente do ciclo de vida da tela: sobrevive à navegação do
// loading-dentro-app para a skin-result. Marca no SUCESSO (nunca no início) → app morto
// no meio apenas tenta de novo no próximo scan. Ordem de escrita: TABELA → STORE → CACHE.
export async function regenerateProtocolInApp(
  userId: string,
  scanResult: ScanResult,
  skinScanId: string | null,
): Promise<void> {
  if (useAppStore.getState().regenInFlight) return; // já rodando nesta sessão

  const { data: urow } = await supabase
    .from('users')
    .select('inapp_protocol_regenerated_at, genero, pregnancy_status, skincare_routine_type, skincare_routine_description, allergy_type, allergy_description, tipo_pele, concerns, sun_exposure, hydration, sleep, birthday')
    .eq('id', userId)
    .maybeSingle();
  if (urow?.inapp_protocol_regenerated_at) return; // já regenerou (entre sessões)

  useAppStore.getState().setRegenInFlight(true);
  useAppStore.getState().setRoutineUpdatingNotice(true); // promessa → modal na skin-result
  try {
    // Linha mais recente ANTES da geração. A usuária já tem uma (a do signup), então
    // "existe uma linha" não prova nada — precisamos ver uma linha NOVA aparecer.
    const { data: before } = await supabase
      .from('protocolos').select('id').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    const onboardingData = buildOnboardingDataFromUserRow(urow, scanResult);

    let produced: ProtocolResult | null = null;
    await new Promise<void>((resolve) => {
      generateAndSaveProtocol({
        scanResult,
        onboardingData,
        skinScanId,
        userId,
        regenerate: true,
        onSuccess: (result) => { produced = result; }, // só CAPTURA — não seta o store
        onFinally: () => resolve(),
      });
    });
    if (!produced) return; // geração falhou → marcador NÃO gravado → retry no próximo scan

    // Read-back: a linha mais recente tem que ser DIFERENTE da de antes. O insert em
    // generateAndSaveProtocol é fire-and-forget e engole erro (RLS/rede) — sem esta
    // comparação, gravaríamos o marcador sobre uma regeneração que não aconteceu e a
    // usuária nunca mais teria retry.
    const { data: after } = await supabase
      .from('protocolos').select('id').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!after?.id || after.id === before?.id) {
      console.warn('[regenerateProtocolInApp] insert não confirmado (linha inalterada) — marcador NÃO gravado, retry no próximo scan');
      return;
    }

    // (3) store DEPOIS da tabela → (4) cache → (5) marcador
    useAppStore.getState().setProtocolResult(produced);
    invalidateCache(`protocolo:${userId}`);
    await supabase.from('users')
      .update({ inapp_protocol_regenerated_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (e) {
    console.warn('[regenerateProtocolInApp] falhou (retry no próximo scan):', e);
  } finally {
    useAppStore.getState().setRegenInFlight(false);
  }
}
