// ─────────────────────────────────────────────────────────────────────────────
// Aba Rotina enquanto os PRODUTOS DE CASA do pós-compra v2 ainda estão na fila do aparelho
// (lib/filaProdutosCasa.ts — decisão do produto, 26/nov/2026). Ela já escaneou, então a Rotina
// não pode pedir o scan de novo nem ficar vazia: cobre a tela (a navbar fica) com
// "Estamos montando sua rotina com os seus produtos", as miniaturas do que ela fotografou e um
// anel girando, no fundo da Rotina. Quando o envio dá certo, a fila some e a Rotina volta a ser
// a de sempre (com o aviso do lote, components/rotina/AvisoLote.tsx, quando a rotina final fica
// pronta no servidor).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { t } from '../../lib/i18n';

const INK = '#121212';
const PINK = '#FF5EA8';
const SOFT = '#6E6468';
const BG = ['#FFE3EF', '#FFD3E5', '#FFC6DC', '#FDDFEB', '#FBEEF3', '#F9F2F5'] as const;
const BG_STOPS = [0, 0.28, 0.5, 0.64, 0.8, 1] as const;
const ANEL = 132;

export default function MontandoComProdutos({ miniaturas, topo }: { miniaturas: string[]; topo: number }) {
  const reduzir = useReducedMotion();
  const giro = useSharedValue(0);
  const pulso = useSharedValue(0);
  useEffect(() => {
    if (reduzir) return;
    giro.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    pulso.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduzir]);
  const stGiro = useAnimatedStyle(() => ({ transform: [{ rotate: `${360 * giro.value}deg` }] }));
  const stPulso = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * pulso.value }] }));

  const fotos = miniaturas.slice(0, 3);
  const r = ANEL / 2 - 5;
  const volta = 2 * Math.PI * r;

  return (
    <View style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite">
      <LinearGradient colors={[...BG]} locations={[...BG_STOPS]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: topo, paddingBottom: 140, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ width: ANEL, height: ANEL, alignItems: 'center', justifyContent: 'center' }, stPulso]}>
          <View style={{
            position: 'absolute', width: ANEL - 20, height: ANEL - 20, borderRadius: (ANEL - 20) / 2, backgroundColor: '#FFFFFF',
            shadowColor: PINK, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 18,
          }} />
          <Animated.View style={[StyleSheet.absoluteFill, stGiro]}>
            <Svg width={ANEL} height={ANEL}>
              <Circle cx={ANEL / 2} cy={ANEL / 2} r={r} stroke="rgba(255,94,168,0.18)" strokeWidth={6} fill="none" />
              <Circle cx={ANEL / 2} cy={ANEL / 2} r={r} stroke={PINK} strokeWidth={6} fill="none" strokeLinecap="round"
                strokeDasharray={`${volta * 0.28} ${volta}`} />
            </Svg>
          </Animated.View>
          {/* As fotos dos produtos dela, sobrepostas, no meio do anel */}
          <View style={{ flexDirection: 'row' }}>
            {fotos.map((uri, i) => (
              <ExpoImage key={uri} source={{ uri }} contentFit="cover" style={{
                width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#FFFFFF',
                marginLeft: i ? -12 : 0, backgroundColor: '#F4E6EC',
              }} />
            ))}
          </View>
        </Animated.View>

        <Text style={{ marginTop: 28, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.4, color: INK, textAlign: 'center' }}>
          {t('Estamos montando sua rotina com os seus produtos')}
        </Text>
        <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 21, color: SOFT, textAlign: 'center' }}>
          {t('Assim que ficar pronta, ela aparece aqui. Pode fechar o app: a gente continua de onde parou.')}
        </Text>
      </View>
    </View>
  );
}
