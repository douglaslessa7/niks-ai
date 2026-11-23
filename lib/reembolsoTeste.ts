// ─────────────────────────────────────────────────────────────────────────────
// SÓ DESENVOLVIMENTO (19/nov/2026): abre o pedido de reembolso da Apple para a assinatura
// ativa deste aparelho, para testar em SANDBOX a função `apple-notificacoes` (a Apple manda
// um CONSUMPTION_REQUEST e nós respondemos). Usado só pelo atalho __DEV__ da aba Perfil:
// em build de release o atalho não existe.
// `expo-iap` carregado com `require` protegido, como em lib/comprovanteApple.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';

export async function pedirReembolsoDeTeste(): Promise<string> {
  if (Platform.OS !== 'ios') return 'Só no iPhone.';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let iap: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    iap = require('expo-iap');
  } catch {
    return 'Este build não tem o módulo de compras (expo-iap).';
  }
  try {
    if (!(await iap.initConnection())) return 'Não conectou à App Store.';
    const compras: { productId?: string; id?: string }[] = await iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    const produto = compras?.[0]?.productId;
    if (!produto) return 'Nenhuma assinatura ativa neste aparelho. Compre com a conta sandbox primeiro.';
    const status = await iap.beginRefundRequestIOS(produto);
    return `Pedido aberto para ${produto}: ${status ?? 'sem status'}.`;
  } catch (e) {
    return `Falhou: ${String((e as Error)?.message ?? e)}`;
  } finally {
    try { await iap.endConnection(); } catch { /* nada */ }
  }
}
