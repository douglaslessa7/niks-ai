// ─────────────────────────────────────────────────────────────────────────────
// Prova da Apple (Parte B, Fase 0B): lê no StoreKit as assinaturas ativas deste aparelho e
// devolve as transações assinadas pela Apple (JWS). O servidor valida a assinatura e liga a
// compra à conta logada (função `comprovar-assinatura`).
//
// `expo-iap` é carregado só aqui e com `require` protegido: em uma build sem o módulo
// nativo, nada quebra e o app segue sem o comprovante. Serve só para ler: não compra e não
// finaliza transação, porque as compras continuam sendo feitas pelo Superwall.
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';

const TETO_MS = 8000;
const MAXIMO = 5;

function comTeto<T>(p: Promise<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), TETO_MS);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

export async function comprovantesApple(): Promise<string[]> {
  if (Platform.OS !== 'ios') return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let iap: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    iap = require('expo-iap');
  } catch {
    return [];
  }
  try {
    if (!(await comTeto(iap.initConnection()))) return [];
    const compras = await comTeto<{ purchaseToken?: string | null }[]>(
      iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true }),
    );
    const tokens = (compras ?? []).map((c) => c.purchaseToken).filter((t): t is string => !!t);
    return [...new Set(tokens)].slice(0, MAXIMO);
  } catch {
    return [];
  } finally {
    void comTeto(iap.endConnection());
  }
}

/** A data da compra mais recente nos comprovantes, em ms, no relógio da Apple. Só lê: quem
 *  valida a assinatura é o servidor. Sem data legível, `null`. */
export function dataDaCompraMaisRecente(jws: string[]): number | null {
  let maisRecente: number | null = null;
  for (const token of jws) {
    try {
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const data = Number(JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))).purchaseDate);
      if (data > 0 && (maisRecente === null || data > maisRecente)) maisRecente = data;
    } catch { /* comprovante ilegível não conta */ }
  }
  return maisRecente;
}
