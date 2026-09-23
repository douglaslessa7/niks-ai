import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import ProductAnalysis from '../../components/product/ProductAnalysis';
import PerguntaSimNao from '../../components/colecao/PerguntaSimNao';
import { requestAppReview } from '../../lib/storeReview';
import { clearShareResume } from '../../lib/shareResume';
import { adicionarDoScan, identificarItem, scanJaNaColecao } from '../../lib/colecao';
import { recomendarProdutos } from '../../lib/recomendarProdutos';
import { getUserId } from '../../lib/currentUser';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

// Tela de RESULTADO do scan de produto (fluxo da câmera → loading → aqui).
// O layout inteiro vive em `components/product/ProductAnalysis` — o MESMO componente que o
// detalhe da aba "Escaneados" (`recomendacao-produtos.tsx`) usa, pra que as duas telas nunca
// mais divirjam. Aqui só ligamos a fonte dos dados (store) e a navegação.
//
// ⚠️ É AQUI que mora o pop-up "você tem esse produto em casa?" — e não dentro do
// `ProductAnalysis`. Os DOIS caminhos de scan (câmera e "Compartilhar com o NIKS")
// terminam nesta tela, então uma vez só cobre os dois; se o pop-up morasse no
// componente compartilhado, ele apareceria também ao abrir um scan antigo pelo
// histórico, que não é um scan novo.

/** Atraso proposital: a usuária vê o resultado antes de ser perguntada. */
const DELAY_PERGUNTA_MS = 1000;

export default function ProductResult() {
  const router = useRouter();
  const { track } = useMixpanel();

  // Chegar aqui encerra o fluxo do "Compartilhar com o NIKS": descarta a retomada
  // guardada em `lib/shareResume` (que existe só para a tela de carregamento
  // sobreviver a um remount). Inofensivo no fluxo da câmera, que não usa retomada.
  useEffect(() => { clearShareResume(); }, []);
  const { productScanResult, productImageBase64, productImageMimeType } = useAppStore();
  const colecaoRetakeId = useAppStore((s) => s.colecaoRetakeId);
  const setColecaoRetakeId = useAppStore((s) => s.setColecaoRetakeId);

  const [perguntaVisivel, setPerguntaVisivel] = useState(false);
  // Uma pergunta por resultado: sem o guard, um remount da tela (Fast Refresh,
  // volta da navegação) perguntaria de novo sobre o mesmo produto.
  const jaTratouRef = useRef(false);

  const photoUri = productImageBase64
    ? `data:${productImageMimeType ?? 'image/jpeg'};base64,${productImageBase64}`
    : null;

  useEffect(() => {
    if (jaTratouRef.current) return;
    // Sem resultado ainda não é "já tratou": queimar o guard aqui faria a pergunta
    // nunca acontecer se o store demorasse um tique para chegar.
    if (!productScanResult) return;
    const scanId = productScanResult.scan_id;
    const analiseOk = productScanResult.status !== 'precisa_foto' && !!scanId;
    jaTratouRef.current = true;

    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const userId = await getUserId();
      if (!userId) return;

      // (a) Refazendo a foto de um item NÃO IDENTIFICADO da Coleção: atualiza o
      // item que já existe em vez de perguntar de novo — ele já é dela.
      if (colecaoRetakeId) {
        if (analiseOk) {
          try {
            await identificarItem(userId, colecaoRetakeId, productScanResult, scanId!);
            track('colecao_item_identificado');
            // O produto agora pode ocupar um passo: refresca só a recomendação.
            await recomendarProdutos({ userId, regenerate: true, preservarCatalogo: true });
          } catch (e) {
            console.warn('[product-result] não deu pra identificar o item:', e);
          }
        }
        // Consome o alvo mesmo se a análise falhou de novo — senão o próximo scan
        // de produto qualquer seria gravado por cima daquele item.
        setColecaoRetakeId(null);
        return;
      }

      // (b) Scan normal: pergunta se o produto é dela. Só faz sentido para uma
      // análise que deu certo (um "precisa_foto" não virou produto nenhum).
      if (!analiseOk) return;
      if (await scanJaNaColecao(userId, scanId!)) return; // já respondeu "sim" antes
      timer = setTimeout(() => setPerguntaVisivel(true), DELAY_PERGUNTA_MS);
    })();

    return () => { if (timer) clearTimeout(timer); };
  }, [productScanResult, colecaoRetakeId, setColecaoRetakeId, track]);

  const responder = async (tem: boolean) => {
    setPerguntaVisivel(false);
    track('colecao_pergunta_respondida', {
      tem_em_casa: tem,
      compatibilidade: typeof productScanResult?.compatibilidade === 'number' ? productScanResult.compatibilidade : null,
      veredito: productScanResult?.veredito ?? null,
    });
    if (!tem) return; // "Não" → fica só em "Escaneados", como sempre foi.

    try {
      const userId = await getUserId();
      const scanId = productScanResult?.scan_id;
      if (!userId || !scanId) return;
      await adicionarDoScan(userId, scanId, productScanResult);
      track('colecao_item_adicionado', { origem: 'scan' });
      // Se ele for o mais compatível para algum passo, passa a ocupar esse passo.
      // Só o produto do passo muda — a estrutura da rotina não é reescrita.
      await recomendarProdutos({ userId, regenerate: true, preservarCatalogo: true });
    } catch (e) {
      console.warn('[product-result] não deu pra adicionar à Coleção:', e);
    }
  };

  return (
    <>
      <ProductAnalysis
        result={productScanResult}
        photoUri={photoUri}
        onClose={() => { requestAppReview(); router.replace('/(app)/recomendacao-produtos' as any); }}
        onRescan={() => router.replace('/(scan)/product-camera' as any)}
        rescanLabel={productScanResult?.status === 'precisa_foto' ? 'Escanear os ingredientes' : 'Escanear outro produto'}
      />

      <PerguntaSimNao
        visible={perguntaVisivel}
        titulo="Você tem esse produto em casa?"
        subtitulo="Se tiver, eu uso ele na sua rotina sempre que fizer sentido — em vez de indicar um parecido pra você comprar."
        labelSim="Tenho em casa"
        labelNao="Não tenho"
        onSim={() => responder(true)}
        onNao={() => responder(false)}
      />
    </>
  );
}
