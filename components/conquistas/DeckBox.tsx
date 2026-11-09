// ─────────────────────────────────────────────────────────────────────────────
// Caixa de baralho (tuck box) das coleções — designs 78a/78e/78f do Claude Design
// (NiksConquistas.dc.html). No design a caixa é CSS 3D (`perspective:640px`,
// `rotateY(-26deg)`, `preserve-3d` + `translateZ`), que o React Native não tem. Aqui
// a MESMA cena é montada no Skia: cada face recebe a matriz 4×4 que o navegador
// calcularia (matrizes iguais às do CSS, linha a linha) e é desenhada na ordem de
// profundidade do design: fundo (z −10) → tampa → cartas (z −5…+4) → frente (z +10)
// → lateral. Coordenadas = as do contêiner 84×118 do design.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef } from 'react';
import { useTelaFocada } from '../../hooks/useTelaFocada';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useDerivedValue, useAnimatedStyle, withSpring, withTiming, withDelay, withRepeat, withSequence,
  Easing, ReduceMotion, cancelAnimation, type SharedValue,
} from 'react-native-reanimated';
import {
  Canvas, Group, Rect, RoundedRect, Path, Circle, Oval, LinearGradient, Shadow, BlurMask, BlendColor,
  Image as SkImage, useImage, Skia, PathOp, rrect, rect,
} from '@shopify/react-native-skia';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import type { Deck } from '../../lib/conquistas';

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const SPARKLE = 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z';
const STAR4 = 'M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z';

export const BOX_H = 196;
const PAD = 48; // folga do Canvas: as cartas saem por cima da caixa e o leque abre para os lados

/** Relógio do ambiente: 156 s = mmc de 12 s (brilho, ida e volta) e 5,2 s (respirar). */
export const AMBIENT_MS = 156000;

