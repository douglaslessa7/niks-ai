import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Alert, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, ReduceMotion, cubicBezier, interpolate, useAnimatedStyle, useDerivedValue, useFrameCallback,
  useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import {
  Blur, BlurStyle, Canvas, Group, Paint, PaintStyle, Path as SkiaPath, Picture, Skia, TileMode,
  createPicture, notifyChange, useImage, vec, type SkImage,
} from '@shopify/react-native-skia';
import { haptics } from '../../lib/haptics';
import { CARTAS, ORDEM_CARTAS, REC_ICONS, type CartaTipo } from '../../lib/cartas';
import {
  cartaDetalhe, rasparCarta, estadoCartas, vezesRaspada, estadoPoder, etiquetaCarta, PODER_INFO, type CartaGanha,
} from '../../lib/cartasServidor';
import { dateKey, sessionDate } from '../../lib/routineProgress';

// ─────────────────────────────────────────────────────────────────────────────
// Carta de raspar — réplica do protótipo 67a do Claude Design ("Cartas de raspar",
// NiksCartas.dc.html). Os 7 momentos do design:
//   1 Entrada · sobe de baixo dando um giro completo (y ζ.8 .62s, giro ζ.92 .78s, rz ζ.7
//     .6s, escala ζ.75 .55s), o fundo desfoca em .45s e um brilho atravessa a carta
//   2 Curiosidade · headline 450 ms depois (fade + 12 pt); "Continuar" apagado
//   3 Toque · salto com impulso de 520 pt/s (ζ.55 .38s) e "Raspe para ver" em 340 ms
//   4 Arrastar · inclina até 7° seguindo o dedo (ζ1 .3s; solta com ζ.7 .5s), o reflexo
//     perolado e o brilho acompanham a inclinação
//   5 Raspar · pincel de 46 pt solta partículas rosa e lilás; o botão vai enchendo
//   6 Revelação · com 60% raspado a camada some em 460 ms (desfoque), flash, explosão de
//     brilho e o número conta em 900 ms
//   7 Recomendações · a carta recua para 56% e a folha branca sobe (ζ.92 .5s), cascata 60 ms
// Molas = as do design (ζ = damping ratio, r = resposta em s), convertidas para física:
// rigidez (2π/r)², amortecimento 4πζ/r, massa 1. Tudo no UI thread (Reanimated + Skia);
// o JS só troca a fase. Reduzir movimento: sem giro, salto, inclinação ou partículas —
// só fades de 200–300 ms e o número aparece direto.
// Posições = frame de 393 × 852 do design (status bar de 54).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const LOGO = require('../../assets/home/score-logo-pink.png');

const CW = 252;
const CH = 360;
const CARD_LEFT = 70;
const CARD_TOP = 246;
const STAGE7_Y = -221;
const UNLOCK = 0.6;
const BRUSH = 46;
const CELL = 12;
const COLS = Math.ceil(CW / CELL);
const ROWS = Math.ceil(CH / CELL);

const EO = Easing.bezier(0.23, 1, 0.32, 1);
const CSS_EO = cubicBezier(0.23, 1, 0.32, 1); // a mesma curva, para as transições CSS do Reanimated
const EIO = Easing.bezier(0.77, 0, 0.175, 1);
const COLORS = ['#FF5EA8', '#FF8CC0', '#F7B3D6', '#D9B8FF', '#FFFFFF', '#FF5EA8'];

const PH_ENTER = 0, PH_IDLE = 1, PH_READY = 2, PH_SCRATCH = 3, PH_REVEALED = 4, PH_RECS = 5;
type Phase = 'enter' | 'idle' | 'ready' | 'scratching' | 'revealed' | 'recs';

// Mola do design → física do Reanimated.
function spr(z: number, r: number, velocity = 0, eps = 0.02) {
  'worklet';
  return {
    stiffness: Math.pow((2 * Math.PI) / r, 2), damping: (4 * Math.PI * z) / r, mass: 1, velocity,
    restDisplacementThreshold: eps, restSpeedThreshold: eps * 2, reduceMotion: ReduceMotion.Never,
  };
}

// Transform da carta (cardT do design): perspectiva 1100, subida, escala e giros X/Y/Z.
function cardT(tX: number, ty: number, sc: number, rx: number, ry: number, rz: number, back: boolean) {
  'worklet';
  const t: object[] = [
    { perspective: 1100 },
    { translateX: tX },
    { translateY: ty },
    { scale: sc },
    { rotateX: `${rx}deg` },
    { rotateY: `${ry}deg` },
    { rotateZ: `${rz}deg` },
  ];
  if (back) t.push({ rotateY: '180deg' });
  return t;
}

// ── Entrada ─────────────────────────────────────────────────────────────────
// A carta nasce bem pequena NO CENTRO (o mesmo ponto onde para) e vem crescendo e girando
// devagar (1,5 volta, de verso para frente) até o tamanho final, passando um pouco
// (≈1,07) antes de assentar (pedido do Douglas, 01/nov/2026: sem vir da direita, giro mais
// lento). Progressos com curvas próprias: escala (com sobra no fim) e giro (macio na chegada).
const FLY_DELAY = 90;
const FLY_MS = 1500;
const SPIN_MS = 1750;
const START_SCALE = 0.06;
const EASE_PATH = Easing.bezier(0.33, 0, 0.2, 1);
const EASE_GROW = Easing.bezier(0.34, 1.25, 0.64, 1);
const EASE_SPIN = Easing.bezier(0.3, 0.35, 0.2, 1);

function flight(p: number, ps: number, pr: number, x0: number, y0: number, s0: number) {
  'worklet';
  return {
    x: x0 * (1 - p),
    y: y0 * (1 - p),
    s: s0 + (1 - s0) * ps,
    ry: -540 * (1 - pr),
    rz: 0 * p,
  };
}

type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; c: string; star: boolean; rot: number };

function mkPart(x: number, y: number, vx: number, vy: number): Part {
  'worklet';
  return {
    x, y, vx, vy, life: 0, max: 0.55 + Math.random() * 0.75, s: 1.6 + Math.random() * 3.2,
    c: COLORS[Math.floor(Math.random() * COLORS.length)], star: Math.random() < 0.45, rot: Math.random() * 3,
  };
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A camada de raspar (drawFoil do design), em coordenadas da carta 252 × 360.
function drawFoil(idade: boolean, img: SkImage | null) {
  return createPicture((c) => {
    const W = CW, H = CH;
    const full = Skia.XYWHRect(0, 0, W, H);
    const g = Skia.Paint();
    g.setShader(Skia.Shader.MakeLinearGradient(
      vec(0, 0), vec(W, H),
      ['#FFD9EA', '#FBC9E3', idade ? '#E2CCFB' : '#ECD6FA', '#FFD3E7'].map((x) => Skia.Color(x)),
      [0, 0.34, 0.62, 1], TileMode.Clamp,
    ));
    c.drawRect(full, g);
    const rg = Skia.Paint();
    rg.setShader(Skia.Shader.MakeRadialGradient(
      vec(W * 0.3, H * 0.22), W * 0.95,
      [Skia.Color('rgba(255,255,255,0.7)'), Skia.Color('rgba(255,255,255,0)')], null, TileMode.Clamp,
    ));
    c.drawRect(full, rg);
    const st = Skia.Paint();
    st.setColor(Skia.Color('#FFFFFF')); st.setAlphaf(0.1); st.setStrokeWidth(10);
    for (let i = -H; i < W + H; i += 34) c.drawLine(i, 0, i - H * 0.55, H, st);
    if (img) {
      const lp = Skia.Paint(); lp.setAlphaf(0.17);
      const src = Skia.XYWHRect(0, 0, img.width(), img.height());
      const s = 20, step = 44; let row = 0;
      for (let y = 16; y < H; y += step * 0.866, row++) {
        for (let x = (row % 2 ? step / 2 : 0) + 12; x < W; x += step) c.drawImageRect(img, src, Skia.XYWHRect(x - s / 2, y - s / 2, s, s), lp);
      }
    }
    const r = rng(idade ? 7 : 3);
    const dp = Skia.Paint(); dp.setColor(Skia.Color('#FFFFFF'));
    for (let i = 0; i < (idade ? 560 : 320); i++) {
      dp.setAlphaf(0.35 + r() * 0.6);
      const s = r() * 1.4 + 0.4;
      c.drawRect(Skia.XYWHRect(r() * W, r() * H, s, s), dp);
    }
    const cx = W / 2, cy = H * 0.47;
    const cp = Skia.Paint(); cp.setColor(Skia.Color('rgba(255,255,255,0.55)'));
    c.drawCircle(cx, cy, 58, cp);
    const rp = Skia.Paint(); rp.setColor(Skia.Color('rgba(255,255,255,0.95)')); rp.setStyle(PaintStyle.Stroke); rp.setStrokeWidth(1.5);
    c.drawCircle(cx, cy, 66, rp);
    if (img) c.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(cx - 40, cy - 80 * 0.507, 80, 81.2), Skia.Paint());
  }, Skia.XYWHRect(0, 0, CW, CH));
}

