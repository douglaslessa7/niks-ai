// ─────────────────────────────────────────────────────────────────────────────
// Tutorial de primeiro acesso da home — "coach marks" (referência: app Vivid).
//
// A tela inteira escurece, um BURACO iluminado recorta o elemento da vez e uma
// frase grande e branca explica para que ele serve. A usuária avança tocando em
// qualquer lugar; na última parada o toque fecha.
//
// ⚠️ ESTE COMPONENTE PRECISA SER RENDERIZADO NO `(app)/_layout.tsx`, como IRMÃO
// da `GlobalBottomBar` e DEPOIS dela. Renderizado dentro da `home.tsx` ele fica
// ABAIXO da navbar por mais zIndex que leve — no React Native o zIndex só vale
// entre irmãos do mesmo pai, e a navbar mora no layout (pai), a home é filha do
// `<Tabs>`. Sem isso os passos 3–5 (ícones da navbar) seriam impossíveis.
//
// ⚠️ O TOQUE NÃO CHEGA AO ELEMENTO DESTACADO, de propósito: o `Pressable` raiz
// cobre a tela inteira, buraco incluído — ele é só um desenho. O toque avança o
// tutorial e nada mais; um toque que também abrisse a câmera tiraria a usuária
// do tutorial no primeiro passo.
//
// As posições vêm de `lib/coachMarks.ts` (registro de módulo alimentado pela
// home e pela navbar) — ver o cabeçalho de lá para o porquê dos dois canais de
// medição.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import { haptics } from '../../lib/haptics';
import {
  CoachRect,
  CoachTargetKey,
  requestCoachMeasure,
  requestCoachPrepare,
  useCoachTargets,
} from '../../lib/coachMarks';

// Identidade do "Novo design": rosa da marca + texto branco sobre o véu escuro.
const CORAL = '#FF9D9D';
const SCRIM = 'rgba(12,12,14,0.86)';

// Animação do buraco: props de SVG NÃO aceitam native driver (ver decisão 22 do
// README — mesma razão do `strokeDashoffset` das telas de loading).
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const MOVE_MS = 320;
const TEXT_MS = 200;

// As 5 paradas, na ordem. `key` casa com o que a home/navbar registram; um passo
// cujo alvo não foi medido é PULADO (ver `steps` abaixo) — é o que protege o
// passo do card de métricas para quem ainda não tem scan.
const STEPS: { key: CoachTargetKey; text: string }[] = [
  { key: 'scan',         text: 'Escaneie seu rosto para acompanhar a evolução da sua pele' },
  { key: 'metrics',      text: 'Toque nas suas métricas para compartilhar seu Niks score' },
  { key: 'nav-rotina',   text: 'Aqui fica a sua rotina de skincare personalizada' },
  { key: 'nav-produtos', text: 'Veja os produtos recomendados pra sua pele e escaneie os que você já tem' },
  { key: 'nav-chat',     text: 'Tire suas dúvidas com a NIKS, sua expert de pele' },
];

type Hole = { x: number; y: number; w: number; h: number; r: number };

/**
 * Infla o retângulo medido e resolve o raio pelo FORMATO do elemento: pílula no
 * botão Escanear, retângulo arredondado no card, círculo nos ícones da navbar.
 */
function holeFor(rect: CoachRect): Hole {
  if (rect.shape === 'circle') {
    // Ícone de navbar: o alvo medido é o glifo (29×29). Um círculo generoso em
    // volta dele lê melhor do que a caixa exata.
    const size = Math.max(rect.width, rect.height) + 30;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    return { x: cx - size / 2, y: cy - size / 2, w: size, h: size, r: size / 2 };
  }
  const pad = 10;
  const x = rect.x - pad;
  const y = rect.y - pad;
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;
  const r = rect.shape === 'pill'
    ? h / 2
    : Math.min((rect.radius ?? 16) + pad, h / 2, w / 2);
  return { x, y, w, h, r };
}

