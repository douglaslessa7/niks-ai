import { useRouter } from 'expo-router';
import { useAppStore } from '../store/onboarding';
import { getUserId } from '../lib/currentUser';
import { precisaPrimeiroFluxo } from '../lib/colecaoFlow';

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

  /**
   * Vai para a câmera de rosto SEM checar o primeiro fluxo da Minha Coleção.
   * É o que as telas DE DENTRO do fluxo usam (a câmera da Coleção termina aqui);
   * usar o `startFaceScan` lá mandaria a usuária de volta para a Rotina, em círculo.
   */
  const startFaceScanSemGate = () => {
    setScanSource('app');
    // O tutorial de preparação (scan-prep-app) é mostrado UMA vez só na vida.
    // Depois de visto (flag persistido no store), o botão vai direto para a câmera.
    if (scanTutorialSeen) {
      router.push('/(scan)/camera-multi' as any);
    } else {
      router.push('/(scan)/scan-prep-app' as any);
    }
  };

  /**
   * Entrada normal do scan (botão "Escanear" da home).
   *
   * ⚠️ Se esta CONTA ainda não passou pelo primeiro fluxo da Minha Coleção, o
   * toque no "Escanear" NÃO abre a câmera: leva para a Rotina, onde o fluxo
   * começa (pop-up "você tem produtos em casa?"). É a regra da spec — o gatilho
   * do fluxo é o que vier primeiro entre abrir a Rotina e tocar em Escanear.
   * Falha de rede no gate → segue para o scan normalmente (nunca travar o scan
   * por causa de uma feature secundária).
   */
  const startFaceScan = async () => {
    try {
      const userId = await getUserId();
      if (userId && (await precisaPrimeiroFluxo(userId))) {
        router.push('/protocolo' as any);
        return;
      }
    } catch (e) {
      console.warn('[useFaceScan] gate da Coleção falhou, seguindo para o scan:', e);
    }
    startFaceScanSemGate();
  };

  return { startFaceScan, startFaceScanSemGate };
}
