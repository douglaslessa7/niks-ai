// Verificação de assinatura "fail closed" do caminho paywall → cadastro → app.
//
// REGRA DE NEGÓCIO (out/2026): a tela de cadastro (`(onboarding)/signup.tsx`) só
// aparece para quem tem o entitlement `premium` CONFIRMADO no RevenueCat. Qualquer
// outra resposta — erro, timeout, sem internet, resposta estranha — conta como
// "sem premium" e a usuária volta para o paywall. Na dúvida, paywall.
//
// Uma assinatura que já existe no Apple ID conta como "pagou", mas SÓ quando a
// usuária toca em "Restaurar compra" no paywall. Nada aqui restaura sozinho: o
// `restorePurchases()` só roda depois de o Superwall devolver `restored`.
//
// Ver "Guard de assinatura — Superwall + RevenueCat" no README.
import Purchases from 'react-native-purchases';
import type { CustomerInfo } from 'react-native-purchases';
import { isSubscribed } from './revenuecat';
import { supabase } from './supabase';
import { registrarPasso } from './paywallDebug'; // TEMP-PWGUARD

// TEMP-PWGUARD: log temporário para conferir o guard no iPhone (Console do Mac,
// filtro "[PWGUARD]"). Remover junto com todas as linhas marcadas TEMP-PWGUARD.
// Cada linha também entra no "caminho" do diagnóstico do paywall (lib/paywallDebug.ts,
// só com ele ligado). Ao remover os TEMP-PWGUARD, o diagnóstico continua funcionando,
// só sem esses passos intermediários.
export const pwlog = (...args: unknown[]) => { // TEMP-PWGUARD
  const texto = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '); // TEMP-PWGUARD
  console.log('[PWGUARD]', texto); // TEMP-PWGUARD
  registrarPasso(texto); // TEMP-PWGUARD
}; // TEMP-PWGUARD

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
 * `true` SÓ com o `premium` ativo confirmado pelo RevenueCat. Erro, timeout ou
 * resposta sem o entitlement → `false`. Nunca lança.
 */
export async function confirmPremium({
  source = 'cache',
  attempts = 1,
  label,
}: { source?: Source; attempts?: number; label: string }): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    const info = await readCustomerInfo(source);
    const ok = info != null && isSubscribed(info);
    pwlog(`${label}: tentativa ${i}/${attempts} (${source}) →`, info == null ? 'sem resposta' : ok ? 'premium' : 'sem premium'); // TEMP-PWGUARD
    if (ok) return true;
    if (i < attempts) await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
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
    pwlog(`${label}: RevenueCat com identidade sem sessão (anônimo=${anonymous}) → logOut`); // TEMP-PWGUARD
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
  pwlog('logout: RevenueCat deslogado'); // TEMP-PWGUARD
}
