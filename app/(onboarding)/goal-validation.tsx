import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, ClipPath, Rect, G, Line, Path, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton,
  useObFrame, useObName, withName, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 8 do onboarding novo — "Seu potencial" (Gráfico A, modelo 6a do design).
// Tela de valor: só o voltar, sem barra de progresso, fundo rosado.
//
// Animação (roda UMA vez, o board do design mostra em loop): 0–1,2 s a linha se
// desenha da esquerda para a direita (ease-in-out) com a área junto; cada ponto
// intermediário surge com escala 0,4 → 1 quando a linha passa por ele; em 1,2 s o
// ponto final acende (brilho 0 → 1, ponto 0,4 → 1,15 → 1 em 300 ms) e a etiqueta
// "Sua melhor pele" entra com fade subindo 6 pt em 250 ms. O botão aparece desde o
// início. É a MESMA conta do script do design (`tickG`), portada frame a frame.
const STEP = OB_STEPS.potencial;
const STEP_NAME = 'Seu Potencial';

const CURVE = 'M20 160 C35.2 154.7 80.5 140.7 111 128 C141.5 115.3 172.3 99.7 203 84 C233.7 68.3 279.7 42.3 295 34';
const AREA = `${CURVE} L295 190 L20 190 Z`;
const MID_POINTS = [{ x: 20, y: 160 }, { x: 111, y: 128 }, { x: 203, y: 84 }];
const X_LABELS = [{ left: 0, t: 'Hoje' }, { left: 91, t: '2 sem' }, { left: 183, t: '4 sem' }, { left: 275, t: '8 sem' }];
const TOTAL_MS = 1600;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const back = (x: number) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export default function GoalValidation() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
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

  // ── Estado da animação no instante t (mesma matemática do design) ──
  const p = easeInOut(clamp(t / 1200));
  const cx = p * 315;
  const f = clamp((t - 1200) / 300);
  const tagQ = clamp((t - 1350) / 250);

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/skin-type');
  };

  return (
    <ObScreen variant="blush">
      {/* Card do gráfico: 17 pt das laterais, topo a 100 pt, 330 de altura, raio 20 */}
      <View style={{
        position: 'absolute', left: 17, right: 17, top: y(100), height: 330, borderRadius: 20,
        backgroundColor: '#FFFFFF',
        shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12,
      }}>
        <Text style={{ position: 'absolute', left: 22, top: 22, fontSize: 11, fontWeight: '600', letterSpacing: 1, color: OB.sub }}>
          EVOLUÇÃO DA SUA PELE
        </Text>

        <View style={{ position: 'absolute', left: 22, top: 56, width: 315, height: 210 }}>
          <Svg width={315} height={210} viewBox="0 0 315 210" style={{ overflow: 'visible' }}>
            <Defs>
              <LinearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={OB.pink} stopOpacity={0.22} />
                <Stop offset="1" stopColor={OB.pink} stopOpacity={0} />
              </LinearGradient>
              <ClipPath id="cA">
                <Rect x={0} y={-20} width={cx + 4} height={240} />
              </ClipPath>
            </Defs>
            {[40, 90, 140, 190].map((ly) => (
              <Line key={ly} x1={0} y1={ly} x2={315} y2={ly} stroke={OB.divider} strokeWidth={1} strokeDasharray="4 4" />
            ))}
            <G clipPath="url(#cA)">
              <Path d={AREA} fill="url(#gA)" />
              <Path d={CURVE} fill="none" stroke={OB.pink} strokeWidth={3} strokeLinecap="round" />
            </G>
            {MID_POINTS.map((pt) => {
              const q = clamp((cx - pt.x + 2) / 40);
              if (q <= 0) return null;
              return (
                <Circle
                  key={pt.x} cx={pt.x} cy={pt.y} r={5 * (0.4 + 0.6 * easeOut(q))}
                  fill="#FFFFFF" stroke={OB.pink} strokeWidth={2} opacity={q}
                />
              );
            })}
            {f > 0 && (
              <>
                <Circle cx={295} cy={34} r={17 * (0.5 + 0.5 * easeOut(f))} fill="rgba(255,110,175,0.30)" opacity={easeOut(f)} />
                <Circle cx={295} cy={34} r={8 * (0.4 + 0.6 * back(f))} fill={OB.pink} />
              </>
            )}
          </Svg>
        </View>

        {/* Etiqueta "Sua melhor pele" */}
        <View style={{
          position: 'absolute', right: 12, top: 40, height: 28, paddingHorizontal: 12, borderRadius: 14,
          backgroundColor: '#FFFFFF', justifyContent: 'center',
          shadowColor: OB.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 7,
          opacity: tagQ, transform: [{ translateY: 6 * (1 - easeOut(tagQ)) }],
        }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: OB.ink }}>Sua melhor pele</Text>
        </View>

        {/* Eixo X */}
        <View style={{ position: 'absolute', left: 22, width: 315, top: 282, height: 16 }}>
          {X_LABELS.map((l) => (
            <Text key={l.t} style={{ position: 'absolute', left: l.left, width: 40, top: 0, textAlign: 'center', fontSize: 11, color: OB.sub }}>
              {l.t}
            </Text>
          ))}
        </View>
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(462) }}>
        <ObTitle>{withName(name, 'você tem tudo para conseguir o que quer.')}</ObTitle>
      </View>
      <ObSubtitle style={{ position: 'absolute', left: 30, right: 30, top: y(580), marginHorizontal: 0, lineHeight: 24 }}>
        O NIKS mostra exatamente o que a sua pele precisa, passo a passo.
      </ObSubtitle>

      <ObHeader onBack={() => router.back()} />
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
