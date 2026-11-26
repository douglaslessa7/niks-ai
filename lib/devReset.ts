// SÓ DESENVOLVIMENTO (__DEV__): deixa este iPhone "virgem" para testar onboarding, paywall e
// compra sandbox sem apagar o app. Em Release nada aqui é registrado nem roda.
//
// Como usar (qualquer um): menu de desenvolvedor (chacoalhar o iPhone) → "NIKS: zerar aparelho
// (teste)"; link `niks-ai://dev-zerar-aparelho`; pelo depurador do Metro,
// `globalThis.__niksZerarAparelho()`; ou, do Mac, um arquivo `Documents/niks-dev-zerar` no
// container do app (`xcrun devicectl device copy to … --domain-type appDataContainer`) — na
// próxima abertura o app apaga o arquivo e zera.
//
// Atalho do paywall: `Documents/niks-dev-paywall` → zera (igual acima), recarrega e abre
// `(onboarding)/paywall-soft` como anônima nova — a mesma tela/placement (`paywall_onboarding`)
// que o fim do onboarding abre. Entre o zerar e o reload fica `niks-dev-paywall-ir` (sobrevive
// ao AsyncStorage.clear), que a abertura seguinte consome antes de navegar.
//
// Zera: sessão do Supabase (local), RevenueCat (anônimo NOVO), Superwall (reset → appUserId
// anônimo novo), Mixpanel (reset → distinct_id anônimo novo), lembretes, store e TODO o
// AsyncStorage (onboarding, `mx:*`, acesso/convidada, Paywallo, cupom, tutoriais). Depois recarrega.
// NÃO mexe: na marca `niks_aparelho_interno` (Keychain/SecureStore — continua interno), no
// Apple ID/conta sandbox (assinatura de teste ativa nela continua valendo) e no portão de acesso.
import { Alert, DevSettings } from 'react-native';
import { router } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import { useSuperwallStore } from 'expo-superwall';
import { supabase } from './supabase';
import { resetMixpanelFora } from './mixpanel/MixpanelProvider';
import { mixpanel } from './mixpanel/mixpanelClient';
import { esquecerPlano } from './mixpanel/perfil';
import { esquecerIdentidadeSuperwall } from './mixpanel/superwallIdentidade';

function comTeto<T>(p: Promise<T>, ms = 5000): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export async function zerarAparelhoDev(): Promise<string> {
  if (!__DEV__) return 'só em desenvolvimento';
  const passos: string[] = [];
  try { await supabase.auth.signOut({ scope: 'local' }); passos.push('supabase'); } catch {}
  // RevenueCat: `logOut` só funciona identificado — anônimo passa antes por um id descartável.
  try {
    if (await comTeto(Purchases.isAnonymous())) await comTeto(Purchases.logIn(`devreset-${Date.now()}`));
    await comTeto(Purchases.logOut());
    passos.push('revenuecat');
  } catch {}
  try {
    esquecerIdentidadeSuperwall();
    await comTeto(useSuperwallStore.getState().reset());
    passos.push('superwall');
  } catch {}
  try {
    esquecerPlano();
    resetMixpanelFora();
    passos.push('mixpanel');
  } catch {}
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
  try { await AsyncStorage.clear(); passos.push('asyncstorage'); } catch {}
  try { mixpanel.flush(); } catch {}
  console.log('[DEV-RESET] zerado:', passos.join(', '));
  setTimeout(() => DevSettings.reload(), 800);
  return passos.join(', ');
}

// ── Forçar paywall (SÓ __DEV__) ──────────────────────────────────────────────────────
// Flag em arquivo (`Documents/niks-dev-forcar-paywall`): sobrevive ao zerar (que só limpa o
// AsyncStorage). Ligada, o `paywall-soft` pula a pergunta "Você já tem uma assinatura" e
// apresenta o placement de sempre — útil num iPhone cujo Apple ID tem assinatura REAL.
// Em Release `forcarPaywallDev()` é sempre false: a regra de produção não muda.
const FORCAR_PAYWALL = 'niks-dev-forcar-paywall';

export function forcarPaywallDev(): boolean {
  if (!__DEV__) return false;
  try { return new File(Paths.document, FORCAR_PAYWALL).exists; } catch { return false; }
}