export default function HomeCoachMarks({ onFinish }: { onFinish: () => void }) {
  const targets = useCoachTargets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold, Nunito_600SemiBold });
  const fXBold = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fSemi = fontsLoaded ? 'Nunito_600SemiBold' : undefined;

  // ── Medição antes de desenhar qualquer coisa ──────────────────────────────
  // 1) prepare → a home rola para o topo (o card de métricas pode estar fora da
  //    viewport); 2) measure → todos os alvos se remedem; 3) só então começa.
  // Enquanto isso não renderizamos nada: um véu escuro com o buraco no lugar
  // errado, ainda que por 200ms, é pior do que 200ms de nada.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    requestCoachPrepare();
    const t1 = setTimeout(() => requestCoachMeasure(), 60);
    const t2 = setTimeout(() => setStarted(true), 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Uma medida que chega atrasada não pode derrubar um passo em silêncio: espera
  // até TODOS os alvos existirem, e só desiste depois da carência. Sem isso, um
  // `measureInWindow` lento faria o tutorial pular uma parada sem ninguém notar.
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    if (!started) return;
    const t = setTimeout(() => setGraceOver(true), 500);
    return () => clearTimeout(t);
  }, [started]);

  // Depois disso a lista CONGELA: se um alvo sumisse no meio (re-layout), a lista
  // encolher trocaria a frase debaixo do dedo da usuária.
  const stepsRef = useRef<{ key: CoachTargetKey; text: string }[] | null>(null);
  if (started && !stepsRef.current) {
    const present = STEPS.filter((s) => targets[s.key]);
    // `metrics` é opcional de propósito (usuária sem scan — ver a home); os
    // outros 4 são obrigatórios para a lista ser considerada completa.
    const complete = STEPS.every((s) => s.key === 'metrics' || targets[s.key]);
    if (complete || graceOver) stepsRef.current = present;
  }
  const steps = stepsRef.current ?? [];

  const [index, setIndex] = useState(0);
  const step = steps[index];
  const rect = step ? targets[step.key] : undefined;

  // O buraco da vez. Mantém o último válido: se uma remedição atrasada apagar o
  // alvo por um instante, o recorte não pisca.
  const lastHole = useRef<Hole | null>(null);
  const hole = useMemo(() => {
    if (rect) lastHole.current = holeFor(rect);
    return lastHole.current;
  }, [rect]);

  // ── Animação do recorte + do texto ────────────────────────────────────────
  const hx = useRef(new Animated.Value(0)).current;
  const hy = useRef(new Animated.Value(0)).current;
  const hw = useRef(new Animated.Value(0)).current;
  const hh = useRef(new Animated.Value(0)).current;
  const hr = useRef(new Animated.Value(0)).current;
  const scrimIn = useRef(new Animated.Value(0)).current;
  const textIn = useRef(new Animated.Value(0)).current;
  const firstHoleRef = useRef(true);

  useEffect(() => {
    if (!hole) return;
    const pairs: [Animated.Value, number][] = [
      [hx, hole.x], [hy, hole.y], [hw, hole.w], [hh, hole.h], [hr, hole.r],
    ];

    // Primeira parada: o buraco NASCE no lugar (nada de voar do canto da tela).
    // "Reduzir movimento" ligado: todas as trocas são instantâneas.
    if (firstHoleRef.current || reduceMotion) {
      firstHoleRef.current = false;
      pairs.forEach(([v, to]) => v.setValue(to));
    } else {
      Animated.parallel(
        pairs.map(([v, to]) => Animated.timing(v, {
          toValue: to,
          duration: MOVE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // props de SVG — ver decisão 22
        })),
      ).start();
    }

    // O texto sempre troca com fade (mesmo em "reduzir movimento" ele só aparece
    // — opacidade não é movimento; o que fica de fora é o deslize, abaixo).
    textIn.setValue(0);
    Animated.timing(textIn, {
      toValue: 1,
      duration: TEXT_MS,
      delay: reduceMotion ? 0 : 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [hole, reduceMotion]);

  useEffect(() => {
    if (!started) return;
    Animated.timing(scrimIn, {
      toValue: 1,
      duration: reduceMotion ? 0 : 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [started, reduceMotion]);

  if (!started || !step || !hole) return null;

  const isLast = index === steps.length - 1;

  const advance = () => {
    if (isLast) {
      haptics.success();
      onFinish();
      return;
    }
    haptics.tap();
    // Apaga o texto ANTES do re-render: como a posição da frase é calculada na
    // hora (ela pula para o outro lado do buraco), sem isso a frase ANTIGA
    // apareceria por um quadro já na posição NOVA, antes de o fade recomeçar.
    textIn.setValue(0);
    setIndex((i) => i + 1);
  };

  // ── Posição do texto: do lado do buraco que tem MAIS espaço ────────────────
  // Nunca por cima do elemento destacado — seria a frase escondendo justamente o
  // que ela explica. A escolha é por espaço disponível (e não por "metade de cima
  // / metade de baixo"): numa tela curta, o lado geometricamente "natural" pode
  // simplesmente não caber, e aí a frase estouraria a safe area.
  const GAP = 36;
  const spaceAbove = hole.y - insets.top;
  const spaceBelow = screenH - (hole.y + hole.h) - insets.bottom;
  const above = spaceAbove > spaceBelow;
  const textStyle = above
    ? { bottom: Math.max(screenH - hole.y + GAP, insets.bottom + 24) }
    : { top: Math.max(hole.y + hole.h + GAP, insets.top + 24) };

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal pointerEvents="box-none">
      <StatusBar style="light" />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrimIn }]} pointerEvents="box-none">
        {/* Véu + recorte. O buraco é feito por MÁSCARA (branco = véu, preto =
            buraco): assim as coordenadas do recorte são props animáveis de um
            <Rect>, o que um path `d` (string) não permite interpolar. */}
        <Svg width={screenW} height={screenH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id="coach-hole">
              <Rect x={0} y={0} width={screenW} height={screenH} fill="#FFFFFF" />
              <AnimatedRect x={hx} y={hy} width={hw} height={hh} rx={hr} ry={hr} fill="#000000" />
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={screenW} height={screenH} fill={SCRIM} mask="url(#coach-hole)" />
          {/* Aro rosa da marca contornando o recorte */}
          <AnimatedRect
            x={hx} y={hy} width={hw} height={hh} rx={hr} ry={hr}
            fill="none" stroke={CORAL} strokeWidth={2} strokeOpacity={0.9}
          />
        </Svg>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.textBlock,
            textStyle,
            {
              opacity: textIn,
              transform: reduceMotion
                ? []
                : [{ translateY: textIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          <Text style={[styles.title, { fontFamily: fXBold }]}>{step.text}</Text>

          {/* Progresso: a usuária sabe que são 5 paradas e onde está */}
          <View style={styles.dots}>
            {steps.map((s, i) => (
              <View
                key={s.key}
                style={[styles.dot, i === index ? styles.dotOn : styles.dotOff]}
              />
            ))}
          </View>

          <Text style={[styles.hint, { fontFamily: fSemi }]}>
            {isLast ? 'Toque para começar' : 'Toque para continuar'}
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Captura TODOS os toques — inclusive sobre o elemento destacado. Fica por
          último para ficar acima do desenho; o desenho é `pointerEvents: none`. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={advance}
        accessibilityRole="button"
        accessibilityLabel={`${step.text}. Toque para ${isLast ? 'começar' : 'continuar'}.`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  textBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.7,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 22,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOn: { backgroundColor: CORAL },
  dotOff: { backgroundColor: 'rgba(255,255,255,0.28)' },
  hint: {
    marginTop: 16,
    fontSize: 13.5,
    letterSpacing: -0.1,
    color: 'rgba(255,255,255,0.62)',
  },
});
