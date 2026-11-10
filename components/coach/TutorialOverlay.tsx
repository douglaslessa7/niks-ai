// ─────────────────────────────────────────────────────────────────────────────
// Tutorial de primeira entrada — réplica do overlay dos designs NiksHomeTutorial
// (58a–58d) e NiksProductsTutorial (59a–59d) do Claude Design (projeto "NIKS home
// redesign — rotina skincare"). Os dois arquivos têm o MESMO overlay; só mudam as
// paradas (ver `HomeCoachMarks.tsx` e `ProdutosCoachMarks.tsx`).
//
// A tela escurece (rgba(26,8,18,.74)), um ou dois elementos ficam recortados com
// contorno rosa, e um balão branco com seta traz a frase, "N de 4" e "Toque para
// continuar". Tocar em qualquer lugar avança; o recorte desliza (.45 s,
// cubic-bezier(.2,.8,.2,1)) até a próxima parada. "Pular" ou a última parada
// fecham (fade .35 s) e chamam `onFinish`.
//
// ⚠️ RENDERIZAR NO `(app)/_layout.tsx`, depois da `GlobalBottomBar`: o véu cobre a
// navbar (no design o overlay é z-index 40, a nav 32) e o zIndex do RN só vale
// entre irmãos. O toque NÃO chega ao elemento destacado — o recorte é só desenho.
//
// As posições vêm de `lib/coachMarks.ts`. O véu, o recorte e os contornos são desenhados no
// Skia, com shared values: o movimento roda no thread de UI, sem refazer layout nem máscara
// a cada quadro. Medir é caro: só na troca de parada e, de leve, a cada 1 s (carga tardia).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Animated, BackHandler, Easing, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Reanimated, {
  Easing as REasing, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { Canvas, Fill, Group, RoundedRect, Skia } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../../lib/haptics';
import {
  CoachRect, CoachTargetKey, CoachTargets,
  requestCoachMeasure, requestCoachPrepare, useCoachTargets,
} from '../../lib/coachMarks';

/** Altura da faixa do "Pular" a partir da borda de baixo: 30 + 44 do botão + 10 de folga. */
const SKIP_FAIXA = 84;

/** Caixa de uma parada (o `a`/`b` do design): união dos alvos `u`, largura fixa `w`
 *  centrada (opcional), folga `pad` e raio (`'pill'` = metade da altura). */
export type TutSpec = { u: CoachTargetKey[]; pad?: number; r: number | 'pill'; w?: number };
export type TutStop = { t: string; a: TutSpec; b?: TutSpec; anchor?: 'b'; scroll?: boolean | 'mural' };

const rolagem = (st?: TutStop) => (st?.scroll === 'mural' ? 'mural' : st?.scroll ? 'end' : 'top');

type Box = { x: number; y: number; w: number; h: number; r: number };

const SCRIM = 'rgba(26,8,18,0.74)';
const PINK = '#FF5EA8';
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const REASE = REasing.bezier(0.2, 0.8, 0.2, 1);
const HALO = 'rgba(255,94,168,0.22)';

// ── SÓ ANDROID: medida real do próprio overlay ────────────────────────────────
// No Android (edge-to-edge, 3 botões ou gestos) a origem do `measureInWindow` pode
// não coincidir com o canto do overlay: o overlay se mede com a MESMA API e as
// caixas usam a DIFERENÇA. No iOS o hook é uma constante (nada muda).
type Frame = { x: number; y: number; width: number; height: number };
type AndroidOverlay = { frame: Frame | null; measureProps: { ref?: RefObject<View | null>; onLayout?: () => void } };
function useAndroidOverlayFrameImpl(): AndroidOverlay {
  const ref = useRef<View | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const onLayout = useCallback(() => {
    ref.current?.measureInWindow?.((x, y, width, height) => {
      if (!width || !height) return;
      setFrame((p) => (p && Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5
        && Math.abs(p.width - width) < 0.5 && Math.abs(p.height - height) < 0.5 ? p : { x, y, width, height }));
    });
  }, []);
  const measureProps = useMemo(() => ({ ref, onLayout }), [onLayout]);
  return { frame, measureProps };
}
const NO_ANDROID: AndroidOverlay = { frame: null, measureProps: {} };
const useAndroidOverlayFrame: () => AndroidOverlay =
  Platform.OS === 'android' ? useAndroidOverlayFrameImpl : () => NO_ANDROID;

/** `box()` do design: união dos alvos → largura fixa → folga → limita a 8pt das bordas.
 *  Também usado pelas dicas das missões (`GuiaHost`). */
