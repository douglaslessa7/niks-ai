// Session Replay do Mixpanel (@mixpanel/react-native-session-replay 2.1.0).
// Amostragem: 40% das sessões de usuárias reais, 100% das internas (`usuario_interno`). Cota do
// plano: 20 mil gravações por mês.
//
// ⚠️ O pacote LANÇA ERRO AO SER IMPORTADO quando o binário não tem o módulo nativo (Metro sobre
// um dev client antigo, ou JS novo sobre build antiga). Por isso ele é carregado aqui com
// `require` dentro de try/catch: sem o nativo, nada grava e o app segue normal.
//
// Privacidade (ver docs/tracking-plan.md, "Session Replay — o que fica mascarado"):
//   · `autoMaskedViews` = Image + Web + Map → toda imagem (fotos, rosto, produtos) vira bloco.
//     Texto da interface NÃO é mascarado de propósito (é o que torna o replay útil).
//   · TextInput é sempre mascarado pelo SDK (não dá para desligar).
//   · Câmeras, rosto, chat/SOS, nome e e-mail: `<Sensivel>` (components/Sensivel.tsx).
import type * as SR from '@mixpanel/react-native-session-replay';

let modulo: typeof SR | null | undefined;

/** O pacote com o nativo presente, ou null. */
export function sessionReplayModulo(): typeof SR | null {
  if (modulo !== undefined) return modulo;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modulo = require('@mixpanel/react-native-session-replay') as typeof SR;
  } catch {
    modulo = null;
  }
  return modulo;
}

let iniciado: Promise<void> | null = null;

export const PERCENT_REAIS = 40;
export const PERCENT_INTERNOS = 100;
let interno = false;
let token = '';
let idAtual = '';
let percentAtual: number | null = null;

function iniciar(percent: number): void {
  const sr = sessionReplayModulo();
  if (!sr || !token || !idAtual) return;
  percentAtual = percent;
  const config = new sr.MPSessionReplayConfig({
    wifiOnly: false,
    recordingSessionsPercent: percent,
    autoStartRecording: true,
    autoMaskedViews: [sr.MPSessionReplayMask.Image, sr.MPSessionReplayMask.Web, sr.MPSessionReplayMask.Map],
    enableLogging: __DEV__,
  });
  // `initialize` desfaz uma instância anterior antes de criar a nova.
  iniciado = (iniciado ?? Promise.resolve())
    .then(() => sr.MPSessionReplay.initialize(token, idAtual, config))
    .catch((e) => { console.warn('[session-replay] não iniciou:', e); });
}

/**
 * `usuario_interno` mudou (lib/mixpanel/perfil.ts). Se o Session Replay já começou com a
 * amostragem de usuária real (40%) e ela é interna, reinicia com 100% — vale para esta sessão
 * e para as próximas (o sorteio de cada sessão usa a porcentagem da configuração).
 */
export function definirInternoReplay(valor: boolean): void {
  interno = valor;
  if (valor && percentAtual === PERCENT_REAIS) iniciar(PERCENT_INTERNOS);
}

/** Inicia DEPOIS do Mixpanel principal, com o mesmo token e o distinct_id atual. */
export function iniciarSessionReplay(tokenMixpanel: string, distinctId: string, internoBase = false): void {
  if (!sessionReplayModulo() || !tokenMixpanel || !distinctId || percentAtual !== null) return;
  token = tokenMixpanel;
  idAtual = distinctId;
  if (internoBase) interno = true; // não apaga um "interno" que o perfil já tenha publicado
  iniciar(interno ? PERCENT_INTERNOS : PERCENT_REAIS);
}

/**
 * Novo distinct_id do Mixpanel principal (depois do identify ou do reset): repassa ao Session
 * Replay, sempre DEPOIS do principal (a ordem que a doc pede). Nunca lança.
 */
export function sincronizarDistinctId(distinctId: string): void {
  if (!distinctId) return;
  idAtual = distinctId;
  const sr = sessionReplayModulo();
  if (!sr || !iniciado) return;
  void iniciado.then(() => sr.MPSessionReplay.identify(distinctId)).catch(() => {});
}
