import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useShareIntentContext } from 'expo-share-intent';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { normalizeShareIntent, domainOf } from '../../lib/shareProduct';

/**
 * Ponte entre o `expo-share-intent` e o store (feature "Compartilhar com o NIKS").
 *
 * Só COPIA o conteúdo para `pendingShare` e limpa o módulo nativo — nunca navega.
 * Quem abre a tela de análise é o `(app)/_layout.tsx`, depois do guard de
 * assinatura: assim sessão e paywall são respeitados em qualquer caminho.
 *
 * Copiar na hora é obrigatório: o hook do pacote zera o conteúdo quando o app vai
 * para background (`resetOnBackground`), e a usuária pode estar no meio do login.
 */
export function ShareIntentBridge() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const setPendingShare = useAppStore((s) => s.setPendingShare);
  const { track } = useMixpanel();

  useEffect(() => {
    if (!hasShareIntent) return;
    const share = normalizeShareIntent(shareIntent);
    resetShareIntent();

    if (!share) {
      Alert.alert('Não deu pra abrir', 'Não encontramos um link ou imagem nesse compartilhamento.');
      return;
    }
    setPendingShare(share);
    track('product_share_received', {
      origem: share.kind === 'url' ? 'share_url' : 'share_image',
      dominio: share.kind === 'url' ? domainOf(share.sourceUrl) : null,
    });
  }, [hasShareIntent]);

  return null;
}
