import { useEffect, useRef, useState } from 'react';
import { Text, Image, Pressable, Animated, Easing, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, useObFrame, useObName, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { commitmentPhrase } from '../../components/onboarding/answers';

// Tela 28 do fluxo completo — compromisso, última tela antes do paywall.
//
// Repouso: "Eu, <nome>, vou usar a NIKS para" + frase personalizada pelo que ela
//   marcou em "o que te incomoda"; círculo rosa Ø144 centrado em y 509 com a digital
//   branca do design e aura Ø216; círculo e aura respiram (1 → 1,04, 2 s, loop).
// Os estados de segurar/completo são os de antes (o fluxo completo só redesenhou o
// repouso):
// Segurando (2 s): o círculo cresce continuamente até cobrir a tela, a aura
//   junto; "Continue segurando!" entra com fade quando o círculo passa de ~250 pt;
//   vibração a cada 0,25 s ficando mais forte (leve → média → forte).
//   Soltar antes → volta ao repouso com mola suave (~450 ms, sem overshoot).
// Completo: rosa na tela inteira, vibração de sucesso, "Bem-vinda ao NIKS!"
//   com fade de 300 ms; ~1 s depois, paywall.
const STEP = OB_STEPS.compromisso;
const STEP_NAME = 'Compromisso';

const CIRCLE = 144;
const AURA = 216;
const CENTER_Y = 509;       // centro do círculo no frame do design
const HOLD_MS = 2000;
const TEXT_AT_D = 250;      // diâmetro em que "Continue segurando!" aparece

// Digital branca do design (`digital-branca.png`, 61 × 85 no círculo).
const DIGITAL = require('../../assets/onboarding/digital-branca.png');
const ICON_W = 61;
const ICON_H = 85;
// "Continue segurando!" e "Bem-vinda ao NIKS!" ficam ACIMA da digital, com 24 pt de
// respiro até o topo dela. (Eram posições fixas da digital antiga, de 72 pt; com a
// de 85 pt as frases encostavam nela.) `textTop(lineHeight)` = topo da frase no frame.
const TEXT_GAP = 24;
const textTop = (lineHeight: number) => CENTER_Y - ICON_H / 2 - TEXT_GAP - lineHeight;

export default function Compromisso() {
  const router = useRouter();
  const { track } = useMixpanel();
  const concerns = useAppStore((s) => s.onboarding.concerns);
  const name = useObName();
  const { y } = useObFrame();
  const { width, height } = useWindowDimensions();

  const hold = useRef(new Animated.Value(0)).current;    // 0 = 21a, 1 = cobre a tela
  const breath = useRef(new Animated.Value(1)).current;  // respiração do repouso
  const done = useRef(new Animated.Value(0)).current;    // fade do 21c
  const holdAnim = useRef<Animated.CompositeAnimation | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef(0);
  const completed = useRef(false);
  const [finished, setFinished] = useState(false);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  // Escala que faz o círculo cobrir a tela inteira a partir do seu centro.
  const cy = y(CENTER_Y);
  const farthest = Math.max(
    Math.hypot(width / 2, cy),
    Math.hypot(width / 2, height - cy),
  );
  const coverScale = (farthest * 2) / CIRCLE;
  // A aura acompanha: segurando (círculo Ø384) ela está em Ø720.
  const auraCover = (coverScale * CIRCLE * (720 / 384)) / AURA;
  const textAt = (TEXT_AT_D / CIRCLE - 1) / (coverScale - 1);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1.04, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breath, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); stopPulses(); };
  }, []);

  const stopPulses = () => {
    if (pulseTimer.current) clearInterval(pulseTimer.current);
    pulseTimer.current = null;
  };

  const complete = () => {
    if (completed.current) return;
    completed.current = true;
    stopPulses();
    haptics.success();
    setFinished(true);
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    Animated.timing(done, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    setTimeout(() => router.replace('/(onboarding)/paywall-soft' as any), 1000 + 300);
  };

  const onPressIn = () => {
    if (completed.current) return;
    holdStart.current = Date.now();
    haptics.holdPulse(0);
    pulseTimer.current = setInterval(() => {
      const elapsed = Date.now() - holdStart.current;
      haptics.holdPulse(elapsed < HOLD_MS / 3 ? 0 : elapsed < (2 * HOLD_MS) / 3 ? 1 : 2);
    }, 250);
    holdAnim.current?.stop();
    hold.stopAnimation((current) => {
      holdAnim.current = Animated.timing(hold, {
        toValue: 1,
        duration: HOLD_MS * (1 - current),
        easing: Easing.linear,
        useNativeDriver: true,
      });
      holdAnim.current.start(({ finished: ok }) => { if (ok) complete(); });
    });
  };

  const onPressOut = () => {
    if (completed.current) return;
    stopPulses();
    holdAnim.current?.stop();
    // Mola suave, sem overshoot visível (~450 ms).
    Animated.spring(hold, { toValue: 0, damping: 26, stiffness: 180, mass: 1, overshootClamping: true, useNativeDriver: true }).start();
  };

  const circleScale = Animated.multiply(breath, hold.interpolate({ inputRange: [0, 1], outputRange: [1, coverScale] }));
  const auraScale = Animated.multiply(breath, hold.interpolate({ inputRange: [0, 1], outputRange: [1, auraCover] }));
  const keepHolding = hold.interpolate({
    inputRange: [0, Math.max(0.0001, textAt), Math.min(1, textAt + 0.08)],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const iconTop = cy - ICON_H / 2;

  return (
    <ObScreen variant="blush">
      <StatusBar style={finished ? 'light' : 'dark'} />

      {/* Textos do repouso — a aura cresce POR CIMA deles (cobertos, não desbotados) */}
      <Text numberOfLines={1} adjustsFontSizeToFit style={{
        position: 'absolute', left: 17, right: 17, top: y(231), textAlign: 'center',
        fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, color: OB.ink,
      }}>
        {name ? `Eu, ${name}, vou usar a NIKS para` : 'Eu vou usar a NIKS para'}
      </Text>
      <Text style={{
        position: 'absolute', left: 30, right: 30, top: y(267), textAlign: 'center',
        fontSize: 17, lineHeight: 22, fontWeight: '400', color: OB.ink,
      }}>
        {commitmentPhrase(concerns)}
      </Text>
      <Text style={{
        position: 'absolute', left: 17, right: 17, top: y(604), textAlign: 'center',
        fontSize: 17, lineHeight: 21, fontWeight: '600', color: OB.pink,
      }}>
        {'Segure a logo para\nse comprometer.'}
      </Text>

      {/* Aura: radial-gradient(circle, .38 0%, .16 45%, 0 70%) — no CSS o raio vai até
          o canto, então 45% e 70% caem em 0,636 e 0,99 do raio do círculo. */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: width / 2 - AURA / 2, top: cy - AURA / 2, width: AURA, height: AURA,
        transform: [{ scale: auraScale }],
      }}>
        <Svg width={AURA} height={AURA}>
          <Defs>
            <RadialGradient id="aura" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={OB.pink} stopOpacity={0.38} />
              <Stop offset="0.636" stopColor={OB.pink} stopOpacity={0.16} />
              <Stop offset="0.99" stopColor={OB.pink} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={AURA / 2} cy={AURA / 2} r={AURA / 2} fill="url(#aura)" />
        </Svg>
      </Animated.View>

      {/* Círculo */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: width / 2 - CIRCLE / 2, top: cy - CIRCLE / 2,
        width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, backgroundColor: OB.pink,
        transform: [{ scale: circleScale }],
      }} />

      <Animated.Text pointerEvents="none" style={{
        position: 'absolute', left: 0, right: 0, top: y(textTop(22)), textAlign: 'center',
        fontSize: 17, lineHeight: 22, fontWeight: '600', color: '#FFFFFF', opacity: keepHolding,
      }}>
        Continue segurando!
      </Animated.Text>

      {/* Completo — tela inteira rosa + "Bem-vinda ao NIKS!" */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: OB.pink, opacity: done,
      }}>
        <Text style={{
          position: 'absolute', left: 17, right: 17, top: y(textTop(28)), textAlign: 'center',
          fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, color: '#FFFFFF',
        }}>
          Bem-vinda ao NIKS!
        </Text>
      </Animated.View>

      {/* Digital: mesma posição nos três estados (centro em y 509) — é também o alvo do toque */}
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        pressRetentionOffset={{ top: 2000, bottom: 2000, left: 2000, right: 2000 }}
        hitSlop={{ top: (CIRCLE - ICON_H) / 2, bottom: (CIRCLE - ICON_H) / 2, left: (CIRCLE - ICON_W) / 2, right: (CIRCLE - ICON_W) / 2 }}
        style={{ position: 'absolute', left: width / 2 - ICON_W / 2, top: iconTop }}
      >
        <Image source={DIGITAL} style={{ width: ICON_W, height: ICON_H }} />
      </Pressable>
    </ObScreen>
  );
}
