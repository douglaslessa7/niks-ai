import '../global.css';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../lib/supabase';
import { initRevenueCat } from '../lib/revenuecat';

export default function RootLayout() {
  const router = useRouter();
  const [checkDone, setCheckDone] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    initRevenueCat();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHasSession(true);
      setCheckDone(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {});

    return () => subscription.unsubscribe();
  }, []);

  // Redireciona APÓS o Stack estar montado (segundo ciclo de render)
  useEffect(() => {
    if (checkDone && hasSession) {
      router.replace('/(app)/home');
    }
  }, [checkDone, hasSession]);

  // Mantém spinner enquanto verifica OU enquanto aguarda o redirect para home
  if (!checkDone || hasSession) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color="#FB7B6B" />
        </View>
      </GestureHandlerRootView>
    );
  }

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
