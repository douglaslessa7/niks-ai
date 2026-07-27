import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAIConsent } from './useAIConsent';
import { AIConsentModal } from '../components/ui/AIConsentModal';

/**
 * Pede o consentimento de uso de IA assim que uma tela de câmera abre.
 *
 * Antes o aviso aparecia antes de navegar (no ScanModal e nas telas de preparação),
 * o que interrompia a usuária no meio do caminho. Agora ele vive nas próprias telas
 * de câmera — o único ponto por onde toda foto obrigatoriamente passa, o que também
 * garante que nenhum caminho novo pro scan escape do consentimento.
 *
 * Quem já aceitou uma vez (gravado em AsyncStorage) não vê nada. Quem recusa volta
 * pra tela anterior: sem consentimento não há scan.
 *
 * Uso: `const { consentGate } = useScanConsentGate()` e renderize `{consentGate}`.
 */
export function useScanConsentGate() {
  const router = useRouter();
  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();

  useEffect(() => {
    // Callback vazio: quem já consentiu antes simplesmente segue usando a câmera,
    // que já está montada atrás do modal.
    requestConsent(() => {});
  }, []);

  const consentGate = (
    <AIConsentModal
      visible={consentModalVisible}
      onAccept={handleAccept}
      onDecline={() => {
        handleDecline();
        router.back();
      }}
    />
  );

  return { consentGate };
}
