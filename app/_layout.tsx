import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initRevenueCat, loginRevenueCat } from '../lib/revenuecat';
import { supabase } from '../lib/supabase';

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

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
