import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useFrameCallback,
  useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { BlurStyle, Canvas, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import Carta from './Carta';
import { haptics } from '../../lib/haptics';
import { nivelDe } from '../../lib/niveis';
import Medalha from '../medalhas/Medalha';
import { fmtPontos, type NivelTabela } from '../../lib/cartasServidor';

// ─────────────────────────────────────────────────────────────────────────────
// Pacote de NIKS Points, depois da revelação na tela de raspar. Não há design; o visual
// foi aprovado num mockup (nov/2026): o cabeçalho da caminhada (68: nível, título,
// pontos e a barra piso→teto) entra no lugar da headline, e 5 mini cartas (o verso da
// rodada 84a, 30 × 42) saem do selo "+N NIKS Points" em leque, uma a cada 70 ms, sobem em
// curva até a ponta da barra e viram faíscas. Cada chegada enche um pedaço da barra (mola),
// conta o número, pisca a barra e dá um toque leve; a última, um toque médio. Subiu de
// nível: a barra completa e o cabeçalho brilha (o "Continuar" segue para a caminhada).
// Tudo no UI thread: um relógio (`t`, em ms) dirige as mini cartas; uma reação conta as
// chegadas; as faíscas e o rastro são partículas desenhadas no Skia. ~1,5 s no total.
// Tocar na tela adianta para o fim. Reduzir movimento: sem voo; a barra nova aparece
// por cima da antiga com um fade e o número vai direto ao final.
// `semCartas` (regras novas, 05/nov/2026): os pontos ganhos SEM carta (2º skincare,
// check-in, scan, produto no grupo) — o mesmo cabeçalho, sem as mini cartas: a barra enche
// com mola e o número conta (~0,9 s). Quem mostra é `BarraPontosHost` (lib/pontosAnimacao).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const LOGO = require('../../assets/home/score-logo-pink.png');
const VERSO = { k: 'verso' } as const;
const STAR_CORES = [PINK, '#FFFFFF', '#FF8CC0', '#FFFFFF'];

const N = 5;               // mini cartas
const LANCA = 220;         // a 1ª sai 220 ms depois do cabeçalho começar a entrar
const PASSO = 70;          // uma a cada 70 ms
const VOO = 560;           // duração do voo de cada uma
const FIM = LANCA + (N - 1) * PASSO + VOO;
const MW = 30, MH = 42;    // mini carta (220 × 308 em escala)

// Cabeçalho = o da caminhada (styles.hdr de caminhada.tsx): 16 das bordas, 102 de altura,
// borda de 1,5, 14 por dentro; a linha tem 56 (a miniatura) e a barra vem 10 abaixo.
const HDR_X = 16, HDR_H = 102, BORDA = 1.5, PAD = 14;
const BAR_DX = HDR_X + BORDA + PAD;
const BAR_DY = BORDA + PAD + 56 + 10;

function mola(z: number, r: number) {
  'worklet';
  return { stiffness: (2 * Math.PI / r) ** 2, damping: (4 * Math.PI * z) / r, mass: 1 };
}
const EO = Easing.bezier(0.23, 1, 0.32, 1);

type Faisca = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; c: string; rot: number; star: boolean };
type Voo = { a: number; x0: number; y0: number; x1: number; y1: number; x2: number; y2: number };

// Sai devagar de dentro da carta e chega ainda com velocidade (o impacto vira faísca).
function andamento(p: number) {
  'worklet';
  return p * p * (2.2 - 1.2 * p);
}
function ponto(v: Voo, e: number) {
  'worklet';
  const u = 1 - e;
  return { x: u * u * v.x0 + 2 * u * e * v.x1 + e * e * v.x2, y: u * u * v.y0 + 2 * u * e * v.y1 + e * e * v.y2 };
}
function progresso(t: number, i: number) {
  'worklet';
  return Math.min(1, Math.max(0, (t - (LANCA + i * PASSO)) / VOO));
}
function chegadas(t: number) {
  'worklet';
  let n = 0;
  for (let i = 0; i < N; i++) if (t >= LANCA + i * PASSO + VOO) n++;
  return n;
}

