import { useEffect } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { t } from '../../lib/i18n';
import { BvScreen, dataMeta, diaMesLongo, menosDe, useDorPrincipal } from '../../components/boasVindas/kit';
import { DOR_ALTA, PC, PcBotao, PcCheckCheio, maiuscula, usePcFrame } from '../../components/posCompra/pcKit';

// Pós-compra v2 · tela 7 "Projeção" (design-handoff/pos-compra-v2/07-projecao.html).
// "Seu plano personalizado está pronto" + "<Menos acne> até <hoje + 30 dias>", o card
// "Progresso previsto" com a curva da DOR PRINCIPAL caindo até a data e ficando lá ("Manter
// resultado"), e três certezas. SEM porcentagem e sem foto (decisões de 07 e 23/nov/2026).
// Entrada como no CSS do design: confete caindo (2,4–3,3 s), blocos subindo (0,1 / 0,25 /
// 0,5 s), a curva se desenhando de 1 s a 2,3 s, os pontos e rótulos estourando nos 0,9 / 1 /
// 1,9 / 2 s, a faixa "Manter resultado" aos 2,1–2,2 s, a lista aos 2,3 s e o botão aos 2,6 s.
// "Reduzir movimento": tudo pronto, sem confete.
// Depois: o pacto de sempre (`bv-pacto`, pedido do produto em 26/nov/2026), que segue para a pc-recompensa.
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

const CURVA = 'M20 40 C70 40 90 60 120 90 C150 118 165 116 188 116 L326 116';
const CURVA_LEN = 340; // comprimento aproximado da curva (para o traço se desenhar)
const POP = Easing.out(Easing.quad);

// [x, largura, altura, cor, atraso s, duração s] — os 16 do design
const CONFETE: [number, number, number, string, number, number][] = [
  [10, 8, 12, '#FF5EA8', 0, 2.4], [33, 10, 6, '#FFC94D', 0.12, 2.7], [56, 8, 12, '#FF8CC2', 0.24, 3.0],
  [79, 10, 6, '#B48CFF', 0.36, 3.3], [102, 8, 12, '#6FD3C8', 0.48, 2.4], [125, 10, 6, '#FF5EA8', 0.08, 2.7],
  [148, 8, 12, '#FFC94D', 0.2, 3.0], [171, 10, 6, '#FF8CC2', 0.32, 3.3], [194, 8, 12, '#B48CFF', 0.44, 2.4],
  [217, 10, 6, '#FF5EA8', 0.56, 2.7], [240, 8, 12, '#FFC94D', 0.16, 3.0], [263, 10, 6, '#6FD3C8', 0.28, 3.3],
  [286, 8, 12, '#FF8CC2', 0.4, 2.4], [309, 10, 6, '#FF5EA8', 0.52, 2.7], [332, 8, 12, '#B48CFF', 0.64, 3.0],
  [355, 10, 6, '#FFC94D', 0.24, 3.3],
];
const CAI = Easing.bezier(0.3, 0.6, 0.5, 1);

function Confete({ x, w, h, cor, atraso, dur, dx, altura }: { x: number; w: number; h: number; cor: string; atraso: number; dur: number; dx: number; altura: number }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(atraso * 1000, withTiming(1, { duration: dur * 1000, easing: CAI })); }, []);
  const st = useAnimatedStyle(() => ({
    opacity: p.value < 0.85 ? 1 : 1 - (p.value - 0.85) / 0.15,
    transform: [{ translateY: -40 + (altura + 40) * p.value }, { rotate: `${540 * p.value}deg` }],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -30, left: dx + x, width: w, height: h, borderRadius: 2, backgroundColor: cor }, st]} />;
}

