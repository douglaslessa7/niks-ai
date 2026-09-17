import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import ProductAnalysis from '../../components/product/ProductAnalysis';
import { requestAppReview } from '../../lib/storeReview';
import { clearShareResume } from '../../lib/shareResume';

// Tela de RESULTADO do scan de produto (fluxo da câmera → loading → aqui).
// O layout inteiro vive em `components/product/ProductAnalysis` — o MESMO componente que o
// detalhe da aba "Escaneados" (`recomendacao-produtos.tsx`) usa, pra que as duas telas nunca
// mais divirjam. Aqui só ligamos a fonte dos dados (store) e a navegação.

export default function ProductResult() {
  const router = useRouter();

  // Chegar aqui encerra o fluxo do "Compartilhar com o NIKS": descarta a retomada
  // guardada em `lib/shareResume` (que existe só para a tela de carregamento
  // sobreviver a um remount). Inofensivo no fluxo da câmera, que não usa retomada.
  useEffect(() => { clearShareResume(); }, []);
  const { productScanResult, productImageBase64, productImageMimeType } = useAppStore();

  const photoUri = productImageBase64
    ? `data:${productImageMimeType ?? 'image/jpeg'};base64,${productImageBase64}`
    : null;

  return (
    <ProductAnalysis
      result={productScanResult}
      photoUri={photoUri}
      onClose={() => { requestAppReview(); router.replace('/(app)/recomendacao-produtos' as any); }}
      onRescan={() => router.replace('/(scan)/product-camera' as any)}
      rescanLabel={productScanResult?.status === 'precisa_foto' ? 'Escanear os ingredientes' : 'Escanear outro produto'}
    />
  );
}