export function boxOf(spec: TutSpec, targets: CoachTargets, W: number, off: Frame | null): Box | null {
  const rs = spec.u.map((k) => targets[k]).filter(Boolean) as CoachRect[];
  if (!rs.length) return null;
  const ox = off?.x ?? 0, oy = off?.y ?? 0;
  let x1 = Math.min(...rs.map((r) => r.x)) - ox;
  let y1 = Math.min(...rs.map((r) => r.y)) - oy;
  let x2 = Math.max(...rs.map((r) => r.x + r.width)) - ox;
  let y2 = Math.max(...rs.map((r) => r.y + r.height)) - oy;
  if (spec.w) { const cx = (x1 + x2) / 2; x1 = cx - spec.w / 2; x2 = cx + spec.w / 2; }
  const p = spec.pad || 0;
  x1 = Math.max(8, x1 - p); x2 = Math.min(W - 8, x2 + p); y1 -= p; y2 += p;
  const h = y2 - y1;
  return { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(h), r: spec.r === 'pill' ? Math.round(h / 2) : spec.r };
}

/** Valores animados de uma caixa (x, y, w, h, r) — transição de .45 s do design. */
function useBoxAnim() {
  const x = useSharedValue(0), y = useSharedValue(0), w = useSharedValue(0), h = useSharedValue(0), r = useSharedValue(0);
  return useMemo(() => ({ x, y, w, h, r }), [x, y, w, h, r]);
}
type BoxAnim = ReturnType<typeof useBoxAnim>;
function moveBox(v: BoxAnim, to: Box, instant: boolean) {
  const pairs: [SharedValue<number>, number][] = [[v.x, to.x], [v.y, to.y], [v.w, to.w], [v.h, to.h], [v.r, to.r]];
  pairs.forEach(([a, n]) => a.set(instant ? n : withTiming(n, { duration: 450, easing: REASE })));
}

/** Caixa `v` com `d` pontos a mais de cada lado. */
function useRRect(v: BoxAnim, d: number) {
  return useDerivedValue(() => {
    const raio = Math.max(0, v.r.get() + d);
    return Skia.RRectXY(Skia.XYWHRect(v.x.get() - d, v.y.get() - d, Math.max(0, v.w.get() + 2 * d), Math.max(0, v.h.get() + 2 * d)), raio, raio);
  });
}

/** Recorte (`clear`) + os dois traços do contorno: `border:2px #FF5EA8` + halo de 5 pt. */
function Furo({ v, opacity }: { v: BoxAnim; opacity?: SharedValue<number> }) {
  const furo = useRRect(v, 0);
  const halo = useRRect(v, 2.5);
  const traco = useRRect(v, -1);
  return (
    <>
      <RoundedRect rect={furo} r={0} color="#000000" blendMode="clear" />
      <Group opacity={opacity ?? 1}>
        <RoundedRect rect={halo} r={0} color={HALO} style="stroke" strokeWidth={5} />
        <RoundedRect rect={traco} r={0} color={PINK} style="stroke" strokeWidth={2} />
      </Group>
    </>
  );
}

/** O primeiro desenho do Skia custa caro: desenha o véu uma vez, invisível, antes de precisar. */
export function PreaquecerVeu() {
  return (
    <View style={styles.aquecer} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill color={SCRIM} />
        <RoundedRect x={0} y={0} width={1} height={1} r={0.5} color="#000000" blendMode="clear" />
        <RoundedRect x={0} y={0} width={1} height={1} r={0.5} color={HALO} style="stroke" strokeWidth={5} />
      </Canvas>
    </View>
  );
}

type Props = {
  stops: TutStop[];
  onFinish: () => void;
  /** Tutorial obrigatório: sem "Pular". */
  semPular?: boolean;
  /** Tutorial em vários trechos: paradas anteriores e total, para o "N de M". */
  antes?: number;
  total?: number;
  /** Avisa a parada atual: posição dela em `stops`. */
  onParada?: (indice: number) => void;
};