// ── Matrizes 4×4 (linha a linha, convenção do CSS) ───────────────────────────
type M4 = number[];
function mul(a: M4, b: M4): M4 {
  'worklet';
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[j + 4] + a[i * 4 + 2] * b[j + 8] + a[i * 4 + 3] * b[j + 12];
  }
  return r;
}
function chain(...ms: M4[]): M4 {
  'worklet';
  let r = ms[0];
  for (let i = 1; i < ms.length; i++) r = mul(r, ms[i]);
  return r;
}
function T(x: number, y: number, z = 0): M4 {
  'worklet';
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
}
function persp(d: number): M4 {
  'worklet';
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1 / d, 1];
}
function RY(deg: number): M4 {
  'worklet';
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
}
function RX(deg: number): M4 {
  'worklet';
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}
function RZ(deg: number): M4 {
  'worklet';
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
type Mat4 = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
function asT(m: M4) {
  'worklet';
  return [{ matrix: m as unknown as Mat4 }];
}

// linear-gradient(<deg>) do CSS numa caixa x,y,w,h → pontos de início/fim do Skia.
export function cssGrad(deg: number, x: number, y: number, w: number, h: number) {
  'worklet';
  const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
  const L = Math.abs(w * dx) + Math.abs(h * dy), cx = x + w / 2, cy = y + h / 2;
  return { start: { x: cx - (dx * L) / 2, y: cy - (dy * L) / 2 }, end: { x: cx + (dx * L) / 2, y: cy + (dy * L) / 2 } };
}

// Reflexo holográfico do design (data-holo): degradê 115° com background-size 260% e
// background-position X% 50%, que o ambiente leva de 15% a 85% e volta (6 s, ease-in-out).
const HOLO_COLORS = ['rgba(255,255,255,0)', 'rgba(255,170,215,0.9)', 'rgba(205,180,255,0.9)', 'rgba(255,255,255,1)', 'rgba(255,190,225,0.9)', 'rgba(190,175,255,0.85)', 'rgba(255,255,255,0)'];
const HOLO_POS = [0.18, 0.3, 0.4, 0.5, 0.6, 0.7, 0.82];
function holoPts(pos: number, x: number, y: number, w: number, h: number) {
  'worklet';
  const iw = 2.6 * w, ih = 2.6 * h;
  return cssGrad(115, x + (w - iw) * pos, y + (h - ih) * 0.5, iw, ih);
}
const EASE_IO = Easing.bezierFn(0.42, 0, 0.58, 1); // 'ease-in-out' do CSS
function pingPong(t: number, offset: number, half: number) {
  'worklet';
  const u = (((t + offset) % (2 * half)) + 2 * half) % (2 * half) / half;
  return EASE_IO(u <= 1 ? u : 2 - u);
}

export function spr(z: number, r: number, eps = 0.002) {
  'worklet';
  return {
    stiffness: Math.pow((2 * Math.PI) / r, 2), damping: (4 * Math.PI * z) / r, mass: 1,
    restDisplacementThreshold: eps, restSpeedThreshold: eps * 2, reduceMotion: ReduceMotion.Never,
  };
}

// ── Estilo de cada baralho (frame() do design) ───────────────────────────────
function deckStyle(rare: boolean) {
  return rare
    ? {
        box: { deg: 150, colors: ['#FFD9EA', '#F7C2E0', '#E2CBFA', '#FFD3E8'], pos: [0, 0.34, 0.66, 1] }, dot: 'rgba(255,255,255,0.35)',
        side: ['#DDB8F2', '#CDA0E6'], back: '#C9A3E2', flap: ['#F1DDFB', '#E3C6F4'], holoO: 0.9,
      }
    : {
        box: { deg: 160, colors: ['#FF86C1', '#FF5EA8', '#F24F9C'], pos: [0, 0.55, 1] }, dot: 'rgba(255,255,255,0.22)',
        side: ['#E84F98', '#D23F86'], back: '#C93A80', flap: ['#FF9ACB', '#F56FB0'], holoO: 0.6,
      };
}
// Leque: [rotação, x, z] — 3 cartas com 8+ no baralho, 2 de 3 a 7, 1 abaixo disso.
const FANS: Record<number, [number, number, number][]> = {
  3: [[-11, -9, -5], [9, 9, -1], [-2, 0, 4]],
  2: [[9, 6, -2], [-5, -3, 4]],
  1: [[-3, 0, 3]],
};
const SPARKS: [number, number, number, string][] = [[22, 26, 12, '#FF5EA8'], [134, 16, 10, '#D9B8FF'], [146, 104, 13, '#FF8CC0'], [12, 120, 9, '#D9B8FF'], [100, 2, 8, '#FF5EA8']];

// Caminho com cantos diferentes (o Skia só tem RoundedRect uniforme).
function roundPath(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number) {
  return `M${x + tl} ${y}H${x + w - tr}A${tr} ${tr} 0 0 1 ${x + w} ${y + tr}V${y + h - br}A${br} ${br} 0 0 1 ${x + w - br} ${y + h}H${x + bl}A${bl} ${bl} 0 0 1 ${x} ${y + h - bl}V${y + tl}A${tl} ${tl} 0 0 1 ${x + tl} ${y}Z`;
}

// Brilho que atravessa (data-sheen): translateX(-160% → 320%) skewX(-18°), 820 ms.
function Sheen({ x, y, w, h, frac, sheen }: { x: number; y: number; w: number; h: number; frac: number; sheen: SharedValue<number> }) {
  const sw = w * frac, sy = y - 0.3 * h, sh = 1.6 * h;
  const tr = useDerivedValue(() => [{ translateX: (-1.6 + 4.8 * sheen.get()) * sw }, { skewX: (-18 * Math.PI) / 180 }]);
  return (
    <Group transform={tr} origin={{ x: x + sw / 2, y: sy + sh / 2 }}>
      <Rect x={x} y={sy} width={sw} height={sh}>
        <LinearGradient start={{ x, y: 0 }} end={{ x: x + sw, y: 0 }} colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']} />
      </Rect>
    </Group>
  );
}

function Holo({ x, y, w, h, opacity, pos }: { x: number; y: number; w: number; h: number; opacity: number; pos: SharedValue<number> }) {
  const start = useDerivedValue(() => holoPts(pos.get(), x, y, w, h).start);
  const end = useDerivedValue(() => holoPts(pos.get(), x, y, w, h).end);
  return (
    <Rect x={x} y={y} width={w} height={h} opacity={opacity} blendMode="overlay">
      <LinearGradient start={start} end={end} colors={HOLO_COLORS} positions={HOLO_POS} />
    </Rect>
  );
}

const CARD_COLORS = ['#FFE1EE', '#FBCDE5', '#EBD6FB', '#FFD9EA'];
const CARD_POS = [0, 0.38, 0.66, 1];

type Props = {
  deck: Deck;
  index: number;          // posição do baralho na tela (fase do respirar)
  width: number;
  clock: SharedValue<number>;
  sheen: SharedValue<number>;
  rm: boolean;
  onOpen: (frame: { x: number; y: number; w: number; h: number }) => void;
};

export default function DeckBox({ deck, index, width, clock, sheen, rm, onOpen }: Props) {
  const st = deckStyle(deck.rare);
  const logoWhite = useImage(require('../../assets/home/niks-logo.png'));
  const logoPink = useImage(require('../../assets/home/score-logo-pink.png'));
  const nOut = deck.n >= 8 ? 3 : deck.n >= 3 ? 2 : 1;
  const fan = FANS[nOut];

  // Tocar no baralho (78e): as cartas sobem 30 px (mola ζ0,78 r0,5), o leque abre
  // (ζ0,8 r0,5, 40 ms depois) e a sombra cresce 15% (280 ms). Some aos 900 ms.
  const lift = useSharedValue(0);
  const fanP = useSharedValue(0);
  const shP = useSharedValue(0);
  const wrapRef = useRef<View>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const press = () => {
    haptics.tap();
    wrapRef.current?.measureInWindow((x, y, w, h) => onOpen({ x, y, w, h }));
    if (rm) return;
    lift.set(withSpring(1, spr(0.78, 0.5)));
    fanP.set(withDelay(40, withSpring(1, spr(0.8, 0.5))));
    shP.set(withTiming(1, { duration: 280, easing: EO }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { lift.set(0); fanP.set(0); shP.set(0); }, 900);
  };

  // Geometria fixa. Contêiner 84×118 encostado 22 pt acima do pé da área de 196.
  const ox = PAD + width / 2 - 42, oy = PAD + BOX_H - 22 - 118;
  const base = useMemo(() => chain(T(ox + 42, oy + 59), persp(640), RY(-26), T(-42, -59)), [ox, oy]);
  const mBack = useMemo(() => asT(mul(base, T(0, 0, -10))), [base]);
  const mFlap = useMemo(() => asT(chain(base, T(42, 0, -10), RX(40), T(-42, 0))), [base]);
  const mFront = useMemo(() => asT(mul(base, T(0, 0, 10))), [base]);
  const mSide = useMemo(() => asT(chain(base, T(42, 59), RY(90), T(0, 0, 42), T(-42, -59))), [base]);

  // Ambiente: respirar 2,5 pt (2,6 s ida e volta, −430 ms por baralho) e reflexo
  // holográfico 15%→85% (6 s, −900 ms por elemento). Reduzir movimento: parado.
  const breathe = useDerivedValue(() => (rm ? 0 : -2.5 * pingPong(clock.get(), index * 430, 2600)));
  const holoCard = useDerivedValue(() => (rm ? 0.2 : 0.15 + 0.7 * pingPong(clock.get(), index * 2 * 900, 6000)));
  const holoBox = useDerivedValue(() => (rm ? 0.2 : 0.15 + 0.7 * pingPong(clock.get(), (index * 2 + 1) * 900, 6000)));

  const dots = useMemo(() => {
    const p = Skia.Path.Make();
    for (let cx = 4; cx < 84 + 2; cx += 8) for (let cy = 4; cy < 118 + 2; cy += 8) p.addCircle(cx, cy, 1.35);
    return p;
  }, []);
  // box-shadow: inset 0 1px 0 rgba(255,255,255,.5) — a faixa de 1 pt no topo de dentro.
  const insetTop = useMemo(() => {
    const a = Skia.Path.Make(); a.addRRect(rrect(rect(0, 0, 84, 118), 8, 8));
    const b = Skia.Path.Make(); b.addRRect(rrect(rect(0, 1, 84, 118), 8, 8));
    return Skia.Path.MakeFromOp(a, b, PathOp.Difference);
  }, []);

  const boxG = cssGrad(st.box.deg, 0, 0, 84, 118);
  const gloss = cssGrad(125, 0, 0, 84, 118);
  const cardG = cssGrad(150, 9, -34, 66, 94);

  const shadowT = useDerivedValue(() => [{ scale: 1 + 0.15 * shP.get() }]);
  const shadowO = useDerivedValue(() => 1 - 0.3 * shP.get());

  return (
    <View ref={wrapRef} collapsable={false} style={{ width, alignItems: 'center' }}>
      <Pressable onPress={press} style={{ width, alignItems: 'center' }} accessibilityRole="button" accessibilityLabel={deck.name}>
        <View style={{ width: '100%', height: BOX_H }}>
          {deck.rare && <View pointerEvents="none" style={[styles.halo, { left: width / 2 - 90 }]} />}
          <Canvas pointerEvents="none" style={{ position: 'absolute', left: -PAD, top: -PAD, width: width + 2 * PAD, height: BOX_H + 2 * PAD }}>
            {/* Sombra no chão: 116×18, blur(8px) */}
            <Group transform={shadowT} origin={{ x: PAD + width / 2 + 4, y: PAD + BOX_H - 12 - 9 }} opacity={shadowO}>
              <Oval x={PAD + width / 2 - 54} y={PAD + BOX_H - 12 - 18} width={116} height={18} color="rgba(190,60,115,0.30)">
                <BlurMask blur={8} style="normal" />
              </Oval>
            </Group>

            {/* Fundo da caixa (translateZ −10) */}
            <Group transform={mBack}>
              <RoundedRect x={0} y={0} width={84} height={118} r={8} color={st.back} />
            </Group>

            {/* Tampa de trás aberta (translateZ −10 rotateX 40°, origem no pé) + lingueta */}
            <Group transform={mFlap}>
              <Path path={roundPath(0, -28, 84, 28, 4, 4, 0, 0)}>
                <LinearGradient start={{ x: 0, y: -28 }} end={{ x: 0, y: 0 }} colors={st.flap} />
              </Path>
              <Path path={roundPath(84 * 0.17, -40, 84 * 0.66, 14, 12.25, 12.25, 1.75, 1.75)}>
                <LinearGradient start={{ x: 0, y: -40 }} end={{ x: 0, y: -26 }} colors={st.flap} />
              </Path>
            </Group>

            {/* Cartas saindo pela abertura */}
            {fan.map(([r, x, z], i) => (
              <FanCard
                key={i} base={base} r={r} x={x} z={z} front={i === fan.length - 1} rare={deck.rare}
                lift={lift} fanP={fanP} breathe={breathe} holo={holoCard} holoO={st.holoO} sheen={sheen}
                logo={logoPink} grad={cardG}
              />
            ))}

            {/* Frente (translateZ +10) */}
            <Group transform={mFront}>
              <Group clip={rrect(rect(0, 0, 84, 118), 8, 8)}>
                <Rect x={0} y={0} width={84} height={118}>
                  <LinearGradient start={boxG.start} end={boxG.end} colors={st.box.colors} positions={st.box.pos} />
                </Rect>
                <Path path={dots} color={st.dot} />
                {insetTop && <Path path={insetTop} color="rgba(255,255,255,0.5)" />}
                <RoundedRect x={6.5} y={6.5} width={71} height={105} r={4.5} style="stroke" strokeWidth={1} color="rgba(255,255,255,0.55)" />
                <Circle cx={42} cy={63} r={23.25} style="stroke" strokeWidth={1.5} color="rgba(255,255,255,0.7)" />
                {deck.rare
                  ? logoPink && <SkImage image={logoPink} x={28} y={49} width={28} height={28} fit="contain" />
                  : logoWhite && (
                    <SkImage image={logoWhite} x={28} y={49} width={28} height={28} fit="contain">
                      <BlendColor color="#FFFFFF" mode="srcIn" />
                    </SkImage>
                  )}
                <Rect x={0} y={0} width={84} height={118}>
                  <LinearGradient
                    start={gloss.start} end={gloss.end}
                    colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0)', 'rgba(255,214,236,0.28)', 'rgba(255,255,255,0)']}
                    positions={[0, 0.34, 0.62, 0.8]}
                  />
                </Rect>
                {deck.rare && <Holo x={0} y={0} w={84} h={118} opacity={0.9} pos={holoBox} />}
                {deck.rare && <Sheen x={0} y={0} w={84} h={118} frac={0.4} sheen={sheen} />}
              </Group>
            </Group>

            {/* Lateral fina (rotateY 90° translateZ 42) */}
            <Group transform={mSide}>
              <RoundedRect x={32} y={0} width={20} height={118} r={3}>
                <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 0, y: 118 }} colors={st.side} />
              </RoundedRect>
            </Group>
          </Canvas>
          {deck.rare && SPARKS.map(([x, y, s, c], i) => <Twinkle key={i} i={i} x={x} y={y} s={s} c={c} rm={rm} />)}
        </View>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{deck.name}</Text>
          {deck.rare && (
            <Svg width={14} height={14} viewBox="0 0 24 24"><SvgPath d={SPARKLE} fill={PINK} /></Svg>
          )}
        </View>
        <Text style={styles.sub}>{deck.n ? `${deck.n} cartas · última em ${deck.last}` : '0 cartas'}</Text>
      </Pressable>
    </View>
  );
}

