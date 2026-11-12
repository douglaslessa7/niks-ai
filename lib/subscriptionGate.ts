// Verificação de assinatura "fail closed" do caminho paywall → cadastro → app.
//
// REGRA DE NEGÓCIO (out/2026): a tela de cadastro (`(onboarding)/signup.tsx`) só
// aparece para quem tem assinatura CONFIRMADA. Qualquer outra resposta — erro, timeout,
// sem internet, resposta estranha — conta como "sem assinatura" e a usuária volta para o
// paywall. Na dúvida, paywall.
//
// Parte B, Fase 0C, Etapa 1 (08/nov/2026): quem decide é o Superwall e depois o servidor.
// O RevenueCat fica só como reserva até a versão nova estar adotada, e cada discordância
// dele é registrada em `assinatura_divergencias`. Compra ligada a outra conta vai ao
// paywall, mesmo que o RevenueCat diga sim.
//
// Uma assinatura que já existe no Apple ID conta como "pagou", mas SÓ quando a
// usuária toca em "Restaurar compra" no paywall. Nada aqui restaura sozinho: o
// `restorePurchases()` só roda depois de o Superwall devolver `restored`.
//
// Ver "Guard de assinatura — Superwall + RevenueCat" no README.
import { Alert } from 'react-native';
import Purchases from 'react-native-purchases';
import type { CustomerInfo } from 'react-native-purchases';
import { isSubscribed } from './revenuecat';
import { conferirPortao, registrarDiscordanciaRc, type OrigemTransferencia } from './assinaturaServidor';
import { supabase } from './supabase';

/** Teto de espera de uma consulta ao RevenueCat. Estourou = sem premium. */
export const RC_TIMEOUT_MS = 8000;
/** O restore pode abrir o pedido de senha da Apple — espera mais. */
const RESTORE_TIMEOUT_MS = 30000;

/** Resolve com o valor, ou `null` se a promessa falhar ou passar de `ms`. Nunca lança. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

/** Chamada ao RevenueCat com teto: se ele não responder, o fluxo segue. */
export function comTetoRc<T>(promise: Promise<T>, ms = RC_TIMEOUT_MS): Promise<T | null> {
  return withTimeout(promise, ms);
}

type Source =
  | 'cache'    // getCustomerInfo — o que o RevenueCat já sabe
  | 'sync'     // syncPurchasesForResult — manda a compra recém-feita ao RevenueCat, sem pedir senha
  | 'restore'; // restorePurchases — SÓ depois de a usuária tocar em "Restaurar compra"

async function readCustomerInfo(source: Source): Promise<CustomerInfo | null> {
  if (source === 'sync') {
    const result = await withTimeout(Purchases.syncPurchasesForResult(), RC_TIMEOUT_MS);
    return result?.customerInfo ?? null;
  }
  if (source === 'restore') return withTimeout(Purchases.restorePurchases(), RESTORE_TIMEOUT_MS);
  return withTimeout(Purchases.getCustomerInfo(), RC_TIMEOUT_MS);
}

/**
 * `true` SÓ com assinatura confirmada: Superwall → servidor → RevenueCat (reserva).
 * Nenhuma confirmação → `false`. Nunca lança.
 */
export async function confirmPremium({
  source = 'cache',
  attempts = 1,
  label,
  transferir,
  onTransferenciaFalhou,
}: {
  source?: Source;
  attempts?: number;
  label: string;
  /** Só quando ela comprou ou restaurou neste aparelho: traz a compra de outra conta para esta. */
  transferir?: OrigemTransferencia;
  onTransferenciaFalhou?: () => void;
}): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    const c = await conferirPortao(transferir);
    if (c.transferenciaFalhou) onTransferenciaFalhou?.();
    if (c.outraConta) return false;
    if (c.confirmado) {
      // Não atrasa a entrada: só compara. Também mantém o RevenueCat a par da compra.
      void readCustomerInfo(source).then((info) => {
        if (info == null || !isSubscribed(info)) void registrarDiscordanciaRc(c, info == null ? null : false);
      });
      return true;
    }
    const info = await readCustomerInfo(source);
    const rcOk = info != null && isSubscribed(info);
    if (rcOk) {
      void registrarDiscordanciaRc(c, true);
      return true;
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

const AVISO_TRANSFERENCIA = {
  titulo: 'Não conseguimos transferir sua assinatura',
  texto: 'Sua assinatura da Apple está ligada a outra conta do NIKS e não conseguimos trazê-la para esta conta agora. Confira sua internet e toque em "Restaurar compra". Se continuar, escreva para support@niksaiapp.com.',
  botao: 'Entendi',
};

/** Resolve quando ela fecha o aviso, para o paywall não abrir por cima dele. */
export function avisarTransferenciaFalhou(): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(AVISO_TRANSFERENCIA.titulo, AVISO_TRANSFERENCIA.texto, [
      { text: AVISO_TRANSFERENCIA.botao, onPress: () => resolve() },
    ], { cancelable: false });
  });
}

/**
 * Sem sessão no Supabase, o RevenueCat tem de estar ANÔNIMO. Se ele ainda carrega
 * a identidade de uma conta anterior deste aparelho (logout de build antiga, que
 * não chamava `Purchases.logOut()`), o `premium` dela liberaria o cadastro de
 * outra pessoa. Nunca lança.
 */
export async function ensureAnonymousRevenueCat(label: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return;
    const anonymous = await withTimeout(Purchases.isAnonymous(), 3000);
    if (anonymous === true) return;
    // `false` ou sem resposta: desloga mesmo assim (se já for anônimo, o logOut
    // só falha, e o withTimeout engole).
    await withTimeout(Purchases.logOut(), 5000);
  } catch {
    // nada — quem decide é o confirmPremium, que falha fechado
  }
}

/** Logout / apagar conta: a próxima pessoa no aparelho não herda o RevenueCat desta. Nunca lança. */
export async function resetRevenueCatIdentity(): Promise<void> {
  const anonymous = await withTimeout(Purchases.isAnonymous(), 3000);
  if (anonymous === true) return;
  await withTimeout(Purchases.logOut(), 5000);
}
