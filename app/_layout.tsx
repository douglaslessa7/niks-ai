import '../global.css';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaywalloProvider } from '@virex-tech/paywallo-sdk';
import * as Application from 'expo-application';
import * as TrackingTransparency from 'expo-tracking-transparency';
import { initRevenueCat, loginRevenueCat, matchesProduct, ENTITLEMENT_ID } from '../lib/revenuecat';
import { supabase } from '../lib/supabase';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { SuperwallProvider, CustomPurchaseControllerProvider } from 'expo-superwall';
import type { PurchaseResult, RestoreResult } from 'expo-superwall';
import Superwall from 'expo-superwall/compat';
import Purchases from 'react-native-purchases';
import { MixpanelProvider, useMixpanel } from '../lib/mixpanel/MixpanelProvider';
import { useScreenTracking } from '../lib/mixpanel/useScreenTracking';
import { ShareIntentProvider } from 'expo-share-intent';
import { ShareIntentBridge } from '../components/share/ShareIntentBridge';

const PAYWALLO_CONFIG = {
  appKey: process.env.EXPO_PUBLIC_PAYWALLO_APP_KEY ?? '',
  appVersion: Application.nativeApplicationVersion ?? undefined,
  debug: __DEV__,
  environment: 'Production' as const,
  skan: true,
};

/**
 * Resolve o prompt de ATT antes de montar o PaywalloProvider.
 *
 * O SDK do Paywallo não pede esse prompt sozinho — se ele inicializar com o ATT
 * ainda indefinido, o iOS não entrega o IDFA e a atribuição do install degrada
 * (sem madid no CAPI). Por isso a árvore de render inteira fica atrás deste gate.
 *
 * O prompt só aparece com o app em foreground: chamado durante um cold start
 * ainda inativo, o iOS retorna `undetermined` na hora sem mostrar nada — que é
 * exatamente a falha silenciosa que o gate existe para evitar. Daí a espera pelo
 * primeiro estado `active`.
 */
