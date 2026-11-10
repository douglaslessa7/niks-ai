import { trackFora } from '../../lib/mixpanel/MixpanelProvider';
import { irPara } from '../../lib/navegar';
import { paywallAposCarta } from '../../lib/trava';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Alert, AppState, BackHandler, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
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
  cartaDetalhe, rasparCarta, estadoCartas, estadoPoder, etiquetaCarta, useEstadoCartas, type CartaGanha, type EstadoPoder,
} from '../../lib/cartasServidor';
import Carta, { CONTA_MS, VERMELHO_ALERTA, sombraCarta, visualDe, type VisualCarta } from '../../components/cartas/Carta';
import PacotePontos from '../../components/cartas/PacotePontos';
import { inicioDoPacote } from '../../lib/pontosAnimacao';
import { marcarCartaAberta } from '../../lib/cartaDoDia';
import { dateKey, sessionDate } from '../../lib/routineProgress';
import { useAppStore } from '../../store/onboarding';
import { useObName } from '../../components/onboarding/kit';
import { cartaDoOnboarding, pontoForteDoOnboarding } from '../../lib/cartaOnboarding';
import { useObPassoVisto } from '../../components/onboarding/passo';
import { OB_STEPS } from '../../components/onboarding/kit';

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
// Onboarding: voo de 1,5 s depois da luz rosa, com 3 voltas completas (verso e frente à
// vista) que começam rápidas e freiam ao chegar no centro.
const OB_FLY_AT = 3250;
const OB_FLY_MS = 1500;
const OB_EASE_SPIN = Easing.bezier(0.2, 0.55, 0.3, 1);
const OB_GIRO = 1080;
// Onboarding: fundo rosa — partículas brancas e rosa bem claro (o rosa do app sumiria nele).
const COLORS_OB = ['#FFFFFF', '#FFFFFF', '#FFE6F2', '#FFD6EA'];
// A carta clara no fundo rosa: brilho branco em volta + sombra rosa escura embaixo.
const SOMBRA_OB = '0px 0px 30px 6px rgba(255,255,255,0.55), 0px 20px 40px rgba(150,10,80,0.40)';

// ── As DUAS cartas do onboarding (06/nov/2026, pedido do produto) ─────────────────────────
// Carta 1 (notícia boa, o ponto forte) → transição de alerta (sem botão) → Carta 2 (alerta).
// Sem ponto forte possível, a Carta 1 é pulada e a tela vai direto à transição.
// Rosa-escuro do alerta: ícone na camada de raspar e borda pulsando da Carta 2.
// Desde o pedido "mais vermelha" (06/nov/2026): o vermelho do Niks score (#FD3A42, em
// `components/cartas/Carta.tsx`) e o tom escuro dele para o ícone.
const ALERTA_ESCURO = '#D3263A';
// A Carta 2 não tem o brilho branco da Carta 1 (nada festivo): só a sombra escura.
const SOMBRA_ALERTA = '0px 0px 26px 2px rgba(253,58,66,0.35), 0px 22px 44px rgba(60,0,16,0.50)';
// Transição de alerta (ms desde o "Continuar" da Carta 1): a carta sai (240), o fundo vira o
// rosa-escuro (500), "Mas nem tudo são boas notícias, <nome>." 300–1250 com o batimento,
// "Encontramos algo que precisa da sua atenção." 1400–2300, a Carta 2 entra aos 2500.
const TRANS = { sai: 240, escurece: 500, t1: 300, t1Fora: 1250, t2: 1400, t2Fora: 2300, fim: 2500 };
// Entrada da Carta 2 (alerta, não prêmio): surge no centro com um tranco curto (0,92 → 1,04 em
// 120 ms, ease-out; depois assenta em 1 sem sobra) e um tremor leve logo em seguida.
const TRANCO_MS = 120;
const TREMOR: [number, number][] = [[4, 45], [-4, 60], [3, 55], [-3, 55], [1.5, 50], [0, 45]];

// `giro`: graus da entrada (540 = 1,5 volta; o onboarding usa 3 voltas).
function flight(p: number, ps: number, pr: number, x0: number, y0: number, s0: number, giro = 540) {
  'worklet';
  return {
    x: x0 * (1 - p),
    y: y0 * (1 - p),
    s: s0 + (1 - s0) * ps,
    ry: -giro * (1 - pr),
    rz: 0 * p,
  };
}

type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; c: string; star: boolean; rot: number };