function alternarForcarPaywall(): void {
  try {
    const f = new File(Paths.document, FORCAR_PAYWALL);
    if (f.exists) f.delete(); else f.create({ overwrite: true });
    const ligado = f.exists;
    console.log('[DEV-PAYWALL] forçar paywall:', ligado ? 'LIGADO' : 'desligado');
    Alert.alert('NIKS (dev)', `Forçar paywall: ${ligado ? 'LIGADO' : 'desligado'}`);
  } catch {}
}

// ── Ficar no onboarding com conta (SÓ __DEV__) ───────────────────────────────────────
// Flag em arquivo (`Documents/niks-dev-ficar-onboarding`): com ela, o `(onboarding)/_layout` não
// manda a assinante logada para a home — dá para abrir as telas pós-compra (ex.: `bv-entrou`)
// sem sair da conta. Em Release é sempre false.
export function ficarNoOnboardingDev(): boolean {
  if (!__DEV__) return false;
  try { return new File(Paths.document, 'niks-dev-ficar-onboarding').exists; } catch { return false; }
}

// ── Fluxo pós-compra v2 (SÓ __DEV__, branch feature/fluxo-pos-compra-v2) ────────────
// Flag em arquivo (`Documents/niks-dev-pos-compra-v2`), como as de cima. Ligada, a compra
// confirmada no paywall (e o atalho de dev que pula o paywall) abre `pc-boas-vindas` em vez de
// `bv-entrou` — ver lib/posCompraV2.ts. "Abrir pós-compra v2" abre a 1ª tela direto, sem
// passar pelo onboarding (sem foto do scan: a rotina não é pré-gerada). Em Release é sempre false.
const POS_COMPRA_V2 = 'niks-dev-pos-compra-v2';

export function posCompraV2Dev(): boolean {
  if (!__DEV__) return false;
  try { return new File(Paths.document, POS_COMPRA_V2).exists; } catch { return false; }
}

function alternarPosCompraV2(): void {
  try {
    const f = new File(Paths.document, POS_COMPRA_V2);
    if (f.exists) f.delete(); else f.create({ overwrite: true });
    const ligado = f.exists;
    console.log('[DEV-POS-COMPRA-V2]', ligado ? 'LIGADO' : 'desligado');
    Alert.alert('NIKS (dev)', `Pós-compra v2: ${ligado ? 'LIGADO' : 'desligado'}`);
  } catch {}
}

if (__DEV__) {
  (globalThis as any).__niksZerarAparelho = zerarAparelhoDev;
  try { DevSettings.addMenuItem('NIKS: pós-compra v2 (liga/desliga)', alternarPosCompraV2); } catch {}
  try { DevSettings.addMenuItem('NIKS: abrir pós-compra v2', () => { router.push('/(onboarding)/pc-boas-vindas' as any); }); } catch {}
  try { DevSettings.addMenuItem('NIKS: forçar paywall (liga/desliga)', alternarForcarPaywall); } catch {}
  try { DevSettings.addMenuItem('NIKS: zerar aparelho (teste)', () => { void zerarAparelhoDev(); }); } catch {}
  try {
    const marca = new File(Paths.document, 'niks-dev-zerar');
    if (marca.exists) {
      marca.delete(); // antes de zerar: o reload não entra em laço
      console.log('[DEV-RESET] marca encontrada, zerando em 5 s');
      setTimeout(() => { void zerarAparelhoDev(); }, 5000);
    }
  } catch {}
  try {
    const paywall = new File(Paths.document, 'niks-dev-paywall');
    const pedido = paywall.exists;
    if (pedido) {
      paywall.delete();
      new File(Paths.document, 'niks-dev-paywall-ir').create({ overwrite: true });
      console.log('[DEV-PAYWALL] zerando; depois do reload abre o paywall');
      setTimeout(() => { void zerarAparelhoDev(); }, 5000);
    }
    const ir = new File(Paths.document, 'niks-dev-paywall-ir');
    if (!pedido && ir.exists) {
      ir.delete();
      // Espera a navegação montar (splash + index) e abre o paywall como no fim do onboarding.
      let tentativas = 0;
      const abrir = () => {
        try {
          router.replace('/(onboarding)/paywall-soft' as any);
          console.log('[DEV-PAYWALL] paywall-soft aberto');
        } catch {
          if (++tentativas < 15) setTimeout(abrir, 1000);
        }
      };
      setTimeout(abrir, 6000);
    }
  } catch {}
}
