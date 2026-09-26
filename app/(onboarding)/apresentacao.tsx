import { useRef, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
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
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Screen2, Screen3, Screen4, Screen5 } from '../../components/onboarding/welcomeSlides';
import { useAppStore } from '../../store/onboarding';
import { OB_STEPS, obStep } from '../../components/onboarding/kit';

const WHITE = '#FFFFFF';

// Telas de apresentação 2–5 (glow up / expert / produtos / espelho), agora mostradas
// DEPOIS da criação de conta (dentro do app). Sem o link "Já tem conta? Entrar" — não
// se passa `onLogin` aos slides. Última tela ("Vamos lá") → HOME (a antiga tela de
// notificações pós-cadastro saiu do fluxo: a permissão agora é pedida antes do
// cadastro, na tela 13b). Os slides
// vivem em `components/onboarding/welcomeSlides.tsx` (fonte única, com `app/index.tsx`).
export default function Apresentacao() {
  const router = useRouter();
  const [activeScreen, setActiveScreen] = useState(0);
  const { track } = useMixpanel();
  const armHomeTutorial = useAppStore((s) => s.armHomeTutorial);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold,
    Nunito_700Bold,
    Nunito_600SemiBold,
    Nunito_400Regular,
  });
  const fXBold = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold  = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const fSemi  = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const fReg   = fontsLoaded ? 'Nunito_400Regular' : undefined;

  const goToNext = (index: number) => {
    if (index < 3) {
      setActiveScreen(index + 1);
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      track('onboarding_step_completed', obStep(OB_STEPS.apresentacao, 'Apresentação'));
      // ÚNICO ponto em que uma usuária NOVA entra no app (as outras rotas para a
      // home — login, paywall de reengajamento, `index` com sessão — são de conta
      // já existente). É por isso que o tutorial de primeiro acesso é armado AQUI
      // (morava na antiga `notifications.tsx`, que saiu do fluxo): quem atualiza o
      // app ou loga numa conta antiga nunca passa por esta linha. Conta existente
      // que refaz o onboarding também passa, e quem barra é o servidor
      // (`users.home_tutorial_seen_at`). Ver "Feature: Tutorial de primeiro acesso".
      armHomeTutorial();
      router.replace('/(app)/home');
    }
  };

  const base = {
    w: width,
    h: height,
    topInset: insets.top,
    bottomInset: insets.bottom,
    fXBold,
    fBold,
    fSemi,
    fReg,
    // sem onLogin → sem link "Já tem conta? Entrar" (já criou a conta)
  };

  const screens = [
    <Screen2 key="s2" {...base} activeDot={0} isActive={activeScreen === 0} onNext={() => goToNext(0)} />,
    <Screen3 key="s3" {...base} activeDot={1} isActive={activeScreen === 1} onNext={() => goToNext(1)} />,
    <Screen4 key="s4" {...base} activeDot={2} isActive={activeScreen === 2} onNext={() => goToNext(2)} />,
    <Screen5 key="s5" {...base} activeDot={3} isActive={activeScreen === 3} onNext={() => goToNext(3)} />,
  ];

  return (
    <>
      <Stack.Screen options={{ contentStyle: { backgroundColor: WHITE } }} />
      <StatusBar style="dark" />
      <FlatList
        ref={listRef}
        data={screens}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => item}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: WHITE }}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />
    </>
  );
}
