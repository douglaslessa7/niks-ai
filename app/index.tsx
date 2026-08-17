import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
import {
  Nunito_800ExtraBold,
  Nunito_700Bold,
  Nunito_600SemiBold,
  Nunito_400Regular,
} from '@expo-google-fonts/nunito';
import { useRouter, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { useMixpanel } from '../lib/mixpanel/MixpanelProvider';
import { Screen1 } from '../components/onboarding/welcomeSlides';

const CORAL = '#FF9D9D';
const WHITE = '#FFFFFF';

// Ponto de entrada: SÓ a tela de boas-vindas ("Bem-vinda ao NIKS"). Deixou de ser o
// carrossel de 5 slides — os slides 2–5 foram para `(onboarding)/apresentacao.tsx`,
// mostrados DEPOIS da criação de conta. O link "Já tem conta? Entrar" fica só aqui.
// "Começar" → tela de nome ("Como você quer ser chamada?"), que agora vem antes das
// perguntas. Os slides vivem em `components/onboarding/welcomeSlides.tsx` (fonte única).
export default function Welcome() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const { track } = useMixpanel();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold,
    Nunito_700Bold,
    Nunito_600SemiBold,
    Nunito_400Regular,
  });
  // Aliases — fallback undefined evita flash de layout enquanto carrega
  const fXBold = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold  = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const fSemi  = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const fReg   = fontsLoaded ? 'Nunito_400Regular' : undefined;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session) {
          // Usuária logada — delega verificação de assinatura para (app)/_layout.tsx
          // (evita race condition: loginRevenueCat pode não ter completado ainda)
          router.replace('/(app)/home');
        } else {
          setChecking(false);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const goToName = () => {
    track('onboarding_step_completed', { step_number: 1, step_name: 'Tela Inicial', step_total: 23 });
    router.replace('/(onboarding)/nome');
  };

  const goToLogin = () => router.push('/(onboarding)/login');

  return (
    <>
      <Stack.Screen options={{ contentStyle: { backgroundColor: WHITE } }} />
      <StatusBar style="dark" />
      {checking ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={CORAL} />
        </View>
      ) : (
        <Screen1
          w={width}
          h={height}
          topInset={insets.top}
          bottomInset={insets.bottom}
          fXBold={fXBold}
          fBold={fBold}
          fSemi={fSemi}
          fReg={fReg}
          isActive
          onNext={goToName}
          onLogin={goToLogin}
        />
      )}
    </>
  );
}