// Uma carta do leque: translateX(x) translateZ(z) rotateZ(r) com origem no pé da carta;
// subir/respirar = translateY do conjunto. Carta da frente com reflexo e brilho.
function FanCard({
  base, r, x, z, front, rare, lift, fanP, breathe, holo, holoO, sheen, logo, grad,
}: {
  base: M4; r: number; x: number; z: number; front: boolean; rare: boolean;
  lift: SharedValue<number>; fanP: SharedValue<number>; breathe: SharedValue<number>; holo: SharedValue<number>;
  holoO: number; sheen: SharedValue<number>; logo: ReturnType<typeof useImage>; grad: ReturnType<typeof cssGrad>;
}) {
  const m = useDerivedValue(() => {
    const f = fanP.get();
    return asT(chain(base, T(0, -30 * lift.get() + breathe.get()), T(42, 62), T(x * (1 + 1.4 * f), 0, z), RZ(r * (1 + 1.2 * f)), T(-42, -62)));
  });
  const sh = front
    ? rare ? { dy: 0, blur: 9, color: 'rgba(255,94,168,0.55)' } : { dy: 4, blur: 5, color: 'rgba(200,60,120,0.22)' }
    : { dy: 2, blur: 3, color: 'rgba(200,60,120,0.16)' };
  // Carta 70×98 (borda 2 branca, canto 9) com o pé 56 pt acima do pé da caixa.
  return (
    <Group transform={m}>
      <RoundedRect x={7} y={-36} width={70} height={98} r={9} color="#FFFFFF">
        <Shadow dx={0} dy={sh.dy} blur={sh.blur} color={sh.color} />
      </RoundedRect>
      <Group clip={rrect(rect(9, -34, 66, 94), 7, 7)}>
        <Rect x={9} y={-34} width={66} height={94}>
          <LinearGradient start={grad.start} end={grad.end} colors={CARD_COLORS} positions={CARD_POS} />
        </Rect>
        <RoundedRect x={13.5} y={-29.5} width={57} height={85} r={5.5} style="stroke" strokeWidth={1} color="rgba(255,255,255,0.95)" />
        {logo && <SkImage image={logo} x={29} y={-22} width={26} height={26} fit="contain" />}
        {front && <Holo x={9} y={-34} w={66} h={94} opacity={holoO} pos={holo} />}
        {front && <Sheen x={9} y={-34} w={66} h={94} frac={0.46} sheen={sheen} />}
      </Group>
    </Group>
  );
}

