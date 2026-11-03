import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────────────
// Convite aberto pelo link (niks-ai://convite/<token>, fase 3 Parte A). O
// `+native-intent` só guarda o token aqui — sem rede, sem supabase — e o
// `ConvitePendente` (dentro do (app)/_layout, depois do guard de assinatura)
// confere no servidor e coloca ela no grupo.
// ─────────────────────────────────────────────────────────────────────────────

const CHAVE = 'convite:pendente';
export const TOKEN_CONVITE = /^[A-Za-z0-9_-]{16,64}$/;
const ouvintes = new Set<() => void>();

export function guardarConvite(token: string) {
  if (!TOKEN_CONVITE.test(token)) return;
  AsyncStorage.setItem(CHAVE, token).then(() => ouvintes.forEach((f) => f())).catch(() => {});
}

/** Lê e apaga o token pendente (cada convite é tratado uma vez). */
export async function pegarConvite(): Promise<string | null> {
  const t = await AsyncStorage.getItem(CHAVE).catch(() => null);
  if (t) await AsyncStorage.removeItem(CHAVE).catch(() => {});
  return t && TOKEN_CONVITE.test(t) ? t : null;
}

export function aoGuardarConvite(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}
