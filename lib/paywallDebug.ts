// Diagnóstico do paywall para TESTE no iPhone — funciona no TestFlight (não é __DEV__).
//
// No momento em que o app decide entre "paywall de novo" e "cadastro", o fluxo PARA e
// mostra o que o app viu: assinatura `premium` no RevenueCat (produto, validade, se é
// sandbox/TestFlight), o que o Superwall enxerga no Apple ID, se há sessão, e o
// caminho que levou à decisão. Só segue quando a pessoa toca em "Continuar". O
// histórico das últimas decisões fica salvo no aparelho.
//
// ⚠️ INVISÍVEL para as usuárias: desligado por padrão e só liga por um link secreto,
// `niks-ai://pwdiag-n1k5` (desliga com `niks-ai://pwdiag-n1k5-off`, ou pelo próprio
// painel). Nenhum botão, gesto ou tela leva até ele. Desligado, a única coisa que roda
// é uma leitura do AsyncStorage — as decisões nunca esperam.
//
// ⚠️ Só LÊ (`getCustomerInfo`, `getSubscriptionStatus`). Nunca restaura nem
// sincroniza compras: o diagnóstico não pode mudar o resultado que está medindo.
//
// Ver "Diagnóstico do paywall no TestFlight" no README.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesEntitlementInfo } from 'react-native-purchases';
// ⚠️ NÃO usar `Superwall.shared` (compat) para ler status ou zerar: o app configura o
// Superwall pelo `SuperwallProvider`, nunca pelo `configure` da compat, e os métodos
// da compat que fazem `awaitConfig()` (getSubscriptionStatus, reset, handleDeepLink,
// preloadAllPaywalls…) ficam esperando PARA SEMPRE. `dismiss()` não espera — por isso
// o resto do app funciona com ela.
import { SuperwallExpoModule, useSuperwallStore } from 'expo-superwall';
import type { SubscriptionStatus } from 'expo-superwall';
import { ENTITLEMENT_ID } from './revenuecat';
import { supabase } from './supabase';

/** Caminho do link secreto (`niks-ai://pwdiag-n1k5`). Mudou aqui, muda no README. */
export const PWDIAG_LINK = 'pwdiag-n1k5';

const FLAG_KEY = 'niks_pwdiag_on';
const LOG_KEY = 'niks_pwdiag_log';
const MAX_HISTORICO = 40;
const MAX_PASSOS = 30;
const TETO_MS = 4000;

export type Destino = 'paywall' | 'cadastro' | 'home' | 'parado';

export type Retrato = {
  em: string;
  sessao: string;
  rcId: string;
  rcAnonimo: string;
  premium: 'ATIVA' | 'não' | 'sem resposta';
  produto?: string;
  valeAte?: string;
  renova?: string;
  ambiente?: string;
  tipo?: string;
  compradaEm?: string;
  primeiraCompra?: string;
  cancelada?: string;
  jaTeve?: string;
  assinaturasAtivas: string;
  superwall: string;
};

export type Decisao = {
  id: number;
  gatilho: string;
  decisao: string;
  destino: Destino;
  explicacao?: string;
  caminho: string[];
  retrato: Retrato | null;
};

type Estado = { ligado: boolean; pendente: Decisao | null; historico: Decisao[] };

let estado: Estado = { ligado: false, pendente: null, historico: [] };
const ouvintes = new Set<() => void>();
let continuar: (() => void) | null = null;
let passos: string[] = [];

function emitir(parcial: Partial<Estado>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((f) => f());
}

export function assinarDiagnostico(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

export function estadoDiagnostico(): Estado {
  return estado;
}

let carregado: Promise<void> | null = null;
export function carregarDiagnostico(): Promise<void> {
  carregado ??= (async () => {
    try {
      const [on, log] = await Promise.all([AsyncStorage.getItem(FLAG_KEY), AsyncStorage.getItem(LOG_KEY)]);
      emitir({ ligado: on === '1', historico: log ? JSON.parse(log) : [] });
    } catch {
      // sem diagnóstico — nada muda no app
    }
  })();
  return carregado;
}

/** Chamado pelo `+native-intent` ao receber o link secreto. Nunca lança. */
export function ligarDiagnostico(ligar: boolean): void {
  emitir({ ligado: ligar });
  if (!ligar) soltarPendente();
  (ligar ? AsyncStorage.setItem(FLAG_KEY, '1') : AsyncStorage.removeItem(FLAG_KEY)).catch(() => {});
}

/** Um passo do caminho até a próxima decisão (os `[PWGUARD]` passam por aqui). */
export function registrarPasso(texto: string): void {
  if (!estado.ligado) return;
  passos = [...passos, `${hora(new Date())}  ${texto}`].slice(-MAX_PASSOS);
}

/**
 * Registra uma decisão do paywall/cadastro. Diagnóstico desligado → volta na hora.
 * Ligado → tira o retrato, mostra o painel e só resolve no "Continuar".
 */
export async function pwDecisao(
  gatilho: string,
  decisao: string,
  destino: Destino,
  explicacao?: string,
): Promise<void> {
  await carregarDiagnostico();
  if (!estado.ligado) return;
  const caminho = passos;
  passos = [];
  const retrato = await retratoAgora();
  const d: Decisao = { id: Date.now(), gatilho, decisao, destino, explicacao, caminho, retrato };
  const historico = [d, ...estado.historico].slice(0, MAX_HISTORICO);
  AsyncStorage.setItem(LOG_KEY, JSON.stringify(historico)).catch(() => {});
  soltarPendente();
  await new Promise<void>((resolve) => {
    continuar = resolve;
    emitir({ pendente: d, historico });
  });
}

/** Botão "Continuar" do painel: o app segue com a decisão. */
export function soltarPendente(): void {
  const c = continuar;
  continuar = null;
  if (estado.pendente) emitir({ pendente: null });
  c?.();
}

export function limparHistorico(): void {
  emitir({ historico: [] });
  AsyncStorage.removeItem(LOG_KEY).catch(() => {});
}

// ── Retrato: o que o app vê AGORA (só leitura) ──────────────────────────────

function comTeto<T>(p: Promise<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), TETO_MS);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

