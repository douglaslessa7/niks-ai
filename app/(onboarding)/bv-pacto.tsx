import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, Animated, Easing, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useObName, useOnMount } from '../../components/onboarding/kit';
import { useAppStore } from '../../store/onboarding';
import { selarPacto } from '../../lib/boasVindas';
import {
  BV, BvScreen, BvProgresso, BvEtiqueta, BvTitulo, BvCheck, useBvFrame,
} from '../../components/boasVindas/kit';

// Boas-vindas · tela 5 "Pacto" (frame "05"). Desde 07/nov/2026 (pedido do produto) o botão de
// segurar é IGUAL ao do compromisso do onboarding (`(onboarding)/compromisso.tsx`): círculo
// rosa Ø144 com a DIGITAL BRANCA, halo Ø216 respirando (1 → 1,04, 2 s); segurar 2 s faz o
// círculo crescer até cobrir a tela, com vibração a cada 0,25 s ficando mais forte; soltar antes
// volta com mola suave. Completo: tela inteira rosa + vibração de sucesso → ~0,6 s → tela 6.
// Os textos de cima continuam os do design (horários = os que ela escolheu no onboarding).
// É o pacto que faz o servidor creditar os +100 NIKS Points depois do cadastro (`selarPacto`).
// Fica JUNTO com o compromisso de antes do paywall (decisão do produto, 07/nov/2026).
const CIRCLE = 144;
const AURA = 216;
const CENTRO_Y = 562;          // centro do círculo no frame (o do design: 470 + 184/2)
const HOLD_MS = 2000;
const TEXT_AT_D = 250;         // diâmetro em que "Continue segurando!" aparece
const DIGITAL = require('../../assets/onboarding/digital-branca.png');

const hora = (v: string | null | undefined, padrao: string) => (v && /^\d{1,2}:\d{2}/.test(v) ? v.slice(0, 5).padStart(5, '0') : padrao);

