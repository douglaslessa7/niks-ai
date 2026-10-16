import { useEffect, useRef, useState } from 'react';
import { Text, Image, Pressable, Animated, Easing, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, useObFrame, useObName, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 23 do onboarding — compromisso, depois do horário da rotina e última antes do
// paywall. Repouso = RÉPLICA da tela "28 Compromisso" de "NIKS Onboarding - fluxo
// completo.dc.html" (Claude Design): círculo rosa Ø144 com a DIGITAL BRANCA no meio
// (`digital-branca.png`, 54 × 75 — o mesmo arquivo do design), halo Ø216, centro em
// y 509. Os estados de segurar/completo (21b/21c) vêm do handoff anterior
// "design_handoff_compromisso" — a tela 28 só desenha o repouso.
// Medidas no frame de 393 × 852 pt, convertidas por `y()`. Instrução "Toque e segure
// para se comprometer." (pedido do produto; o design diz "Segure a logo para…").
//
// 21a (repouso): "Eu, <nome>, vou usar o NIKS para" + frase fixa; círculo e halo
//   respiram (1 → 1,04, 2 s, loop).
// 21b (segurando, 2 s): o círculo cresce continuamente até cobrir a tela, a aura
//   junto; "Continue segurando!" entra com fade quando o círculo passa de ~250 pt;
//   vibração a cada 0,25 s ficando mais forte (leve → média → forte).
//   Soltar antes → volta ao 21a com mola suave (~450 ms, sem overshoot).
// 21c (completo): rosa na tela inteira, vibração de sucesso, "Bem-vinda ao NIKS!"
//   com fade de 300 ms; ~1 s depois, paywall.
const STEP = OB_STEPS.compromisso;
const STEP_NAME = 'Compromisso';

const CIRCLE = 144;
const AURA = 216;
const CENTER_Y = 509;       // centro do círculo no frame do design (top 437 + 72)
const HOLD_MS = 2000;
const TEXT_AT_D = 250;      // diâmetro em que "Continue segurando!" aparece

// Asset EXATO da tela 28 (`assets/digital-branca.png` do design, 367 × 510).
const DIGITAL = require('../../assets/onboarding/digital-branca.png');

export default function Compromisso() {
  const router = useRouter();
  const { track } = useMixpanel();
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
  // A aura acompanha: no quadro 21b (círculo Ø384) ela está em Ø720.
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
    // Aceite do compromisso com horário (handoff: "salvar que a usuária aceitou").
    // Vai no evento, NÃO em `onboarding.commitment`: mudar o onboarding troca a chave
    // da rotina pré-gerada e a faria ser gerada de novo.
    track('onboarding_step_completed', { ...obStep(STEP, STEP_NAME), commitment_accepted_at: new Date().toISOString() });
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

  return (
    <ObScreen>
      <StatusBar style={finished ? 'light' : 'dark'} />

      {/* Textos do 21a — a aura cresce POR CIMA deles (cobertos, não desbotados) */}
      <Text numberOfLines={1} adjustsFontSizeToFit style={{
        position: 'absolute', left: 17, right: 17, top: y(231), textAlign: 'center',
        fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, color: OB.ink,
      }}>
        {name ? `Eu, ${name}, vou usar o NIKS para` : 'Eu vou usar o NIKS para'}
      </Text>
      <Text style={{
        position: 'absolute', left: 30, right: 30, top: y(267), textAlign: 'center',
        fontSize: 17, lineHeight: 22, fontWeight: '400', color: OB.ink,
      }}>
        {/* Frase FIXA (pedido do produto); o design personaliza pelas preocupações. */}
        fazer meu skincare todos os dias e alcançar a melhor pele da minha vida.
      </Text>
      <Text style={{
        position: 'absolute', left: 30, right: 30, top: y(604), textAlign: 'center',
        fontSize: 17, lineHeight: 21, fontWeight: '600', color: OB.pink,
      }}>
        {'Toque e segure\npara se comprometer.'}
      </Text>

      {/* Halo da tela 28: radial-gradient(circle, .38 0%, .16 45%, 0 70%) num quadrado de
          216. No CSS o `circle` mede até o canto (108·√2), então 45% e 70% viram 0,636 e
          0,99 do raio do SVG (108). */}
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
        position: 'absolute', left: 0, right: 0, top: y(440), textAlign: 'center',
        fontSize: 17, lineHeight: 22, fontWeight: '600', color: '#FFFFFF', opacity: keepHolding,
      }}>
        Continue segurando!
      </Animated.Text>

      {/* 21c — tela inteira rosa + "Bem-vinda ao NIKS!" */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: OB.pink, opacity: done,
      }}>
        <Text style={{
          position: 'absolute', left: 17, right: 17, top: y(427), textAlign: 'center',
          fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, color: '#FFFFFF',
        }}>
          Bem-vinda ao NIKS!
        </Text>
      </Animated.View>

      {/* Digital branca: mesma posição nos três estados (centro em y 509). O alvo do toque
          é o círculo inteiro (Ø144), com a digital de 54 × 75 centrada nele. */}
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel="Segurar para se comprometer"
        accessibilityActions={[{ name: 'activate', label: 'Me comprometer' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate') complete(); }}
        pressRetentionOffset={{ top: 2000, bottom: 2000, left: 2000, right: 2000 }}
        style={{
          position: 'absolute', left: width / 2 - CIRCLE / 2, top: cy - CIRCLE / 2,
          width: CIRCLE, height: CIRCLE, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Image source={DIGITAL} style={{ width: 54, height: 75 }} />
      </Pressable>
    </ObScreen>
  );
}
