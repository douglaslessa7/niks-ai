// ─────────────────────────────────────────────────────────────────────────────
// Assinatura conferida no SERVIDOR (fase 3 — grupos). A compra acontece antes da conta,
// com o RevenueCat anônimo: o evento de loja chega ao servidor (webhook do Superwall →
// `assinaturas_loja`) com o id anônimo (`$RCAnonymousID:…`), sem a conta. Aqui o app,
// já logado, manda esse id (customerInfo.originalAppUserId) uma vez por conta, e o
// servidor liga as compras a ela — inclusive as que ainda vão chegar.
// Compras feitas já com a conta chegam com o UUID dela e não precisam disto.
// Nunca bloqueia nada: é só para o servidor saber (ex.: "só assinante cria grupo").
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getCustomerInfo } from './revenuecat';

const FN_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/assinatura`;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const FEITO_KEY = (uid: string) => `assinatura:rc_vinculado:${uid}`;

let emAndamento = false;

/** Liga as compras anônimas do RevenueCat à conta logada (uma vez por conta). */
export async function vincularAssinatura(uid: string): Promise<void> {
  if (emAndamento) return;
  emAndamento = true;
  try {
    if (await AsyncStorage.getItem(FEITO_KEY(uid))) return;
    const rcId = (await getCustomerInfo()).originalAppUserId;
    // Já é o UUID da conta (comprou logada): os eventos chegam com ele.
    if (!rcId || !rcId.startsWith('$RCAnonymousID:')) {
      await AsyncStorage.setItem(FEITO_KEY(uid), rcId || '-');
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const resp = await fetch(FN_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'vincular', rc_id: rcId }),
    });
    const r = await resp.json().catch(() => null);
    // ok, ou o id já é de outra conta (não adianta tentar de novo): não repete.
    if (resp.ok && r && (r.ok || r.motivo === 'id de outra conta')) await AsyncStorage.setItem(FEITO_KEY(uid), rcId);
  } catch {
    // sem rede / RevenueCat fora: tenta na próxima abertura
  } finally {
    emAndamento = false;
  }
}