function mkPart(x: number, y: number, vx: number, vy: number, cores: string[] = COLORS): Part {
  'worklet';
  return {
    x, y, vx, vy, life: 0, max: 0.55 + Math.random() * 0.75, s: 1.6 + Math.random() * 3.2,
    c: cores[Math.floor(Math.random() * cores.length)], star: Math.random() < 0.45, rot: Math.random() * 3,
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

// Camada de raspar das cartas do servidor = o verso da rodada 84a (NiksCartaFlo): borda
// branca de 3, degradê perolado de 165°, brilho branco no meio, a flor (78 pt com sombra
// rosa) a 46% e o fio branco por dentro. Medidas do design (220 × 308) escaladas para
// 252 × 360; a borda é desenhada aqui porque a camada cobre a carta inteira.
// `alerta` (Carta 2 do onboarding, 06/nov/2026): no lugar da flor, o ícone de alerta (triângulo
// rosa-escuro com "!"), na própria camada de raspar — some raspando, como o resto do verso.
function drawVerso84(img: SkImage | null, alerta = false) {
  return createPicture((c) => {
    const W = CW, H = CH, sx = W / 220, b = 3 * sx;
    const R = 22 * sx;
    const outer = Skia.RRectXY(Skia.XYWHRect(0, 0, W, H), R, R);
    const white = Skia.Paint(); white.setColor(Skia.Color('#FFFFFF'));
    c.drawRRect(outer, white);
    const iw = W - 2 * b, ih = H - 2 * b;
    const inner = Skia.RRectXY(Skia.XYWHRect(b, b, iw, ih), R - b, R - b);
    // 165° no CSS: a direção é (sin 165°, −cos 165°); os extremos cobrem a caixa toda.
    const a = (165 * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
    const half = (Math.abs(iw * dx) + Math.abs(ih * dy)) / 2, cx = b + iw / 2, cy = b + ih / 2;
    const g = Skia.Paint();
    g.setShader(Skia.Shader.MakeLinearGradient(
      vec(cx - dx * half, cy - dy * half), vec(cx + dx * half, cy + dy * half),
      (alerta ? ['#FFF1F0', '#FFD6D8', '#FFE5E8'] : ['#FFE6F1', '#FCD6E8', '#EFDDFB']).map((x) => Skia.Color(x)), [0, 0.48, 1], TileMode.Clamp,
    ));
    c.drawRRect(inner, g);
    // radial-gradient(55% 40% at 50% 46%): elipse de raios 55% × 40% da caixa.
    const gx = b + iw * 0.5, gy = b + ih * 0.46, rx = iw * 0.55, ry = ih * 0.4;
    const rg = Skia.Paint();
    rg.setShader(Skia.Shader.MakeRadialGradient(
      vec(gx, gy), rx, [Skia.Color('rgba(255,255,255,0.85)'), Skia.Color('rgba(255,255,255,0)')], null, TileMode.Clamp,
      Skia.Matrix().translate(gx, gy).scale(1, ry / rx).translate(-gx, -gy),
    ));
    c.drawRRect(inner, rg);
    if (alerta) {
      const t = 84 * sx, cxI = gx, cyI = gy + 4 * sx;
      const tri = Skia.Path.Make();
      tri.moveTo(cxI, cyI - t * 0.52); tri.lineTo(cxI + t * 0.56, cyI + t * 0.44); tri.lineTo(cxI - t * 0.56, cyI + t * 0.44); tri.close();
      const tp = Skia.Paint(); tp.setColor(Skia.Color(ALERTA_ESCURO)); tp.setAntiAlias(true);
      tp.setPathEffect(Skia.PathEffect.MakeCorner(10 * sx));
      tp.setImageFilter(Skia.ImageFilter.MakeDropShadow(0, 6 * sx, 8 * sx, 8 * sx, Skia.Color('rgba(150,10,30,0.35)'), null));
      c.drawPath(tri, tp);
      const wp = Skia.Paint(); wp.setColor(Skia.Color('#FFFFFF')); wp.setAntiAlias(true);
      c.drawRRect(Skia.RRectXY(Skia.XYWHRect(cxI - 4.5 * sx, cyI - t * 0.2, 9 * sx, t * 0.36), 4.5 * sx, 4.5 * sx), wp);
      c.drawCircle(cxI, cyI + t * 0.28, 5.2 * sx, wp);
    } else if (img) {
      const lw = 78 * sx, lh = 79 * sx;
      const lp = Skia.Paint();
      lp.setImageFilter(Skia.ImageFilter.MakeDropShadow(0, 6 * sx, 6 * sx, 6 * sx, Skia.Color('rgba(255,94,168,0.35)'), null));
      c.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(gx - lw / 2, gy - lh / 2, lw, lh), lp);
    }
    const ins = b + 9 * sx;
    const fio = Skia.Paint(); fio.setStyle(PaintStyle.Stroke); fio.setStrokeWidth(1.5 * sx); fio.setColor(Skia.Color('rgba(255,255,255,0.85)'));
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(ins, ins, W - 2 * ins, H - 2 * ins), 15 * sx, 15 * sx), fio);
  }, Skia.XYWHRect(0, 0, CW, CH));
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
const LUZ = 160; // a luz rosa de onde a carta do onboarding sai
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
  const params = useLocalSearchParams<{ tipo?: string; id?: string; modo?: string; depois?: string }>();
  // `depois` (05/nov/2026, o "Iniciar skincare" da home — `lib/concluirSkincare`): para onde ir
  // quando as cartas acabarem ou ela fechar (o mural do grupo, a home ou criar grupo). Sem
  // ele, como sempre: volta para onde estava.
  const depois = typeof params.depois === 'string' && params.depois ? params.depois : null;
  const fechar = () => {
    if (router.canGoBack()) router.back();
    else if (!depois) router.replace('/(app)/home' as any);
    // Desce até o destino se ele já está na pilha do app (ex.: o grupo de onde saiu o check-in),
    // sem empilhar outra cópia; senão abre (lib/navegar).
    if (depois) irPara(depois as any);
  };
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
  const [poderEst, setPoderEst] = useState<EstadoPoder | null>(null);
  const [revelada, setRevelada] = useState(false);
  // NIKS Points da carta (sorteados no servidor ao raspar; a rara já vem ×3).
  const [pontos, setPontos] = useState<number | null>(null);
  // Subiu de nível em alguma carta desta sequência → o "Continuar" final abre a caminhada (68d/68e).
  const subiuNivel = useRef(false);
  // Pacote de pontos depois da revelação (total antes → depois); a tabela de níveis vem do
  // estado das cartas, para a barra piso→teto.
  const [pacote, setPacote] = useState<{ de: number; para: number } | null>(null);
  const reveladaEm = useRef(0);
  const { data: estado } = useEstadoCartas();
  const tabela = useRef(estado);
  tabela.current = estado;
  useEffect(() => {
    if (!srvId) return;
    marcarCartaAberta(srvId);   // a home não reabre sozinha uma carta já aberta nesta sessão
    let vivo = true;
    setSrv(null); setPoderEst(null); setRevelada(false); setPontos(null); setPacote(null);
    cartaDetalhe(srvId)
      .then(async (carta) => {
        // Regras novas (05/nov/2026): não há mais coleção nem "repetida" — a carta é a do dia.
        if (vivo) setSrv({ carta, antes: 0 });
      })
      .catch(() => {
        if (!vivo) return;
        Alert.alert('Carta', 'Não foi possível abrir a carta agora. Tente de novo em instantes.');
        fechar();
      });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srvId]);
  // ── Modo onboarding (`?modo=onboarding`, 03/nov/2026): a chegada da carta logo depois
  // do loading do scan. Tela preta → "Espera, <nome>..." → "Encontramos algo na sua
  // análise." → luz rosa → a carta voa girando e pousa com impacto → raspar revela a
  // IDADE DA PELE do relatório → "Continuar" leva ao resultado do scan. Conteúdo local
  // (nada no servidor); mesma carta da rodada 84 (verso e camada de raspar), frente na
  // identidade da rara. Sem fechar, sem voltar; toca uma vez (`cartaChegadaVista`).
  const obMode = params.modo === 'onboarding';
  useObPassoVisto(OB_STEPS.cartas, 'Cartas', obMode);
  const nome = useObName();
  // A carta vem da ANÁLISE RÁPIDA (antes da compra) e dos problemas que ela marcou
  // (`lib/cartaOnboarding.ts`, 06/nov/2026). A da idade está fora do onboarding por enquanto.
  const analiseRapida = useAppStore((st) => st.analiseRapida);
  const concernsOb = useAppStore((st) => st.onboarding.concerns);
  const birthdayOb = useAppStore((st) => st.onboarding.birthday);
  const cartaOb = cartaDoOnboarding(analiseRapida, { concerns: concernsOb, birthday: birthdayOb });
  const idadePele = cartaOb?.tipo === 'idade' ? cartaOb.idadePele : null;
  const idadeReal = Number(birthdayOb) || null;
  const [numOb, setNumOb] = useState<number | null>(null);
  const chipOb = idadePele == null || idadeReal == null ? 'Análise da sua foto'
    : idadePele < idadeReal ? `${idadeReal - idadePele} ${idadeReal - idadePele === 1 ? 'ano' : 'anos'} mais jovem que você`
    : idadePele > idadeReal ? `${idadePele - idadeReal} ${idadePele - idadeReal === 1 ? 'ano' : 'anos'} acima da sua idade`
    : 'A mesma idade que você';
  // A carta de alerta ("Você tem 40% mais [problema] do que a usuária padrão."): a escolha
  // do problema e o número moram em `lib/cartaOnboarding.ts` (o "Seu caminho" e a tela final
  // leem os mesmos dados).
  const cartaAlerta = cartaOb?.tipo === 'comparacao' ? cartaOb : null;
  const ALERTA_PCT = cartaAlerta ? cartaAlerta.numero : 0;
  const temAlerta = cartaAlerta != null;
  // As DUAS cartas (06/nov/2026): Carta 1 = o ponto forte (notícia boa; null → pulada), depois
  // a transição de alerta e a Carta 2 (a de alerta acima). `etapa` troca a carta na tela; a
  // `etapaCartaOb` do store guarda até onde ela foi, para retomar sem repetir carta raspada.
  const pontoForte = obMode ? pontoForteDoOnboarding(analiseRapida, { concerns: concernsOb }) : null;
  const pontoForteRef = useRef(pontoForte);
  pontoForteRef.current = pontoForte;
  type EtapaOb = 'boa' | 'transicao' | 'alerta';
  const [etapa, setEtapa] = useState<EtapaOb>('boa');
  const etapaRef = useRef<EtapaOb>('boa');
  const irEtapa = (e: EtapaOb) => { etapaRef.current = e; setEtapa(e); };
  // QUAL FRENTE aparece é separado da etapa: a frente só vira a de alerta com a Carta 1 já
  // invisível (no meio da transição), e a Carta 2 só começa a entrar com a frente nova já
  // desenhada. Antes a troca seguia a etapa, e no "Continuar" a frente de alerta aparecia
  // por ~240 ms na Carta 1 que ainda estava sumindo (bug visto em 06/nov/2026).
  const [faceAlerta, setFaceAlertaJS] = useState(false);
  const faceAlertaRef = useRef(false);
  const setFaceAlerta = (v: boolean) => { faceAlertaRef.current = v; setFaceAlertaJS(v); };
  const naBoa = obMode && !faceAlerta && pontoForte != null;
  const naAlerta = obMode && faceAlerta;
  // Frente/verso/camada da rodada 84: as cartas do servidor e a do onboarding.
  const cartaNova = srvMode || obMode;
  const visOb: VisualCarta | null = !obMode ? null
    : naBoa ? { k: 'pontoForte', numero: numOb, problema: pontoForte!.nome }
    : cartaAlerta ? { k: 'alerta', numero: numOb, contar: !reduced, problema: cartaAlerta.nome, semNumero: cartaAlerta.semNumero, regiaoTexto: cartaAlerta.regiaoTexto }
    : { k: 'idade', numero: numOb, chip: chipOb, contar: !reduced };
  const pronto = useSharedValue(params.id ? 0 : 1);
  useEffect(() => { pronto.set(!srvMode || srv ? 1 : 0); }, [srvMode, srv, pronto]);
  const fam = srv?.carta.carta?.familia ?? null;
  const kindSrv: 'coll' | 'power' | 'conh' | null = !srv ? null : fam === 'poder' ? 'power' : fam === 'colecionavel' ? 'coll' : 'conh';
  const isPower = kindSrv === 'power';
  const isDup = false;
  // Rodada 84: o visual sai da família, subtipo, rara, origem e (no poder) do estado.
  // Regras novas: a Comum mostra os NIKS Points em destaque na própria carta (contando).
  const visualBase = srv ? visualDe(srv.carta, poderEst) : null;
  const visual: VisualCarta | null = visualBase?.k === 'colecionavel' ? { ...visualBase, pontos, contar: !reduced } : visualBase;
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
    ? (revelada && isPower ? 'Um poder saiu na sua carta' : campea ? 'Você foi a mais constante da semana'
      : srv?.carta.origem === 'missoes' ? 'Você completou as missões!' : 'Sua carta de hoje chegou')
    : c.headline;
  // Reflexo perolado: .5 na carta comum, .85 no poder (sHolo do design); antes de raspar, o de hoje.
  const holoK = !srvMode ? c.holo : !revelada ? 1 : isPower ? 0.85 / 0.55 : 0.5 / 0.55;

  // Frame do design (393 × 852, status bar 54) → tela.
  const ox = (W - 393) / 2;
  const oy = insets.top - 54;
  const ob = insets.bottom - 34; // home indicator do frame = 34
  // Onboarding: a carta fica com ~72% da largura da tela (escala K do palco inteiro, em
  // volta do centro), limitada ao espaço entre o título e o botão — no SE ela encolhe para
  // caber. Centro vertical = meio desse espaço.
  const obBtnBottom = Math.max(40 + ob, insets.bottom + 16);
  const obTopo = oy + 102 + 96;               // título em 2 linhas + "Raspe para revelar"
  const obBase = H - obBtnBottom - 56;        // topo do botão
  const K = obMode ? Math.min((0.72 * W) / CW, (obBase - obTopo - 28) / CH) : 1;
  const stageX = obMode ? (W - CW) / 2 : ox + CARD_LEFT;
  const stageY = obMode ? (obTopo + obBase) / 2 - CH / 2 : oy + CARD_TOP;
  const giro = obMode ? OB_GIRO : 540;
  const cores = obMode ? COLORS_OB : COLORS;
  // Ponto da carta (coordenadas 252 × 360) → tela, com a escala K em volta do centro.
  const telaX = (x: number) => { 'worklet'; return stageX + CW / 2 + (x - CW / 2) * K; };
  const telaY = (y: number) => { 'worklet'; return stageY + CH / 2 + (y - CH / 2) * K; };
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
  // Onboarding: a carta nasce invisível (a sequência só começa quando o modal aparece).
  const lift = useSharedValue(0), tx = useSharedValue(0), ty = useSharedValue(0), o = useSharedValue(obMode ? 0 : 1);
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
  const auraO = useSharedValue(0), auraBreath = useSharedValue(0);
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

  // Modo onboarding: os dois textos da abertura, a luz rosa, a flutuação e a mãozinha.
  const txt1 = useSharedValue(0), txt2 = useSharedValue(0), luz = useSharedValue(0);
  const bob = useSharedValue(0), maoO = useSharedValue(0), maoX = useSharedValue(0);
  const [handOb, setHandOb] = useState(false);
  // As duas cartas: `escuro` = o rosa-escuro da transição (fica na Carta 2); `txt3`/`txt4` = os
  // dois textos da transição; `tremor` = o deslocamento X do tremor da Carta 2; `borda`/`pulso`
  // = a borda rosa-escuro pulsando; `festa` = 0 tira as partículas (worklets leem aqui).
  const escuro = useSharedValue(0), txt3 = useSharedValue(0), txt4 = useSharedValue(0);
  const tremor = useSharedValue(0), borda = useSharedValue(0), pulso = useSharedValue(0), festa = useSharedValue(1);
  // Na revelação o título vira "Sua pele aparenta N anos" (a idade do resultado).
  const [tituloIdade, setTituloIdade] = useState(false);

  const rm = reduced;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const numRaf = useRef(0);

  const foilPic = useMemo(() => (cartaNova ? drawVerso84(logoImg ?? null, naAlerta) : drawFoil(tipo === 'idade', logoImg ?? null)), [cartaNova, tipo, logoImg, naAlerta]);

  const setPhase = useCallback((p: Phase) => setPhaseJS(p), []);

  // ── Carta 2 (alerta): entra no centro, sem voo nem giro ────────────────────
  // Animação de ALERTA, não de prêmio: tranco curto, tremor leve e a borda rosa-escuro
  // pulsando; sem raios, brilho, flutuação nem partículas. `imediato`: o rosa-escuro já pronto
  // (retomada, ou voltou ao app no meio da transição).
  const bootAlerta = useCallback((imediato = false) => {
    clearTimers();
    irEtapa('alerta');
    useAppStore.getState().setEtapaCartaOb('alerta');
    festa.set(0); parts.set([]);
    saindoOb.current = false;
    setPhaseJS('enter'); setProgress(0); setHint(false); setBtnShown(false); setHandOb(false); setNumOb(null); setTituloIdade(false); setRevelada(false);
    scratch.set(Skia.Path.Make()); last.set(null);
    grid.set(new Array(COLS * ROWS).fill(0)); cleared.set(0); moves.set(0); down.set(false);
    foilO.set(1); foilS.set(1); foilBlur.set(0); flash.set(0); sheen.set(0);
    lift.set(0); tx.set(0); ty.set(0); ph.set(PH_ENTER);
    fx0.set(0); fy0.set(0); fs0.set(1); fp.set(1); fs.set(1); fr.set(1);
    y.set(0); ry.set(0); rz.set(0); glow.set(0); raysO.set(0); bob.set(0); luz.set(0);
    txt1.set(0); txt2.set(0); txt3.set(0); txt4.set(0); maoO.set(0); head.set(0);
    tremor.set(0); pulso.set(0); borda.set(0);
    if (imediato) { veil.set(1); escuro.set(1); }
    o.set(0);
    // A frente de alerta precisa estar desenhada antes de a carta aparecer (retomada direto na
    // Carta 2): troca agora e começa a entrada no quadro seguinte ao redesenho.
    const trocar = !faceAlertaRef.current;
    if (trocar) setFaceAlerta(true);
    const entrar = () => entradaAlerta();
    if (trocar) later(80, entrar); else entrar();
  }, [rm]);

  const entradaAlerta = () => {
    if (rm) {
      // Reduzir movimento: só fades — sem tranco, tremor nem pulso (a borda fica parada).
      s.set(1); o.set(0); pulso.set(1);
      o.set(withTiming(1, { duration: 300, reduceMotion: ReduceMotion.Never }));
      borda.set(withTiming(1, { duration: 300, reduceMotion: ReduceMotion.Never }));
      later(300, () => { haptics.impact(); head.set(withTiming(1, { duration: 300, reduceMotion: ReduceMotion.Never })); ph.set(PH_IDLE); setPhaseJS('idle'); });
      return;
    }
    s.set(0.92); o.set(0);
    o.set(withTiming(1, { duration: TRANCO_MS, easing: EO, reduceMotion: ReduceMotion.Never }));
    s.set(withSequence(
      withTiming(1.04, { duration: TRANCO_MS, easing: EO, reduceMotion: ReduceMotion.Never }),
      withSpring(1, spr(1, 0.3, 0, 0.001)),
    ));
    later(TRANCO_MS, () => haptics.impact());   // no quadro do tranco
    tremor.set(withDelay(TRANCO_MS, withSequence(...TREMOR.map(([v, d]) =>
      withTiming(v, { duration: d, easing: EIO, reduceMotion: ReduceMotion.Never })))));
    borda.set(withDelay(TRANCO_MS, withTiming(1, { duration: 300, easing: EO, reduceMotion: ReduceMotion.Never })));
    pulso.set(withDelay(TRANCO_MS + 300, withRepeat(withTiming(1, { duration: 600, easing: EIO, reduceMotion: ReduceMotion.Never }), -1, true)));
    later(TRANCO_MS + 200, () => head.set(withSpring(1, spr(1, 0.38, 0, 0.002))));
    later(TRANCO_MS + 450, () => { ph.set(PH_IDLE); setPhaseJS('idle'); });
  };

  // ── Transição de alerta (sem botão, ~2,5 s) ───────────────────────────────
  // A Carta 1 sai; o brilho festivo (luz, raios, flutuação, partículas) some; o fundo vira o
  // rosa-escuro, levemente mais escuro; os dois textos com o batimento (dois toques). `semCarta1`:
  // a Carta 1 foi pulada (não houve ponto forte).
  const startTransicao = useCallback((semCarta1 = false) => {
    clearTimers();
    irEtapa('transicao');
    if (!semCarta1) useAppStore.getState().setEtapaCartaOb('boaRaspada');
    festa.set(0); parts.set([]);
    setBtnShown(false); setHandOb(false); maoO.set(0);
    head.set(withTiming(0, { duration: 200, easing: EO, reduceMotion: ReduceMotion.Never }));
    o.set(withTiming(0, { duration: TRANS.sai, easing: EO, reduceMotion: ReduceMotion.Never }));
    if (!rm) s.set(withTiming(0.96, { duration: TRANS.sai, easing: EO }));
    glow.set(withTiming(0, { duration: 300, easing: EO, reduceMotion: ReduceMotion.Never }));
    raysO.set(withTiming(0, { duration: 300, easing: EO, reduceMotion: ReduceMotion.Never }));
    bob.set(withTiming(0, { duration: 220, easing: EO, reduceMotion: ReduceMotion.Never }));
    escuro.set(withTiming(1, { duration: TRANS.escurece, easing: EO, reduceMotion: ReduceMotion.Never }));
    later(TRANS.t1, () => {
      haptics.tap();                                  // batimento: leve…
      txt3.set(withTiming(1, { duration: 260, easing: EO, reduceMotion: ReduceMotion.Never }));
    });
    later(TRANS.t1 + 140, () => haptics.action());    // …e médio
    later(TRANS.t1Fora, () => txt3.set(withTiming(0, { duration: 200, easing: EO, reduceMotion: ReduceMotion.Never })));
    later(TRANS.t2, () => txt4.set(withTiming(1, { duration: 260, easing: EO, reduceMotion: ReduceMotion.Never })));
    later(TRANS.t2Fora, () => txt4.set(withTiming(0, { duration: 200, easing: EO, reduceMotion: ReduceMotion.Never })));
    later(TRANS.sai + 60, () => setFaceAlerta(true));   // a Carta 1 já sumiu: troca a frente
    later(TRANS.fim, () => bootAlerta());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rm, bootAlerta]);

  // Saiu do app no meio da transição: ao voltar, a Carta 2 já pronta (não refaz a transição).
  useEffect(() => {
    if (!obMode) return;
    let saiu = false;
    const sub = AppState.addEventListener('change', (estadoApp) => {
      if (estadoApp === 'background') saiu = true;
      else if (estadoApp === 'active' && saiu) {
        saiu = false;
        if (etapaRef.current === 'transicao') bootAlerta(true);
      }
    });
    return () => sub.remove();
  }, [obMode, bootAlerta]);

  // ── 0. Chegada no onboarding (abertura própria, uma vez) ───────────────────
  // Tempos (ms desde a tela abrir, que é o resultado pronto): preto 0–400; "Espera,
  // <nome>..." 450–1450 com vibração leve; "Encontramos algo na sua análise." 1450–2650;
  // o texto some; luz rosa 2900; a carta voa 3250–4350 (giro rápido que freia, 1,5 volta
  // do verso para a frente, nascendo a 6% do tamanho); no pouso passa a 108% e volta, com
  // brilho, raios, partículas e vibração forte; os títulos entram e a carta flutua.
  const bootOb = useCallback(() => {
    const st = useAppStore.getState();
    st.setCartaChegadaVista(true);
    // Retomada (a tela foi recriada): nunca repete uma carta já raspada.
    if (st.etapaCartaOb === 'alertaRaspada') { router.back(); return; }   // o loading abre a "Calma"
    if (st.etapaCartaOb === 'boaRaspada' || st.etapaCartaOb === 'alerta') { veil.set(1); bootAlerta(true); return; }
    irEtapa('boa'); setFaceAlerta(false); festa.set(1);
    escuro.set(0); txt3.set(0); txt4.set(0); tremor.set(0); borda.set(0); pulso.set(0);
    setPhaseJS('enter'); setProgress(0); setHint(false); setRecs(false); setBtnShown(false); setHandOb(false); setNumOb(null); setTituloIdade(false); setRevelada(false);
    scratch.set(Skia.Path.Make()); last.set(null);
    grid.set(new Array(COLS * ROWS).fill(0)); cleared.set(0); moves.set(0); down.set(false);
    foilO.set(1); foilS.set(1); foilBlur.set(0); flash.set(0); sheen.set(0);
    lift.set(0); tx.set(0); ty.set(0); sheet.set(110); sheetO.set(1);
    ph.set(PH_ENTER);
    y.set(0); s.set(1); ry.set(0); rz.set(0); head.set(0); glow.set(0); raysO.set(0);
    txt1.set(0); txt2.set(0); luz.set(0); bob.set(0); maoO.set(0); maoX.set(0);
    veil.set(withTiming(1, { duration: rm ? 300 : 500, easing: EO, reduceMotion: ReduceMotion.Never }));
    // Sem ponto forte possível: pula a Carta 1 e vai direto à transição de alerta.
    if (!pontoForteRef.current) { o.set(0); later(rm ? 300 : 500, () => startTransicao(true)); return; }
    st.setEtapaCartaOb('boa');
    later(450, () => { haptics.tap(); txt1.set(withTiming(1, { duration: 260, easing: EO, reduceMotion: ReduceMotion.Never })); });
    later(1450, () => {
      txt1.set(withTiming(0, { duration: 200, easing: EO, reduceMotion: ReduceMotion.Never }));
      txt2.set(withDelay(150, withTiming(1, { duration: 260, easing: EO, reduceMotion: ReduceMotion.Never })));
    });
    later(2650, () => txt2.set(withTiming(0, { duration: 240, easing: EO, reduceMotion: ReduceMotion.Never })));
    if (rm) {
      // Reduzir movimento: a carta só aparece (fade), sem luz, giro, partículas ou flutuação.
      fp.set(1); fs.set(1); fr.set(1); o.set(0);
      later(2950, () => { o.set(withTiming(1, { duration: 300, reduceMotion: ReduceMotion.Never })); glow.set(withTiming(0.4, { duration: 300, reduceMotion: ReduceMotion.Never })); });
      later(3300, () => { haptics.impact(); head.set(withTiming(1, { duration: 300, reduceMotion: ReduceMotion.Never })); ph.set(PH_IDLE); setPhaseJS('idle'); });
      return;
    }
    fx0.set(0); fy0.set(0); fs0.set(START_SCALE);
    fp.set(0); fs.set(0); fr.set(0); o.set(0);
    // A luz rosa nasce pequena no centro; a carta sai de dentro dela e a luz se apaga.
    later(2900, () => luz.set(withTiming(1, { duration: 420, easing: EO, reduceMotion: ReduceMotion.Never })));
    later(OB_FLY_AT, () => {
      o.set(1);
      fp.set(withTiming(1, { duration: OB_FLY_MS, easing: EASE_PATH, reduceMotion: ReduceMotion.Never }));
      fs.set(withTiming(1, { duration: OB_FLY_MS, easing: EASE_PATH, reduceMotion: ReduceMotion.Never }));
      fr.set(withTiming(1, { duration: OB_FLY_MS, easing: OB_EASE_SPIN, reduceMotion: ReduceMotion.Never }));
      luz.set(withTiming(0, { duration: 600, easing: EO, reduceMotion: ReduceMotion.Never }));
    });
    // Impacto: passa um pouco do tamanho e volta; brilho, raios, partículas e vibração forte.
    later(OB_FLY_AT + OB_FLY_MS, () => {
      haptics.impact();
      s.set(withSequence(withTiming(1.08, { duration: 130, easing: EO, reduceMotion: ReduceMotion.Never }), withSpring(1, spr(0.6, 0.38, 0, 0.001))));
      glow.set(withSequence(withTiming(1, { duration: 200, easing: EO, reduceMotion: ReduceMotion.Never }), withTiming(0.55, { duration: 900, easing: EO, reduceMotion: ReduceMotion.Never })));
      raysO.set(withTiming(0.22, { duration: 700, easing: EO, reduceMotion: ReduceMotion.Never }));
      raysRot.set(0);
      raysRot.set(withRepeat(withTiming(360, { duration: 30000, easing: Easing.linear, reduceMotion: ReduceMotion.Never }), -1, false));
      flashPeak.set(0.7); burstN.set(64);
      scheduleOnUI(burst);
      sheen.set(0); sheen.set(withTiming(1, { duration: 820, easing: EIO, reduceMotion: ReduceMotion.Never }));
    });
    later(OB_FLY_AT + OB_FLY_MS + 300, () => head.set(withSpring(1, spr(1, 0.38, 0, 0.002))));
    later(OB_FLY_AT + OB_FLY_MS + 500, () => {
      ph.set(PH_IDLE); setPhaseJS('idle');
      bob.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.bezier(0.42, 0, 0.58, 1), reduceMotion: ReduceMotion.Never }), -1, true));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rm, bootAlerta, startTransicao]);

  // Mãozinha: 2 s parada no idle sem toque → mostra o gesto de raspar (vai e vem).
  useEffect(() => {
    if (!obMode || phase !== 'idle') return;
    const t = setTimeout(() => {
      setHandOb(true);
      maoO.set(withTiming(1, { duration: 260, easing: EO, reduceMotion: ReduceMotion.Never }));
      if (!rm) maoX.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.bezier(0.42, 0, 0.58, 1) }), -1, true));
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obMode, phase, rm]);

  // Sem voltar do Android durante a carta do onboarding.
  useEffect(() => {
    if (!obMode) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [obMode]);

  // ── 1. Entrada ────────────────────────────────────────────────────────────
  const boot = useCallback(() => {
    clearTimers();
    cancelAnimationFrame(numRaf.current);
    if (obMode) { bootOb(); return; }
    const cfg = CARTAS[tipo];
    setPhaseJS('enter'); setProgress(0); setHint(false); setRecs(false); setBtnShown(false); setPacote(null);
    setNum(cfg.to ?? 0); setSecs(6720);
    scratch.set(Skia.Path.Make()); last.set(null);
    grid.set(new Array(COLS * ROWS).fill(0)); cleared.set(0); moves.set(0); down.set(false);
    foilO.set(1); foilS.set(1); foilBlur.set(0); flash.set(0); sheen.set(0);
    meter.set(0.667); oldY.set(0); newY.set(-54); prefixO.set(0); numScale.set(1);
    lift.set(0); tx.set(0); ty.set(0); sheet.set(110); sheetO.set(1);
    auraO.set(0); auraBreath.set(0);
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
  }, [tipo, rm, run, obMode, bootOb]);

  // Onboarding: a sequência começa quando o modal APARECE (`transitionStart`), não na
  // montagem — a montagem vem de 0,2 a 1,3 s antes (medido no simulador), e a tela surgia
  // já no preto, sem o escurecimento nem o "Espera, <nome>...". Reserva: 800 ms.
  const navigation = useNavigation();
  const [visivel, setVisivel] = useState(!obMode);
  useEffect(() => {
    if (!obMode) return;
    const t = setTimeout(() => setVisivel(true), 800);
    const sai = navigation.addListener('transitionStart' as never, () => { clearTimeout(t); setVisivel(true); });
    return () => { clearTimeout(t); sai(); };
  }, [navigation, obMode]);

  useEffect(() => {
    if (!visivel) return;
    boot();
    return () => { clearTimers(); cancelAnimationFrame(numRaf.current); };
  }, [boot, run, visivel]);

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
      const f = flight(p, fs.get(), fr.get(), fx0.get(), fy0.get(), fs0.get(), giro);
      const cx = stageX + CW / 2 + f.x * K, cy = stageY + CH / 2 + f.y * K;
      const r = (CW * f.s * K) / 2;
      list = list.slice();
      for (let i = 0; i < 2; i++) {
        const q = mkPart(cx + (Math.random() - 0.5) * r * 1.4, cy + (Math.random() - 0.5) * r * 1.8, (Math.random() - 0.5) * 60, -20 - Math.random() * 60, cores);
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
      const q = mkPart(telaX(x), telaY(yy), (dx / d) * sp, (dy / d) * sp - 120, cores);
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
      reveladaEm.current = Date.now();
      if (visual?.k === 'convidada') trackFora('convidada_carta_especial', { tipo: visual.tipo, numero_checkin: (srv?.carta.conteudo as any)?.numero ?? null });
      // O servidor marca a carta como raspada e, se for Poder, já aplica (79k: "Ativado agora").
      const id = srvId!;
      rasparCarta(id)
        .then((r) => {
          proximaCarta.current = estadoCartas().catch(() => null);
          // Regras novas: a carta de outro dia venceu às 04:00 — fecha (o card da home já mostra).
          if (r.vencida) { fechar(); return; }
          if (r.pontos) {
            setPontos(r.pontos.ganhos);
            if (r.pontos.nivel > r.pontos.nivel_antes) subiuNivel.current = true;
            // As mini cartas saem do selo depois que ele aparece (~600 ms da revelação).
            const p = r.pontos;
            if (p.ganhos > 0 && tabela.current?.niveis?.length && tabela.current.icone) {
              later(Math.max(0, 600 - (Date.now() - reveladaEm.current)), () => {
                head.set(withTiming(0, { duration: 180, easing: EO }));
                // Os pontos sem carta do mesmo fluxo (check-in…) sobem junto: a barra sobe uma vez só.
                setPacote({ de: inicioDoPacote(p.total_antes), para: p.total });
              });
            }
          }
          if (!r.poder) return;
          const hoje = dateKey(sessionDate(new Date()));
          setPoderEst(estadoPoder({ id: '', tipo: r.poder.tipo, inicio: '', fim: r.poder.fim, consumido_em: null, dados: r.poder.dados }, r.poder.tipo, hoje));
        })
        .catch(() => {});
      // Poder: a aura rosa respira atrás da carta.
      if (isPower && !rm) {
        auraO.set(withTiming(1, { duration: 460, easing: EO }));
        auraBreath.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.bezier(0.42, 0, 0.58, 1) }), -1, true));
      } else if (isPower) auraO.set(withTiming(1, { duration: 220 }));
    }
    // Carta 2 do onboarding (alerta): a camada some sem flash, explosão nem pulo.
    const alertaOb = obMode && etapaRef.current !== 'boa';
    if (obMode) useAppStore.getState().setEtapaCartaOb(alertaOb ? 'alertaRaspada' : 'boaRaspada');
    if (alertaOb) {
      borda.set(withTiming(0, { duration: 300, easing: EO, reduceMotion: ReduceMotion.Never }));
      pulso.set(withTiming(0, { duration: 300, reduceMotion: ReduceMotion.Never }));
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
      if (!alertaOb) flash.set(withTiming(1, { duration: 760, easing: EO }));
      tx.set(withSpring(0, spr(0.7, 0.5))); ty.set(withSpring(0, spr(0.7, 0.5)));
      s.set(withSpring(1, alertaOb ? spr(1, 0.4, 0, 0.001) : spr(0.55, 0.42, 0.9, 0.001)));
      if (!alertaOb) scheduleOnUI(burst);
    }
    if (obMode) {
      // O número (idade da pele ou % da acne) sobe de 0 até o valor em CONTA_MS e só então o
      // "Continuar" aparece. Quem conta é o `Contador` da carta: aqui o valor final entra uma
      // vez só (antes esta tela inteira redesenhava a cada número, e a contagem travava).
      setRevelada(true); setHandOb(false); maoO.set(withTiming(0, { duration: 150 }));
      const alvo = !alertaOb && pontoForteRef.current ? pontoForteRef.current.numero : cartaAlerta ? ALERTA_PCT : idadePele ?? 0;
      if (rm) { setNumOb(alvo); setTituloIdade(true); later(400, () => setBtnShown(true)); return; }
      // O título troca junto com o número: some em 140 ms, troca e volta em 260 ms.
      head.set(withTiming(0, { duration: 140, easing: EO }));
      later(160, () => { setTituloIdade(true); setNumOb(alvo); head.set(withTiming(1, { duration: 260, easing: EO })); });
      later(160 + CONTA_MS + 100, () => setBtnShown(true));
      return;
    }
    if (srvMode) return; // sem número nem recomendações: a carta revelada fica na tela
    later(rm ? 60 : 160, runNumber);
    later(rm ? 700 : 1550, showRecs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rm, runNumber, showRecs, srvMode, srvId, isPower, isDup, obMode, idadePele, temAlerta]);
  // ── 3–5. Toque, arrastar e raspar (gesto no UI thread) ────────────────────
  // Onboarding: sem a pílula "Raspe para ver" (o "Raspe para revelar" já está no título);
  // o primeiro toque some com a mãozinha e para a flutuação.
  const onReady = useCallback(() => {
    haptics.tap(); setPhaseJS('ready');
    if (obMode) {
      setHandOb(false); maoO.set(withTiming(0, { duration: 150 })); bob.set(withTiming(0, { duration: 220, easing: EO }));
      // Carta 2: a borda para de pulsar quando ela começa a raspar (fica acesa, parada).
      if (etapaRef.current === 'alerta') pulso.set(withTiming(0.5, { duration: 200, easing: EO }));
    }
    else setHint(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obMode]);
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
    if (!rm && festa.get()) {
      const list = parts.get().slice();
      const count = Math.min(4, 1 + Math.floor(d / 14));
      for (let i = 0; i < count; i++) {
        list.push(mkPart(telaX(x) + (Math.random() - 0.5) * 18, telaY(yy) + (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 160, -Math.random() * 170 - 30, cores));
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
        // Onboarding: o primeiro toque já raspa (o pedido é "Raspe para revelar").
        if (obMode) scratchAt(e.x, e.y);
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

  // Carta especial da convidada, já raspada: tocar leva ao paywall. É um gesto junto com o de
  // raspar porque o Pan começa no primeiro toque e cancelaria um botão comum por cima.
  const toqueCarta = Gesture.Tap()
    .enabled(srvMode && visual?.k === 'convidada' && revelada)
    .runOnJS(true)
    .onEnd((_e, ok) => {
      if (!ok) return;
      haptics.action();
      // O Superwall não abre por cima deste modal (e não dá erro): quem abre é o AvisoCadeado,
      // depois que a carta sair da tela.
      // Subiu de nível: a caminhada só abre depois de ela fechar o paywall.
      paywallAposCarta('carta', subiuNivel.current);
      subiuNivel.current = false;
      fechar();
    });
  const gestoCarta = Gesture.Simultaneous(gesture, toqueCarta);

  // ── Estilos animados ──────────────────────────────────────────────────────
  // ⚠️ Os valores animados são lidos DIRETO em cada useAnimatedStyle: o Reanimated só
  // refaz o estilo quando o próprio worklet lê os shared values — lidos dentro de uma
  // função auxiliar, a carta só era redesenhada quando a tela re-renderizava.
  // Qual face aparece: a frente quando está virada para a tela (cos do giro ≥ 0), o verso
  // no resto. Faz o papel do `backface-visibility: hidden` do design — no iOS, com a
  // perspectiva no transform, o backfaceVisibility escondia a frente de pé.
  const frontStyle = useAnimatedStyle(() => {
    const f = flight(fp.get(), fs.get(), fr.get(), fx0.get(), fy0.get(), fs0.get(), giro);
    const Y = ry.get() + ty.get() + f.ry, X = tx.get();
    const facing = Math.cos((Y * Math.PI) / 180) * Math.cos((X * Math.PI) / 180) >= 0;
    return {
      opacity: facing ? o.get() : 0,
      transform: cardT(f.x + tremor.get(), y.get() + lift.get() + f.y - 6 * bob.get(), s.get() * f.s, X, Y, rz.get() + f.rz, false) as any,
    };
  });
  const haloStyle = useAnimatedStyle(() => {
    const f = flight(fp.get(), fs.get(), fr.get(), fx0.get(), fy0.get(), fs0.get(), giro);
    return {
      opacity: o.get(),
      transform: cardT(f.x + tremor.get(), y.get() + lift.get() + f.y - 6 * bob.get(), s.get() * f.s, tx.get(), ry.get() + ty.get() + f.ry, rz.get() + f.rz, false) as any,
    };
  });
  // Borda rosa-escuro da Carta 2: acompanha a carta (inclusive o tremor) e pulsa 0,35 ↔ 0,9.
  const bordaStyle = useAnimatedStyle(() => {
    const f = flight(fp.get(), fs.get(), fr.get(), fx0.get(), fy0.get(), fs0.get(), giro);
    return {
      opacity: o.get() * borda.get() * (0.35 + 0.55 * pulso.get()),
      transform: cardT(f.x + tremor.get(), y.get() + lift.get() + f.y, s.get() * f.s, tx.get(), ry.get() + ty.get() + f.ry, rz.get() + f.rz, false) as any,
    };
  });
  const backStyle = useAnimatedStyle(() => {
    const f = flight(fp.get(), fs.get(), fr.get(), fx0.get(), fy0.get(), fs0.get(), giro);
    const Y = ry.get() + ty.get() + f.ry, X = tx.get();
    const facing = Math.cos((Y * Math.PI) / 180) * Math.cos((X * Math.PI) / 180) >= 0;
    return {
      opacity: facing ? 0 : o.get(),
      transform: cardT(f.x + tremor.get(), y.get() + lift.get() + f.y - 6 * bob.get(), s.get() * f.s, X, Y, rz.get() + f.rz, true) as any,
    };
  });
  // Brilho rosado atrás da carta pousada + raios girando devagar.
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.get(),
    transform: [{ scale: interpolate(glow.get(), [0, 1], [0.6, 1.08]) * K }],
  }));
  // Halo rosa na borda: só depois do pouso (é estático no centro, não acompanha o voo).
  const cardGlowStyle = useAnimatedStyle(() => ({ opacity: fp.get() > 0.98 ? glow.get() : 0 }));
  const raysStyle = useAnimatedStyle(() => ({ opacity: raysO.get(), transform: [{ rotate: `${raysRot.get()}deg` }] }));
  const { holo, glare } = useHolo(tx, ty, ry, holoK);
  const auraSt = useAnimatedStyle(() => ({
    opacity: auraO.get() * (0.8 + 0.2 * auraBreath.get()),
    transform: [{ scale: 0.97 + 0.06 * auraBreath.get() }],
  }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.get() }));
  // Abertura do onboarding: os dois textos sobem 8 pt ao entrar; a luz rosa nasce pequena.
  const txt1Style = useAnimatedStyle(() => ({ opacity: txt1.get(), transform: [{ translateY: (1 - txt1.get()) * 8 }] }));
  const txt2Style = useAnimatedStyle(() => ({ opacity: txt2.get(), transform: [{ translateY: (1 - txt2.get()) * 8 }] }));
  const txt3Style = useAnimatedStyle(() => ({ opacity: txt3.get(), transform: [{ translateY: rm ? 0 : (1 - txt3.get()) * 8 }] }));
  const txt4Style = useAnimatedStyle(() => ({ opacity: txt4.get(), transform: [{ translateY: rm ? 0 : (1 - txt4.get()) * 8 }] }));
  const escuroStyle = useAnimatedStyle(() => ({ opacity: escuro.get() }));
  const luzStyle = useAnimatedStyle(() => ({ opacity: luz.get(), transform: [{ scale: 0.25 + 0.45 * luz.get() }] }));
  // Mãozinha: vai e vem 56 pt em cima da carta, inclinando junto (o gesto de raspar).
  const maoStyle = useAnimatedStyle(() => ({
    opacity: maoO.get(),
    transform: [{ translateX: (maoX.get() - 0.5) * 56 }, { rotate: `${(maoX.get() - 0.5) * 16}deg` }],
  }));
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
  const saindoOb = useRef(false);
  // Consulta feita logo depois de raspar: o "Continuar" não espera a rede.
  const proximaCarta = useRef<Promise<Awaited<ReturnType<typeof estadoCartas>> | null> | null>(null);
  const saidaOb = useSharedValue(0);
  const saidaObStyle = useAnimatedStyle(() => ({ opacity: saidaOb.get() }));
  // A carta (modal da raiz, sem animação) só FECHA: o loading que está por baixo já mostra o
  // mesmo rosa e, ao ganhar foco, troca a si mesmo pela "Calma, <nome>." DENTRO da pilha do
  // scan — onde vale o `animation: 'none'`. (Um `replace` daqui saía deslizando: a troca
  // acontecia na pilha da raiz, com o deslize padrão.)
  const irParaSolucao = () => router.back();
  const onContinue = () => {
    if (!unlocked) return;
    haptics.action();
    if (obMode && etapaRef.current === 'boa') { startTransicao(); return; }   // Carta 1 → transição
    if (obMode) {
      // O rosa cobre o conteúdo, a carta fecha e o loading por baixo abre a "Calma, <nome>."
      // (`(scan)/solucao`), que segue sozinha para o "Seu caminho".
      if (saindoOb.current) return;
      saindoOb.current = true;
      saidaOb.set(withTiming(1, { duration: 300, easing: EO }, (ok) => {
        'worklet';
        if (ok) scheduleOnRN(irParaSolucao);
      }));
      return;
    }
    if (srvMode) {
      // Próxima carta a raspar (Carta extra, marco); sem mais nenhuma, volta — ou, se ela
      // subiu de nível, vai para a "Sua caminhada", que anima os pontos e celebra (68d/68e).
      const atual = srvId;
      const consulta = proximaCarta.current ?? estadoCartas();
      proximaCarta.current = null;
      const sair = () => {
        fechar();
        if (subiuNivel.current) { subiuNivel.current = false; router.push('/(app)/caminhada?de=home' as any); }
      };
      consulta
        .then((e) => {
          if (!e) { sair(); return; }
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
      <StatusBar style={obMode ? 'light' : 'dark'} />
      {/* Fundo = o próprio app (a tela é um modal transparente por cima dele), desfocado
          enquanto a carta voa: camada de desfoque estática, só a opacidade anima.
          Onboarding: o loading branco passa direto para o rosa do app (#FF5EA8, mais claro no
          centro e mais forte nas bordas), sem passar pelo preto. */}
      {obMode ? (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, styles.fundoOb, veilStyle]} pointerEvents="none" />
          {/* Transição de alerta e Carta 2: o rosa mais escuro e profundo por cima (só a opacidade anima). */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.fundoAlerta, escuroStyle]} pointerEvents="none" />
        </>
      ) : (
        <Animated.View style={[StyleSheet.absoluteFill, veilStyle]} pointerEvents="none">
          <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(252,228,238,0.55)' }]} />
        </Animated.View>
      )}

      {/* Abertura do onboarding: os dois textos no centro e a luz rosa de onde a carta sai */}
      {obMode && (
        <>
          <Animated.Text pointerEvents="none" style={[styles.obText, { top: H / 2 - 40, left: 32, right: 32 }, txt1Style]}>
            {nome ? `Espera, ${nome}...` : 'Espera...'}
          </Animated.Text>
          <Animated.Text pointerEvents="none" style={[styles.obText, { top: H / 2 - 40, left: 32, right: 32 }, txt2Style]}>
            Encontramos algo bom na sua análise.
          </Animated.Text>
          <Animated.Text pointerEvents="none" style={[styles.obText, { top: H / 2 - 48, left: 32, right: 32 }, txt3Style]}>
            {nome ? `Mas nem tudo são boas notícias, ${nome}.` : 'Mas nem tudo são boas notícias.'}
          </Animated.Text>
          <Animated.Text pointerEvents="none" style={[styles.obText, { top: H / 2 - 48, left: 32, right: 32 }, txt4Style]}>
            Encontramos algo que precisa da sua atenção.
          </Animated.Text>
          <Animated.View pointerEvents="none" style={[styles.luz, { left: stageX + CW / 2 - LUZ / 2, top: stageY + CH / 2 - LUZ / 2 }, luzStyle]} />
        </>
      )}

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
      <Animated.View pointerEvents="none" style={[styles.glow, obMode && styles.glowOb, { left: stageX + CW / 2 - GLOW / 2, top: stageY + CH / 2 - GLOW / 2 }, glowStyle]} />

      {/* Fechar (o onboarding não tem: sem voltar no meio da sequência) */}
      {!obMode && <Pressable
        onPress={() => { haptics.tap(); fechar(); }}
        style={[styles.close, { top: oy + 58, right: ox + 16 }]}
        accessibilityLabel="Fechar"
        hitSlop={6}
      >
        <Icon d={['M18 6 6 18', 'm6 6 12 12']} size={18} color={INK} sw={2} />
      </Pressable>}

      {/* 2. Headline (onboarding: "<nome>, você precisa ver isso." + "Raspe para revelar", em branco) */}
      <Animated.View style={[styles.head, { top: oy + 102, left: ox + 24, right: ox + 24 }, headStyle]} pointerEvents="none">
        {obMode ? (
          <>
            <Text style={[styles.headline, { color: '#FFFFFF', marginTop: 0 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
              {tituloIdade && naBoa ? 'O ponto forte da sua pele'
                : tituloIdade && cartaAlerta ? `Seu maior desafio: ${cartaAlerta.nome}`
                : tituloIdade && idadePele != null ? `Sua pele aparenta ${idadePele} anos`
                : nome ? `${nome}, você precisa ver isso.` : 'Você precisa ver isso.'}
            </Text>
            <Text style={[styles.obSub, { opacity: phase === 'revealed' ? 0 : 1, transitionProperty: 'opacity', transitionDuration: 220 } as any]}>
              Raspe para revelar
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.headLabel}>{headLabel}</Text>
            <Text style={styles.headline} lineBreakStrategyIOS="standard">{headLine}</Text>
          </>
        )}
        {!srvMode && c.timer && (
          <View style={styles.timer}>
            <Icon d={['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z', 'M12 6v6l4 2']} size={15} color={PINK} sw={2} />
            <Text style={styles.timerText}>some em {hh}h {mm}min</Text>
            <View style={styles.drainTrack}><Animated.View style={[styles.drainFill, drainStyle]} /></View>
          </View>
        )}
      </Animated.View>

      {/* A carta */}
      <GestureDetector gesture={gestoCarta}>
        <View style={[styles.stage, { left: stageX, top: stageY }, K !== 1 && { transform: [{ scale: K }] }]}>
          <Animated.View pointerEvents="none" style={[styles.cardGlow, obMode && styles.cardGlowOb, cardGlowStyle]} />
          {!srvMode && tipo === 'idade' && (
            <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />
          )}
          {isPower && (
            <Animated.View pointerEvents="none" style={[styles.auraWrap, haloStyle]}>
              <Animated.View style={[styles.aura, auraSt]} />
            </Animated.View>
          )}
          {/* Verso (aparece durante o giro da entrada). Servidor e onboarding: o verso da rodada 84a. */}
          {cartaNova ? (
            <Animated.View pointerEvents="none" style={[styles.faceSrv, backStyle]}>
              <Carta v={VERSO} w={CW} h={CH} />
            </Animated.View>
          ) : (
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
          )}

          {/* Frente. Servidor: a carta da rodada 84 (recortada nos cantos para a camada de
              raspar; a sombra vai na própria face e as faíscas de fora numa camada à parte). */}
          <Animated.View
            pointerEvents="none"
            style={[cartaNova ? [styles.faceSrv, styles.faceSrvClip, { boxShadow: obMode ? (naAlerta ? SOMBRA_ALERTA : SOMBRA_OB) : visual ? sombraCarta(visual) : undefined }] : [styles.face, styles.front, isPower && styles.frontPower], frontStyle]}
          >
            {!cartaNova && <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(160deg, #FFFFFF 0%, #FFF7FB 58%, #FCEEF6 100%)' }]} />}
            {obMode ? (
              visOb ? <Carta v={visOb} w={CW} h={CH} semSombra faiscasFora={false} parado={naAlerta} /> : null
            ) : srvMode ? (
              visual ? <Carta v={visual} w={CW} h={CH} semSombra faiscasFora={false} selo={pontos != null && visual.k !== 'colecionavel' ? <SeloPontos valor={pontos} rm={rm} /> : undefined} /> : null
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
            {/* Reflexo e brilho do 67a só nas cartas de exemplo: as da rodada 84 têm o próprio. */}
            {!cartaNova && <Animated.View style={[styles.holo, holo]} />}
            {!cartaNova && <Animated.View style={[styles.glare, glare]} />}
          </Animated.View>

          {srvMode && visual?.k === 'rara' && revelada && (
            <Animated.View pointerEvents="none" style={[styles.faceSrv, frontStyle]}>
              <Carta v={visual} w={CW} h={CH} apenasFaiscas />
            </Animated.View>
          )}
          {/* Carta 2: a borda rosa-escuro pulsando, POR CIMA da face (por baixo ela some). */}
          {obMode && naAlerta && (
            <Animated.View pointerEvents="none" style={[styles.faceSrv, styles.bordaAlerta, bordaStyle]} />
          )}
          {obMode && visOb && revelada && !naAlerta && (
            <Animated.View pointerEvents="none" style={[styles.faceSrv, frontStyle]}>
              <Carta v={visOb} w={CW} h={CH} apenasFaiscas />
            </Animated.View>
          )}

          {/* Mãozinha do onboarding: 2 s sem toque, mostra o gesto de raspar */}
          {/* Só com a carta parada esperando o toque: o aviso de 2 s podia disparar junto com a
              revelação e a mãozinha ficava na tela (inclusive na transição). */}
          {obMode && handOb && phase === 'idle' && (
            <Animated.View pointerEvents="none" style={[styles.mao, maoStyle]}>
              <Icon d={HAND} size={26} color={PINK} sw={1.9} />
            </Animated.View>
          )}

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
          opacity: phase === 'idle' && !obMode ? 1 : 0,
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
      <Pressable onPress={onContinue} disabled={!unlocked || !btnShown} style={{ position: 'absolute', left: ox + 24, right: ox + 24, bottom: obMode ? Math.max(40 + ob, insets.bottom + 16) : 40 + ob }}>
        <Animated.View
          style={[styles.btn, {
            opacity: btnShown ? 1 : 0,
            backgroundColor: obMode ? '#FFFFFF' : unlocked ? PINK : '#F0F0F0',
            boxShadow: obMode ? '0px 10px 22px rgba(150,10,80,0.35)' : unlocked ? '0px 6px 12px rgba(255,94,168,0.45)' : '0px 0px 0px rgba(255,94,168,0)',
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
          <Animated.Text style={[styles.btnText, { color: obMode ? (naAlerta ? VERMELHO_ALERTA : PINK) : unlocked ? '#FFFFFF' : '#B5B5B5', transitionProperty: 'color', transitionDuration: 240 }, obMode && { fontWeight: '700' }]}>
            {obMode ? (naBoa ? 'Continuar' : 'Quero resolver isso') : 'Continuar'}
          </Animated.Text>
        </Animated.View>
      </Pressable>

      {/* Pacote de NIKS Points: cabeçalho de nível no lugar da headline + mini cartas.
          Por cima de tudo: tocar na tela durante a animação adianta para o fim. */}
      {pacote && estado?.niveis && estado.icone && (
        <PacotePontos
          de={pacote.de}
          para={pacote.para}
          niveis={estado.niveis}
          icone={estado.icone}
          origem={{ x: stageX + CW / 2, y: stageY + CH - 42 }}
          topo={oy + 98}
          rm={rm}
        />
      )}

      {/* Onboarding: ao tocar em "Quero resolver isso", o MESMO fundo rosa cobre carta,
          título e botão (300 ms) e só então a tela "Calma, <nome>." (`(scan)/solucao`, mesmo
          fundo, sem animação de entrada) toma o lugar — a troca não aparece. */}
      {obMode && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fundoOb, { zIndex: 100, elevation: 100 }, saidaObStyle]} />}
    </View>
  );
}


// ── Revelação das cartas do servidor (peça 4 do design, 79i–79k) ─────────────
const VERSO = { k: 'verso' } as const;

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
  faceSrv: { position: 'absolute', left: 0, top: 0, width: CW, height: CH },
  faceSrvClip: { borderRadius: 22 * (CW / 220), overflow: 'hidden' },
  front: { borderWidth: 1.5, borderColor: PINK, boxShadow: '0px 18px 40px rgba(200,60,120,0.18), 0px 2px 6px rgba(200,60,120,0.10)' },
  frontPower: { boxShadow: '0px 18px 44px rgba(200,60,120,0.26), 0px 0px 0px 3px rgba(255,94,168,0.18)' },
  // Auréola rosa e lilás atrás do poder (79k), respirando .97↔1.03 em 2,4 s.
  auraWrap: { position: 'absolute', left: -34, top: -34, right: -34, bottom: -34 },
  aura: {
    flex: 1, borderRadius: 56,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,94,168,0.38), rgba(214,180,255,0.24) 62%, rgba(214,180,255,0))',
  },
  selo: {
    marginTop: 8, height: 30, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: PINK, boxShadow: '0px 8px 18px rgba(255,94,168,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  seloText: { color: PINK, fontSize: 15, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
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

  // Onboarding (chegada da carta, fundo preto).
  obText: { position: 'absolute', zIndex: 12, textAlign: 'center', fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, color: '#FFFFFF' },
  obSub: { marginTop: 8, fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, color: '#FFFFFF', textAlign: 'center' },
  fundoOb: {
    backgroundColor: PINK,
    experimental_backgroundImage: 'radial-gradient(circle at 50% 46%, #FF8DC3 0%, #FF5EA8 52%, #EC4895 100%)',
  },
  // Transição de alerta e Carta 2: rosa mais escuro e profundo, um pouco mais escuro nas bordas.
  // Puxado para o vinho (06/nov/2026): o magenta de antes brigava com o vermelho da carta.
  fundoAlerta: {
    backgroundColor: '#9E1D46',
    experimental_backgroundImage: 'radial-gradient(circle at 50% 46%, #CF3A62 0%, #A9234C 52%, #5E0D27 100%)',
  },
  // Rosa-escuro, mas saturado: no fundo do alerta (também rosa-escuro) o #B3135F sumia. O brilho
  // é estático; quem pulsa é a opacidade da camada.
  bordaAlerta: {
    borderRadius: 22 * (CW / 220), borderWidth: 3.5, borderColor: VERMELHO_ALERTA,
    boxShadow: '0px 0px 22px 5px rgba(253,58,66,0.9)',
  },
  cardGlowOb: {
    boxShadow: '0px 0px 44px 10px rgba(255,255,255,0.62), 0px 24px 46px rgba(150,10,80,0.42)',
  },
  luz: {
    position: 'absolute', width: LUZ, height: LUZ, borderRadius: LUZ / 2, zIndex: 9,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,255,255,1), rgba(255,236,245,0.9) 30%, rgba(255,214,234,0.45) 60%, rgba(255,214,234,0))',
  },
  glowOb: {
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,255,255,0.6), rgba(255,226,240,0.3) 42%, rgba(255,226,240,0))',
  },
  mao: {
    position: 'absolute', left: CW / 2 - 26, top: CH * 0.62 - 26, width: 52, height: 52, borderRadius: 26, zIndex: 4,
    backgroundColor: 'rgba(255,255,255,0.96)', boxShadow: '0px 8px 20px rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center',
  },

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
