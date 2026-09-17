import { useEffect, useState } from 'react';
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
 * Telas que disparam a IA sozinhas (sem a usuária apertar nada — ex.:
 * `share-product-loading`) devem esperar `granted === true` antes de chamar a IA,
 * e podem passar `onDecline` quando não houver tela anterior para onde voltar, e
 * `presentation: 'inline'` para não depender do `<Modal>` nativo (ver AIConsentModal).
 */
export function useScanConsentGate(options?: { onDecline?: () => void; presentation?: 'modal' | 'inline' }) {
  const router = useRouter();
  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    // Nas câmeras, quem já consentiu simplesmente segue usando a câmera, que já
    // está montada atrás do modal. `granted` libera quem precisa esperar.
    requestConsent(() => setGranted(true));
  }, []);

  const consentGate = (
    <AIConsentModal
      visible={consentModalVisible}
      presentation={options?.presentation}
      onAccept={handleAccept}
      onDecline={() => {
        handleDecline();
        if (options?.onDecline) options.onDecline();
        else router.back();
      }}
    />
  );

  return { consentGate, granted };
}