// Faíscas das Raras (data-twinkle): .25→.95, escala .7→1, giro 0→45°, 1,6 s ida e volta.
function Twinkle({ i, x, y, s, c, rm }: { i: number; x: number; y: number; s: number; c: string; rm: boolean }) {
  const t = useSharedValue(-1);
  const focada = useTelaFocada();
  useEffect(() => {
    if (rm || !focada) { cancelAnimation(t); t.set(-1); return; }
    t.set(withDelay(i * 320, withSequence(
      withTiming(0, { duration: 0 }),
      withRepeat(withTiming(1, { duration: 1600, easing: Easing.bezier(0.42, 0, 0.58, 1) }), -1, true),
    )));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rm, focada]);
  const style = useAnimatedStyle(() => {
    const v = t.get();
    if (v < 0) return { opacity: 0.85, transform: [{ scale: 1 }, { rotate: '0deg' }] };
    return { opacity: 0.25 + 0.7 * v, transform: [{ scale: 0.7 + 0.3 * v }, { rotate: `${45 * v}deg` }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y, width: s, height: s }, style]}>
      <Svg width={s} height={s} viewBox="0 0 24 24"><SvgPath d={STAR4} fill={c} /></Svg>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  halo: {
    position: 'absolute', top: BOX_H / 2 - 95, width: 180, height: 190, borderRadius: 95,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,94,168,0.30), rgba(214,180,255,0.20) 60%, rgba(214,180,255,0))',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3, lineHeight: 20, color: INK },
  sub: { marginTop: 3, fontSize: 13, lineHeight: 17, color: MUTE, letterSpacing: -0.1, textAlign: 'center' },
});
