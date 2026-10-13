import { useEffect, useRef, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Screen2, Screen3, Screen4, Screen5 } from '../../components/onboarding/welcomeSlides';
import { OB, OB_STEPS, obStep } from '../../components/onboarding/kit';

const WHITE = OB.bg;

// ⚠️ FORA DO FLUXO (out/2026, a pedido do produto): nada navega para cá.
// Apresentação 2–5 (glow up / expert / produtos / escanear
// produto), mostrada DEPOIS da criação de conta, como na versão B. Sem o link "Já tem
// conta? Entrar" — não se passa `onLogin` aos slides. Última tela ("Começar") →
// notificações (tela 23), que arma o tutorial da home e entra no app. Os slides vivem
// em `components/onboarding/welcomeSlides.tsx` (fonte única, com `app/index.tsx`).
export default function Apresentacao() {
  const router = useRouter();
  const [activeScreen, setActiveScreen] = useState(0);
  const { track } = useMixpanel();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    track('onboarding_step_viewed', obStep(OB_STEPS.apresentacao, 'Apresentação'));
  }, []);

  const goToNext = (index: number) => {
    if (index < 3) {
      setActiveScreen(index + 1);
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      track('onboarding_step_completed', obStep(OB_STEPS.apresentacao, 'Apresentação'));
      router.replace('/(onboarding)/notifications');
    }
  };

  const base = {
    w: width,
    h: height,
    topInset: insets.top,
    bottomInset: insets.bottom,
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