function Icon({ d, size, color, sw }: { d: string[]; size: number; color: string; sw: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {d.map((p, i) => <Path key={i} d={p} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />)}
    </Svg>
  );
}

// Raios atrás da carta: 16 cunhas finas saindo do centro (desenhadas uma vez).
const RAYS = 760;
const GLOW = 470;
const RAYS_PATH = (() => {
  const c = RAYS / 2, n = 16, half = (4.6 * Math.PI) / 180;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    const x1 = c + Math.cos(a - half) * c, y1 = c + Math.sin(a - half) * c;
    const x2 = c + Math.cos(a + half) * c, y2 = c + Math.sin(a + half) * c;
    d += `M${c} ${c}L${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}Z`;
  }
  return d;
})();

const HAND = ['M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2', 'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2', 'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8', 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'];
const HOLO_BG = 'linear-gradient(115deg, rgba(255,255,255,0) 18%, rgba(255,170,215,0.9) 30%, rgba(205,180,255,0.9) 40%, rgba(255,255,255,1) 50%, rgba(255,190,225,0.9) 60%, rgba(190,175,255,0.85) 70%, rgba(255,255,255,0) 82%)';

// Reflexo perolado + brilho, seguindo a inclinação (holoV do design).
function useHolo(tx: SharedValue<number>, ty: SharedValue<number>, ry: SharedValue<number>, hk: number) {
  const holo = useAnimatedStyle(() => {
    const tilt = ty.get() + Math.sin((ry.get() * Math.PI) / 180) * 18;
    const hx = 50 + tilt * 3.4, hy = 50 - tx.get() * 3.4;
    // background-size 260% → a faixa é 2,6× a carta e anda por (1,6 × lado) × posição.
    return {
      opacity: Math.min(1, 0.55 * hk),
      transform: [{ translateX: -(1.6 * CW * hx) / 100 }, { translateY: -(1.6 * CH * hy) / 100 }],
    };
  });
  const glare = useAnimatedStyle(() => {
    const tilt = ty.get() + Math.sin((ry.get() * Math.PI) / 180) * 18;
    const gx = 50 + tilt * 4, gy = 38 - tx.get() * 4;
    return {
      opacity: Math.min(1, 0.42 * hk),
      transform: [{ translateX: (CW * gx) / 100 - GLARE_R }, { translateY: (CH * gy) / 100 - GLARE_R }],
    };
  });
  return { holo, glare };
}
// radial-gradient(circle at gx gy, …75% → 0 em 55%): raio = 55% da distância ao canto mais longe.
const GLARE_R = 0.55 * Math.hypot(CW / 2, CH * 0.62);

export default function CartaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const params = useLocalSearchParams<{ tipo?: string; id?: string }>();
  const reduced = useReducedMotion();
  const logoImg = useImage(LOGO);

  const inicial = (ORDEM_CARTAS as string[]).includes(params.tipo ?? '') ? (params.tipo as CartaTipo) : 'sos';
  const [tipo, setTipo] = useState<CartaTipo>(inicial);
  const [run, setRun] = useState(0);
  const c = CARTAS[tipo];

  // ── Modo servidor (sistema de cartas, F4): `?id=` = a carta ganha em cartas_usuario.
  // O conteúdo vem do servidor; raspar chama a função `cartas` (que aplica o Poder na
  // hora) e a revelação é a da peça 4 do design (79i nova · 79j repetida · 79k poder).
  // Sem `id`, é o protótipo 67a com o conteúdo de exemplo (`?tipo=`).
  const [srvId, setSrvId] = useState<string | null>(params.id ?? null);
  const srvMode = srvId != null;
  const [srv, setSrv] = useState<{ carta: CartaGanha; antes: number } | null>(null);
  const [poderTxt, setPoderTxt] = useState('');
  const [revelada, setRevelada] = useState(false);
  // NIKS Points da carta (sorteados no servidor ao raspar; a rara já vem ×3).
  const [pontos, setPontos] = useState<number | null>(null);
  // Subiu de nível em alguma carta desta sequência → o "Continuar" final abre a caminhada (68d/68e).
  const subiuNivel = useRef(false);
  useEffect(() => {
    if (!srvId) return;
    let vivo = true;
    setSrv(null); setPoderTxt(''); setRevelada(false); setPontos(null);
    cartaDetalhe(srvId)
      .then(async (carta) => {
        const antes = carta.carta?.familia === 'colecionavel' && carta.carta ? await vezesRaspada(carta.carta.id, carta.id) : 0;
        if (vivo) setSrv({ carta, antes });
      })
      .catch(() => {
        if (!vivo) return;
        Alert.alert('Carta', 'Não foi possível abrir a carta agora. Tente de novo em instantes.');
        if (router.canGoBack()) router.back(); else router.replace('/(app)/home' as any);
      });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srvId]);
  const pronto = useSharedValue(params.id ? 0 : 1);
  useEffect(() => { pronto.set(!srvMode || srv ? 1 : 0); }, [srvMode, srv, pronto]);
  const fam = srv?.carta.carta?.familia ?? null;
  const kindSrv: 'coll' | 'power' | 'conh' | null = !srv ? null : fam === 'poder' ? 'power' : fam === 'colecionavel' ? 'coll' : 'conh';
  const isPower = kindSrv === 'power';
  const isDup = kindSrv === 'coll' && (srv?.antes ?? 0) >= 1;
  // Grupo (NiksGrupoV2): a carta do check-in diz "Check-in feito" (80e); a da campeã da
  // semana leva o nome do grupo e "Você foi a mais constante da semana" (80h).
  const campea = srv?.carta.origem === 'campea';
  const grupoCampea = String((srv?.carta.conteudo as any)?.grupo ?? '');
  const origemLabel = !srv ? 'Carta do dia'
    : srv.carta.origem === 'checkin_grupo' ? 'Check-in feito'
    : campea && grupoCampea ? `Campeã da semana · ${grupoCampea}`
    : etiquetaCarta('x', srv.carta.origem);
  const headLabel = srvMode ? (revelada && isPower ? 'Carta de poder' : origemLabel) : c.label;
  const headLine = srvMode
    ? (revelada && isPower ? 'Um poder saiu na sua carta' : campea ? 'Você foi a mais constante da semana' : 'Sua carta de hoje chegou')
    : c.headline;
  // Reflexo perolado: .5 na carta comum, .85 no poder (sHolo do design); antes de raspar, o de hoje.
  const holoK = !srvMode ? c.holo : !revelada ? 1 : isPower ? 0.85 / 0.55 : 0.5 / 0.55;

  // Frame do design (393 × 852, status bar 54) → tela.
  const ox = (W - 393) / 2;
  const oy = insets.top - 54;
  const ob = insets.bottom - 34; // home indicator do frame = 34
  const stageX = ox + CARD_LEFT;
  const stageY = oy + CARD_TOP;
  const sheetTop = oy + 328;
  const sheetH = H - sheetTop;

  // ── Estado da tela (só o que muda a UI; nada por quadro) ──────────────────
  const [phase, setPhaseJS] = useState<Phase>('enter');
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState(false);
  const [recs, setRecs] = useState(false);
  const [btnShown, setBtnShown] = useState(false);
  const [num, setNum] = useState(c.to ?? 0);
  const [secs, setSecs] = useState(6720);

  // ── Valores animados (UI thread) ──────────────────────────────────────────
  const y = useSharedValue(640), s = useSharedValue(0.78), ry = useSharedValue(-360), rz = useSharedValue(-10);
  const lift = useSharedValue(0), tx = useSharedValue(0), ty = useSharedValue(0), o = useSharedValue(1);
  const veil = useSharedValue(0), head = useSharedValue(0), sheet = useSharedValue(110), sheetO = useSharedValue(1);
  const ph = useSharedValue(PH_ENTER);
  const sheen = useSharedValue(0);
  const foilO = useSharedValue(1), foilS = useSharedValue(1), foilBlur = useSharedValue(0);
  const flash = useSharedValue(0);
  const meter = useSharedValue(0.667);
  const oldY = useSharedValue(0), newY = useSharedValue(-54), prefixO = useSharedValue(0);
  const numScale = useSharedValue(1);
  const drain = useSharedValue(6720 / 7200);
  const fp = useSharedValue(0), fs = useSharedValue(0), fr = useSharedValue(0);
  const fx0 = useSharedValue(0), fy0 = useSharedValue(0), fs0 = useSharedValue(0.3);
  const glow = useSharedValue(0), raysO = useSharedValue(0), raysRot = useSharedValue(0);
  const chipP = useSharedValue(1), chipGlow = useSharedValue(0), auraO = useSharedValue(0), auraBreath = useSharedValue(0);
  const flashPeak = useSharedValue(0.9), burstN = useSharedValue(56);

  // Raspagem: traço (Skia) + grade de cobertura para medir quanto foi raspado.
  const scratch = useSharedValue(Skia.Path.Make());
  const last = useSharedValue<{ x: number; y: number } | null>(null);
  const grid = useSharedValue<number[]>([]);
  const cleared = useSharedValue(0);
  const moves = useSharedValue(0);
  const down = useSharedValue(false);

  // Partículas (tela inteira).
  const parts = useSharedValue<Part[]>([]);

  const rm = reduced;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const numRaf = useRef(0);

  const foilPic = useMemo(() => drawFoil(tipo === 'idade', logoImg ?? null), [tipo, logoImg]);

  const setPhase = useCallback((p: Phase) => setPhaseJS(p), []);

  // ── 1. Entrada ────────────────────────────────────────────────────────────
  const boot = useCallback(() => {
    clearTimers();
    cancelAnimationFrame(numRaf.current);
    const cfg = CARTAS[tipo];
    setPhaseJS('enter'); setProgress(0); setHint(false); setRecs(false); setBtnShown(false);
    setNum(cfg.to ?? 0); setSecs(6720);
    scratch.set(Skia.Path.Make()); last.set(null);
    grid.set(new Array(COLS * ROWS).fill(0)); cleared.set(0); moves.set(0); down.set(false);
    foilO.set(1); foilS.set(1); foilBlur.set(0); flash.set(0); sheen.set(0);
    meter.set(0.667); oldY.set(0); newY.set(-54); prefixO.set(0); numScale.set(1);
    lift.set(0); tx.set(0); ty.set(0); sheet.set(110); sheetO.set(1);
    chipP.set(1); chipGlow.set(0); auraO.set(0); auraBreath.set(0);
    ph.set(PH_ENTER);
    y.set(0); s.set(1); ry.set(0); rz.set(0); veil.set(0); head.set(0); glow.set(0); raysO.set(0);
    if (rm) {
      fp.set(1); fs.set(1); fr.set(1); o.set(0);
      o.set(withTiming(1, { duration: 300 })); veil.set(withTiming(1, { duration: 300 }));
      glow.set(withTiming(0.55, { duration: 300 }));
      later(150, () => head.set(withTiming(1, { duration: 300 })));
      later(320, () => { ph.set(PH_IDLE); setPhaseJS('idle'); setBtnShown(true); });
      return;
    }
    // Nasce no próprio centro, bem pequena.
    fx0.set(0); fy0.set(0); fs0.set(START_SCALE);
    fp.set(0); fs.set(0); fr.set(0); o.set(1);
    fp.set(withDelay(FLY_DELAY, withTiming(1, { duration: FLY_MS, easing: EASE_PATH })));
    fs.set(withDelay(FLY_DELAY, withTiming(1, { duration: FLY_MS, easing: EASE_GROW })));
    fr.set(withDelay(FLY_DELAY, withTiming(1, { duration: SPIN_MS, easing: EASE_SPIN })));
    veil.set(withTiming(1, { duration: 520, easing: EO }));
    raysRot.set(0);
    raysRot.set(withRepeat(withTiming(360, { duration: 30000, easing: Easing.linear }), -1, false));
    // Pouso: brilho atrás, raios, explosão de brilhos, reflexo atravessando e um toque médio.
    later(FLY_DELAY + FLY_MS - 40, () => {
      haptics.action();
      glow.set(withSequence(withTiming(1, { duration: 200, easing: EO }), withTiming(0.55, { duration: 900, easing: EO })));
      raysO.set(withTiming(0.9, { duration: 700, easing: EO }));
      scheduleOnUI(burst);
      sheen.set(0); sheen.set(withTiming(1, { duration: 820, easing: EIO }));
    });
    later(FLY_DELAY + FLY_MS + 120, () => head.set(withSpring(1, spr(1, 0.38, 0, 0.002))));
    later(FLY_DELAY + FLY_MS + 450, () => { ph.set(PH_IDLE); setPhaseJS('idle'); setBtnShown(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, rm, run]);

  useEffect(() => { boot(); return () => { clearTimers(); cancelAnimationFrame(numRaf.current); }; }, [boot, run]);

  // Carta surpresa: "some em 1h 52min" contando e a barrinha esvaziando.
  useEffect(() => {
    if (!c.timer) return;
    const id = setInterval(() => setSecs((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [c.timer, run]);
  useEffect(() => { drain.set(withTiming(secs / 7200, { duration: 900, easing: Easing.linear })); }, [secs, drain]);

  // ── Partículas: física no UI thread (gravidade 520, atrito .985) ──────────
  useFrameCallback((fi) => {
    let list = parts.get();
    // Rastro de brilhos atrás da carta enquanto ela voa.
    const p = fp.get();
    if (!rm && p > 0.02 && p < 0.96) {
      const f = flight(p, fs.get(), fr.get(), fx0.get(), fy0.get(), fs0.get());
      const cx = stageX + CW / 2 + f.x, cy = stageY + CH / 2 + f.y;
      const r = (CW * f.s) / 2;
      list = list.slice();
      for (let i = 0; i < 2; i++) {
        const q = mkPart(cx + (Math.random() - 0.5) * r * 1.4, cy + (Math.random() - 0.5) * r * 1.8, (Math.random() - 0.5) * 60, -20 - Math.random() * 60);
        q.max = 0.45 + Math.random() * 0.4;
        list.push(q);
      }
    }
    if (!list.length) return;
    const dt = Math.min(0.05, (fi.timeSincePreviousFrame ?? 16) / 1000);
    const next: Part[] = [];
    for (const q of list) {
      const life = q.life + dt;
      if (life >= q.max) continue;
      const vy = q.vy + 520 * dt, vx = q.vx * 0.985;
      next.push({ ...q, life, vx, vy, x: q.x + vx * dt, y: q.y + vy * dt, rot: q.rot + dt * 3 });
    }
    parts.set(next);
  });
  const partPic = useDerivedValue(() => {
    const list = parts.get();
    return createPicture((cv) => {
      for (const q of list) {
        const a = Math.max(0, 1 - q.life / q.max);
        const p = Skia.Paint();
        if (q.c === '#FFFFFF') {
          const sh = Skia.Paint();
          sh.setColor(Skia.Color('rgba(255,94,168,0.6)')); sh.setAlphaf(0.6 * a);
          sh.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 2, true));
          if (q.star) { /* sombra só nos pontos, como no design */ } else cv.drawCircle(q.x, q.y, q.s / 2 + 1, sh);
        }
        p.setColor(Skia.Color(q.c)); p.setAlphaf(a);
        if (q.star) {
          const r = q.s * 1.9;
          const path = Skia.Path.Make();
          path.moveTo(0, -r); path.quadTo(0, 0, r, 0); path.quadTo(0, 0, 0, r); path.quadTo(0, 0, -r, 0); path.quadTo(0, 0, 0, -r);
          cv.save(); cv.translate(q.x, q.y); cv.rotate((q.rot * 180) / Math.PI, 0, 0); cv.drawPath(path, p); cv.restore();
        } else {
          cv.drawCircle(q.x, q.y, q.s / 2, p);
        }
      }
    }, Skia.XYWHRect(0, 0, 2000, 3000));
  });

  // ── 6. Revelação ──────────────────────────────────────────────────────────
  const runNumber = useCallback(() => {
    const cfg = CARTAS[tipo];
    if (rm) {
      setNum(cfg.to ?? 0); meter.set(0.667); oldY.set(54); newY.set(0); prefixO.set(1);
      return;
    }
    if (cfg.kind === 'count') {
      const t0 = performance.now(), to = cfg.to ?? 0;
      let shown = -1;
      const f = (now: number) => {
        const t = Math.min(1, (now - t0) / 900);
        const v = Math.round(to * (1 - Math.pow(1 - t, 3)));
        if (v !== shown) { shown = v; setNum(v); } // no máximo `to` + 1 renders
        if (t < 1) numRaf.current = requestAnimationFrame(f);
        else numScale.set(withSequence(withTiming(1.08, { duration: 160, easing: EO }), withTiming(1, { duration: 160, easing: EO })));
      };
      numRaf.current = requestAnimationFrame(f);
    }
    if (cfg.kind === 'meter') {
      meter.set(0);
      meter.set(withSpring(0.667, spr(0.78, 0.6, 0, 0.001)));
    }
    if (cfg.kind === 'roll') {
      oldY.set(withSpring(54, spr(1, 0.32, 0, 0.05)));
      later(90, () => newY.set(withSpring(0, spr(0.6, 0.5, 0, 0.05))));
      later(520, () => prefixO.set(withTiming(1, { duration: 300, easing: EO })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, rm]);

  const showRecs = useCallback(() => {
    setPhaseJS('recs'); setRecs(true); ph.set(PH_RECS);
    if (rm) {
      y.set(STAGE7_Y); s.set(0.56); head.set(0); sheet.set(0); tx.set(0); ty.set(0); glow.set(0); raysO.set(0);
      o.set(0); sheetO.set(0);
      o.set(withTiming(1, { duration: 300 })); sheetO.set(withTiming(1, { duration: 300 }));
      return;
    }
    raysO.set(withTiming(0, { duration: 260, easing: EO }));
    glow.set(withTiming(0, { duration: 260, easing: EO }));
    y.set(withSpring(STAGE7_Y, spr(0.9, 0.55)));
    s.set(withSpring(0.56, spr(0.9, 0.55, 0, 0.001)));
    head.set(withSpring(0, spr(1, 0.25, 0, 0.002)));
    later(80, () => sheet.set(withSpring(0, spr(0.92, 0.5, 0, 0.05))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rm]);

  const burst = () => {
    'worklet';
    const cx = CW / 2, cy = CH / 2;
    const list = parts.get().slice();
    for (let i = 0; i < burstN.get(); i++) {
      const side = Math.random(), a = Math.random();
      let x: number, yy: number;
      if (side < 0.25) { x = a * CW; yy = 0; } else if (side < 0.5) { x = a * CW; yy = CH; } else if (side < 0.75) { x = 0; yy = a * CH; } else { x = CW; yy = a * CH; }
      const dx = x - cx, dy = yy - cy, d = Math.hypot(dx, dy) || 1, sp = 180 + Math.random() * 360;
      const q = mkPart(stageX + x, stageY + yy, (dx / d) * sp, (dy / d) * sp - 120);
      q.max += 0.3;
      list.push(q);
    }
    parts.set(list);
  };

  const reveal = useCallback(() => {
    setPhaseJS('revealed'); setHint(false); setProgress(1);
    haptics.success();
    if (srvMode) {
      setRevelada(true);
      // O servidor marca a carta como raspada e, se for Poder, já aplica (79k: "Ativado agora").
      const id = srvId!;
      rasparCarta(id)
        .then((r) => {
          if (r.pontos) {
            setPontos(r.pontos.ganhos);
            if (r.pontos.nivel > r.pontos.nivel_antes) subiuNivel.current = true;
          }
          if (!r.poder) return;
          const hoje = dateKey(sessionDate(new Date()));
          setPoderTxt(estadoPoder({ id: '', tipo: r.poder.tipo, inicio: '', fim: r.poder.fim, consumido_em: null, dados: r.poder.dados }, r.poder.tipo, hoje).texto);
        })
        .catch(() => {});
      // Chip: aparece com mola (ζ.6 r.42, de 50%) 120 ms depois; no poder, um pulso de glow aos 300 ms.
      chipP.set(0);
      chipP.set(rm ? withDelay(120, withTiming(1, { duration: 220 })) : withDelay(120, withSpring(1, spr(0.6, 0.42, 0, 0.002))));
      if (isPower && !rm) {
        chipGlow.set(0);
        chipGlow.set(withDelay(300, withSequence(withTiming(1, { duration: 560, easing: EO }), withTiming(0, { duration: 840, easing: EO }))));
        auraO.set(withTiming(1, { duration: 460, easing: EO }));
        auraBreath.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.bezier(0.42, 0, 0.58, 1) }), -1, true));
      } else if (isPower) auraO.set(withTiming(1, { duration: 220 }));
    }
    // Flash: repetida não é festa (metade); poder é a revelação mais brilhante.
    flashPeak.set(!srvMode ? 0.9 : isPower ? 1 : isDup ? 0.45 : 0.9);
    burstN.set(!srvMode ? 56 : isPower ? 60 : 40);
    if (rm) {
      foilO.set(withTiming(0, { duration: 220 }));
      flash.set(withSequence(withTiming(0.45, { duration: 180 }), withTiming(0, { duration: 180 })));
    } else {
      foilO.set(withTiming(0, { duration: 460, easing: EO }));
      foilS.set(withTiming(1.08, { duration: 460, easing: EO }));
      foilBlur.set(withTiming(6, { duration: 460, easing: EO }));
      flash.set(0);
      flash.set(withTiming(1, { duration: 760, easing: EO }));
      tx.set(withSpring(0, spr(0.7, 0.5))); ty.set(withSpring(0, spr(0.7, 0.5)));
      s.set(withSpring(1, spr(0.55, 0.42, 0.9, 0.001)));
      scheduleOnUI(burst);
    }
    if (srvMode) return; // sem número nem recomendações: a carta revelada fica na tela
    later(rm ? 60 : 160, runNumber);
    later(rm ? 700 : 1550, showRecs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rm, runNumber, showRecs, srvMode, srvId, isPower, isDup]);

  // ── 3–5. Toque, arrastar e raspar (gesto no UI thread) ────────────────────
  const onReady = useCallback(() => { haptics.tap(); setPhaseJS('ready'); setHint(true); }, []);
  const onScratching = useCallback(() => { setPhaseJS('scratching'); setHint(false); }, []);

  const tilt = (px: number, py: number, max: number) => {
    'worklet';
    if (rm) return;
    const x = Math.min(1, Math.max(0, px / CW)), yy = Math.min(1, Math.max(0, py / CH));
    tx.set(withSpring(-(yy - 0.5) * 2 * max * 0.8, spr(1, 0.3)));
    ty.set(withSpring((x - 0.5) * 2 * max, spr(1, 0.3)));
  };
  const untilt = () => {
    'worklet';
    if (rm) return;
    tx.set(withSpring(0, spr(0.7, 0.5))); ty.set(withSpring(0, spr(0.7, 0.5)));
  };
  const measure = () => {
    'worklet';
    const p = cleared.get() / (COLS * ROWS);
    scheduleOnRN(setProgress, p);
    if (p >= UNLOCK && ph.get() < PH_REVEALED) {
      ph.set(PH_REVEALED);
      down.set(false);
      scheduleOnRN(reveal);
    }
  };
  const scratchAt = (x: number, yy: number) => {
    'worklet';
    const path = scratch.get();
    const prev = last.get();
    let d = 20;
    if (prev) { path.lineTo(x, yy); d = Math.hypot(x - prev.x, yy - prev.y); } else { path.moveTo(x, yy); path.lineTo(x + 0.01, yy); }
    notifyChange(scratch);
    // Marca as células da grade cobertas pelo pincel (amostras a cada 6 pt no segmento).
    const g = grid.get();
    const fx = prev ? prev.x : x, fy = prev ? prev.y : yy;
    const n = Math.max(1, Math.ceil(d / 6));
    let added = 0;
    for (let k = 0; k <= n; k++) {
      const sx = fx + ((x - fx) * k) / n, sy = fy + ((yy - fy) * k) / n;
      const c0 = Math.max(0, Math.floor((sx - BRUSH / 2) / CELL)), c1 = Math.min(COLS - 1, Math.floor((sx + BRUSH / 2) / CELL));
      const r0 = Math.max(0, Math.floor((sy - BRUSH / 2) / CELL)), r1 = Math.min(ROWS - 1, Math.floor((sy + BRUSH / 2) / CELL));
      for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) {
        const i = r * COLS + cc;
        if (g[i]) continue;
        const ccx = cc * CELL + CELL / 2, ccy = r * CELL + CELL / 2;
        if ((ccx - sx) * (ccx - sx) + (ccy - sy) * (ccy - sy) <= (BRUSH / 2) * (BRUSH / 2)) { g[i] = 1; added++; }
      }
    }
    if (added) cleared.set(cleared.get() + added);
    last.set({ x, y: yy });
    if (!rm) {
      const list = parts.get().slice();
      const count = Math.min(4, 1 + Math.floor(d / 14));
      for (let i = 0; i < count; i++) {
        list.push(mkPart(stageX + x + (Math.random() - 0.5) * 18, stageY + yy + (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 160, -Math.random() * 170 - 30));
      }
      parts.set(list);
    }
    if (ph.get() === PH_READY) { ph.set(PH_SCRATCH); scheduleOnRN(onScratching); }
    moves.set(moves.get() + 1);
    if (moves.get() % 4 === 0) measure();
  };

  const gesture = Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin((e) => {
      const p = ph.get();
      if (p === PH_ENTER || p >= PH_REVEALED || !pronto.get()) return;
      down.set(true);
      last.set(null);
      if (p === PH_IDLE) {
        if (!rm) {
          lift.set(withSpring(0, spr(0.55, 0.38, -520)));
          s.set(withSpring(1, spr(0.6, 0.36, 1.1, 0.001)));
        }
        ph.set(PH_READY);
        scheduleOnRN(onReady);
      } else {
        scratchAt(e.x, e.y);
      }
      tilt(e.x, e.y, 7);
    })
    .onUpdate((e) => {
      const p = ph.get();
      if (!down.get() || p === PH_ENTER || p >= PH_REVEALED) return;
      if (p === PH_READY || p === PH_SCRATCH) scratchAt(e.x, e.y);
      if (ph.get() < PH_REVEALED) tilt(e.x, e.y, 7);
    })
    .onFinalize(() => {
      const was = down.get();
      down.set(false);
      last.set(null);
      if (ph.get() < PH_REVEALED) untilt();
      if (was && ph.get() === PH_SCRATCH) measure();
    });

  // ── Estilos animados ──────────────────────────────────────────────────────
  // ⚠️ Os valores animados são lidos DIRETO em cada useAnimatedStyle: o Reanimated só
  // refaz o estilo quando o próprio worklet lê os shared values — lidos dentro de uma
  // função auxiliar, a carta só era redesenhada quando a tela re-renderizava.
  // Qual face aparece: a frente quando está virada para a tela (cos do giro ≥ 0), o verso
  // no resto. Faz o papel do `backface-visibility: hidden` do design — no iOS, com a
  // perspectiva no transform, o backfaceVisibility escondia a frente de pé.
  const frontStyle = useAnimatedStyle(() => {
    const f = flight(fp.get(), fs.get(), fr.get(), fx0.get(), fy0.get(), fs0.get());
    const Y = ry.get() + ty.get() + f.ry, X = tx.get();
    const facing = Math.cos((Y * Math.PI) / 180) * Math.cos((X * Math.PI) / 180) >= 0;
    return {
      opacity: facing ? o.get() : 0,
      transform: cardT(f.x, y.get() + lift.get() + f.y, s.get() * f.s, X, Y, rz.get() + f.rz, false) as any,
    };
  });
  const haloStyle = useAnimatedStyle(() => {
    const f = flight(fp.get(), fs.get(), fr.get(), fx0.get(), fy0.get(), fs0.get());
    return {
      opacity: o.get(),
      transform: cardT(f.x, y.get() + lift.get() + f.y, s.get() * f.s, tx.get(), ry.get() + ty.get() + f.ry, rz.get() + f.rz, false) as any,
    };
  });
  const backStyle = useAnimatedStyle(() => {
    const f = flight(fp.get(), fs.get(), fr.get(), fx0.get(), fy0.get(), fs0.get());
    const Y = ry.get() + ty.get() + f.ry, X = tx.get();
    const facing = Math.cos((Y * Math.PI) / 180) * Math.cos((X * Math.PI) / 180) >= 0;
    return {
      opacity: facing ? 0 : o.get(),
      transform: cardT(f.x, y.get() + lift.get() + f.y, s.get() * f.s, X, Y, rz.get() + f.rz, true) as any,
    };
  });
  // Brilho rosado atrás da carta pousada + raios girando devagar.
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.get(),
    transform: [{ scale: interpolate(glow.get(), [0, 1], [0.6, 1.08]) }],
  }));
  // Halo rosa na borda: só depois do pouso (é estático no centro, não acompanha o voo).
  const cardGlowStyle = useAnimatedStyle(() => ({ opacity: fp.get() > 0.98 ? glow.get() : 0 }));
  const raysStyle = useAnimatedStyle(() => ({ opacity: raysO.get(), transform: [{ rotate: `${raysRot.get()}deg` }] }));
  const { holo, glare } = useHolo(tx, ty, ry, holoK);
  const chipSt = useAnimatedStyle(() => {
    const v = chipP.get();
    return { opacity: Math.min(1, v * 2), transform: [{ scale: 0.5 + 0.5 * v }] };
  });
  const chipGlowSt = useAnimatedStyle(() => ({ opacity: chipGlow.get() }));
  const auraSt = useAnimatedStyle(() => ({
    opacity: auraO.get() * (0.8 + 0.2 * auraBreath.get()),
    transform: [{ scale: 0.97 + 0.06 * auraBreath.get() }],
  }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.get() }));
  const headStyle = useAnimatedStyle(() => ({ opacity: head.get(), transform: [{ translateY: (1 - head.get()) * 12 }] }));
  const sheetStyle = useAnimatedStyle(() => ({ opacity: sheetO.get(), transform: [{ translateY: (sheet.get() / 100) * sheetH }] }));
  const SHEEN_W = (CW - 3) * 0.38;
  const sheenStyle = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(sheen.get(), [0, 1], [-1.6 * SHEEN_W, 4.2 * SHEEN_W]) }, { skewX: '-18deg' }] }));
  const flashStyle = useAnimatedStyle(() => {
    const t = flash.get();
    if (rm) return { opacity: t, transform: [{ scale: 1 }] };
    return {
      opacity: interpolate(t, [0, 0.22, 1], [0, flashPeak.get(), 0]),
      transform: [{ scale: interpolate(t, [0, 0.22, 1], [0.85, 1, 1.3]) }],
    };
  });
  const meterStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: meter.get() }] }));
  const oldStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - oldY.get() / 40), transform: [{ translateY: oldY.get() }] }));
  const newStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, 1 + newY.get() / 40)), transform: [{ translateY: newY.get() }] }));
  const prefixStyle = useAnimatedStyle(() => ({ opacity: prefixO.get() }));
  const numStyle = useAnimatedStyle(() => ({ transform: [{ scale: numScale.get() }] }));
  const drainStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: drain.get() }] }));
  const foilTransform = useDerivedValue(() => [{ scale: foilS.get() }]);

  // ── Continuar ─────────────────────────────────────────────────────────────
  const unlocked = progress >= UNLOCK || phase === 'revealed' || phase === 'recs';
  const onContinue = () => {
    if (!unlocked) return;
    haptics.action();
    if (srvMode) {
      // Próxima carta a raspar (Carta extra, marco); sem mais nenhuma, volta — ou, se ela
      // subiu de nível, vai para a "Sua caminhada", que anima os pontos e celebra (68d/68e).
      const atual = srvId;
      const sair = () => {
        if (router.canGoBack()) router.back(); else router.replace('/(app)/home' as any);
        if (subiuNivel.current) { subiuNivel.current = false; router.push('/(app)/caminhada' as any); }
      };
      estadoCartas()
        .then((e) => {
          const prox = e.a_raspar.find((x) => x.id !== atual);
          if (prox) { setSrvId(prox.id); setRun((r) => r + 1); }
          else sair();
        })
        .catch(sair);
      return;
    }
    const i = ORDEM_CARTAS.indexOf(tipo);
    setTipo(ORDEM_CARTAS[(i + 1) % ORDEM_CARTAS.length]);
    setRun((r) => r + 1);
  };
  const fill = unlocked ? 0 : Math.min(1, progress / UNLOCK);

  const hh = Math.floor(secs / 3600), mm = Math.floor((secs % 3600) / 60);
  const ease = CSS_EO;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {/* Fundo = o próprio app (a tela é um modal transparente por cima dele), desfocado
          enquanto a carta voa: camada de desfoque estática, só a opacidade anima. */}
      <Animated.View style={[StyleSheet.absoluteFill, veilStyle]} pointerEvents="none">
        <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(252,228,238,0.55)' }]} />
      </Animated.View>

      {/* Brilho e raios atrás da carta pousada */}
      <Animated.View pointerEvents="none" style={[styles.rays, { left: stageX + CW / 2 - RAYS / 2, top: stageY + CH / 2 - RAYS / 2 }, raysStyle]}>
        <Svg width={RAYS} height={RAYS} viewBox={`0 0 ${RAYS} ${RAYS}`}>
          <Defs>
            <RadialGradient id="ray" cx="50%" cy="50%" r="50%">
              <Stop offset="0.16" stopColor="#FFFFFF" stopOpacity={1} />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.7} />
              <Stop offset="1" stopColor="#FFC2DB" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Path d={RAYS_PATH} fill="url(#ray)" />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.glow, { left: stageX + CW / 2 - GLOW / 2, top: stageY + CH / 2 - GLOW / 2 }, glowStyle]} />

      {/* Fechar */}
      <Pressable
        onPress={() => { haptics.tap(); if (router.canGoBack()) router.back(); else router.replace('/(app)/home' as any); }}
        style={[styles.close, { top: oy + 58, right: ox + 16 }]}
        accessibilityLabel="Fechar"
        hitSlop={6}
      >
        <Icon d={['M18 6 6 18', 'm6 6 12 12']} size={18} color={INK} sw={2} />
      </Pressable>

      {/* 2. Headline */}
      <Animated.View style={[styles.head, { top: oy + 102, left: ox + 24, right: ox + 24 }, headStyle]} pointerEvents="none">
        <Text style={styles.headLabel}>{headLabel}</Text>
        <Text style={styles.headline} lineBreakStrategyIOS="standard">{headLine}</Text>
        {!srvMode && c.timer && (
          <View style={styles.timer}>
            <Icon d={['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z', 'M12 6v6l4 2']} size={15} color={PINK} sw={2} />
            <Text style={styles.timerText}>some em {hh}h {mm}min</Text>
            <View style={styles.drainTrack}><Animated.View style={[styles.drainFill, drainStyle]} /></View>
          </View>
        )}
      </Animated.View>

      {/* A carta */}
      <GestureDetector gesture={gesture}>
        <View style={[styles.stage, { left: stageX, top: stageY }]}>
          <Animated.View pointerEvents="none" style={[styles.cardGlow, cardGlowStyle]} />
          {!srvMode && tipo === 'idade' && (
            <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />
          )}
          {isPower && (
            <Animated.View pointerEvents="none" style={[styles.auraWrap, haloStyle]}>
              <Animated.View style={[styles.aura, auraSt]} />
            </Animated.View>
          )}
          {/* Verso (aparece durante o giro da entrada) */}
          <Animated.View pointerEvents="none" style={[styles.face, styles.back, backStyle]}>
            <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(150deg, #FFE1EE 0%, #FBCDE5 38%, #EBD6FB 66%, #FFD9EA 100%)' }]} />
            <View style={styles.backInner} />
            <View style={styles.backPattern}>
              {Array.from({ length: 13 * 8 }).map((_, i) => <Image key={i} source={LOGO} style={styles.backPatternLogo} />)}
            </View>
            <View style={styles.backCircle}><Image source={LOGO} style={{ width: 84, height: 85 }} /></View>
            <Animated.View style={[styles.holo, holo]} />
            <Animated.View style={[styles.glare, glare]} />
          </Animated.View>

          {/* Frente */}
          <Animated.View pointerEvents="none" style={[styles.face, styles.front, isPower && styles.frontPower, frontStyle]}>
            <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(160deg, #FFFFFF 0%, #FFF7FB 58%, #FCEEF6 100%)' }]} />
            {srvMode ? (
              <View style={styles.frontPad}>
                {srv && kindSrv && (
                  <FrenteServidor
                    kind={kindSrv} carta={srv.carta} dup={isDup} vezes={(srv.antes ?? 0) + 1} poderTxt={poderTxt}
                    label={origemLabel} chipSt={chipSt} chipGlowSt={chipGlowSt} pontos={pontos} rm={rm}
                  />
                )}
              </View>
            ) : (
            <View style={styles.frontPad}>
              <View style={styles.frontTop}>
                <Image source={LOGO} style={{ width: 18, height: 18 }} />
                <Text style={styles.frontLabel}>{c.label}</Text>
                <Text style={styles.frontWhen}>{c.when}</Text>
              </View>
              <View style={styles.frontMid}>
                {c.kind === 'meter' && (
                  <>
                    <Text style={styles.meterTitle}>{c.title}</Text>
                    <View style={styles.meterTrack}>
                      <Animated.View style={[styles.meterFill, meterStyle]} />
                      <View style={[styles.meterSep, { left: '33.33%' }]} />
                      <View style={[styles.meterSep, { left: '66.66%' }]} />
                    </View>
                    <Text style={styles.meterLevel}>{c.level}</Text>
                  </>
                )}
                {c.kind === 'count' && (
                  <>
                    <View style={styles.countRow}>
                      {!!c.prefix && <Text style={styles.countPrefix}>{c.prefix}</Text>}
                      <Animated.Text style={[styles.countNum, numStyle]}>{num}</Animated.Text>
                      {!!c.suffix && <Text style={styles.countSuffix}>{c.suffix}</Text>}
                    </View>
                    <Text style={styles.countText}>{c.text}</Text>
                  </>
                )}
                {c.kind === 'roll' && (
                  <>
                    <View style={styles.rollRow}>
                      <Animated.View style={[styles.rollPrefix, prefixStyle]}>
                        <Text style={styles.rollFrom}>{c.from}</Text>
                        <Icon d={['M5 12h14', 'm12 5 7 7-7 7']} size={18} color="#B5B5B5" sw={2.2} />
                      </Animated.View>
                      <View style={styles.rollBox}>
                        <Animated.Text style={[styles.rollNum, oldStyle]}>{c.from}</Animated.Text>
                        <Animated.Text style={[styles.rollNum, newStyle]}>{c.to}</Animated.Text>
                      </View>
                    </View>
                    <Text style={[styles.countText, { marginTop: 2 }]}>{c.text}</Text>
                  </>
                )}
                <View style={styles.chip}><Text style={styles.chipText}>{c.chip}</Text></View>
              </View>
              <Text style={styles.foot}>{c.foot}</Text>
            </View>
            )}

            {/* 5. A camada de raspar (Skia): o traço apaga a camada (BlendMode.Clear) */}
            <Canvas style={StyleSheet.absoluteFill}>
              <Group transform={[{ scaleX: (CW - 3) / CW }, { scaleY: (CH - 3) / CH }]}>
                {/* A opacidade vai na Paint da camada: o <Picture> desenha com as próprias
                    paints e ignora o `opacity` do Group — a camada ficava por cima, desfocada,
                    depois da revelação. */}
                <Group
                  origin={vec(CW / 2, CH / 2)}
                  transform={foilTransform}
                  layer={<Paint opacity={foilO}><Blur blur={foilBlur} /></Paint>}
                >
                  <Picture picture={foilPic} />
                  <SkiaPath
                    path={scratch}
                    style="stroke"
                    strokeWidth={BRUSH}
                    strokeCap="round"
                    strokeJoin="round"
                    color="black"
                    blendMode="clear"
                  />
                </Group>
              </Group>
            </Canvas>
            <Animated.View style={[styles.sheen, sheenStyle]} />
            {/* "Raspe para ver" */}
            <Animated.View
              style={[styles.hint, {
                opacity: hint ? 1 : 0,
                transform: [{ translateX: '-50%' }, { translateY: '-50%' }, { scale: hint ? 1 : 0.9 }],
                transitionProperty: ['opacity', 'transform'],
                transitionDuration: [220, 340],
                transitionTimingFunction: ease,
              } as any]}
            >
              <Icon d={HAND} size={17} color={PINK} sw={1.9} />
              <Text style={styles.hintText}>Raspe para ver</Text>
            </Animated.View>
            <Animated.View style={[styles.holo, holo]} />
            <Animated.View style={[styles.glare, glare]} />
          </Animated.View>

          {/* Flash da revelação */}
          <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />
        </View>
      </GestureDetector>

      {/* Partículas */}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Picture picture={partPic} />
      </Canvas>

      {/* "Toque na carta para começar" */}
      <Animated.Text
        pointerEvents="none"
        style={[styles.helper, {
          bottom: 112 + ob, left: ox + 24, right: ox + 24,
          opacity: phase === 'idle' ? 1 : 0,
          transitionProperty: 'opacity', transitionDuration: 220,
        }]}
      >
        Toque na carta para começar
      </Animated.Text>

      {/* 7. Recomendações */}
      <Animated.View style={[styles.sheet, { top: sheetTop }, sheetStyle]} pointerEvents={recs ? 'auto' : 'none'}>
        <View style={styles.grabber} />
        <Text style={styles.recTitle}>{c.recTitle}</Text>
        <View style={{ marginTop: 14, gap: 10 }}>
          {c.recs.map((r, i) => (
            <Animated.View
              key={`${tipo}-${i}`}
              style={[styles.rec, {
                opacity: recs ? 1 : 0,
                transform: [{ translateY: recs || rm ? 0 : 16 }],
                transitionProperty: ['opacity', 'transform'],
                transitionDuration: [260, 440],
                transitionDelay: recs && !rm ? 200 + i * 60 : 0,
                transitionTimingFunction: ease,
              } as any]}
            >
              <View style={styles.recIcon}><Icon d={REC_ICONS[r.i]} size={20} color="#fff" sw={1.8} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.recT}>{r.t}</Text>
                <Text style={styles.recD}>{r.d}</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      {/* Continuar */}
      <Pressable onPress={onContinue} disabled={!unlocked} style={{ position: 'absolute', left: ox + 24, right: ox + 24, bottom: 40 + ob }}>
        <Animated.View
          style={[styles.btn, {
            opacity: btnShown ? 1 : 0,
            backgroundColor: unlocked ? PINK : '#F0F0F0',
            boxShadow: unlocked ? '0px 6px 12px rgba(255,94,168,0.45)' : '0px 0px 0px rgba(255,94,168,0)',
            transitionProperty: ['opacity', 'backgroundColor', 'boxShadow'],
            transitionDuration: 240,
          }]}
        >
          <Animated.View
            style={[styles.btnFill, {
              transform: [{ scaleX: fill }],
              transitionProperty: 'transform', transitionDuration: 220, transitionTimingFunction: ease,
            } as any]}
          />
          <Animated.Text style={[styles.btnText, { color: unlocked ? '#FFFFFF' : '#B5B5B5', transitionProperty: 'color', transitionDuration: 240 }]}>
            Continuar
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}


// ── Revelação das cartas do servidor (peça 4 do design, 79i–79k) ─────────────
const COPY = ['M5.5 6h8A2.5 2.5 0 0 1 16 8.5v11a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 19.5v-11A2.5 2.5 0 0 1 5.5 6z', 'M8 3h11a2 2 0 0 1 2 2v13'];
const SPARK_PLUS = 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z';

// Selo de NIKS Points abaixo do chip (proposta aprovada: o selo branco de borda rosa do
// 68d, na altura dos chips da carta). Entra com fade e o número conta em 900 ms.
const EO_FN = Easing.bezierFn(0.23, 1, 0.32, 1);
function SeloPontos({ valor, rm }: { valor: number; rm: boolean }) {
  const [n, setN] = useState(rm ? valor : 0);
  const o = useSharedValue(rm ? 1 : 0);
  useEffect(() => {
    o.set(withDelay(rm ? 0 : 260, withTiming(1, { duration: rm ? 200 : 320, easing: EO })));
    if (rm) { setN(valor); return; }
    let raf = 0;
    const t0 = Date.now() + 260;
    const passo = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - t0) / 900));
      setN(Math.round(valor * EO_FN(t)));
      if (t < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor, rm, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateY: 6 * (1 - o.get()) }] }));
  return (
    <Animated.View style={[styles.selo, st]}>
      <Text style={styles.seloText}>{`+${n} NIKS Points`}</Text>
    </Animated.View>
  );
}

