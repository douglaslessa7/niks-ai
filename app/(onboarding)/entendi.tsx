import { View, Text, Image, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObCheck, ObPillButton,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { concernBenefits, concernTags } from '../../components/onboarding/answers';

// Tela de valor "Entendi! Vamos te ajudar a:" (modelo 1f do design), logo depois da
// tela 5 ("O que mais te incomoda") e antes da preparação do scan.
// Tela de valor: só o voltar, SEM barra (nota do design). As etiquetas em volta da
// logo e os benefícios mudam conforme o que ela marcou na tela 5
// (`components/onboarding/answers.ts`).
//
// Medidas do design (frame de 393): halo Ø320 em (36, 80), anel Ø200 em (96, 140),
// disco branco Ø140 em (126, 170) com a logo 76×77, etiquetas em (84, 156) e
// (252, 292), título a 436, benefícios a 500 (gap 18). As posições X são convertidas
// em deslocamento a partir do centro, para valerem em qualquer largura.
const STEP = OB_STEPS.entendi;
const STEP_NAME = 'Entendi';
const LOGO_PINK = require('../../assets/onboarding/niks-logo-FF5EA8.png');
const FRAME_CENTER = 393 / 2;

export default function Entendi() {
  const router = useRouter();
  const { track } = useMixpanel();
  const concerns = useAppStore((s) => s.onboarding.concerns);
  const { y, buttonBottom } = useObFrame();
  const { width } = useWindowDimensions();
  const x = (designX: number) => width / 2 + (designX - FRAME_CENTER);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const tags = concernTags(concerns);
  const benefits = concernBenefits(concerns);
  const TAG_POS = [{ left: 84, top: 156 }, { left: 252, top: 292 }];

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(scan)/scan-prep' as any);
  };

  return (
    <ObScreen>
      {/* Halo: radial-gradient(circle, .30 0%, .12 45%, 0 70%) — no CSS o raio do
          `circle` é até o canto (160·√2), por isso os stops caem em 0,636 e 0,99 do raio. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: x(36), top: y(80), width: 320, height: 320 }}>
        <Svg width={320} height={320}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="rgb(255,110,175)" stopOpacity={0.30} />
              <Stop offset="0.636" stopColor="rgb(255,110,175)" stopOpacity={0.12} />
              <Stop offset="0.99" stopColor="rgb(255,110,175)" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={160} cy={160} r={160} fill="url(#halo)" />
        </Svg>
      </View>

      {/* Anel Ø200 */}
      <View pointerEvents="none" style={{
        position: 'absolute', left: x(96), top: y(140), width: 200, height: 200, borderRadius: 100,
        borderWidth: 1, borderColor: 'rgba(255,110,175,0.30)',
      }} />

      {/* Disco branco Ø140 com a logo */}
      <View style={{
        position: 'absolute', left: x(126), top: y(170), width: 140, height: 140, borderRadius: 70,
        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        shadowColor: 'rgb(255,110,175)', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.30, shadowRadius: 20,
      }}>
        <Image source={LOGO_PINK} style={{ width: 76, height: 77 }} />
      </View>

      {/* Etiquetas das preocupações */}
      {tags.map((tag, i) => (
        <View key={tag} style={{
          position: 'absolute', left: x(TAG_POS[i].left), top: y(TAG_POS[i].top), height: 30, paddingHorizontal: 12,
          borderRadius: 15, backgroundColor: '#FFFFFF', justifyContent: 'center',
          shadowColor: OB.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 7,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: OB.ink }}>{tag}</Text>
        </View>
      ))}

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(436) }}>
        <ObTitle>Entendi! Vamos te ajudar a:</ObTitle>
      </View>

      <View style={{ position: 'absolute', left: 17, right: 17, top: y(500), gap: 18 }}>
        {benefits.map((b) => (
          <View key={b} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
            <View style={{ marginTop: 1 }}>
              <ObCheck size={22} stroke={2.2} />
            </View>
            <Text style={{ flex: 1, fontSize: 18, lineHeight: 25, color: OB.body }}>{b}</Text>
          </View>
        ))}
      </View>

      <ObHeader onBack={() => router.back()} />
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
