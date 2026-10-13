import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, NIKS_LOGO_PINK,
  useObName, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 3 do onboarding (voltou a pedido do produto, entre o nome e a idade) — "Prazer,
// <nome>!", sem subtítulo (o "Em poucos minutos, vamos montar o plano perfeito para sua
// pele" saiu a pedido do produto, out/2026). Tela PURA (13/out/2026): sem voltar e sem
// botão — segue sozinha para a idade em `HOLD_MS` (`replace`: o voltar da idade cai no
// nome, não aqui). A logo entra com escala 0,8 → 1 e o texto logo depois.
const STEP = OB_STEPS.prazer;
const STEP_NAME = 'Prazer';
const HOLD_MS = 2300;

export default function Prazer() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logo, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(text, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      track('onboarding_step_completed', obStep(STEP, STEP_NAME));
      router.replace('/(onboarding)/birthday');
    }, HOLD_MS);
    return () => clearTimeout(id);
  }, []);

  return (
    <ObScreen>
      {/* Logo + "Prazer, <nome>!" centralizados na altura da tela (pedido do produto). */}
      <View style={{ position: 'absolute', left: 30, right: 30, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.Image
          source={NIKS_LOGO_PINK}
          style={{
            width: 72, height: 73, opacity: logo,
            transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          }}
        />
        <Animated.View style={{ opacity: text, alignItems: 'center' }}>
          <Text style={{ marginTop: 24, fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', color: OB.ink }}>
            {name ? `Prazer, ${name}!` : 'Prazer!'}
          </Text>
        </Animated.View>
      </View>
    </ObScreen>
  );
}
