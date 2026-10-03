import { useRouter } from 'expo-router';
import { useProductAnalysis } from '../../hooks/useProductAnalysis';
import { ScanLoadingView } from '../../components/scan/ScanLoadingView';

// Tela de carregamento do scan de PRODUTO — visual = tela 50b do Claude Design
// (`components/scan/ScanLoadingView`, a mesma tela do scan de rosto). A LÓGICA
// é a mesma de antes: chama a Edge Function `analisar-produto` (verificação de
// JWT interna → precisa do token da sessão) e, ao terminar, navega para a tela
// de resultado. A lógica mora em `hooks/useProductAnalysis` (compartilhada com
// `share-product-loading`).

export default function ProductLoading() {
  const router = useRouter();
  const { percentage, showDemandNotice, countdown, countdownPaused, showError } =
    useProductAnalysis({ enabled: true, origem: 'camera' });

  return (
    <ScanLoadingView
      kind="product"
      percentage={percentage}
      showDemandNotice={showDemandNotice}
      countdown={countdown}
      countdownPaused={countdownPaused}
      showError={showError}
      onRetry={() => router.back()}
    />
  );
}
