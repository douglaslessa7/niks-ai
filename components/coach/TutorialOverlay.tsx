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
// As posições vêm de `lib/coachMarks.ts`, medidas a cada 300 ms como o
// `setInterval(measure, 300)` do design (pega rolagem, carregamento tardio etc.).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Mask, Path, Rect } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import {
  CoachRect, CoachTargetKey, CoachTargets,
  requestCoachMeasure, requestCoachPrepare, useCoachTargets,
} from '../../lib/coachMarks';

/** Caixa de uma parada (o `a`/`b` do design): união dos alvos `u`, largura fixa `w`
 *  centrada (opcional), folga `pad` e raio (`'pill'` = metade da altura). */
export type TutSpec = { u: CoachTargetKey[]; pad?: number; r: number | 'pill'; w?: number };
export type TutStop = { t: string; a: TutSpec; b?: TutSpec; anchor?: 'b'; scroll?: boolean };

type Box = { x: number; y: number; w: number; h: number; r: number };

const SCRIM = 'rgba(26,8,18,0.74)';
const PINK = '#FF5EA8';
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

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

/** `box()` do design: união dos alvos → largura fixa → folga → limita a 8pt das bordas. */
function boxOf(spec: TutSpec, targets: CoachTargets, W: number, off: Frame | null): Box | null {
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
  return useRef({
    x: new Animated.Value(0), y: new Animated.Value(0), w: new Animated.Value(0),
    h: new Animated.Value(0), r: new Animated.Value(0),
  }).current;
}
type BoxAnim = ReturnType<typeof useBoxAnim>;
function moveBox(v: BoxAnim, to: Box, instant: boolean) {
  const pairs: [Animated.Value, number][] = [[v.x, to.x], [v.y, to.y], [v.w, to.w], [v.h, to.h], [v.r, to.r]];
  if (instant) { pairs.forEach(([a, n]) => a.setValue(n)); return; }
  Animated.parallel(pairs.map(([a, n]) =>
    Animated.timing(a, { toValue: n, duration: 450, easing: EASE, useNativeDriver: false }))).start();
}

/** Contorno: `border:2px solid #FF5EA8` + `box-shadow:0 0 0 5px rgba(255,94,168,.22)`. */
function Ring({ v, opacity }: { v: BoxAnim; opacity: Animated.Value | number }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', opacity,
        left: Animated.add(v.x, -5), top: Animated.add(v.y, -5),
        width: Animated.add(v.w, 10), height: Animated.add(v.h, 10),
        borderRadius: Animated.add(v.r, 5), borderWidth: 5, borderColor: 'rgba(255,94,168,0.22)',
      }}
    >
      <Animated.View style={{ flex: 1, borderRadius: v.r, borderWidth: 2, borderColor: PINK }} />
    </Animated.View>
  );
}

