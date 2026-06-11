import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initRevenueCat, loginRevenueCat, ENTITLEMENT_ID } from '../lib/revenuecat';
import { supabase } from '../lib/supabase';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { SuperwallProvider, CustomPurchaseControllerProvider } from 'expo-superwall';
import type { PurchaseResult, RestoreResult } from 'expo-superwall';
import Superwall from 'expo-superwall/compat';
import Purchases from 'react-native-purchases';
import { MixpanelProvider, useMixpanel } from '../lib/mixpanel/MixpanelProvider';
import { useScreenTracking } from '../lib/mixpanel/useScreenTracking';

// Delega compras e restaurações do Superwall para o RevenueCat.
// Sem este controller, o Superwall processa via StoreKit direto e o RevenueCat
// não sabe da compra — getCustomerInfo() retorna "não assinante" e o paywall volta.
const superwallPurchaseController = {
  onPurchase: async ({ productId }: { productId: string }): Promise<PurchaseResult> => {
    try {
      const offerings = await Purchases.getOfferings();
      const packages = offerings.current?.availablePackages ?? [];
      const pkg = packages.find((p) => p.product.identifier === productId);
      if (!pkg) return { type: 'failed', error: 'Produto não encontrado' };
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

  return <>{children}</>;
}

export default function RootLayout() {
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

    // App estava fechado e foi aberto pelo link (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthUrl(url);
    });

    // App estava em background ou foreground e recebeu o link
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleAuthUrl(url);
    });

    return () => subscription.remove();
  }, []);

  return (
    <MixpanelProvider>
      <SuperwallProvider
        apiKeys={{ ios: 'pk_4iUsZwW_-ME9WdK3IcXYp' }}
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
  );
}
