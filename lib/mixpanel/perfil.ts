// Perfil da usuária no Mixpanel (people) + identidade + plano. Fora do React: tudo passa pela
// fila do `MixpanelProvider`, então nada se perde antes do init. Nunca lança.
//
// - Identidade: `identify(user_id do Supabase)` sempre que existir sessão — abertura do app com
//   sessão, login, cadastro (inclusive da convidada) e onboarding concluído com conta já logada.
//   O `reset()` fica no logout e no "apagar conta" (`clearLocalData`, hooks/useAuth.ts).
// - Plano (`plano`: free | trial | pago | convidada | expirado): fonte = o resultado do PORTÃO DE
//   ACESSO (a mesma regra que libera o app). Trial × pago pelo comprovante da Apple (oferta de
//   teste grátis) ou pelo `freeTrialStart` visto neste aparelho. Ver "Plano (portão de acesso)".
//   Vai como super property (segmenta qualquer evento) e no perfil.
// - Sem texto livre, foto ou URL: só metadados.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSuperwallStore } from 'expo-superwall';
import { comprovantesApple } from '../comprovanteApple';
import { supabase } from '../supabase';
import { useAcesso } from '../acesso';
import { useAppStore } from '../../store/onboarding';
import { aparelhoInterno, lerAparelhoInterno, marcarAparelhoInterno } from './aparelhoInterno';
import { definirInternoReplay } from './sessionReplay';
import { identifyFora, peopleSet, peopleSetOnce, peopleIncrement, planoInicialConhecido, superFora, trackFora } from './MixpanelProvider';

export type Plano = 'free' | 'trial' | 'pago' | 'convidada' | 'expirado';

const FIRST_OPEN_KEY = 'mx:first_open_em';

// ── Usuário interno (time do NIKS) ─────────────────────────────────────────────────────
// E-mails do time: as contas deles levam `usuario_interno: true` (super property e perfil),
// assim como QUALQUER build de desenvolvimento (__DEV__) e todo aparelho onde um desses e-mails
// já fez login (marca no Keychain — lib/mixpanel/aparelhoInterno.ts). Os relatórios filtram
// `usuario_interno = false` (docs/tracking-plan.md). Minúsculas. Entrou alguém no time,
// acrescente aqui (vale a partir da próxima build/OTA).
export const EMAILS_INTERNOS: readonly string[] = [
  'felipeesteves188@icloud.com',
  'niksteste1@gmail.com',
];

/** O e-mail é do time? (só a lista — a build e o aparelho ficam de fora) */
export function emailInterno(email: string | null | undefined): boolean {
  const e = (email ?? '').trim().toLowerCase();
  return !!e && EMAILS_INTERNOS.includes(e);
}

/** Build de desenvolvimento, aparelho do time (Keychain) ou e-mail do time. */
export function ehUsuarioInterno(email: string | null | undefined): boolean {
  return __DEV__ || aparelhoInterno() || emailInterno(email);
}

let ultimoInterno: boolean | null = null;
function publicarInterno(interno: boolean) {
  if (interno === ultimoInterno) return;
  ultimoInterno = interno;
  definirInternoReplay(interno); // Session Replay: interna grava 100%
  superFora({ usuario_interno: interno });
  peopleSet({ usuario_interno: interno });
}

/** Primeira abertura desta instalação: dispara `first_open` uma vez e guarda a data (first_seen). */
export async function registrarFirstOpen(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(FIRST_OPEN_KEY)) return;
    const agora = new Date().toISOString();
    await AsyncStorage.setItem(FIRST_OPEN_KEY, agora);
    trackFora('first_open');
    peopleSetOnce({ first_seen: agora });
  } catch {}
}

async function firstSeen(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(FIRST_OPEN_KEY)) ?? new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

let nomeLidoDe: string | null = null;

/** Sessão encontrada (abertura, login, cadastro, convidada): identify + dados da conta. */
export function identificarSessao(user: { id: string; email?: string | null } | null | undefined): void {
  if (!user?.id) return;
  contaLogada = true;
  identifyFora(user.id);
  // Login de um e-mail do time marca o aparelho (Keychain): dali em diante, até o onboarding
  // anônimo e as instalações novas neste aparelho saem como internos. A marca não sai no logout.
  if (emailInterno(user.email)) marcarAparelhoInterno();
  // Espera a leitura do Keychain: sem isso, um login logo na abertura publicaria `false` num
  // aparelho do time antes de a marca ser lida (e a fila mandaria esse `false` por último).
  void lerAparelhoInterno().then(() => publicarInterno(ehUsuarioInterno(user.email)));
  void (async () => {
    peopleSetOnce({ first_seen: await firstSeen() });
    if (user.email) peopleSet({ $email: user.email });
    // Nome: uma leitura por conta por abertura do app.
    if (nomeLidoDe === user.id) return;
    nomeLidoDe = user.id;
    try {
      const { data } = await supabase.from('users').select('nome').eq('id', user.id).maybeSingle();
      const nome = (data?.nome ?? '').trim();
      if (nome) peopleSet({ $name: nome });
    } catch {}
  })();
}

