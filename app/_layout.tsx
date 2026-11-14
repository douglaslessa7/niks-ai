import '../global.css';
import MedidorFps from '../components/debug/MedidorFps'; // TEMP-FPS
import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { store } from 'expo-router/build/global-state/router-store';
import { vigiarPilha } from '../lib/navegar';
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
import { MixpanelProvider, trackFora, useMixpanel } from '../lib/mixpanel/MixpanelProvider';
import { useScreenTracking } from '../lib/mixpanel/useScreenTracking';
import { ShareIntentProvider } from 'expo-share-intent';
import { ShareIntentBridge } from '../components/share/ShareIntentBridge';
import * as SplashScreen from 'expo-splash-screen';
import SplashOverlay from '../components/SplashOverlay';
import PaywallDiagnostico from '../components/debug/PaywallDiagnostico';
import BarraPontosHost from '../components/cartas/BarraPontosHost';
import GuiaHost from '../components/coach/GuiaHost';

// Segura a splash NATIVA até a cópia JS (SplashOverlay) desenhar o 1º quadro —
// é ela quem esconde a nativa, sem fade (as duas são idênticas). Precisa rodar no
// carregamento do módulo, antes do 1º render.
SplashScreen.preventAutoHideAsync().catch(() => {});
import {
  armSuppressReapresentar,
  canShowDownsell,
  markDownsellShown,
  requestDownsell,
} from '../lib/paywallFlow';

// Telas de (scan) e (onboarding) SEM o gesto de voltar da borda (10/nov/2026). Cada uma já
// desliga o próprio gesto (no arquivo ou no `_layout` do grupo); esta lista cobre o caso de ela
// ser a única tela da pilha do grupo — ver o `(scan)`/`(onboarding)` no <Stack> abaixo.
// ⚠️ Tela nova sem gesto: desligue no grupo E ponha aqui.
const TELAS_SEM_GESTO = new Set([
  // (scan)
  'camera', 'analisando-foto', 'resultado-scan', 'results', 'share-product-loading',
  'solucao', 'seu-caminho', 'personalizar', 'demo-transicao',
  'product-loading', 'loading-dentro-app', 'loading', 'sos-loading', 'lote-montando',
  'product-result', 'lote-resultado', 'lote-revisao', 'sos-resultado',
  'pergunta', // só a 1ª desliga o gesto; as outras nunca ficam sozinhas na pilha do grupo
  // (onboarding)
  'abertura', 'ola', 'seus-dados', 'compromisso', 'idade-pele', 'loading-rotina',
  'permitir-notificacoes', 'rotina-pronta', 'rotina-pronta-v2', 'transicao-rotina',
  'paywall-soft', 'signup',
  'bv-entrou', 'bv-rotina', 'bv-foto', 'bv-projecao', 'bv-pacto', 'bv-recompensa', 'bv-sequencia', 'bv-nivel',
]);
/** O `(onboarding)` está na pilha raiz (o scan aberto é o do onboarding)? */
function sobreOnboarding(navigation: { getState?: () => { routes?: { name: string }[] } | undefined }): boolean {
  try {
    return Boolean(navigation.getState?.()?.routes?.some((r) => r.name === '(onboarding)'));
  } catch {
    return false;
  }
}
/** Nome da tela aberta dentro de um grupo (a rota do grupo na pilha raiz). */
function telaAberta(route: { state?: { index?: number; routes?: { name: string }[] }; params?: object }): string | undefined {
  const st = route.state;
  if (st?.routes && typeof st.index === 'number') return st.routes[st.index]?.name;
  return (route.params as { screen?: string } | undefined)?.screen;
}

const PAYWALLO_CONFIG = {
  appKey: process.env.EXPO_PUBLIC_PAYWALLO_APP_KEY ?? '',
  appVersion: Application.nativeApplicationVersion ?? undefined,
  debug: __DEV__,
  environment: __DEV__ ? ('Sandbox' as const) : ('Production' as const),
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
      if (error?.userCancelled) {
        // ⚠️ HOJE ESTE BLOCO NÃO RODA — o controller inteiro está INATIVO. O
        // SuperwallProvider do expo-superwall só liga `manualPurchaseManagement`
        // se o CustomPurchaseControllerProvider estiver ACIMA dele na árvore; aqui
        // ele está abaixo, então o SDK sobrescreve o `true` das options com `false`
        // e o Superwall compra direto pela StoreKit, sem chamar este onPurchase.
        // O downsell no cancelamento vem do evento `transactionAbandon`, em
        // `(onboarding)/paywall-soft.tsx`. Mantido para quando os providers forem
        // invertidos (pendência no README, seção 15) — o flag de canShowDownsell
        // impede disparo duplo entre os dois caminhos.
        //
        // Cancelou a folha de pagamento da Apple. É o mesmo momento de desistência
        // que o placement `transaction_abandon` do Superwall cobriria — só que ele
        // é pago, então detectamos aqui. Mesmo molde do botão de cupom: arma a
        // supressão (senão o onDismiss reapresentaria o paywall normal por cima),
        // fecha o paywall e pede o downsell — que a paywall-soft registra com os
        // callbacks de fail closed.
        //
        // Se o downsell JÁ apareceu nesta sessão (inclusive se o cancelamento foi
        // DENTRO dele), nada disso roda: ela segue no paywall, como antes.
        if (canShowDownsell()) {
          markDownsellShown();
          armSuppressReapresentar();
          try { await Superwall.shared.dismiss(); } catch {}
          requestDownsell();
        }
        return { type: 'cancelled' };
      }
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

  // Rede de segurança da "folha com vão em cima" (lib/navegar, 12/nov/2026): se uma 2ª cópia do
  // app for empilhada por cima da carta, conserta na hora e mede quantas vezes isso acontece.
  useEffect(() => {
    let parar = () => {};
    let tentativas = 0;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ligar = () => {
      if (!store.navigationRef.current) {
        if (tentativas++ < 40) t = setTimeout(ligar, 250);   // a navegação ainda não montou
        return;
      }
      parar = vigiarPilha((telas) => trackFora('nav_folha_reparada', { telas: telas.join(',') }));
    };
    ligar();
    return () => { if (t) clearTimeout(t); parar(); };
  }, []);

  return (
    <>
      <ShareIntentBridge />
      {children}
    </>
  );
}

