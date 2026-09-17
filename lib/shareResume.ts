import { useAppStore, type PendingShare } from '../store/onboarding';

// Retomada do share quando a tela de carregamento REMONTA.
//
// A `share-product-loading` tira o `pendingShare` do store logo na montagem (para
// o (app)/_layout não reabrir a tela). Se a tela remontar — Fast Refresh em
// desenvolvimento, e em produção qualquer remount do Stack — a segunda montagem
// não acharia nada no store e mandaria a usuária para a home no meio da análise.
// Por isso o último share consumido fica guardado aqui, em memória de módulo.
//
// Janela curta de propósito: é hand-off, não histórico. Passados 5 minutos, ou
// depois que o fluxo termina (resultado aberto, foto recusada, tela fechada),
// a retomada é descartada — senão um deep link direto à tela reabriria uma
// análise velha.

const RESUME_WINDOW_MS = 5 * 60_000;

let consumedShare: PendingShare | null = null;
let consumedAt = 0;

/** Share do store (consumindo-o) ou, numa remontagem, o último consumido. */
export function takeShareForLoadingScreen(): PendingShare | null {
  const pending = useAppStore.getState().pendingShare;
  if (pending) {
    consumedShare = pending;
    consumedAt = Date.now();
    return pending;
  }
  if (consumedShare && Date.now() - consumedAt <= RESUME_WINDOW_MS) {
    return consumedShare;
  }
  consumedShare = null;
  return null;
}

/** Fim do fluxo: resultado aberto, tela fechada ou caminho alternativo escolhido. */
export function clearShareResume(): void {
  consumedShare = null;
  consumedAt = 0;
}