/** Nome mudou (cadastro, "Seu nome"): atualiza o perfil. */
export function atualizarNomePerfil(nome: string | null | undefined): void {
  const n = (nome ?? '').trim();
  if (n) peopleSet({ $name: n });
}

// ── Plano (portão de acesso) ──────────────────────────────────────────────────────────
// Fonte de verdade = a MESMA regra que libera o app (só lida aqui, nada muda no portão):
//   · `subscriptionVerified` (store) ou `useAcesso.estado === 'assinante'` → `trial` ou `pago`.
//     Ambos só viram "sim" depois do `confirmPremium` (Superwall → servidor → RevenueCat) ou de
//     uma compra/restauração confirmada no paywall/cadeado.
//   · `useAcesso.estado === 'convidada'` → `convidada`.
//   · `useAcesso.estado === 'sem_acesso'` → `expirado` se esta conta/aparelho já teve assinatura
//     (`mx:ja_assinou`), senão `free`.
//   · Portão ainda sem resposta: com conta logada, não publica (vale o plano gravado na sessão
//     anterior); sem conta (onboarding anônimo, não há portão), o status do Superwall decide.
// Trial × pago (só quando há acesso de assinante): comprovante da Apple com teste grátis válido
// (`lib/comprovanteApple`) ou `freeTrialStart`/compra com trial vista neste aparelho
// (`mx:trial_ate`). O Superwall não diz se é trial; ele só entra para o anônimo.
const TRIAL_ATE_KEY = 'mx:trial_ate';
const JA_ASSINOU_KEY = 'mx:ja_assinou';
let ultimoPlano: Plano | null = null;
let trialAte = 0;          // ms; fim do teste grátis conhecido
let jaAssinou = false;
let contaLogada = false;   // há sessão no Supabase (o portão vai responder)
let trialDoComprovante: boolean | null = null; // null = ainda não lido nesta sessão
let lendoComprovante = false;

function statusSuperwall(): 'ACTIVE' | 'INACTIVE' | 'UNKNOWN' {
  const st = useSuperwallStore.getState().subscriptionStatus?.status;
  return st === 'ACTIVE' || st === 'INACTIVE' ? st : 'UNKNOWN';
}

/** Resultado do portão de acesso, ou null se ele ainda não respondeu nesta sessão. */
function estadoPortao(): 'assinante' | 'convidada' | 'sem_acesso' | null {
  if (useAppStore.getState().subscriptionVerified) return 'assinante';
  return useAcesso.getState().estado;
}

/** Tem acesso de assinante: trial ou pago? null = comprovante ainda sendo lido. */
function trialOuPago(): Plano | null {
  if (trialAte > Date.now()) return 'trial';
  if (trialDoComprovante === null) return null;
  return trialDoComprovante ? 'trial' : 'pago';
}

function calcularPlano(): Plano | null {
  const portao = estadoPortao();
  if (portao === 'assinante') return trialOuPago();
  if (portao === 'convidada') return 'convidada';
  if (portao === 'sem_acesso') return jaAssinou ? 'expirado' : 'free';
  if (contaLogada) return null; // o portão ainda vai responder
  const st = statusSuperwall();
  if (st === 'ACTIVE') return trialOuPago();
  if (st === 'INACTIVE') return jaAssinou ? 'expirado' : 'free';
  return null;
}

function marcarJaAssinou() {
  if (jaAssinou) return;
  jaAssinou = true;
  AsyncStorage.setItem(JA_ASSINOU_KEY, '1').catch(() => {});
}

/** Lê no comprovante da Apple se a assinatura ativa está no teste grátis (uma vez por sessão). */
function lerTrialDoComprovante() {
  if (lendoComprovante || trialDoComprovante !== null) return;
  lendoComprovante = true;
  void comprovantesApple()
    .then((jws) => {
      let trial = false;
      for (const token of jws) {
        try {
          const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          const t = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
          const ativa = !t.expiresDate || Number(t.expiresDate) > Date.now();
          // offerDiscountType (iOS 17.2+) = 'FREE_TRIAL'; antes, oferta de introdução (offerType 1) de preço 0.
          const gratis = t.offerDiscountType === 'FREE_TRIAL' || (Number(t.offerType) === 1 && Number(t.price ?? 0) === 0);
          if (ativa && gratis) trial = true;
        } catch { /* comprovante ilegível não conta */ }
      }
      trialDoComprovante = trial;
    })
    .catch(() => { trialDoComprovante = false; })
    .finally(() => { lendoComprovante = false; publicarPlano(); });
}