function Mini({ i, t, voo }: { i: number; t: SharedValue<number>; voo: Voo }) {
  const st = useAnimatedStyle(() => {
    const p = progresso(t.get(), i);
    const e = andamento(p);
    const q = ponto(voo, e);
    // Salta da carta (0,6 → 1) e encolhe chegando na barra (→ 0,55).
    const s = p < 0.12 ? 0.6 + 0.4 * (p / 0.12) : 1 - 0.45 * Math.pow((p - 0.12) / 0.88, 2);
    const o = p <= 0 || p >= 1 ? 0 : p < 0.08 ? p / 0.08 : p > 0.94 ? (1 - p) / 0.06 : 1;
    return {
      opacity: o,
      transform: [{ translateX: q.x - MW / 2 }, { translateY: q.y - MH / 2 }, { rotate: `${voo.a * (1 - e)}deg` }, { scale: s }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.mini, st]}>
      <Carta v={VERSO} w={MW} h={MH} semSombra parado />
    </Animated.View>
  );
}

function Vivo({ xp, fmtFn, style }: { xp: SharedValue<number>; fmtFn: (v: number) => string; style: any }) {
  const [v, setV] = useState(() => Math.round(xp.get()));
  useAnimatedReaction(() => Math.round(xp.get()), (n, prev) => { if (n !== prev) scheduleOnRN(setV, n); });
  return <Text style={style}>{fmtFn(v)}</Text>;
}

type Props = {
  /** Total de NIKS Points antes e depois desta carta. */
  de: number;
  para: number;
  niveis: NivelTabela[];
  icone: { passo: number; incremento: number };
  /** Centro do selo "+N NIKS Points" na tela (de onde saem as mini cartas). */
  origem: { x: number; y: number };
  /** Topo do cabeçalho na tela. */
  topo: number;
  rm: boolean;
  onFim?: () => void;
  /** Pontos sem carta: só o cabeçalho com a barra subindo (sem as mini cartas). */
  semCartas?: boolean;
};

export default function PacotePontos({ de, para, niveis, icone, origem, topo, rm, onFim, semCartas = false }: Props) {
  const { width: W } = useWindowDimensions();
  const nv = useMemo(() => nivelDe(de, niveis, icone), [de, niveis, icone]);
  const { piso, teto } = nv;
  const ganho = Math.max(0, para - de);
  const barW = W - 2 * BAR_DX;
  const barY = topo + BAR_DY + 4;
  const fracao = (v: number) => {
    'worklet';
    if (teto <= piso) return 1;
    return Math.min(1, Math.max(0, (v - piso) / Math.max(1, teto - piso)));
  };
  const valor = (n: number) => {
    'worklet';
    return de + Math.round((ganho * n) / N);
  };

  // Trajetórias: saem do selo abertas em leque (−22° … 22°), cada uma com a curva puxada
  // para um lado, e fecham na ponta da barra que ela vai encher.
  const voos = useMemo<Voo[]>(() => Array.from({ length: N }, (_, i) => {
    const x0 = origem.x + (i - 2) * 16, y0 = origem.y - 4;
    const x2 = BAR_DX + barW * fracao(valor(i + 1)), y2 = barY;
    const x1 = Math.min(W - 30, Math.max(30, x0 + (i - 2) * 55 + 60));
    const y1 = (y0 + y2) / 2 + 30;
    return { a: (i - 2) * 11, x0, y0, x1, y1, x2, y2 };
  }), [origem.x, origem.y, barW, barY, W]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useSharedValue(0);
  const hdr = useSharedValue(0);
  const barK = useSharedValue(fracao(de));
  const novaO = useSharedValue(0);           // reduzir movimento: a barra nova em fade
  const xp = useSharedValue(de);
  const pisca = useSharedValue(0);
  const brilho = useSharedValue(0);
  const fx = useSharedValue<Faisca[]>([]);
  const [rodando, setRodando] = useState(true);
  // No NIKS (último nível, teto === piso) não há subida: os pontos só somam.
  const ultimo = teto <= piso;
  const subiu = !ultimo && para >= teto;

  const terminar = () => { setRodando(false); onFim?.(); };

  useEffect(() => {
    if (rm) {
      hdr.set(withTiming(1, { duration: 220 }));
      xp.set(para);
      novaO.set(withDelay(160, withTiming(1, { duration: 320 })));
      if (subiu) brilho.set(withDelay(480, withSequence(withTiming(1, { duration: 220 }), withTiming(0.35, { duration: 600 }))));
      const id = setTimeout(() => { haptics.action(); terminar(); }, 480);
      return () => clearTimeout(id);
    }
    hdr.set(withSpring(1, mola(1, 0.35)));
    if (semCartas) {
      // Sem carta: a barra enche de uma vez, com mola, e o número conta junto.
      const id = setTimeout(() => {
        barK.set(withSpring(fracao(para), mola(0.8, 0.45)));
        xp.set(withSpring(para, mola(1, 0.5)));
        pisca.set(0);
        pisca.set(withTiming(1, { duration: 620, easing: EO }));
        haptics.action();
        if (subiu) brilho.set(withSequence(withTiming(1, { duration: 220, easing: EO }), withTiming(0.35, { duration: 900, easing: EO })));
      }, 260);
      const fimId = setTimeout(terminar, 1000);
      return () => { clearTimeout(id); clearTimeout(fimId); };
    }
    t.set(withTiming(FIM, { duration: FIM, easing: Easing.linear }));
    return () => cancelAnimation(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const estoura = (x: number, y: number, qtd: number, forca: number) => {
    'worklet';
    const list = fx.get().slice();
    for (let k = 0; k < qtd; k++) {
      const a = Math.random() * Math.PI * 2, sp = (70 + Math.random() * 150) * forca;
      list.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: 0.45 + Math.random() * 0.35,
        r: 3 + Math.random() * 4, c: STAR_CORES[k % STAR_CORES.length], rot: Math.random() * 3, star: true,
      });
    }
    fx.set(list);
  };

  // Cada chegada: a barra enche um pedaço (mola), o número conta, a barra pisca e a mini
  // carta vira faíscas na ponta. Tocar para adiantar pula várias de uma vez: um só estouro.
  useAnimatedReaction(() => chegadas(t.get()), (n, prev) => {
    if (prev == null || n <= prev || rm) return;
    const v = valor(n), k = fracao(v);
    barK.set(withSpring(k, mola(0.8, 0.35)));
    xp.set(withSpring(v, mola(1, 0.4)));
    pisca.set(0);
    pisca.set(withTiming(1, { duration: 520, easing: EO }));
    const x = BAR_DX + barW * k;
    estoura(x, barY, n - prev > 1 ? 16 : 7, n - prev > 1 ? 1.3 : 1);
    if (n >= N) {
      scheduleOnRN(haptics.action);
      if (subiu) brilho.set(withSequence(withTiming(1, { duration: 220, easing: EO }), withTiming(0.35, { duration: 900, easing: EO })));
      scheduleOnRN(terminar);
    } else scheduleOnRN(haptics.tap);
  });

  // Faíscas e rastro das mini cartas (gravidade leve, somem em ~0,6 s).
  useFrameCallback((fi) => {
    let list = fx.get();
    const tt = t.get();
    if (!rm && tt > 0 && tt < FIM && Math.random() < 0.5) {
      list = list.slice();
      for (let i = 0; i < N; i++) {
        const p = progresso(tt, i);
        if (p <= 0.1 || p >= 0.94) continue;
        const q = ponto(voos[i], andamento(p));
        list.push({ x: q.x + (Math.random() - 0.5) * 8, y: q.y + MH * 0.3, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 30, life: 0, max: 0.3 + Math.random() * 0.2, r: 1.2 + Math.random() * 1.3, c: '#FF8CC0', rot: 0, star: false });
      }
    }
    if (!list.length) return;
    const dt = Math.min(0.05, (fi.timeSincePreviousFrame ?? 16) / 1000);
    const next: Faisca[] = [];
    for (const q of list) {
      const life = q.life + dt;
      if (life >= q.max) continue;
      const vy = q.vy + 260 * dt, vx = q.vx * 0.96;
      next.push({ ...q, life, vx, vy: vy * 0.96, x: q.x + vx * dt, y: q.y + vy * dt, rot: q.rot + dt * 4 });
    }
    fx.set(next);
  });
  const fxPic = useDerivedValue(() => {
    const list = fx.get();
    return createPicture((cv) => {
      for (const q of list) {
        const a = Math.max(0, 1 - q.life / q.max);
        const p = Skia.Paint();
        p.setColor(Skia.Color(q.c)); p.setAlphaf(a);
        if (!q.star) { cv.drawCircle(q.x, q.y, q.r, p); continue; }
        const r = q.r * (0.6 + 0.4 * a);
        const path = Skia.Path.Make();
        path.moveTo(0, -r); path.quadTo(0, 0, r, 0); path.quadTo(0, 0, 0, r); path.quadTo(0, 0, -r, 0); path.quadTo(0, 0, 0, -r);
        cv.save(); cv.translate(q.x, q.y); cv.rotate((q.rot * 180) / Math.PI, 0, 0);
        if (q.c === '#FFFFFF') {
          // Estrela branca com um halo rosa, para não sumir no fundo claro.
          const h = Skia.Paint();
          h.setColor(Skia.Color('rgba(255,94,168,0.7)')); h.setAlphaf(0.7 * a);
          h.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 2.5, true));
          cv.drawPath(path, h);
        }
        cv.drawPath(path, p);
        cv.restore();
      }
    }, Skia.XYWHRect(0, 0, 2000, 3000));
  });

  const adiantar = () => {
    if (rm) return;
    hdr.set(1);
    cancelAnimation(t);
    t.set(FIM);
  };

  const hdrSt = useAnimatedStyle(() => ({
    opacity: hdr.get(),
    transform: rm ? [] : [{ translateY: -8 * (1 - hdr.get()) }, { scale: 0.97 + 0.03 * hdr.get() }],
  }));
  const barSt = useAnimatedStyle(() => ({ transform: [{ scaleX: barK.get() }] }));
  const novaSt = useAnimatedStyle(() => ({ opacity: novaO.get(), transform: [{ scaleX: fracao(para) }] }));
  const piscaSt = useAnimatedStyle(() => {
    const g = pisca.get();
    return { opacity: g <= 0 || g >= 1 ? 0 : g < 0.25 ? g * 4 : (1 - g) / 0.75 };
  });
  const brilhoSt = useAnimatedStyle(() => ({ opacity: brilho.get() }));

  return (
    // Acima do palco da carta (zIndex 10) e dos raios (9) da tela de raspar.
    <View style={[StyleSheet.absoluteFill, { zIndex: 30 }]} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[styles.hdr, { top: topo }, hdrSt]}>
        <Animated.View style={[styles.brilho, brilhoSt]} />
        <View style={styles.hdrRow}>
          <View style={styles.thumb}>
            <Medalha nivel={nv.nivel} tamanho={56} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.hdrLvl}>{`Nível ${nv.nivel}`}</Text>
            <Text style={styles.hdrName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{nv.titulo}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Vivo xp={xp} fmtFn={(v) => (ultimo ? fmtPontos(v) : `${fmtPontos(Math.min(v, teto))} / ${fmtPontos(teto)}`)} style={styles.hdrXp} />
            <Vivo
              xp={xp}
              fmtFn={(v) => (ultimo ? 'Nível máximo' : v >= teto ? 'nível completo' : `faltam ${fmtPontos(teto - v)} NIKS Points`)}
              style={styles.hdrFalta}
            />
          </View>
        </View>
        <View style={styles.barWrap}>
          <Animated.View style={[styles.barGlow, piscaSt]} />
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, barSt]} />
            {rm && <Animated.View style={[styles.barFill, novaSt]} />}
          </View>
        </View>
      </Animated.View>

      {!rm && !semCartas && voos.map((v, i) => <Mini key={i} i={i} t={t} voo={v} />)}

      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Picture picture={fxPic} />
      </Canvas>

      {rodando && !rm && !semCartas && (
        <Pressable style={StyleSheet.absoluteFill} onPress={adiantar} accessibilityLabel="Pular animação" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hdr: {
    position: 'absolute', left: HDR_X, right: HDR_X, height: HDR_H, paddingTop: PAD, paddingHorizontal: PAD,
    borderWidth: BORDA, borderColor: PINK, borderRadius: 20, backgroundColor: '#fff', boxShadow: '0px 6px 18px rgba(255,94,168,0.12)',
  },
  brilho: {
    position: 'absolute', left: -BORDA, right: -BORDA, top: -BORDA, bottom: -BORDA, borderRadius: 20,
    boxShadow: '0px 0px 30px 8px rgba(255,94,168,0.7)',
  },
  hdrRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Só a medalha, sem carta atrás. O desenho tem folga nas laterais, por isso a margem negativa.
  thumb: { width: 56, height: 56, marginHorizontal: -4, alignItems: 'center', justifyContent: 'center' },
  hdrLvl: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: PINK },
  hdrName: { marginTop: 2, fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.6, color: INK },
  hdrXp: { fontSize: 14, lineHeight: 18, fontWeight: '600', letterSpacing: -0.2, color: INK, fontVariant: ['tabular-nums'] },
  hdrFalta: { marginTop: 2, fontSize: 12, lineHeight: 16, color: MUTE, fontVariant: ['tabular-nums'] },
  barWrap: { marginTop: 10, height: 8 },
  barGlow: { position: 'absolute', left: -4, right: -4, top: -4, bottom: -4, borderRadius: 100, backgroundColor: 'rgba(255,94,168,0.22)' },
  barTrack: { height: 8, borderRadius: 100, backgroundColor: '#F0F0F0', overflow: 'hidden' },
  barFill: { ...StyleSheet.absoluteFillObject, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },
  mini: { position: 'absolute', left: 0, top: 0, width: MW, height: MH, borderRadius: 3, boxShadow: '0px 3px 8px rgba(200,60,120,0.4)' },
});
