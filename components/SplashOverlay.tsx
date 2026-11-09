import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useAppStore } from '../store/onboarding';

// ─────────────────────────────────────────────────────────────────────────────
// Splash 0a do onboarding novo ("NIKS Onboarding Modelos"): fundo branco e só a
// logo #FF5EA8 com 132 pt de largura no CENTRO EXATO da tela. Roda em TODA
// abertura a frio (é montada no layout raiz), não só no onboarding.
//
// Como funciona:
//   1. A splash NATIVA (app.json → plugin `expo-splash-screen`, `imageWidth: 132`,
//      mesmo PNG) é idêntica a este componente — mesmo arquivo, mesmo tamanho,
//      mesmo centro. `preventAutoHideAsync()` a segura (no topo do `app/_layout`)
//      e ela só é escondida, SEM fade, depois que esta cópia desenhou o 1º quadro:
//      a troca nativa → JS é invisível.
//   2. Esta cópia fica por cima do app enquanto o DESTINO não está pronto —
//      welcome, paywall ou home (incluindo o guard de assinatura/nome do
//      `(app)/_layout`). Quem decide chama `markSplashDestinationReady()`.
//   3. Mínimo de 1 s (nota do design: "para não piscar") e então fade de 300 ms
//      revelando o destino, seja qual for. Com "Reduzir movimento" também é só o
//      fade de 300 ms — o design não tem outro movimento.
//   4. Ao terminar, `splashDone = true`: é o que libera o tutorial da home.
//   5. Piscada no MEIO (03/nov/2026, pedido do produto): logo parada → 300 ms depois
//      de a nativa sair, apaga até 35% e volta (160 + 240 ms, o vale do `niksPulse` do
//      design novo) → mais 600 ms parada, e só então a splash pode sair. Antes, a
//      piscada caía colada na saída e parecia a transição. Com isso a splash dura no
//      mínimo 1,3 s (era 1 s). Com "Reduzir movimento", não pisca e vale o mínimo de 1 s.
//
// Rede de segurança: se nenhum destino avisar em 12 s (algo travou), revela assim
// mesmo — melhor mostrar a tela do que prender a usuária na logo.
// ─────────────────────────────────────────────────────────────────────────────
// `splash-logo-FF5EA8.png` = a logo do design (196×199, `niks-logo-FF5EA8.png`)
// centrada num quadrado de 199×199 transparente, com TODO pixel no RGB #FF5EA8 e o
// alpha original. Por quê: (1) o plugin `expo-splash-screen` gera a imagem nativa
// QUADRADA — com a origem quadrada, 134×134 pt mostram a logo em 132×134 pt, as
// medidas do design, igual aqui; (2) o redimensionamento do plugin misturava o RGB
// preto dos pixels transparentes e a logo saía acinzentada (~rgb 151,56,100).
// Nativa e JS usam o MESMO arquivo no MESMO tamanho — é o que torna a troca invisível.
const LOGO = require('../assets/onboarding/splash-logo-FF5EA8.png');
const LOGO_W = 134;
const LOGO_H = 134;
const MIN_MS = 1000;
const FADE_MS = 300;
const FAILSAFE_MS = 12000;
const BLINK_DELAY_MS = 300;   // logo parada antes da piscada
const BLINK_MIN = 0.35;
const BLINK_HOLD_MS = 600;    // logo parada DEPOIS da piscada, antes de a splash sair

export default function SplashOverlay() {
  const { width, height } = useWindowDimensions();
  const destinationReady = useAppStore((s) => s.splashDestinationReady);
  const setSplashDone = useAppStore((s) => s.setSplashDone);
  const opacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const [minElapsed, setMinElapsed] = useState(false);
  const [failsafe, setFailsafe] = useState(false);
  // A splash só sai depois da piscada E de mais um tempo parada (a piscada fica no
  // meio, não colada na saída). Sem piscada ("Reduzir movimento"), vale só o mínimo.
  const [blinkDone, setBlinkDone] = useState(false);
  const [gone, setGone] = useState(false);
  const nativeHidden = useRef(false);

  useEffect(() => {
    const a = setTimeout(() => setMinElapsed(true), MIN_MS);
    const b = setTimeout(() => setFailsafe(true), FAILSAFE_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  useEffect(() => {
    if (gone) return;
    if (!failsafe && !(minElapsed && blinkDone && destinationReady)) return;
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
      setGone(true);
      setSplashDone(true);
    });
  }, [minElapsed, blinkDone, destinationReady, failsafe, gone]);

  // Esconde a nativa só depois do 1º quadro desta cópia (sem fade: são idênticas).
  const handleLayout = () => {
    if (nativeHidden.current) return;
    nativeHidden.current = true;
    requestAnimationFrame(() => {
      SplashScreen.setOptions({ fade: false, duration: 0 });
      SplashScreen.hide();
      blink();
    });
  };

  const blink = () => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) { setBlinkDone(true); return; }
      Animated.sequence([
        Animated.delay(BLINK_DELAY_MS),
        Animated.timing(logoOpacity, { toValue: BLINK_MIN, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.delay(BLINK_HOLD_MS),
      ]).start(() => setBlinkDone(true));
    }).catch(() => setBlinkDone(true));
  };

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents="auto"
      onLayout={handleLayout}
      style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999, backgroundColor: '#FFFFFF', opacity }]}
    >
      <Animated.Image
        source={LOGO}
        style={{
          position: 'absolute', width: LOGO_W, height: LOGO_H,
          left: (width - LOGO_W) / 2, top: (height - LOGO_H) / 2,
          opacity: logoOpacity,
        }}
      />
    </Animated.View>
  );
}