// Depois de uma compra/trial, o portão pode levar um tempo para virar "assinante"; nesse
// intervalo mandaria 'free' por cima. Até `forcadoAte`, só trial/pago substitui o forçado.
const FORCADO_MS = 10 * 60_000;
let forcadoAte = 0;

function publicarPlano() {
  const portao = estadoPortao();
  if (portao === 'assinante' || (portao === null && !contaLogada && statusSuperwall() === 'ACTIVE')) {
    marcarJaAssinou();
    lerTrialDoComprovante();
  }
  const plano = calcularPlano();
  if (!plano) return;
  if (Date.now() < forcadoAte && plano !== 'trial' && plano !== 'pago') return;
  if (plano === ultimoPlano) return;
  ultimoPlano = plano;
  if (__DEV__) console.log('[MIXPANEL] plano =', plano, '(portão:', portao, ')');
  planoInicialConhecido(plano); // a 1ª vez libera a fila do Mixpanel já com o plano
  superFora({ plano });
  peopleSet({ plano });
}

/** Compra/trial acabou de acontecer (Superwall): atualiza o plano na hora. `trialAteMs`: fim do teste. */
export function forcarPlano(plano: Plano, trialAteMs?: number | null): void {
  forcadoAte = Date.now() + FORCADO_MS;
  marcarJaAssinou();
  if (plano === 'trial') {
    trialAte = trialAteMs && trialAteMs > Date.now() ? trialAteMs : Date.now() + 3 * 86_400_000;
    AsyncStorage.setItem(TRIAL_ATE_KEY, String(trialAte)).catch(() => {});
  }
  if (plano === ultimoPlano) return;
  ultimoPlano = plano;
  superFora({ plano });
  peopleSet({ plano });
}

let planoLigado = false;
/** Liga o plano ao portão de acesso (e ao Superwall, só para o anônimo). Uma vez por abertura. */
export function ligarPlanoMixpanel(): void {
  if (planoLigado) return;
  planoLigado = true;
  void Promise.all([
    AsyncStorage.multiGet([TRIAL_ATE_KEY, JA_ASSINOU_KEY])
      .then((pares) => {
        const m = Object.fromEntries(pares);
        trialAte = Number(m[TRIAL_ATE_KEY] ?? 0) || 0;
        jaAssinou = m[JA_ASSINOU_KEY] === '1';
      })
      .catch(() => {}),
    supabase.auth.getSession()
      .then(({ data }) => { if (data.session) contaLogada = true; })
      .catch(() => {}),
  ]).finally(() => {
    publicarPlano();
    useAppStore.subscribe((st, antes) => {
      if (st.subscriptionVerified !== antes.subscriptionVerified) publicarPlano();
    });
    useAcesso.subscribe((st, antes) => {
      if (st.estado !== antes.estado) publicarPlano();
    });
    useSuperwallStore.subscribe((st, antes) => {
      if (st.subscriptionStatus !== antes.subscriptionStatus) publicarPlano();
    });
  });
}

/** Logout: o próximo plano é publicado de novo (o reset apagou a super property). */
export function esquecerPlano(): void {
  // O reset volta a super property ao valor base (__DEV__); o próximo identify decide de novo.
  ultimoInterno = null;
  ultimoPlano = null;
  contaLogada = false;
  forcadoAte = 0;
  trialDoComprovante = null; // outra conta pode estar em outra situação (o Apple ID é o mesmo)
  nomeLidoDe = null;
  ultimoNivelSeq = '';
}

// ── Pele, nível e sequência ───────────────────────────────────────────────────────────
/** Scan de rosto concluído DENTRO do app. */
export function perfilScanConcluido(skinScore: number | null | undefined, skinType: string | null | undefined): void {
  peopleIncrement('scans_total', 1);
  const props: Record<string, unknown> = {};
  if (typeof skinScore === 'number') props.skin_score_atual = skinScore;
  if (skinType) props.skin_type = skinType;
  if (Object.keys(props).length) peopleSet(props);
}

let ultimoNivelSeq = '';
/** Estado das cartas chegou: nível e sequência atuais (só manda quando muda). */
export function perfilNivelSequencia(nivel: number | null | undefined, sequencia: number | null | undefined): void {
  const chave = `${nivel ?? ''}|${sequencia ?? ''}`;
  if (chave === ultimoNivelSeq) return;
  ultimoNivelSeq = chave;
  const props: Record<string, unknown> = {};
  if (typeof nivel === 'number') props.nivel = nivel;
  if (typeof sequencia === 'number') props.sequencia_atual = sequencia;
  if (Object.keys(props).length) peopleSet(props);
}

/** Fim do onboarding (uma vez por conta: set_once). */
export function perfilOnboardingConcluido(): void {
  peopleSetOnce({ onboarding_concluido_em: new Date().toISOString() });
}
