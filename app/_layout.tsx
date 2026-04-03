import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initRevenueCat, loginRevenueCat } from '../lib/revenuecat';
import { supabase } from '../lib/supabase';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';

export default function RootLayout() {
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(app)" options={{ gestureEnabled: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