export default function BvPacto() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const { y } = useBvFrame();
  const { width, height } = useWindowDimensions();
  const manha = useAppStore((s) => hora(s.onboarding.rotina_manha_horario, '07:30'));
  const noite = useAppStore((s) => hora(s.onboarding.rotina_noite_horario, '22:00'));

  const hold = useRef(new Animated.Value(0)).current;    // 0 = repouso, 1 = cobre a tela
  const breath = useRef(new Animated.Value(1)).current;  // respiração do repouso
  const done = useRef(new Animated.Value(0)).current;    // tela inteira rosa
  const holdAnim = useRef<Animated.CompositeAnimation | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef(0);
  const completed = useRef(false);
  const [finished, setFinished] = useState(false);

  useOnMount(() => track('boas_vindas_tela', { tela: 5, nome: 'pacto' }));

  const cy = y(CENTRO_Y);
  const farthest = Math.max(Math.hypot(width / 2, cy), Math.hypot(width / 2, height - cy));
  const coverScale = (farthest * 2) / CIRCLE;
  const auraCover = (coverScale * CIRCLE * (720 / 384)) / AURA;
  const textAt = (TEXT_AT_D / CIRCLE - 1) / (coverScale - 1);

  const stopPulses = () => {
    if (pulseTimer.current) clearInterval(pulseTimer.current);
    pulseTimer.current = null;
  };

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1.04, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breath, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); stopPulses(); };
  }, []);

  const complete = () => {
    if (completed.current) return;
    completed.current = true;
    stopPulses();
    haptics.success();
    setFinished(true);
    track('boas_vindas_pacto', { selado_em: new Date().toISOString() });
    void selarPacto();
    Animated.timing(done, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    setTimeout(() => router.replace('/(onboarding)/bv-recompensa' as any), 300 + 300);
  };

  const onPressIn = () => {
    if (completed.current) return;
    holdStart.current = Date.now();
    haptics.holdPulse(0);
    stopPulses();
    pulseTimer.current = setInterval(() => {
      const elapsed = Date.now() - holdStart.current;
      haptics.holdPulse(elapsed < HOLD_MS / 3 ? 0 : elapsed < (2 * HOLD_MS) / 3 ? 1 : 2);
    }, 250);
    holdAnim.current?.stop();
    hold.stopAnimation((current) => {
      holdAnim.current = Animated.timing(hold, {
        toValue: 1, duration: HOLD_MS * (1 - current), easing: Easing.linear, useNativeDriver: true,
      });
      holdAnim.current.start(({ finished: ok }) => { if (ok) complete(); });
    });
  };

  const onPressOut = () => {
    if (completed.current) return;
    stopPulses();
    holdAnim.current?.stop();
    Animated.spring(hold, { toValue: 0, damping: 26, stiffness: 180, mass: 1, overshootClamping: true, useNativeDriver: true }).start();
  };

  const circleScale = Animated.multiply(breath, hold.interpolate({ inputRange: [0, 1], outputRange: [1, coverScale] }));
  const auraScale = Animated.multiply(breath, hold.interpolate({ inputRange: [0, 1], outputRange: [1, auraCover] }));
  const keepHolding = hold.interpolate({
    inputRange: [0, Math.max(0.0001, textAt), Math.min(1, textAt + 0.08)],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  return (
    <BvScreen>
      {finished && <StatusBar style="light" />}
      <BvProgresso feitas={4} />

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(104), paddingHorizontal: 20 }}>
        <BvEtiqueta>AGORA É COM VOCÊ</BvEtiqueta>
        <BvTitulo style={{ marginTop: 10 }}>
          {name ? `Eu, ${name}, vou cuidar da minha pele 2× por dia.` : 'Eu vou cuidar da minha pele 2× por dia.'}
        </BvTitulo>
        <View style={{ marginTop: 18, gap: 10 }}>
          {[`Matinal às ${manha} · Noturna às ${noite}`, 'Nos dias corridos, 1 passo de 2 minutos'].map((t) => (
            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <BvCheck />
              <Text style={{ flex: 1, fontSize: 16, letterSpacing: -0.2, color: BV.dark }}>{t}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={{
        position: 'absolute', left: 30, right: 30, top: cy + CIRCLE / 2 + 23, textAlign: 'center',
        fontSize: 17, lineHeight: 21, fontWeight: '600', color: BV.pink,
      }}>
        {'Toque e segure\npara selar o pacto.'}
      </Text>

      {/* Halo (o mesmo do compromisso): radial .38 → .16 → 0. */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: width / 2 - AURA / 2, top: cy - AURA / 2, width: AURA, height: AURA,
        transform: [{ scale: auraScale }],
      }}>
        <Svg width={AURA} height={AURA}>
          <Defs>
            <RadialGradient id="auraPacto" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={BV.pink} stopOpacity={0.38} />
              <Stop offset="0.636" stopColor={BV.pink} stopOpacity={0.16} />
              <Stop offset="0.99" stopColor={BV.pink} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={AURA / 2} cy={AURA / 2} r={AURA / 2} fill="url(#auraPacto)" />
        </Svg>
      </Animated.View>

      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: width / 2 - CIRCLE / 2, top: cy - CIRCLE / 2,
        width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, backgroundColor: BV.pink,
        transform: [{ scale: circleScale }],
      }} />

      <Animated.Text pointerEvents="none" style={{
        position: 'absolute', left: 0, right: 0, top: cy - 69, textAlign: 'center',
        fontSize: 17, lineHeight: 22, fontWeight: '600', color: '#FFFFFF', opacity: keepHolding,
      }}>
        Continue segurando!
      </Animated.Text>

      <Animated.View pointerEvents="none" style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BV.pink, opacity: done,
      }} />

      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel="Segurar para selar o pacto"
        accessibilityActions={[{ name: 'activate', label: 'Selar o pacto' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate') complete(); }}
        pressRetentionOffset={{ top: 2000, bottom: 2000, left: 2000, right: 2000 }}
        style={{
          position: 'absolute', left: width / 2 - CIRCLE / 2, top: cy - CIRCLE / 2,
          width: CIRCLE, height: CIRCLE, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Image source={DIGITAL} style={{ width: 54, height: 75 }} />
      </Pressable>
    </BvScreen>
  );
}
