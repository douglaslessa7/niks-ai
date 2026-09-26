import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { OB, ObScreen, useObFrame, useObName } from '../../components/onboarding/kit';

// PNG EXATO do design (`niks-logo-FF5EA8.png`, 196×199 — é o "04 - Cores do Niks
// score (chapada)/niks-logo-rosa-FF5EA8.png" dos logos oficiais), não o bloom tintado.
const LOGO_PINK = require('../../assets/onboarding/niks-logo-FF5EA8.png');

// Transição "Prazer, <nome>!" entre a tela 2 (nome) e a 3 (idade) — modelo 1e.
// Sem botão: a logo entra com escala 0,8 → 1, o texto logo depois, e a tela
// avança sozinha em 1,6 s. `replace` para o voltar da idade cair direto no nome.
// Entra SEM a animação de push do Stack (`animation: 'none'`): o deslize lateral
// comia ~350 ms dos 1,6 s e a logo começava a crescer ainda fora da tela.
const HOLD_MS = 1600;

export default function Prazer() {
  const router = useRouter();
  const name = useObName();
  const { y } = useObFrame();
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logo, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(text, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => router.replace('/(onboarding)/birthday'), HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <ObScreen>
      <Stack.Screen options={{ animation: 'none', gestureEnabled: false }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(340), alignItems: 'center', gap: 24 }}>
        <Animated.Image
          source={LOGO_PINK}
          style={{
            width: 72, height: 73,
            opacity: logo,
            transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          }}
        />
        <Animated.View style={{ opacity: text }}>
          <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', color: OB.ink }}>
            {name ? `Prazer, ${name}!` : 'Prazer!'}
          </Text>
        </Animated.View>
      </View>
    </ObScreen>
  );
}