const dois = (n: number) => String(n).padStart(2, '0');
function hora(d: Date) {
  return `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}
function quando(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

function detalhes(e: PurchasesEntitlementInfo) {
  return {
    produto: e.productIdentifier,
    valeAte: e.expirationDate ? quando(e.expirationDate) : 'sem validade (vitalícia)',
    renova: e.willRenew ? 'sim' : 'não',
    ambiente: e.isSandbox ? 'SANDBOX (compra de teste: TestFlight/Xcode)' : 'PRODUÇÃO (compra real)',
    tipo: `${e.periodType}${e.store ? ` · ${e.store}` : ''}`,
    compradaEm: quando(e.latestPurchaseDate),
    primeiraCompra: quando(e.originalPurchaseDate),
    cancelada: e.unsubscribeDetectedAt ? `cancelada em ${quando(e.unsubscribeDetectedAt)}` : undefined,
  };
}

export async function retratoAgora(): Promise<Retrato> {
  const [sess, id, anon, info, sw] = await Promise.all([
    comTeto(supabase.auth.getSession()),
    comTeto(Purchases.getAppUserID()),
    comTeto(Purchases.isAnonymous()),
    comTeto<CustomerInfo>(Purchases.getCustomerInfo()),
    comTeto<SubscriptionStatus>(SuperwallExpoModule.getSubscriptionStatus()),
  ]);
  const ativo = info?.entitlements.active[ENTITLEMENT_ID];
  const qualquer = info?.entitlements.all[ENTITLEMENT_ID];
  const r: Retrato = {
    em: quando(new Date().toISOString()),
    sessao: sess == null ? 'sem resposta' : sess.data.session ? 'sim (já tem conta logada)' : 'não (usuária nova)',
    rcId: id ?? 'sem resposta',
    rcAnonimo: anon == null ? '?' : anon ? 'anônimo' : 'identificado',
    premium: info == null ? 'sem resposta' : ativo ? 'ATIVA' : 'não',
    assinaturasAtivas: info == null ? '—' : info.activeSubscriptions.join(', ') || 'nenhuma',
    superwall: !sw
      ? 'sem resposta'
      : String(sw.status).toUpperCase() === 'ACTIVE'
        ? `ATIVA no Apple ID (${('entitlements' in sw ? sw.entitlements : []).map((e) => e.id).join(', ') || '?'})`
        : String(sw.status).toUpperCase() === 'INACTIVE' ? 'sem assinatura no Apple ID' : `ainda não sabe (${sw.status})`,
  };
  if (ativo) Object.assign(r, detalhes(ativo));
  else if (qualquer) r.jaTeve = `teve ${qualquer.productIdentifier}, expirou em ${quando(qualquer.expirationDate)}`;
  return r;
}

// ── Zerar o aparelho (o que dá para zerar de dentro do app) ─────────────────

/**
 * Deixa o APP como recém-instalado: sai da conta, RevenueCat com um anônimo NOVO,
 * Superwall zerado, AsyncStorage limpo (consentimento, tutoriais, store, cache) e
 * lembretes cancelados — e reabre. O diagnóstico continua ligado.
 * ⚠️ Não mexe no Apple ID: uma assinatura de teste ativa nele continua valendo para
 * a Apple e para o Superwall (ver README).
 * Devolve uma mensagem só quando não conseguiu reabrir sozinho.
 */
export async function zerarComoNovaUsuaria(): Promise<string | null> {
  soltarPendente();
  try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
  // RevenueCat: anônimo NOVO. O `logOut` só existe para usuário identificado, então
  // um anônimo passa antes por um id descartável (`pwdiag-…`, só aparece no painel
  // do RevenueCat). Sem isso o anônimo antigo, que pode ter recebido a assinatura de
  // teste num sync, continuaria aparecendo como "premium" no diagnóstico.
  try {
    if (await comTeto(Purchases.isAnonymous())) {
      await comTeto(Purchases.logIn(`pwdiag-${Date.now()}`));
    }
    await comTeto(Purchases.logOut());
  } catch {}
  try { await comTeto(useSuperwallStore.getState().reset()); } catch {}
  try {
    const { cancelRoutineReminders } = await import('./routineReminders');
    await cancelRoutineReminders();
  } catch {}
  try {
    const { useAppStore } = await import('../store/onboarding');
    useAppStore.getState().reset();
    useAppStore.getState().clearHomeTutorialFlags();
    useAppStore.getState().setSubscriptionVerified(false);
  } catch {}
  const historico = estado.historico;
  try {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(FLAG_KEY, '1');
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(historico));
  } catch {}
  try {
    const Updates = await import('expo-updates');
    await Updates.reloadAsync();
    return null;
  } catch {
    return 'Tudo zerado. Feche o app (deslize para cima no seletor de apps) e abra de novo.';
  }
}

/** Folha nativa da Apple para cancelar a assinatura (de teste, no TestFlight). */
export async function abrirAssinaturasDaApple(): Promise<void> {
  try { await Purchases.showManageSubscriptions(); } catch {}
}