export default function TutorialOverlay({ stops: allStops, onFinish, semPular = false, antes = 0, total, onParada }: Props) {
  const targets = useCoachTargets();
  // "Reduzir movimento" (06/nov/2026): o recorte pula direto para a próxima parada e o
  // balão só esmaece (sem deslizar 6 pt).
  const reduzir = useReducedMotion();
  const insets = useSafeAreaInsets();
  let { width: W, height: H } = useWindowDimensions();
  const { frame: androidFrame, measureProps } = useAndroidOverlayFrame();
  if (Platform.OS === 'android' && androidFrame) { W = androidFrame.width; H = androidFrame.height; }

  // Medição: leve e só do que está em destaque (carga tardia); a troca de parada mede na hora.
  const alvosRef = useRef<CoachTargetKey[] | undefined>(undefined);
  useEffect(() => {
    const iv = setInterval(() => requestCoachMeasure(alvosRef.current), 1000);
    return () => clearInterval(iv);
  }, []);

  // Paradas: congeladas depois da 1ª medição (+ carência de 500 ms). Parada sem
  // alvo nenhum na tela é PULADA — o tutorial nunca trava esperando um elemento.
  const [started, setStarted] = useState(false);
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    requestCoachPrepare(rolagem(allStops[0]));
    const medir = [60, 180, 450, 650].map((ms) => setTimeout(() => requestCoachMeasure(), ms));
    const t2 = setTimeout(() => setStarted(true), 200);
    const t3 = setTimeout(() => setGraceOver(true), 700);
    return () => { medir.forEach(clearTimeout); clearTimeout(t2); clearTimeout(t3); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const stopsRef = useRef<TutStop[] | null>(null);
  if (started && !stopsRef.current) {
    const has = (st: TutStop) => st.a.u.some((k) => targets[k]);
    if (allStops.every(has) || graceOver) stopsRef.current = allStops.filter(has);
  }
  const stops = stopsRef.current ?? [];
  const LAST = stops.length - 1;
  const congelou = stopsRef.current != null;
  const vazio = congelou && stops.length === 0;

  const [s, setS] = useState(0);
  const [tipOn, setTipOn] = useState(true);
  const [closing, setClosing] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  const st = stops[s];
  alvosRef.current = st ? [...st.a.u, ...(st.b?.u ?? [])] : undefined;
  // Nenhum alvo na tela depois da carência: o tutorial obrigatório segue, nunca trava.
  useEffect(() => {
    if (vazio && semPular) onFinish();
  }, [vazio]); // eslint-disable-line react-hooks/exhaustive-deps
  const indiceReal = st ? allStops.indexOf(st) : -1;
  useEffect(() => {
    if (indiceReal >= 0) onParada?.(indiceReal);
  }, [indiceReal]); // eslint-disable-line react-hooks/exhaustive-deps
  // Android: o botão voltar não sai do tutorial obrigatório.
  useEffect(() => {
    if (!semPular) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [semPular]);
  const off = Platform.OS === 'android' ? androidFrame : null;
  // Mantém a última caixa válida: uma remedição que some por um instante não pisca.
  const lastA = useRef<Box | null>(null);
  const lastB = useRef<Box | null>(null);
  const A = st ? boxOf(st.a, targets, W, off) ?? lastA.current : null;
  const B = st?.b ? boxOf(st.b, targets, W, off) : null;
  if (A) lastA.current = A;
  lastB.current = B;
  const ready = !!A;

  // ── Animações ──────────────────────────────────────────────────────────────
  const av = useBoxAnim();
  const bv = useBoxAnim();
  const ovOp = useSharedValue(0);
  const ringBOp = useSharedValue(0);
  const tipOp = useRef(new Animated.Value(0)).current;
  const tipY = useRef(new Animated.Value(0)).current;
  const rootSt = useAnimatedStyle(() => ({ opacity: ovOp.get() }));
  const firstRef = useRef(true);
  const aKey = A ? `${A.x},${A.y},${A.w},${A.h},${A.r}` : '';
  const bKey = B ? `${B.x},${B.y},${B.w},${B.h},${B.r}` : '';
  useEffect(() => {
    if (!A) return;
    const first = firstRef.current;
    firstRef.current = false;
    moveBox(av, A, first || reduzir);
    moveBox(bv, B ?? A, first || reduzir);
    if (first) ovOp.set(withTiming(1, { duration: 350, easing: REasing.ease }));
  }, [aKey, bKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    ringBOp.set(withTiming(B ? 1 : 0, { duration: 300, easing: REasing.ease }));
  }, [!!B]); // eslint-disable-line react-hooks/exhaustive-deps

  // Balão: abaixo do recorte se couber (150 pt de balão + 62 do "Pular"), senão acima.
  const a = A ?? { x: 196, y: 400, w: 0, h: 0, r: 0 };
  const b = B ?? a;
  const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y + a.h, b.y + b.h);
  const below = y2 + 16 + 150 <= H - 62;
  // "Pular" fica embaixo, a 30 pt da borda. Se o destaque chega nessa faixa (ícones da barra
  // de abas, "Escanear produto"), ele vai para o topo, para não ficar em cima do destaque.
  const skipNoTopo = y2 > H - SKIP_FAIXA;
  const anc = st?.anchor === 'b' && B ? b : a;
  const ax = Math.max(22, Math.min(W - 40 - 36, anc.x + anc.w / 2 - 20 - 7));
  useEffect(() => {
    Animated.parallel([
      Animated.timing(tipOp, { toValue: tipOn ? 1 : 0, duration: 250, easing: Easing.ease, useNativeDriver: true }),
      Animated.timing(tipY, { toValue: tipOn || reduzir ? 0 : (below ? 6 : -6), duration: 350, easing: EASE, useNativeDriver: true }),
    ]).start();
  }, [tipOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n: number) => {
    setTipOn(false);
    const chaves = [...stops[n].a.u, ...(stops[n].b?.u ?? [])];
    // Com rolagem: o recorte espera a tela assentar, em vez de perseguir o alvo enquanto ela anda.
    if (stops[n].scroll) {
      requestCoachPrepare(rolagem(stops[n]));
      at(480, () => requestCoachMeasure(chaves));
      at(520, () => setS(n));
      at(900, () => setTipOn(true));
      return;
    }
    at(180, () => { requestCoachPrepare(rolagem(stops[n])); requestCoachMeasure(chaves); setS(n); });
    at(330, () => requestCoachMeasure(chaves));
    at(520, () => setTipOn(true));
  };
  const close = () => {
    if (closing) return;
    setClosing(true);
    ovOp.set(withTiming(0, { duration: 350, easing: REasing.ease }));
    at(350, onFinish);
  };
  const next = () => {
    if (closing) return;
    if (s >= LAST) { if (total == null || antes + s + 1 >= total) haptics.success(); else haptics.tap(); close(); } else { haptics.tap(); go(s + 1); }
  };

  // Android: antes de desenhar, o overlay precisa da própria medida.
  if (Platform.OS === 'android' && !androidFrame) {
    return <View style={StyleSheet.absoluteFill} pointerEvents="none" {...measureProps} />;
  }
  // Obrigatório: enquanto mede, nenhum toque passa para a tela de baixo.
  if (!st || !ready) return semPular && !vazio ? <View style={StyleSheet.absoluteFill} /> : null;

  const fim = total != null ? antes + s + 1 >= total : s === LAST;
  const contagem = `${antes + s + 1} de ${total ?? stops.length}`;
  const dica = fim ? 'Toque para começar' : 'Toque para continuar';
  const baloes = (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tip,
        below ? { top: y2 + 16 } : { bottom: H - y1 + 16 },
        { opacity: tipOp, transform: [{ translateY: tipY }] },
      ]}
    >
      <View style={[styles.arrow, { left: ax }, below ? { top: -6 } : { bottom: -6 }]} />
      <Text style={styles.text} lineBreakStrategyIOS="push-out">{st.t}</Text>
      <View style={styles.foot}>
        <Text style={styles.count}>{contagem}</Text>
        <View style={styles.hintRow}>
          <Text style={styles.hint}>{dica}</Text>
          <Svg width={13} height={13} viewBox="0 0 24 24">
            <Path d="M9 6l6 6-6 6" fill="none" stroke="#8A8387" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </View>
    </Animated.View>
  );
  const veu = (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill color={SCRIM} />
        <Furo v={av} />
        <Furo v={bv} opacity={ringBOp} />
      </Canvas>
    </View>
  );

  return (
    <Reanimated.View
      style={[StyleSheet.absoluteFill, { zIndex: 40 }, rootSt]}
      pointerEvents={closing ? 'none' : 'auto'}
      accessibilityViewIsModal
      {...measureProps}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={next} accessibilityRole="button" accessibilityLabel={`${st.t}. ${dica}.`}>
        {veu}
        {baloes}
      </Pressable>

      {/* Pular */}
      {!semPular && (
        <View pointerEvents="box-none" style={[styles.skipWrap, skipNoTopo && { bottom: undefined, top: insets.top + 8 }]}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); close(); }} style={styles.skip} accessibilityRole="button" accessibilityLabel="Pular tutorial">
            <Text style={styles.skipText}>Pular</Text>
          </TouchableOpacity>
        </View>
      )}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  aquecer: { position: 'absolute', left: 0, top: 0, width: 2, height: 2, opacity: 0.01 },
  tip: {
    position: 'absolute', left: 20, right: 20,
    paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14, borderRadius: 20, backgroundColor: '#FFFFFF',
    gap: 12,
    shadowColor: '#000000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.28, shadowRadius: 20, elevation: 16,
  },
  arrow: {
    position: 'absolute', width: 14, height: 14, backgroundColor: '#FFFFFF', borderRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
  text: { fontSize: 17, fontWeight: '600', lineHeight: 23, letterSpacing: -0.35, color: '#121212' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  count: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: '#E8468F' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  hint: { fontSize: 13, fontWeight: '500', letterSpacing: -0.1, color: '#8A8387' },
  skipWrap: { position: 'absolute', left: 0, right: 0, bottom: 30, alignItems: 'center' },
  skip: { height: 44, paddingHorizontal: 22, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' },
  skipText: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' },
});
