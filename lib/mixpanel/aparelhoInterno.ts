// "Aparelho interno": um e-mail do time (EMAILS_INTERNOS, lib/mixpanel/perfil.ts) já fez login
// neste aparelho. A marca fica no Keychain (expo-secure-store) e NUNCA é apagada no logout:
// no iOS o Keychain sobrevive à reinstalação do app, então o onboarding anônimo de um aparelho do
// time (antes de qualquer login, inclusive numa instalação nova) já sai com `usuario_interno: true`.
// ⚠️ No Android o SecureStore NÃO sobrevive à desinstalação (o plugin tira o SecureStore do
// backup automático): lá a marca vale até o app ser apagado.
//
// O expo-secure-store lança erro ao ser importado num binário sem o módulo nativo (Metro sobre
// dev client antigo, JS novo sobre build antiga): carregado com `require` em try/catch.
import type * as SecureStoreTipos from 'expo-secure-store';

const CHAVE = 'niks_aparelho_interno';
let valor = false;
let leitura: Promise<boolean> | null = null;

function secureStore(): typeof SecureStoreTipos | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-secure-store') as typeof SecureStoreTipos;
  } catch {
    return null;
  }
}

/** Valor já lido (false até a 1ª leitura terminar). */
export function aparelhoInterno(): boolean {
  return valor;
}

/** Lê a marca uma vez por abertura do app. Nunca rejeita. */
export function lerAparelhoInterno(): Promise<boolean> {
  if (leitura) return leitura;
  leitura = (async () => {
    const ss = secureStore();
    if (!ss) return false;
    try {
      const v = await ss.getItemAsync(CHAVE, { keychainAccessible: ss.AFTER_FIRST_UNLOCK });
      if (v === '1') valor = true;
    } catch {}
    return valor;
  })();
  return leitura;
}

/** Login de um e-mail do time: marca o aparelho (para sempre). */
export function marcarAparelhoInterno(): void {
  if (valor) return;
  valor = true;
  const ss = secureStore();
  if (!ss) return;
  ss.setItemAsync(CHAVE, '1', { keychainAccessible: ss.AFTER_FIRST_UNLOCK }).catch(() => {});
}
