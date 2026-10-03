import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import ProductAnalysis from '../../components/product/ProductAnalysis';
import { requestAppReview } from '../../lib/storeReview';
import { clearShareResume } from '../../lib/shareResume';
import { useColecaoToggle } from '../../hooks/useColecaoToggle';
import { waitScanCutout } from '../../lib/scanCutouts';

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

  // "Tenho em casa" — só para análise ok que foi salva (tem scan_id).
  const r = productScanResult as any;
  const colecaoSrc = useMemo(() => (r?.status === 'ok' && r?.scan_id ? {
    origem: 'scan' as const, productScanId: r.scan_id,
    nome: r.produto?.nome ?? null, marca: r.produto?.marca ?? null,
    categoria: r.produto?.categoria ?? null, compat: r.compatibilidade ?? null,
  } : null), [r]);
  const col = useColecaoToggle(colecaoSrc);

  // Recorte sem fundo (Fase 3): o servidor faz em segundo plano depois da análise. A foto
  // original aparece na hora; quando o recorte fica pronto, troca por ele. Espera até 90 s:
  // o normal é ~5 s, mas com a fila do Replicate cheia (429) o servidor tenta de novo por
  // até ~3 min — com 20 s a tela desistia e ficava com a foto de fundo até ser reaberta.
  // Se falhar, fica a original.
  const [cutoutUri, setCutoutUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setCutoutUri(null);
    if (r?.status === 'ok' && r?.scan_id) {
      waitScanCutout(r.scan_id, 90_000).then((url) => { if (alive && url) setCutoutUri(url); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [r?.scan_id, r?.status]);

  return (
    <ProductAnalysis
      result={productScanResult}
      photoUri={photoUri}
      cutoutUri={cutoutUri}
      onClose={() => { requestAppReview(); router.replace('/(app)/recomendacao-produtos' as any); }}
      onRescan={() => router.replace('/(scan)/product-camera' as any)}
      rescanLabel={productScanResult?.status === 'precisa_foto' ? 'Escanear os ingredientes' : 'Escanear outro produto'}
      colecao={colecaoSrc && col.owned !== null ? { owned: col.owned, busy: col.busy, onToggle: col.toggle } : undefined}
    />
  );
}