/** 0 → 1 depois de `atraso` ms, em `dur` ms (ou já 1, com "Reduzir movimento"). */
function useEntrada(atraso: number, dur: number, reduzir: boolean, easing = Easing.out(Easing.quad)) {
  const v = useSharedValue(reduzir ? 1 : 0);
  useEffect(() => { if (!reduzir) v.value = withDelay(atraso, withTiming(1, { duration: dur, easing })); }, []);
  return v;
}
const sobeStyle = (v: SharedValue<number>) => {
  'worklet';
  return { opacity: v.value, transform: [{ translateY: 24 * (1 - v.value) }] };
};
/** `pop` do design: 0,6 → 1,08 (70%) → 1. */
const escalaPop = (v: number) => {
  'worklet';
  return v < 0.7 ? 0.6 + (1.08 - 0.6) * (v / 0.7) : 1.08 - 0.08 * ((v - 0.7) / 0.3);
};

export default function PcProjecao() {
  const router = useRouter();
  const dor = useDorPrincipal();
  const { top, bottom } = usePcFrame();
  const { width, height } = useWindowDimensions();
  const reduzir = useReducedMotion();
  const data = diaMesLongo(dataMeta());
  const dx = (width - 390) / 2;

  const s1 = useEntrada(100, 600, reduzir);
  const s2 = useEntrada(250, 600, reduzir);
  const s3 = useEntrada(500, 600, reduzir);
  const lista = useEntrada(2300, 600, reduzir);
  const botao = useEntrada(2600, 600, reduzir);
  const traco = useEntrada(1000, 1300, reduzir);
  const pHoje = useEntrada(900, 450, reduzir, POP);
  const pMeta = useEntrada(1900, 450, reduzir, POP);
  const chipAlta = useEntrada(1000, 450, reduzir, POP);
  const chipControle = useEntrada(2000, 450, reduzir, POP);
  const faixa = useEntrada(2100, 600, reduzir);
  const manter = useEntrada(2200, 600, reduzir);

  const st1 = useAnimatedStyle(() => sobeStyle(s1));
  const st2 = useAnimatedStyle(() => sobeStyle(s2));
  const st3 = useAnimatedStyle(() => sobeStyle(s3));
  const stLista = useAnimatedStyle(() => sobeStyle(lista));
  const stBotao = useAnimatedStyle(() => sobeStyle(botao));
  const stChipAlta = useAnimatedStyle(() => ({ opacity: Math.min(1, chipAlta.value / 0.7), transform: [{ scale: escalaPop(chipAlta.value) }] }));
  const stChipControle = useAnimatedStyle(() => ({ opacity: Math.min(1, chipControle.value / 0.7), transform: [{ scale: escalaPop(chipControle.value) }] }));
  const propsCurva = useAnimatedProps(() => ({ strokeDashoffset: CURVA_LEN * (1 - traco.value) }));
  const propsHoje = useAnimatedProps(() => ({ r: 7 * escalaPop(pHoje.value), opacity: Math.min(1, pHoje.value / 0.7) }));
  const propsMeta = useAnimatedProps(() => ({ r: 7 * escalaPop(pMeta.value), opacity: Math.min(1, pMeta.value / 0.7) }));
  const propsFaixa = useAnimatedProps(() => ({ opacity: faixa.value }));
  const propsManter = useAnimatedProps(() => ({ opacity: manter.value }));

  // O gráfico do design tem 326 × 172 pt dentro do card (390 − 2×16 de margem − 2×16 de padding).
  const graficoW = width - 64;
  const k = graficoW / 326;

  return (
    <BvScreen
      fundo={
        <LinearGradient colors={['#FFD9EA', '#FFE9F3', '#FFF4F9']} locations={[0, 0.4, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      }
    >
      {!reduzir && CONFETE.map(([x, w, h, cor, atraso, dur]) => (
        <Confete key={x} x={x} w={w} h={h} cor={cor} atraso={atraso} dur={dur} dx={dx} altura={height} />
      ))}

      <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom, paddingHorizontal: 16 }}>
        <Animated.Text style={[{ marginTop: 40, fontSize: 14, color: PC.sub, textAlign: 'center' }, st1]}>
          {t('Seu plano personalizado está pronto')}
        </Animated.Text>
        <Animated.Text style={[{ marginTop: 8, fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', color: PC.ink }, st2]}>
          <Text style={{ color: PC.pink }}>{`${menosDe(dor.nome)} ${dor.nome}`}</Text>
          {t(' até\n{{data}}', { data })}
        </Animated.Text>

        <Animated.View style={[{
          marginTop: 32, backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 20, paddingHorizontal: 16, gap: 16,
          shadowColor: PC.pink, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.14, shadowRadius: 16,
        }, st3]}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: PC.ink }}>{t('Progresso previsto')}</Text>

          <View style={{ width: graficoW, height: 172 * k }}>
            <Svg width={graficoW} height={172 * k} viewBox="0 0 326 172">
              <Line x1={14} y1={40} x2={326} y2={40} stroke="#F3E3EA" strokeDasharray="4 4" />
              <Line x1={14} y1={84} x2={326} y2={84} stroke="#F3E3EA" strokeDasharray="4 4" />
              <Line x1={14} y1={128} x2={326} y2={128} stroke="#F3E3EA" strokeDasharray="4 4" />
              <Line x1={20} y1={20} x2={20} y2={150} stroke="#F3E3EA" />
              <AnimatedRect animatedProps={propsFaixa} x={188} y={116} width={138} height={34} fill={PC.rosaClaro} />
              <AnimatedPath animatedProps={propsCurva} d={CURVA} fill="none" stroke={PC.pink} strokeWidth={4} strokeLinecap="round"
                strokeDasharray={`${CURVA_LEN} ${CURVA_LEN}`} />
              <AnimatedCircle animatedProps={propsHoje} cx={20} cy={40} fill="#FFFFFF" stroke="#B9AEB3" strokeWidth={3} />
              <AnimatedCircle animatedProps={propsMeta} cx={188} cy={116} fill="#FFFFFF" stroke={PC.pink} strokeWidth={3} />
              <AnimatedSvgText animatedProps={propsManter} x={318} y={140} fontSize={11} fill={PC.pinkDark} textAnchor="end">
                {t('Manter resultado')}
              </AnimatedSvgText>
              <SvgText x={20} y={168} fontSize={11} fill={PC.sub} textAnchor="middle">{t('Hoje')}</SvgText>
              <SvgText x={188} y={168} fontSize={11} fill={PC.sub} textAnchor="middle">{data}</SvgText>
            </Svg>
            <Animated.View style={[{ position: 'absolute', left: 4 * k, top: 4 * k, backgroundColor: '#F1ECEE', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 }, stChipAlta]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: PC.body }}>{t(DOR_ALTA[dor.problema] ?? maiuscula(dor.nome))}</Text>
            </Animated.View>
            <Animated.View style={[{ position: 'absolute', left: 150 * k, top: 76 * k, backgroundColor: PC.pink, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 }, stChipControle]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{t('Sob controle')}</Text>
            </Animated.View>
          </View>

          <Animated.View style={[{ gap: 11, borderTopWidth: 1, borderTopColor: '#F6E3EC', paddingTop: 16 }, stLista]}>
            {[
              t('Primeiros resultados visíveis em 3 semanas'),
              t('{{dor}} sob controle até {{data}}', { dor: maiuscula(dor.nome), data }),
              t('Sua rotina ajuda a manter o resultado'),
            ].map((linha) => (
              <View key={linha} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <PcCheckCheio />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: PC.ink }}>{linha}</Text>
              </View>
            ))}
          </Animated.View>
        </Animated.View>

        <View style={{ flex: 1 }} />
        <Animated.View style={stBotao}>
          <PcBotao label={t('Quero chegar lá →')} onPress={() => router.push('/(onboarding)/bv-pacto' as any)} />
        </Animated.View>
      </View>
    </BvScreen>
  );
}
