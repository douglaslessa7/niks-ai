import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObPillButton, NIKS_LOGO_PINK,
  useObFrame, useObName, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 2 do fluxo completo — "Prazer, <nome>!" + "Em poucos minutos, vamos montar o
// plano perfeito para sua pele" (texto do produto; o do design falava em "1 foto",
// e o scan tira 3). Diferente
// da transição antiga (que seguia sozinha em 1,6 s), agora tem voltar e o botão
// "Vamos lá". A logo entra com escala 0,8 → 1 e o texto logo depois.
const STEP = OB_STEPS.prazer;
const STEP_NAME = 'Prazer';

export default function Prazer() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logo, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(text, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/birthday');
  };

  return (
    <ObScreen>
      <View style={{ position: 'absolute', left: 30, right: 30, top: y(300), alignItems: 'center' }}>
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
          <Text style={{ marginTop: 12, fontSize: 17, lineHeight: 23, textAlign: 'center', color: OB.sub }}>
            Em poucos minutos, vamos montar o plano perfeito para sua pele
          </Text>
        </Animated.View>
      </View>

      <ObHeader onBack={() => router.back()} />
      <ObPillButton label="Vamos lá" onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
