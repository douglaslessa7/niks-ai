import { useEffect, useRef, useState } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, ClipPath, Rect, G, Line, Path, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObPillButton, ObTitle, ObSubtitle, useObFrame, useObName, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 19 do fluxo completo — "A gente entende, <nome>." (o "Papo reto:" do design
// saiu a pedido do produto). Tela de valor
// (fundo rosado) depois do objetivo, com o gráfico "Evolução da sua pele": a linha
// se desenha da esquerda para a direita (1,2 s), os pontos aparecem quando a linha
// passa por eles e, no fim, o ponto "Sua melhor pele" acende com a etiqueta.
// Medidas do `EmpChart` do design (viewBox 315 × 210 desenhado em 305 × 203).
const STEP = OB_STEPS.empatia;
const STEP_NAME = 'Empatia';
const LINE = 'M20 160 C35.2 154.7 80.5 140.7 111 128 C141.5 115.3 172.3 99.7 203 84 C233.7 68.3 279.7 42.3 295 34';
const POINTS: [number, number][] = [[20, 160], [111, 128], [203, 84]];
const LABELS: [string, number][] = [['Hoje', 20], ['2 sem', 111], ['4 sem', 203], ['8 sem', 295]];
const DRAW_MS = 1200;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const easeInOut = (x: number) => { x = clamp(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

function EvolutionChart({ width }: { width: number }) {
  const [t, setT] = useState(0);
  const start = useRef(Date.now());
  useEffect(() => {
    let id: number;
    const loop = () => {
      const now = Date.now() - start.current;
      setT(now);
      if (now < DRAW_MS + 600) id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  const S = width / 315;
  const cx = 20 + easeInOut(t / DRAW_MS) * 275;
  const pop = (x: number) => clamp((cx - x) / 20 + 0.2);
  const endK = clamp((t - DRAW_MS) / 300);
  const tagK = clamp((t - DRAW_MS - 50) / 250);
  const sc = (k: number) => (k < 1 ? 0.4 + k * 0.75 : 1);

  return (
    <View style={{ height: 236 * (width / 305) }}>
      <Svg width={width} height={width * (210 / 315)} viewBox="0 0 315 210" style={{ overflow: 'visible' }}>
        <Defs>
          <LinearGradient id="empG" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={OB.pink} stopOpacity={0.22} />
            <Stop offset="1" stopColor={OB.pink} stopOpacity={0} />
          </LinearGradient>
          <ClipPath id="empC">
            <Rect x={0} y={-20} width={cx} height={240} />
          </ClipPath>
        </Defs>
        {[40, 90, 140, 190].map((yy) => (
          <Line key={yy} x1={0} y1={yy} x2={315} y2={yy} stroke={OB.divider} strokeWidth={1} strokeDasharray="4 4" />
        ))}
        <G clipPath="url(#empC)">
          <Path d={`${LINE} L295 190 L20 190 Z`} fill="url(#empG)" />
          <Path d={LINE} fill="none" stroke={OB.pink} strokeWidth={3} strokeLinecap="round" />
        </G>
        {POINTS.map(([x, y], k) => {
          const v = pop(x);
          return <Circle key={k} cx={x} cy={y} r={5 * sc(v)} fill="#FFFFFF" stroke={OB.pink} strokeWidth={2} opacity={v} />;
        })}
        <Circle cx={295} cy={34} r={17 * endK} fill="rgba(255,110,175,0.30)" opacity={endK} />
        <Circle cx={295} cy={34} r={8 * sc(endK)} fill={OB.pink} opacity={endK} />
      </Svg>
      <View style={{
        position: 'absolute', right: -10, top: -16 + (1 - tagK) * 6, height: 28, paddingHorizontal: 12,
        borderRadius: 14, backgroundColor: '#FFFFFF', justifyContent: 'center', opacity: tagK,
        shadowColor: OB.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 7,
      }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: OB.ink }}>Sua melhor pele</Text>
      </View>
      {LABELS.map(([l, x]) => (
        <Text key={l} style={{
          position: 'absolute', left: x * S - 20, width: 40, top: 220 * (width / 305),
          textAlign: 'center', fontSize: 11, lineHeight: 16, color: OB.sub,
        }}>
          {l}
        </Text>
      ))}
    </View>
  );
}

export default function Empatia() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();
  const { width } = useWindowDimensions();
  const chartW = width - 34 - 40; // card a 17 pt das bordas, 20 pt de respiro dentro

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/horario-rotina');
  };

  return (
    <ObScreen variant="blush">
      {/* Mesmo esqueleto das telas de pergunta (`ObChoiceScreen`): título em y 118,
          subtítulo 9 pt abaixo, conteúdo 22 pt abaixo, a 17 pt das bordas — mas com os
          textos alinhados à esquerda, como no design. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(118) }}>
        <ObTitle style={{ textAlign: 'left', fontSize: 30, lineHeight: 36 }}>{name ? `A gente entende, ${name}.` : 'A gente entende.'}</ObTitle>
        <ObSubtitle style={{ marginTop: 9, textAlign: 'left', color: OB.body }}>
          Sua pele regula a sua autoestima. Mas saiba que ela sempre se renova todas as semanas, e a NIKS acompanha cada uma delas.
        </ObSubtitle>

        <View style={{
          marginTop: 22, marginHorizontal: 17, borderRadius: 20, backgroundColor: '#FFFFFF',
          paddingTop: 20, paddingHorizontal: 20, paddingBottom: 18, gap: 14,
          shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12,
        }}>
          <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1, color: OB.sub }}>EVOLUÇÃO DA SUA PELE</Text>
          <EvolutionChart width={chartW} />
        </View>

        <Text style={{ marginTop: 16, marginHorizontal: 17, fontSize: 14, lineHeight: 20, fontStyle: 'italic', color: OB.sub }}>
          {name ? `A gente entende, ${name}. ` : 'A gente entende. '}Você já deu o passo mais difícil: começar 😉
        </Text>
      </View>

      <ObHeader onBack={() => router.back()} />
      <ObPillButton label="Faz sentido" onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
