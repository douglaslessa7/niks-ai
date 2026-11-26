import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { t } from '../../lib/i18n';
import { useObName } from '../../components/onboarding/kit';
import { BvScreen } from '../../components/boasVindas/kit';
import { PcBotao, usePcFrame } from '../../components/posCompra/pcKit';
import { comecarPosCompraV2 } from '../../lib/posCompraV2';

// Pós-compra v2 · tela 1 "Parabéns" (design-handoff/pos-compra-v2/01-parabens.html).
// Fundo rosa em degradê até o branco, bandeirinhas no alto, confete parado e o texto entrando
// (`entra`: sobe 60 pt, passa um pouco e assenta, 0,9 s; o botão sobe aos 1,2 s). Começa o
// fluxo novo do zero (pontos e produtos de uma tentativa anterior saem).
const ENTRA = Easing.bezier(0.2, 0.8, 0.2, 1);

const BANDEIRAS: [string, string][] = [
  ['M18 30 L40 39 L24 62 Z', '#FFE27A'], ['M62 46 L86 53 L68 76 Z', '#FFFFFF'],
  ['M108 58 L132 62 L116 86 Z', '#C9A8FF'], ['M156 64 L180 66 L166 91 Z', '#FFE27A'],
  ['M205 66 L229 64 L218 90 Z', '#FFFFFF'], ['M254 61 L278 57 L270 83 Z', '#C9A8FF'],
  ['M300 50 L324 44 L320 70 Z', '#FFE27A'], ['M344 36 L368 28 L366 54 Z', '#FFFFFF'],
];
// [x, y, largura, altura, cor, giro]
const CONFETE: [number, number, number, number, string, number][] = [
  [46, 210, 7, 14, '#FFE27A', 28], [322, 236, 7, 14, '#FFFFFF', -35], [84, 330, 8, 8, '#C9A8FF', 0],
  [300, 360, 7, 14, '#FFE27A', 60], [30, 470, 7, 14, '#FF5EA8', -20], [342, 500, 8, 8, '#FF5EA8', 0],
  [250, 180, 6, 6, '#FFFFFF', 0], [140, 560, 7, 14, '#FF8CC2', 40],
];

/** `entra` do design: 0 → 70% (passa 6 pt e 2%) → 100%. */
function useEntra(delay: number, reduzir: boolean) {
  const p = useSharedValue(reduzir ? 1 : 0);
  useEffect(() => {
    if (!reduzir) p.value = withDelay(delay, withTiming(1, { duration: 900, easing: ENTRA }));
  }, []);
  return useAnimatedStyle(() => {
    const v = p.value;
    const a = Math.min(1, v / 0.7);
    const ty = v < 0.7 ? 60 + (-6 - 60) * a : -6 + 6 * ((v - 0.7) / 0.3);
    const sc = v < 0.7 ? 0.92 + (1.02 - 0.92) * a : 1.02 - 0.02 * ((v - 0.7) / 0.3);
    return { opacity: a, transform: [{ translateY: ty }, { scale: sc }] };
  });
}

export default function PcBoasVindas() {
  const router = useRouter();
  const name = useObName();
  const { width } = useWindowDimensions();
  const { top, bottom } = usePcFrame();
  const reduzir = useReducedMotion();
  const dy = top - 59; // o design desenha a partir do topo do aparelho, com 59 pt de status bar
  const dx = (width - 390) / 2;

  useEffect(() => { comecarPosCompraV2(); }, []);

  const saudacao = useEntra(200, reduzir);
  const titulo = useEntra(450, reduzir);
  const botaoP = useSharedValue(reduzir ? 1 : 0);
  useEffect(() => {
    if (!reduzir) botaoP.value = withDelay(1200, withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }));
  }, []);
  const botao = useAnimatedStyle(() => ({ opacity: botaoP.value, transform: [{ translateY: 24 * (1 - botaoP.value) }] }));

  const sombra = { textShadowColor: 'rgba(196,40,110,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 };

  return (
    <BvScreen
      statusBar="light"
      fundo={
        <LinearGradient
          colors={['#FF5EA8', '#FF6CB0', '#FF8CC2', '#FFB8D8', '#FFE2EF', '#FFFFFF']}
          locations={[0, 0.45, 0.65, 0.8, 0.92, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      }
    >
      <Svg width={390} height={120} viewBox="0 0 390 120" style={{ position: 'absolute', left: dx, top: 40 + dy }} pointerEvents="none">
        <Path d="M-10 18 Q195 92 400 18" fill="none" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={1.5} />
        {BANDEIRAS.map(([d, cor]) => <Path key={d} d={d} fill={cor} />)}
      </Svg>
      {CONFETE.map(([x, y, w, h, cor, giro]) => (
        <View
          key={`${x}-${y}`}
          pointerEvents="none"
          style={{
            position: 'absolute', left: dx + x, top: dy + y, width: w, height: h, backgroundColor: cor,
            borderRadius: w === h ? w / 2 : 2, transform: [{ rotate: `${giro}deg` }],
          }}
        />
      ))}

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24, paddingBottom: 120 }}>
        <Animated.Text style={[{ fontSize: 22, lineHeight: 28, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' }, sombra, saudacao]}>
          {name ? t('Parabéns, {{name}}!', { name }) : t('Parabéns!')}
        </Animated.Text>
        <Animated.Text style={[{ fontSize: 40, lineHeight: 44, fontWeight: '700', letterSpacing: -0.4, color: '#FFFFFF', textAlign: 'center' }, sombra, titulo]}>
          {t('Você agora tem o NIKS Premium')}
        </Animated.Text>
      </View>

      <Animated.View style={[{ position: 'absolute', left: 20, right: 20, bottom }, botao]}>
        <PcBotao label={t('Bora lá')} onPress={() => router.push('/(onboarding)/pc-criar-rotina' as any)} />
      </Animated.View>
    </BvScreen>
  );
}
