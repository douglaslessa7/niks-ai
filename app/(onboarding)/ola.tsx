import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, NIKS_LOGO_PINK, useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 0.1 do fluxo completo — "Olá, eu sou a NIKS". Primeira tela depois da splash
// para quem não tem sessão (`app/index.tsx`). O design não tem botão: a logo entra
// (escala 0,8 → 1), o texto logo depois, e a tela segue sozinha para os dados (0.2).
// `replace`: não há para onde voltar daqui.
const HOLD_MS = 2000;
const STEP = OB_STEPS.ola;
const STEP_NAME = 'Olá';

export default function Ola() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y } = useObFrame();
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logo, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(text, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      track('onboarding_step_completed', obStep(STEP, STEP_NAME));
      router.replace('/(onboarding)/seus-dados');
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <ObScreen>
      <Stack.Screen options={{ animation: 'fade', gestureEnabled: false }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(310), alignItems: 'center', gap: 24 }}>
        <Animated.Image
          source={NIKS_LOGO_PINK}
          style={{
            width: 72, height: 73, opacity: logo,
            transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          }}
        />
        <Animated.View style={{ opacity: text }}>
          <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', color: OB.ink }}>
            {'Olá,\neu sou a NIKS'}
          </Text>
        </Animated.View>
      </View>
    </ObScreen>
  );
}
