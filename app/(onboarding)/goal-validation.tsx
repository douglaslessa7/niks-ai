import { useEffect, useRef, useState } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, {
  Defs, LinearGradient, RadialGradient, Stop, ClipPath, Rect, G, Line, Path, Circle, Ellipse,
  Filter, FeGaussianBlur,
} from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObPillButton,
  useObFrame, useObName, withName, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 6 do onboarding — "Seu potencial". DISPOSIÇÃO e GRÁFICO da versão B (commit
// 8ae3453), no visual do kit: título no topo e um card branco com "EVOLUÇÃO DA SUA
// PELE", o gráfico e a legenda embaixo dele, tudo DENTRO do card. O gráfico é o de B — grade tracejada
// horizontal (3) e vertical (3), linha de base, curva suave com 3 pontos vazados e a
// "bolinha" com brilho no fim, sem rótulos de eixo — com o rosa do kit no lugar do
// coral.
//
// Animação (roda UMA vez): 0–1,2 s a curva se desenha da esquerda para a direita
// (ease-in-out) com a área junto; cada ponto surge (escala 0,4 → 1) quando a curva
// passa por ele; em 1,2 s a bolinha final acende com um leve quique.
const STEP = OB_STEPS.potencial;
const STEP_NAME = 'Seu Potencial';

// Geometria do gráfico de B (viewBox 320 × 170).
const W = 320;
const H = 170;
const PTS = [
  { x: 44, y: 144 },
  { x: 125, y: 122 },
  { x: 199, y: 82 },
  { x: 286, y: 30 },
];
const CURVE = `M ${PTS[0].x} ${PTS[0].y}
  C ${PTS[0].x + 28} ${PTS[0].y - 4}, ${PTS[1].x - 28} ${PTS[1].y + 4}, ${PTS[1].x} ${PTS[1].y}
  C ${PTS[1].x + 28} ${PTS[1].y - 6}, ${PTS[2].x - 28} ${PTS[2].y + 8}, ${PTS[2].x} ${PTS[2].y}
  C ${PTS[2].x + 30} ${PTS[2].y - 8}, ${PTS[3].x - 30} ${PTS[3].y + 8}, ${PTS[3].x} ${PTS[3].y}`;
const AREA = `${CURVE} L ${PTS[3].x} ${H - 12} L ${PTS[0].x} ${H - 12} Z`;
const TOTAL_MS = 1600;
const CARD_PAD = 20;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const back = (x: number) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

function Chart({ width, t }: { width: number; t: number }) {
  // Posição da "ponta" da curva no instante t (do 1º ao último ponto).
  const p = easeInOut(clamp(t / 1200));
  const cx = PTS[0].x + p * (PTS[3].x - PTS[0].x);
  const f = clamp((t - 1200) / 300);
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width={width} height={Math.round((H / W) * width)} style={{ overflow: 'visible' }}>
      <Defs>
        <LinearGradient id="gvArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={OB.pink} stopOpacity={0.26} />
          <Stop offset="0.6" stopColor={OB.pink} stopOpacity={0.1} />
          <Stop offset="1" stopColor={OB.pink} stopOpacity={0} />
        </LinearGradient>
        <RadialGradient id="gvOrb" cx="35%" cy="28%" r="70%">
          <Stop offset="0" stopColor="#FFEAF3" />
          <Stop offset="0.3" stopColor="#FFB3D5" />
          <Stop offset="0.7" stopColor={OB.pink} />
          <Stop offset="1" stopColor="#D93C86" />
        </RadialGradient>
        <Filter id="gvGlow" x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation="3" />
        </Filter>
        <ClipPath id="gvClip">
          <Rect x={0} y={0} width={cx + 3} height={H} />
        </ClipPath>
      </Defs>

      {/* Grade tracejada: 3 horizontais e 3 verticais (versão B) */}
      {[42, 82, 122].map((ly) => (
        <Line key={`h${ly}`} x1={14} y1={ly} x2={W - 14} y2={ly}
          stroke="rgba(18,18,18,0.22)" strokeWidth={0.9} strokeDasharray="4 5" />
      ))}
      {[88, 162, 236].map((lx) => (
        <Line key={`v${lx}`} x1={lx} y1={20} x2={lx} y2={H - 14}
          stroke="rgba(18,18,18,0.18)" strokeWidth={0.9} strokeDasharray="4 5" />
      ))}
      {/* Linha de base */}
      <Line x1={14} y1={H - 12} x2={W - 14} y2={H - 12} stroke="rgba(18,18,18,0.18)" strokeWidth={1} strokeLinecap="round" />

      {/* Área + curva, reveladas da esquerda para a direita */}
      <G clipPath="url(#gvClip)">
        <Path d={AREA} fill="url(#gvArea)" />
        <Path d={CURVE} fill="none" stroke={OB.pink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </G>

      {/* Pontos intermediários (vazados) */}
      {PTS.slice(0, 3).map((pt) => {
        const q = clamp((cx - pt.x + 2) / 30);
        if (q <= 0) return null;
        return (
          <Circle key={pt.x} cx={pt.x} cy={pt.y} r={4.6 * (0.4 + 0.6 * easeOut(q))}
            fill="#FFFFFF" stroke={OB.pink} strokeWidth={2} opacity={q} />
        );
      })}

      {/* Bolinha final com brilho */}
      {f > 0 && (
        <>
          <Circle cx={PTS[3].x} cy={PTS[3].y} r={14} fill={OB.pink} opacity={0.22 * easeOut(f)} filter="url(#gvGlow)" />
          <Circle cx={PTS[3].x} cy={PTS[3].y} r={10.5 * Math.max(0.4, back(f))} fill="url(#gvOrb)" stroke="#FFFFFF" strokeWidth={2} />
          <Ellipse cx={PTS[3].x - 2.5} cy={PTS[3].y - 3} rx={2.6} ry={1.6} fill="#FFFFFF" opacity={0.55 * f} />
        </>
      )}
    </Svg>
  );
}

export default function GoalValidation() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const { width } = useWindowDimensions();
  const { y, buttonBottom } = useObFrame();
  const [t, setT] = useState(0);
  const raf = useRef<number | null>(null);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  useEffect(() => {
    const t0 = Date.now();
    const loop = () => {
      const now = Date.now() - t0;
      setT(Math.min(now, TOTAL_MS));
      if (now < TOTAL_MS) raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current); };
  }, []);

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/skin-type');
  };

  const chartW = width - 17 * 2 - CARD_PAD * 2;

  return (
    <ObScreen>
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(118) }}>
        <ObTitle>{withName(name, 'você tem tudo para conseguir o que quer.')}</ObTitle>

        {/* Card do gráfico */}
        <View style={{
          marginTop: 24, marginHorizontal: 17, padding: CARD_PAD, borderRadius: 20,
          backgroundColor: '#FFFFFF',
          shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1, color: OB.sub, marginBottom: 10 }}>
            EVOLUÇÃO DA SUA PELE
          </Text>
          <Chart width={chartW} t={t} />
          {/* Legenda DENTRO do card, embaixo do gráfico (como na versão B) */}
          <Text style={{ marginTop: 16, paddingHorizontal: 6, textAlign: 'center', fontSize: 15, lineHeight: 21, color: OB.body }}>
            O NIKS torna muito fácil saber exatamente o que a sua pele precisa para atingir o seu objetivo.
          </Text>
        </View>
      </View>

      <ObHeader onBack={() => router.back()} />
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
