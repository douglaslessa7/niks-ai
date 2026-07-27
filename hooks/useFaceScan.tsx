import { useRouter } from 'expo-router';
import { useAppStore } from '../store/onboarding';

/**
 * Inicia o scan de rosto direto, sem passar pelo bottom sheet de escolha de tipo
 * (o ScanModal saiu do fluxo: a home vai direto pro rosto e o scan de produto
 * ficou só na tela de recomendação).
 *
 * O consentimento de IA NÃO é pedido aqui — ele vive na própria tela de câmera,
 * em hooks/useScanConsentGate.
 */
export function useFaceScan() {
  const router = useRouter();
  const setScanSource = useAppStore((s) => s.setScanSource);
  const scanTutorialSeen = useAppStore((s) => s.scanTutorialSeen);

  const startFaceScan = () => {
    setScanSource('app');
    // O tutorial de preparação (scan-prep-app) é mostrado UMA vez só na vida.
    // Depois de visto (flag persistido no store), o botão vai direto para a câmera.
    if (scanTutorialSeen) {
      router.push('/(scan)/camera-multi' as any);
    } else {
      router.push('/(scan)/scan-prep-app' as any);
    }
  };

  return { startFaceScan };
}