export default function TutorialOverlay({ stops: allStops, onFinish }: { stops: TutStop[]; onFinish: () => void }) {
  const targets = useCoachTargets();
  let { width: W, height: H } = useWindowDimensions();
  const { frame: androidFrame, measureProps } = useAndroidOverlayFrame();
  if (Platform.OS === 'android' && androidFrame) { W = androidFrame.width; H = androidFrame.height; }

  // Medição: `setInterval(measure, 300)` do design + rajadas durante as transições.
  const burstRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const burst = useCallback((ms: number) => {
    if (burstRef.current) clearInterval(burstRef.current);
    const end = Date.now() + ms;
    burstRef.current = setInterval(() => {
      requestCoachMeasure();
      if (Date.now() > end && burstRef.current) { clearInterval(burstRef.current); burstRef.current = null; }
    }, 50);
  }, []);
  useEffect(() => {
    const iv = setInterval(requestCoachMeasure, 300);
    return () => { clearInterval(iv); if (burstRef.current) clearInterval(burstRef.current); };
  }, []);

  // Paradas: congeladas depois da 1ª medição (+ carência de 500 ms). Parada sem
  // alvo nenhum na tela é PULADA — o tutorial nunca trava esperando um elemento.
  const [started, setStarted] = useState(false);
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    requestCoachPrepare(allStops[0]?.scroll ? 'end' : 'top');
    const t1 = setTimeout(() => { requestCoachMeasure(); burst(1000); }, 60);
    const t2 = setTimeout(() => setStarted(true), 200);
    const t3 = setTimeout(() => setGraceOver(true), 700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const stopsRef = useRef<TutStop[] | null>(null);
  if (started && !stopsRef.current) {
    const has = (st: TutStop) => st.a.u.some((k) => targets[k]);
    if (allStops.every(has) || graceOver) stopsRef.current = allStops.filter(has);
  }
  const stops = stopsRef.current ?? [];
  const LAST = stops.length - 1;

  const [s, setS] = useState(0);
  const [tipOn, setTipOn] = useState(true);
  const [closing, setClosing] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  const st = stops[s];
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
  const ovOp = useRef(new Animated.Value(0)).current;
  const ringBOp = useRef(new Animated.Value(0)).current;
  const tipOp = useRef(new Animated.Value(0)).current;
  const tipY = useRef(new Animated.Value(0)).current;
  const firstRef = useRef(true);
  const aKey = A ? `${A.x},${A.y},${A.w},${A.h},${A.r}` : '';
  const bKey = B ? `${B.x},${B.y},${B.w},${B.h},${B.r}` : '';
  useEffect(() => {
    if (!A) return;
    const first = firstRef.current;
    firstRef.current = false;
    moveBox(av, A, first);
    moveBox(bv, B ?? A, first);
    if (first) Animated.timing(ovOp, { toValue: 1, duration: 350, easing: Easing.ease, useNativeDriver: false }).start();
  }, [aKey, bKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Animated.timing(ringBOp, { toValue: B ? 1 : 0, duration: 300, easing: Easing.ease, useNativeDriver: false }).start();
  }, [!!B]); // eslint-disable-line react-hooks/exhaustive-deps

  // Balão: abaixo do recorte se couber (150 pt de balão + 62 do "Pular"), senão acima.
  const a = A ?? { x: 196, y: 400, w: 0, h: 0, r: 0 };
  const b = B ?? a;
  const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y + a.h, b.y + b.h);
  const below = y2 + 16 + 150 <= H - 62;
  const anc = st?.anchor === 'b' && B ? b : a;
  const ax = Math.max(22, Math.min(W - 40 - 36, anc.x + anc.w / 2 - 20 - 7));
  useEffect(() => {
    Animated.parallel([
      Animated.timing(tipOp, { toValue: tipOn ? 1 : 0, duration: 250, easing: Easing.ease, useNativeDriver: true }),
      Animated.timing(tipY, { toValue: tipOn ? 0 : (below ? 6 : -6), duration: 350, easing: EASE, useNativeDriver: true }),
    ]).start();
  }, [tipOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n: number) => {
    setTipOn(false);
    at(180, () => { setS(n); requestCoachPrepare(stops[n].scroll ? 'end' : 'top'); burst(1000); });
    at(stops[n].scroll ? 820 : 520, () => setTipOn(true));
  };
  const close = () => {
    if (closing) return;
    setClosing(true);
    Animated.timing(ovOp, { toValue: 0, duration: 350, easing: Easing.ease, useNativeDriver: false }).start();
    at(350, onFinish);
  };
  const next = () => {
    if (closing) return;
    if (s >= LAST) { haptics.success(); close(); } else { haptics.tap(); go(s + 1); }
  };

  // Android: antes de desenhar, o overlay precisa da própria medida.
  if (Platform.OS === 'android' && !androidFrame) {
    return <View style={StyleSheet.absoluteFill} pointerEvents="none" {...measureProps} />;
  }
  if (!st || !ready) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: ovOp, zIndex: 40 }]}
      pointerEvents={closing ? 'none' : 'auto'}
      accessibilityViewIsModal
      {...measureProps}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={next} accessibilityRole="button" accessibilityLabel={`${st.t}. ${s === LAST ? 'Toque para começar' : 'Toque para continuar'}.`}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id="tut-hole">
              <Rect x={0} y={0} width={W} height={H} fill="#FFFFFF" />
              <AnimatedRect x={av.x} y={av.y} width={av.w} height={av.h} rx={av.r} ry={av.r} fill="#000000" />
              <AnimatedRect x={bv.x} y={bv.y} width={bv.w} height={bv.h} rx={bv.r} ry={bv.r} fill="#000000" />
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill={SCRIM} mask="url(#tut-hole)" />
        </Svg>

        <Ring v={av} opacity={1} />
        <Ring v={bv} opacity={ringBOp} />

        {/* Balão */}
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
            <Text style={styles.count}>{`${s + 1} de ${stops.length}`}</Text>
            <View style={styles.hintRow}>
              <Text style={styles.hint}>{s === LAST ? 'Toque para começar' : 'Toque para continuar'}</Text>
              <Svg width={13} height={13} viewBox="0 0 24 24">
                <Path d="M9 6l6 6-6 6" fill="none" stroke="#8A8387" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          </View>
        </Animated.View>
      </Pressable>

      {/* Pular */}
      <View pointerEvents="box-none" style={styles.skipWrap}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); close(); }} style={styles.skip} accessibilityRole="button" accessibilityLabel="Pular tutorial">
          <Text style={styles.skipText}>Pular</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
