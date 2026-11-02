// ─────────────────────────────────────────────────────────────────────────────
// Faíscas da "Sua caminhada" (design 68: `spark` e `burst`). Cada faísca segue os
// keyframes do design — 0% no ponto de saída (escala .4), 45% a 70% do caminho e 12 pt
// acima (escala 1, 90°), 100% no fim com 26 pt de queda (escala .6, 170°, some) — com a
// curva ease-out forte sobre a animação inteira. Estrela (55%) ou ponto, nas 6 cores do
// design; as brancas ganham um halo rosa. Tudo num Canvas Skia no UI thread.
// ─────────────────────────────────────────────────────────────────────────────
import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet } from 'react-native';
import { Easing, useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { BlurStyle, Canvas, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import { COLORS } from './geometria';

type Faisca = { x: number; y: number; dx: number; dy: number; dur: number; delay: number; born: number; s: number; star: boolean; c: string };

export type FaiscasRef = {
  /** Uma faísca saindo de (x, y) e indo até (x + dx, y + dy + 26). */
  spark: (x: number, y: number, dx: number, dy: number, dur: number, delay?: number) => void;
  /** Explosão de n faíscas em volta de (cx, cy) (design: burst). */
  burst: (cx: number, cy: number, n: number, spread: number) => void;
};

const EO = Easing.bezierFn(0.23, 1, 0.32, 1);
const STAR_D = 'M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z';

function nova(x: number, y: number, dx: number, dy: number, dur: number, delay: number, now: number): Faisca {
  const star = Math.random() < 0.55;
  return {
    x, y, dx, dy, dur, delay, born: now,
    s: star ? 8 + Math.random() * 9 : 4 + Math.random() * 4,
    star, c: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

const Faiscas = forwardRef<FaiscasRef, { off?: boolean }>(function Faiscas({ off }, ref) {
  const lista = useSharedValue<Faisca[]>([]);
  const agora = useSharedValue(0);

  useFrameCallback((fi) => {
    agora.set(fi.timestamp);
    const l = lista.get();
    if (!l.length) return;
    const vivas = l.filter((f) => fi.timestamp - f.born < f.delay + f.dur);
    if (vivas.length !== l.length) lista.set(vivas);
  });

  useImperativeHandle(ref, () => ({
    spark: (x, y, dx, dy, dur, delay = 0) => {
      if (off) return;
      lista.set([...lista.get(), nova(x, y, dx, dy, dur, delay, agora.get())]);
    },
    burst: (cx, cy, n, spread) => {
      if (off) return;
      const now = agora.get();
      const add: Faisca[] = [];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = spread * (0.45 + Math.random() * 0.75);
        add.push(nova(cx, cy, Math.cos(a) * d, Math.sin(a) * d * 1.1, 700 + Math.random() * 450, Math.random() * 80, now));
      }
      lista.set([...lista.get(), ...add]);
    },
  }), [off, lista, agora]);

  const pic = useDerivedValue(() => {
    const l = lista.get();
    const now = agora.get();
    return createPicture((cv) => {
      const STAR = l.length ? Skia.Path.MakeFromSVGString(STAR_D) : null;
      for (const f of l) {
        const t = now - f.born - f.delay;
        const p = t <= 0 ? 0 : EO(Math.min(1, t / f.dur));
        // Keyframes 0 → .45 → 1 (lineares entre si, como no WAAPI com easing global).
        let px: number, py: number, sc: number, rot: number, op: number;
        if (p <= 0.45) {
          const u = p / 0.45;
          px = f.x + f.dx * 0.7 * u; py = f.y + (f.dy * 0.7 - 12) * u;
          sc = 0.4 + 0.6 * u; rot = 90 * u; op = 1;
        } else {
          const u = (p - 0.45) / 0.55;
          px = f.x + f.dx * 0.7 + f.dx * 0.3 * u; py = f.y + f.dy * 0.7 - 12 + (f.dy * 0.3 + 38) * u;
          sc = 1 - 0.4 * u; rot = 90 + 80 * u; op = 1 - u;
        }
        if (op <= 0) continue;
        const size = f.s * sc;
        cv.save();
        cv.translate(px, py);
        cv.rotate(rot, 0, 0);
        if (f.c === '#FFFFFF') {
          const h = Skia.Paint();
          h.setColor(Skia.Color('rgba(255,94,168,0.8)'));
          h.setAlphaf(0.8 * op);
          h.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 2, true));
          cv.drawCircle(0, 0, size * 0.3, h);
        }
        const paint = Skia.Paint();
        paint.setColor(Skia.Color(f.c));
        paint.setAlphaf(op);
        if (f.star && STAR) {
          const k = size / 24;
          cv.scale(k, k);
          cv.translate(-12, -12);
          cv.drawPath(STAR, paint);
        } else {
          cv.drawCircle(0, 0, (7 / 24) * size, paint);
        }
        cv.restore();
      }
    }, Skia.XYWHRect(0, 0, 2000, 3000));
  });

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Picture picture={pic} />
    </Canvas>
  );
});

export default Faiscas;
