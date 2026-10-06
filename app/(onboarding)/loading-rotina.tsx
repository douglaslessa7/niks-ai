import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, useObFrame, useObName, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { routineLoadingLines } from '../../components/onboarding/answers';
import { awaitRoutine, ensureSkinPreview } from '../../lib/onboardingPrefetch';

// Tela 23 do fluxo completo — "Criando uma rotina só sua, <nome>". Anel R 122 (trilho
// branco 13 pt + progresso em degradê #FF5EA8 → #FF8CC0, 11 pt) em volta de um disco
// branco Ø214 com a porcentagem; embaixo do título, uma frase que troca a cada terço
// (`routineLoadingLines`: queixa → tipo de pele do scan → o que causou reação, esta só
// se ela informou na tela 17) e 4 tracinhos pulsando.
//
// A rotina já está sendo gerada em segundo plano desde o objetivo (18) — aqui só
// aguardamos (`awaitRoutine`, que dispara de novo se o job de fundo falhou). A % anda
// no ritmo do design (0 → 100 em ~6,5 s) mas SEGURA em 95% até a rotina chegar. Se a
// geração falhar, a tela segue mesmo assim: o signup gera de novo
// (`saveOnboardingProtocol`), como sempre fez. Também garante o antes/depois da tela
// seguinte. Sem voltar.
//
// ⚠️ A linha "43.754 mulheres com pele oleosa já seguem uma rotina NIKS" do design
// ficou de fora: prova social não vai ao ar com número de exemplo.
const R = 122;
const C = 2 * Math.PI * R;
const RUN_MS = 6500;
const HOLD_AT = 0.95;
const SIZE = 2 * R + 14;

export default function LoadingRotina() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const { y } = useObFrame();
  const onboarding = useAppStore((s) => s.onboarding);
  const skinType = useAppStore((s) => s.scanResult?.skin_type_detected);
  const lines = useRef(routineLoadingLines(onboarding, skinType)).current;
  const [p, setP] = useState(0);
  const ready = useRef(false);
  const start = useRef(Date.now());
  const dots = useRef(new Animated.Value(0)).current;

  useOnMount(() => track('onboarding_step_viewed', obStep(OB_STEPS.loadingRotina, 'Loading Rotina')));

  useEffect(() => {
    ensureSkinPreview();
    awaitRoutine()
      .then((r) => { if (!r) console.warn('[loading-rotina] rotina não ficou pronta — o signup gera de novo'); })
      .finally(() => { ready.current = true; });

    Animated.loop(Animated.timing(dots, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })).start();

    let id: number;
    let done = false;
    const loop = () => {
      const t = (Date.now() - start.current) / RUN_MS;
      const pe = 1 - Math.pow(1 - Math.min(1, t), 1.6);
      const next = ready.current ? pe : Math.min(HOLD_AT, pe);
      setP(next);
      if (next >= 1 && !done) {
        done = true;
        track('onboarding_step_completed', obStep(OB_STEPS.loadingRotina, 'Loading Rotina'));
        setTimeout(() => router.replace('/(onboarding)/rotina-pronta'), 400);
        return;
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  const pct = Math.round(p * 100);
  const n = lines.length;
  const idx = Math.min(n - 1, Math.floor(p * n));
  const local = p * n - idx;
  const lineOpacity = Math.max(0, Math.min(1, local * 6, idx === n - 1 ? 1 : (1 - local) * 8));
  const cy = y(370);

  return (
    <ObScreen variant="blush">
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Text style={{
        position: 'absolute', left: 0, right: 0, top: y(74), textAlign: 'center',
        fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.4, color: OB.sub,
      }}>
        SUA ROTINA
      </Text>

      {/* Disco translúcido Ø300 atrás do anel */}
      <View style={{
        position: 'absolute', top: cy - 150, alignSelf: 'center', width: 300, height: 300, borderRadius: 150,
        backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 1, borderColor: 'rgba(255,94,168,0.10)',
      }} />

      <View style={{ position: 'absolute', top: cy - SIZE / 2, alignSelf: 'center', width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Defs>
            <LinearGradient id="rotG" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={OB.pink} />
              <Stop offset="1" stopColor="#FF8CC0" />
            </LinearGradient>
          </Defs>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#FFFFFF" strokeWidth={13} />
          <Circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="url(#rotG)" strokeWidth={11} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0.005, p))}
          />
        </Svg>
      </View>

      {/* Disco branco Ø214 com a porcentagem */}
      <View style={{
        position: 'absolute', top: cy - 107, alignSelf: 'center', width: 214, height: 214, borderRadius: 107,
        backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingTop: 78,
        shadowColor: OB.pink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.10, shadowRadius: 12,
      }}>
        <Text style={{ fontSize: 54, lineHeight: 58, fontWeight: '700', letterSpacing: -1.2, color: OB.ink, fontVariant: ['tabular-nums'] }}>{pct}</Text>
        <Text style={{ fontSize: 18, lineHeight: 18, fontWeight: '500', color: OB.sub, marginLeft: 3 }}>%</Text>
      </View>

      <Text style={{
        position: 'absolute', left: 24, right: 24, top: y(562), textAlign: 'center',
        fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, color: OB.ink,
      }}>
        {name ? `Criando uma rotina só sua, ${name}` : 'Criando uma rotina só sua'}
      </Text>
      <Text style={{
        position: 'absolute', left: 24, right: 24, top: y(595), textAlign: 'center',
        fontSize: 15, lineHeight: 20, color: OB.sub, opacity: lineOpacity,
      }}>
        {lines[idx]}
      </Text>

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(640), flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
        {[6, 14, 14, 6].map((w, k) => (
          <Animated.View key={k} style={{
            width: w, height: 5, borderRadius: 3, backgroundColor: OB.pink,
            opacity: dots.interpolate({
              inputRange: [0, 0.25, 0.5, 0.75, 1],
              outputRange: [0, 1, 2, 3, 4].map((j) => 0.35 + 0.65 * Math.max(0, Math.cos(((j / 4) - k / 4) * Math.PI * 2))),
            }),
          }} />
        ))}
      </View>
    </ObScreen>
  );
}