function useAttResolved(): boolean {
  const [attResolved, setAttResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const whenActive = () =>
      new Promise<void>((resolve) => {
        if (AppState.currentState === 'active') return resolve();
        const sub = AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            sub.remove();
            resolve();
          }
        });
      });

    (async () => {
      if (Platform.OS === 'ios') {
        try {
          await whenActive();
          await TrackingTransparency.requestTrackingPermissionsAsync();
        } catch (error) {
          // Recusa do usuário, prompt indisponível ou erro do módulo nativo não
          // podem travar o boot — segue sem IDFA, que é degradação aceitável.
          console.warn('[att] Falha ao resolver o prompt de tracking:', error);
        }
      }
      // Android não tem ATT: libera direto, sem pedir nada.
      if (!cancelled) setAttResolved(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return attResolved;
}

// Cada plataforma tem seu próprio app no dashboard do Superwall, com chave
// própria. Passar só a do iOS deixaria o SDK sem configuração no Android e
// nenhum paywall abriria lá.
const superwallKey = (value: string | undefined) =>
  value?.startsWith('pk_') ? value : '';

const SUPERWALL_API_KEYS = {
  ios: superwallKey(process.env.EXPO_PUBLIC_SUPERWALL_IOS_KEY) || 'pk_4iUsZwW_-ME9WdK3IcXYp',
  android: superwallKey(process.env.EXPO_PUBLIC_SUPERWALL_ANDROID_KEY),
};

// Delega compras e restaurações do Superwall para o RevenueCat.
// Sem este controller, o Superwall processa via StoreKit direto e o RevenueCat
// não sabe da compra — getCustomerInfo() retorna "não assinante" e o paywall volta.
const superwallPurchaseController = {
  onPurchase: async ({ productId }: { productId: string }): Promise<PurchaseResult> => {
    try {
      // Procura o produto em TODAS as offerings do projeto, não só na atual.
      // Produtos de cupom (ex.: o anual com desconto da offering `promo10`) vivem
      // numa offering que NÃO é a default. Limitar a busca a `offerings.current`
      // faria a compra desses produtos falhar em silêncio: o Superwall entenderia
      // que falhou, o RevenueCat nunca seria notificado, e a usuária cairia em loop
      // de paywall depois de já ter pago.
      const offerings = await Purchases.getOfferings();
      const allPackages = Object.values(offerings.all).flatMap((o) => o.availablePackages);
      const pkg = allPackages.find((p) => matchesProduct(p.product.identifier, productId));
      if (!pkg) {
        // Só chega aqui se o produto não existe em NENHUMA offering — falha real de
        // configuração no RevenueCat. Loga o cenário completo para não falhar às cegas.
        console.error(
          `[purchase] Produto "${productId}" não encontrado em nenhuma offering do RevenueCat. ` +
          `Offerings existentes: ${Object.keys(offerings.all).join(', ') || '(nenhuma)'}. ` +
          `Produtos por offering: ${
            Object.values(offerings.all)
              .map((o) => `${o.identifier}[${o.availablePackages.map((p) => p.product.identifier).join(', ')}]`)
              .join(' · ') || '(nenhum)'
          }`
        );
        return { type: 'failed', error: `Produto ${productId} não encontrado em nenhuma offering` };
      }
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
      return active ? { type: 'purchased' } : { type: 'failed', error: 'Entitlement não ativo' };
    } catch (error: any) {
      if (error?.userCancelled) return { type: 'cancelled' };
      return { type: 'failed', error: error?.message ?? 'Erro na compra' };
    }
  },
  onPurchaseRestore: async (): Promise<RestoreResult> => {
    try {
      const customerInfo = await Purchases.restorePurchases();
      const active = typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
      return active ? { type: 'restored' } : { type: 'failed', error: 'Nenhuma compra para restaurar' };
    } catch (error: any) {
      return { type: 'failed', error: error?.message ?? 'Erro ao restaurar' };
    }
  },
};

function AppShell({ children }: { children: React.ReactNode }) {
  const { track } = useMixpanel();
  useScreenTracking();

  useEffect(() => {
    track('app_opened');
  }, []);

  return (
    <>
      <ShareIntentBridge />
      {children}
    </>
  );
}

export default function RootLayout() {
  const attResolved = useAttResolved();

  useEffect(() => {
    Superwall.shared.preloadAllPaywalls();
  }, []);

  useEffect(() => {
    initRevenueCat();

    // Associa o usuário Supabase ao RevenueCat para rastrear compras por conta
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loginRevenueCat(session.user.id).catch(() => {});
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) loginRevenueCat(session.user.id).catch(() => {});
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleAuthUrl = async (url: string) => {
      const hasCode = url.includes('code=');
      const hasAccessToken = url.includes('access_token=');

      if (!url.includes('auth/confirm') && !hasCode && !hasAccessToken) return;

      try {
        if (hasCode) {
          // Fluxo PKCE
          const { error } = await supabase.auth.exchangeCodeForSession(url);
          if (error) console.error('Erro ao confirmar e-mail (PKCE):', error.message);
        } else if (hasAccessToken) {
          // Fluxo token-based — tokens no fragmento (#)
          const fragment = url.includes('#') ? url.split('#')[1] : url.split('?')[1];
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) console.error('Erro ao setar sessão:', error.message);
          }
        }
        // O onAuthStateChange existente detecta a sessão e redireciona automaticamente
      } catch (err) {
        console.error('Erro ao processar deep link de autenticação:', err);
      }
    };

    // MESMA condição de auth usada dentro do handleAuthUrl (a negação do return de
    // guarda ali em cima). É a fronteira única entre os dois fluxos: se for auth, vai
    // SÓ para o handleAuthUrl (inalterado); senão, vai SÓ para o Superwall. Um nunca
    // rouba o link do outro.
    const isAuthUrl = (url: string) =>
      url.includes('auth/confirm') || url.includes('code=') || url.includes('access_token=');

    // Despachante: NÃO altera o tratamento de auth — só decide quem recebe a URL.
    const handleDeepLink = (url: string) => {
      // Link da Share Extension ("Compartilhar com o NIKS") — tratado pelo
      // ShareIntentProvider/ShareIntentBridge; não é auth nem Superwall.
      if (url.includes('dataUrl=')) return;
      if (isAuthUrl(url)) {
        // Link de autenticação do Supabase → fluxo de auth, exatamente como hoje.
        handleAuthUrl(url);
        return;
      }
      // Só o que NÃO é auth vai para o Superwall (ex.: preview de paywall por QR code).
      // Defensivo: qualquer falha aqui é isolada e nunca afeta o fluxo de auth.
      try {
        Superwall.shared.handleDeepLink(url).catch(() => {});
      } catch {
        // SDK ainda não configurado / indisponível — ignora.
      }
    };

    // App estava fechado e foi aberto pelo link (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // App estava em background ou foreground e recebeu o link
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => subscription.remove();
  }, []);

  // Segura a árvore inteira até o ATT estar resolvido — o PaywalloProvider não
  // pode montar antes disso. Todos os hooks acima já rodaram, então este early
  // return não altera a ordem de hooks entre renders.
  if (!attResolved) return null;

  return (
    // ShareIntentProvider por fora de tudo (exigência do expo-share-intent).
    // `scheme` explícito: o app tem vários CFBundleURLSchemes (Google Sign-In etc.).
    <ShareIntentProvider options={{ scheme: 'niks-ai', disabled: Platform.OS !== 'ios' }}>
    <PaywalloProvider config={PAYWALLO_CONFIG}>
      <MixpanelProvider>
        <SuperwallProvider
          apiKeys={SUPERWALL_API_KEYS}
          options={{ manualPurchaseManagement: true }}
        >
          <CustomPurchaseControllerProvider controller={superwallPurchaseController}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <SafeAreaProvider>
                <AppShell>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(app)" options={{ gestureEnabled: false }} />
                  </Stack>
                </AppShell>
              </SafeAreaProvider>
            </GestureHandlerRootView>
          </CustomPurchaseControllerProvider>
        </SuperwallProvider>
      </MixpanelProvider>
    </PaywalloProvider>
    </ShareIntentProvider>
  );
}