function FrenteServidor({
  kind, carta, dup, vezes, poderTxt, label, chipSt, chipGlowSt, pontos, rm,
}: {
  kind: 'coll' | 'power' | 'conh'; carta: CartaGanha; dup: boolean; vezes: number; poderTxt: string; label: string;
  chipSt: object; chipGlowSt: object; pontos: number | null; rm: boolean;
}) {
  const cat = carta.carta!;
  if (kind === 'conh') {
    // Conhecimento: o mesmo verso do detalhe 78c (tipo, título e texto).
    const titulo = String((carta.conteudo as any)?.titulo ?? cat.nome);
    const texto = (carta.conteudo as any)?.texto ?? cat.texto;
    return (
      <>
        <View style={styles.frontTop}>
          <Image source={LOGO} style={{ width: 18, height: 18 }} />
          <Text style={styles.frontLabel}>{label}</Text>
          <Text style={styles.frontWhen}>Hoje</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 10 }}>
          <Text style={styles.conhTitle} lineBreakStrategyIOS="standard">{titulo}</Text>
          {!!texto && <Text style={styles.conhText} lineBreakStrategyIOS="standard">{String(texto)}</Text>}
        </View>
        {pontos != null && <View style={{ alignItems: 'center', marginBottom: 6 }}><SeloPontos valor={pontos} rm={rm} /></View>}
      </>
    );
  }
  if (carta.origem === 'campea' && kind === 'coll') {
    // 80h · carta rara da campeã: selo Rara, "Campeã da semana", check-ins e a semana.
    const ct = carta.conteudo as { checkins?: number; semana?: string } | null;
    const ini = ct?.semana ? new Date(`${ct.semana}T12:00:00`) : null;
    const fim = ini ? new Date(ini.getTime() + 6 * 86400000) : null;
    const curta = (d: Date) => `${d.getDate()} de ${['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'][d.getMonth()]}`;
    const n = Number(ct?.checkins ?? 0);
    const sub = [n ? `${n} ${n === 1 ? 'check-in' : 'check-ins'}` : '', ini && fim ? `${curta(ini)} a ${curta(fim)}` : ''].filter(Boolean).join(' · ');
    return (
      <>
        <View style={styles.frontTop}>
          <Image source={LOGO} style={{ width: 18, height: 18 }} />
          <Text style={styles.frontLabel}>Carta rara</Text>
          <View style={styles.rarePill}>
            <Svg width={11} height={11} viewBox="0 0 24 24"><Path d={SPARK_PLUS} fill="#fff" /></Svg>
            <Text style={styles.rarePillText}>Rara</Text>
          </View>
        </View>
        <View style={styles.frontMid}>
          <View style={[styles.srvArt, { boxShadow: '0px 0px 24px rgba(255,94,168,0.35)' }]}>
            <Image source={LOGO} style={{ width: 56, height: 57 }} />
          </View>
          <Text style={styles.srvName} lineBreakStrategyIOS="standard">{'Campeã\nda semana'}</Text>
          {!!sub && <Text style={[styles.srvSub, { color: '#C99BC4' }]} lineBreakStrategyIOS="standard">{sub}</Text>}
          {dup ? null : (
            <View style={{ marginTop: 16 }}>
              <Animated.View style={[styles.srvChip, chipSt]}>
                <Icon d={['M12 5v14M5 12h14']} size={14} color="#fff" sw={2.6} />
                <Text style={[styles.srvChipText, { color: '#fff' }]}>Nova na sua coleção!</Text>
              </Animated.View>
            </View>
          )}
          {pontos != null && <SeloPontos valor={pontos} rm={rm} />}
        </View>
        <Text style={styles.foot}>Vai para o seu deck de Raras</Text>
      </>
    );
  }
  const power = kind === 'power';
  const info = power ? PODER_INFO[cat.subtipo ?? ''] ?? { nome: cat.nome, efeito: cat.texto ?? '', icone: PODER_INFO.sequencia_dobro.icone } : null;
  return (
    <>
      {power && (
        <View style={styles.frontTop}>
          <Image source={LOGO} style={{ width: 18, height: 18 }} />
          <Text style={styles.frontLabel}>Carta de poder</Text>
          <Text style={styles.frontWhen}>Hoje</Text>
        </View>
      )}
      <View style={styles.frontMid}>
        <View style={[styles.srvArt, power && { boxShadow: '0px 0px 24px rgba(255,94,168,0.45)' }]}>
          <Image source={LOGO} style={{ width: 56, height: 57 }} />
          {power && (
            <View style={styles.srvBadge}>
              <Icon d={[info!.icone]} size={15} color="#fff" sw={2.2} />
            </View>
          )}
        </View>
        {power ? (
          <>
            <Text style={styles.srvName} lineBreakStrategyIOS="standard">{info!.nome}</Text>
            <Text style={styles.srvSub} lineBreakStrategyIOS="standard">{info!.efeito}</Text>
          </>
        ) : (
          <Text style={styles.srvColl}>Carta colecionável</Text>
        )}
        {dup ? (
          <View style={styles.srvChipDup}>
            <Icon d={COPY} size={14} color={PINK} sw={2.2} />
            <Text style={[styles.srvChipText, { color: PINK }]}>{`Você já tem esta · x${vezes}`}</Text>
          </View>
        ) : (
          <View style={{ marginTop: 16 }}>
            {power && <Animated.View style={[styles.srvChipGlow, chipGlowSt]} />}
            <Animated.View style={[styles.srvChip, power && { boxShadow: '0px 6px 14px rgba(255,94,168,0.45)' }, chipSt]}>
              {power ? (
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Path d={SPARK_PLUS} fill="#fff" />
                  <Path d="M20 2v4M22 4h-4" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" fill="none" />
                </Svg>
              ) : (
                <Icon d={['M12 5v14M5 12h14']} size={14} color="#fff" sw={2.6} />
              )}
              <Text style={[styles.srvChipText, { color: '#fff' }]}>{power ? 'Ativado agora' : 'Nova na sua coleção!'}</Text>
            </Animated.View>
          </View>
        )}
        {pontos != null && <SeloPontos valor={pontos} rm={rm} />}
      </View>
      {power && <Text style={styles.foot}>{poderTxt}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  rays: { position: 'absolute', width: RAYS, height: RAYS, zIndex: 9 },
  cardGlow: {
    position: 'absolute', left: 0, top: 0, width: CW, height: CH, borderRadius: 22,
    boxShadow: '0px 0px 48px 8px rgba(255,94,168,0.55), 0px 0px 0px 4px rgba(255,94,168,0.18)',
  },
  glow: {
    position: 'absolute', width: GLOW, height: GLOW, borderRadius: GLOW / 2, zIndex: 9,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,140,192,0.55) 40%, rgba(214,180,255,0.3) 68%, rgba(214,180,255,0))',
  },
  close: {
    position: 'absolute', zIndex: 30, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(255,94,168,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  head: { position: 'absolute', zIndex: 5, alignItems: 'center' },
  headLabel: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: PINK, letterSpacing: -0.1, textAlign: 'center' },
  headline: { marginTop: 8, fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.7, maxWidth: 310, textAlign: 'center', color: INK },
  timer: {
    marginTop: 12, height: 28, paddingLeft: 10, paddingRight: 12, borderRadius: 100, backgroundColor: '#fff',
    borderWidth: 1, borderColor: 'rgba(255,94,168,0.35)', flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  timerText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: INK, fontVariant: ['tabular-nums'] },
  drainTrack: { width: 38, height: 4, borderRadius: 100, backgroundColor: '#F0F0F0', overflow: 'hidden' },
  drainFill: { ...StyleSheet.absoluteFillObject, backgroundColor: PINK, transformOrigin: 'left center' },

  stage: { position: 'absolute', width: CW, height: CH, zIndex: 10 },
  halo: {
    position: 'absolute', left: -34, top: -34, right: -34, bottom: -34, borderRadius: 56,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,94,168,0.34), rgba(214,180,255,0.22) 62%, rgba(214,180,255,0))',
  },
  face: { position: 'absolute', left: 0, top: 0, width: CW, height: CH, borderRadius: 22, overflow: 'hidden' },
  front: { borderWidth: 1.5, borderColor: PINK, boxShadow: '0px 18px 40px rgba(200,60,120,0.18), 0px 2px 6px rgba(200,60,120,0.10)' },
  frontPower: { boxShadow: '0px 18px 44px rgba(200,60,120,0.26), 0px 0px 0px 3px rgba(255,94,168,0.18)' },
  // Auréola rosa e lilás atrás do poder (79k), respirando .97↔1.03 em 2,4 s.
  auraWrap: { position: 'absolute', left: -34, top: -34, right: -34, bottom: -34 },
  aura: {
    flex: 1, borderRadius: 56,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,94,168,0.38), rgba(214,180,255,0.24) 62%, rgba(214,180,255,0))',
  },
  srvArt: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: '#FFF0F7', borderWidth: 1.5, borderColor: 'rgba(255,94,168,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  srvBadge: {
    position: 'absolute', right: -4, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: PINK,
    borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 4px 10px rgba(255,94,168,0.4)',
  },
  srvName: { marginTop: 16, fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.7, maxWidth: 200, textAlign: 'center', color: INK },
  srvSub: { marginTop: 5, fontSize: 13, lineHeight: 18, letterSpacing: -0.1, maxWidth: 200, textAlign: 'center', color: INK },
  srvColl: { marginTop: 16, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: INK },
  srvChip: { height: 30, paddingLeft: 11, paddingRight: 14, borderRadius: 100, backgroundColor: PINK, flexDirection: 'row', alignItems: 'center', gap: 6 },
  srvChipGlow: {
    position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 100,
    boxShadow: '0px 0px 0px 10px rgba(255,94,168,0), 0px 6px 24px rgba(255,94,168,0.7)',
  },
  srvChipDup: {
    marginTop: 16, height: 30, paddingLeft: 11, paddingRight: 14, borderRadius: 100, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: PINK, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  srvChipText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  selo: {
    marginTop: 8, height: 30, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: PINK, boxShadow: '0px 8px 18px rgba(255,94,168,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  seloText: { color: PINK, fontSize: 15, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  conhTitle: { fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.6, color: INK },
  conhText: { marginTop: 10, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: INK },
  back: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)', boxShadow: '0px 18px 40px rgba(200,60,120,0.18)' },
  backInner: { position: 'absolute', left: 9 - 1.5, top: 9 - 1.5, right: 9 - 1.5, bottom: 9 - 1.5, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)' },
  backPattern: {
    position: 'absolute', left: 20 - 1.5, top: 20 - 1.5, right: 20 - 1.5, bottom: 20 - 1.5, opacity: 0.24,
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'space-between',
  },
  backPatternLogo: { width: 24, height: 24 },
  backCircle: {
    position: 'absolute', left: '50%', top: '50%', width: 132, height: 132, marginLeft: -66, marginTop: -66, borderRadius: 66,
    backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  holo: {
    position: 'absolute', left: 0, top: 0, width: CW * 2.6, height: CH * 2.6, mixBlendMode: 'overlay',
    experimental_backgroundImage: HOLO_BG,
  },
  glare: {
    position: 'absolute', left: 0, top: 0, width: GLARE_R * 2, height: GLARE_R * 2,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,255,255,0.75), rgba(255,255,255,0))',
  },
  frontPad: { flex: 1, padding: 18 - 1.5 },
  frontTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  frontLabel: { fontSize: 13, fontWeight: '600', color: PINK, letterSpacing: -0.1 },
  frontWhen: { marginLeft: 'auto', fontSize: 12, color: MUTE },
  rarePill: { marginLeft: 'auto', height: 24, paddingHorizontal: 9, borderRadius: 100, backgroundColor: PINK, flexDirection: 'row', alignItems: 'center', gap: 4 },
  rarePillText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  frontMid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meterTitle: { fontSize: 27, lineHeight: 31, fontWeight: '700', letterSpacing: -0.8, maxWidth: 190, textAlign: 'center', color: INK },
  meterTrack: { marginTop: 18, width: 150, height: 8, borderRadius: 100, backgroundColor: '#F0F0F0', overflow: 'hidden' },
  meterFill: { ...StyleSheet.absoluteFillObject, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },
  meterSep: { position: 'absolute', top: 0, bottom: 0, width: 3, marginLeft: -1.5, backgroundColor: '#fff' },
  meterLevel: { marginTop: 9, fontSize: 14, color: MUTE, letterSpacing: -0.1 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5 },
  countPrefix: { fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: PINK },
  countNum: { fontSize: 80, lineHeight: 84, fontWeight: '800', letterSpacing: -3, color: PINK, fontVariant: ['tabular-nums'] },
  countSuffix: { fontSize: 36, fontWeight: '700', letterSpacing: -1, color: PINK },
  countText: { marginTop: 4, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, maxWidth: 190, textAlign: 'center', color: INK },
  rollRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  rollPrefix: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rollFrom: { fontSize: 30, fontWeight: '700', color: '#B5B5B5', letterSpacing: -0.8, textDecorationLine: 'line-through' },
  rollBox: { width: 98, height: 88, overflow: 'hidden' },
  rollNum: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, textAlign: 'center', lineHeight: 88,
    fontSize: 82, fontWeight: '800', letterSpacing: -3, color: PINK,
  },
  chip: { marginTop: 16, height: 30, paddingHorizontal: 14, borderRadius: 100, backgroundColor: PINK, justifyContent: 'center' },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  foot: { fontSize: 12, color: MUTE, textAlign: 'center' },
  sheen: {
    position: 'absolute', top: '-30%', bottom: '-30%', left: 0, width: '38%',
    experimental_backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.8), rgba(255,255,255,0))',
  },
  hint: {
    position: 'absolute', left: '50%', top: '76%', zIndex: 3, height: 36, paddingLeft: 13, paddingRight: 16, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.94)', boxShadow: '0px 6px 16px rgba(200,60,120,0.16)',
    flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  hintText: { color: PINK, fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  flash: {
    position: 'absolute', left: -70, top: -70, right: -70, bottom: -70, borderRadius: 999, zIndex: 2,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,214,236,0.7) 45%, rgba(255,214,236,0))',
  },

  helper: { position: 'absolute', zIndex: 6, textAlign: 'center', fontSize: 14, color: MUTE, letterSpacing: -0.1 },

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 15, backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 18,
    boxShadow: '0px -10px 30px rgba(190,70,120,0.12)',
  },
  grabber: { width: 36, height: 5, borderRadius: 100, backgroundColor: '#F0F0F0', alignSelf: 'center' },
  recTitle: { marginTop: 18, fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.5, color: INK },
  rec: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 13, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: PINK, borderRadius: 16, backgroundColor: '#fff', boxShadow: '0px 6px 18px rgba(255,94,168,0.10)',
  },
  recIcon: { width: 37, height: 37, borderRadius: 18.5, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  recT: { fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3, color: INK },
  recD: { marginTop: 3, fontSize: 13, lineHeight: 18, color: MUTE },

  btn: { height: 56, borderRadius: 100, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  btnFill: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,94,168,0.2)', transformOrigin: 'left center' },
  btnText: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
});