// Rede de proteção: um erro ao desenhar qualquer tela cai aqui, em vez de fechar o app ou
// deixar a tela branca. O Expo Router envolve a rota com este componente, FORA dos providers
// (sem SafeArea, tema ou store): por isso usa só componentes básicos do React Native.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => {
    console.error('[ErrorBoundary] erro de tela:', error);
    try {
      trackFora('erro_tela', { nome: error?.name ?? 'Error', mensagem: String(error?.message ?? '').slice(0, 200) });
    } catch {}
  }, [error]);

  return (
    <View style={erroStyles.tela}>
      <Text style={erroStyles.titulo} accessibilityRole="header">Algo deu errado</Text>
      <Pressable onPress={() => { void retry(); }} style={erroStyles.botao} accessibilityRole="button" accessibilityLabel="Tentar de novo">
        <Text style={erroStyles.botaoTexto}>Tentar de novo</Text>
      </Pressable>
    </View>
  );
}

const erroStyles = StyleSheet.create({
  tela: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24, backgroundColor: '#F9F2F5' },
  titulo: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: '#121212', textAlign: 'center' },
  botao: { height: 52, paddingHorizontal: 32, borderRadius: 100, backgroundColor: '#FF5EA8', justifyContent: 'center' },
  botaoTexto: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: '#FFFFFF' },
});

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
  // ⚠️ A SplashOverlay é SEMPRE o último filho do fragmento — antes e depois do
  // ATT resolver — para NÃO remontar (o mínimo de 1 s e o fade são dela).
  if (!attResolved) return <>{null}<SplashOverlay /></>;

  return (
    <>
    {/* ShareIntentProvider por fora de tudo (exigência do expo-share-intent).
        `scheme` explícito: o app tem vários CFBundleURLSchemes (Google Sign-In etc.). */}
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
                    {/* Quando a tela aberta é a ÚNICA da pilha do grupo (ex.: o loading que substituiu
                        a câmera), quem decide o gesto de voltar é ESTA pilha, não a do grupo: sem isto,
                        arrastar a borda fecharia o scan inteiro no meio da análise (10/nov/2026). */}
                    {/* Onboarding SEM gesto de voltar (12/nov/2026, pedido do produto): arrastar a borda
                        tirava da pilha o GRUPO inteiro e a pessoa voltava quase o onboarding todo. No
                        onboarding só a setinha volta, e só uma tela. O `(scan)` também fica sem gesto
                        quando está por cima do onboarding (scan-prep, carta, personalização, demo). */}
                    <Stack.Screen name="(scan)" options={({ route, navigation }) => ({ gestureEnabled: !TELAS_SEM_GESTO.has(telaAberta(route) ?? '') && !sobreOnboarding(navigation) })} />
                    <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
                    {/* Carta de raspar: abre POR CIMA do app (o app desfocado fica atrás) */}
                    <Stack.Screen
                      name="(carta)"
                      options={{ presentation: 'transparentModal', animation: 'none', gestureEnabled: false, contentStyle: { backgroundColor: 'transparent' } }}
                    />
                  </Stack>
                </AppShell>
                {/* Diagnóstico do paywall: `null` a menos que ligado pelo link secreto
                    (lib/paywallDebug.ts). Por cima de todas as telas. */}
                <PaywallDiagnostico />
                {/* Dicas dos desafios do primeiro acesso: passam pelas telas de scan, fora do (app). */}
                <GuiaHost />
                {/* Barra de nível no topo para os NIKS Points ganhos sem carta (regras novas). */}
                <BarraPontosHost />
                {(__DEV__ || process.env.EXPO_PUBLIC_MEDIR_FPS === '1') && <MedidorFps />}{/* TEMP-FPS */}
              </SafeAreaProvider>
            </GestureHandlerRootView>
          </CustomPurchaseControllerProvider>
        </SuperwallProvider>
      </MixpanelProvider>
    </PaywalloProvider>
    </ShareIntentProvider>
    <SplashOverlay />
    </>
  );
}
