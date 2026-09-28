import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { OB, ObScreen, useObFrame } from '../../components/onboarding/kit';

// Loading logo depois da FOTO do rosto (onboarding) — modelo 9f do design ("Loading
// sem logo · Rosa sólido · trilho cinza · fundo branco"): anel Ø154 pt, traço 5,5 pt,
// progresso #FF5EA8 sobre trilho #DCD5D6, porcentagem em #FF5EA8 no centro e a frase
// embaixo, que troca a cada terço.
//
// Dura 5 s (mesma curva do design: 0 → 100% com ease-in-out em 5000 ms) e segue
// sozinha para a tela 8 ("Seu potencial"). ⚠️ Esta tela NÃO chama IA. O antes/depois
// já foi disparado pela câmera, e a `analyze-skin` só dispara depois do sono (11b),
// porque usa tipo de pele / sol / sono, respondidos DEPOIS da foto — ver
// `lib/onboardingPrefetch.ts`. Sem voltar, sem barra, sem gesto de voltar.
const DURATION_MS = 5000;
const RING = 154;
const R = 74;
const C = 464.96; // 2π·74

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function phraseFor(pct: number) {
  if (pct < 34) return 'Analisando sua pele…';
  if (pct < 67) return 'Cruzando suas respostas…';
  return 'Montando sua rotina…';
}

export default function AnalisandoFoto() {
  const router = useRouter();
  const { y } = useObFrame();
  const [pct, setPct] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const t0 = Date.now();
    const loop = () => {
      const t = Date.now() - t0;
      setPct(Math.min(100, Math.round(100 * easeInOut(Math.min(1, t / DURATION_MS)))));
      if (t < DURATION_MS) raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    // `replace`: voltar da tela 8 cai na câmera (refazer a foto), não neste loading.
    const done = setTimeout(() => router.replace('/(onboarding)/goal-validation' as any), DURATION_MS);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      clearTimeout(done);
    };
  }, []);

  return (
    <ObScreen>
      <Stack.Screen options={{ gestureEnabled: false }} />

      {/* Anel: topo a 330 pt no design, centrado */}
      <View style={{ position: 'absolute', top: y(330), alignSelf: 'center', width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={RING} height={RING} viewBox="0 0 154 154" style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={77} cy={77} r={R} fill="none" stroke={OB.track} strokeWidth={5.5} />
          <Circle
            cx={77} cy={77} r={R} fill="none" stroke={OB.pink} strokeWidth={5.5} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)}
          />
        </Svg>
        <Text style={{ fontSize: 40, lineHeight: 44, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'], color: OB.pink }}>
          {pct}%
        </Text>
      </View>

      <Text style={{
        position: 'absolute', left: 17, right: 17, top: y(514), textAlign: 'center',
        fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4, color: OB.ink,
      }}>
        {phraseFor(pct)}
      </Text>
    </ObScreen>
  );
}
