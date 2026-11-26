// ─────────────────────────────────────────────────────────────────────────────
// Palco animado do pós-compra v2 · passo 2 ("Vamos ver o que você já tem" — lib/posCompraV2.ts).
// EXPLICA o que vai acontecer: um produto no meio, dentro da moldura rosa de scan → a linha de
// scan passa → "+20" sobe → o produto voa para o passo dele na faixa "Sua rotina" (Limpeza ·
// Sérum · Protetor) → o próximo entra no meio. Os três encaixados, a cena some e recomeça.
//
// Como foi feito (skill animate-expo): um RELÓGIO só (`t`, em ms, `withRepeat` linear) na thread
// de UI; cada peça deriva a posição dele num `useAnimatedStyle` — nenhum setState por quadro.
// Só transform e opacidade. Para quando a tela sai de vista (`useTelaFocada`). Reduzir
// movimento: a cena PARADA já completa (os três produtos na rotina), sem nada se mexendo.
// Imagens: os produtos genéricos do tutorial da Rotina (sem marca real).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { View, Text, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTelaFocada } from '../../hooks/useTelaFocada';
import { t as tr } from '../../lib/i18n';

const PINK = '#FF5EA8';
const EASE_OUT = Easing.bezierFn(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezierFn(0.77, 0, 0.175, 1);

// Linha do tempo (ms). Cada produto tem uma FASE: entra no meio, é escaneado, "+20", voa.
const ABRE = 300;          // a cena aparece
const FASE = 1900;
const ENTRA = 420;         // até o meio da moldura
const SCAN_FIM = 1120;     // a linha terminou de passar
const VOA = 1300;          // começa a ir para a rotina
const POUSA = 1750;        // chegou no passo
const LOOP = ABRE + 3 * FASE + 1300;
const PARADO = LOOP - 400; // o quadro da cena completa (Reduzir movimento)
function inicio(k: number): number {
  'worklet';
  return ABRE + k * FASE;
}

const PRODUTOS = [
  { img: require('../../assets/rotina-tutorial/cut-pump.png'), aspecto: 210 / 800, passo: 'Limpeza', de: 'meio' as const },
  { img: require('../../assets/rotina-tutorial/cut-serum.png'), aspecto: 179 / 573, passo: 'Sérum', de: 'direita' as const },
  { img: require('../../assets/rotina-tutorial/protetor_generico.png'), aspecto: 320 / 760, passo: 'Protetor', de: 'esquerda' as const },
];

function prog(t: number, a: number, b: number, e?: (x: number) => number): number {
  'worklet';
  if (t <= a) return 0;
  if (t >= b) return 1;
  const x = (t - a) / (b - a);
  return e ? e(x) : x;
}
function mix(a: number, b: number, p: number): number {
  'worklet';
  return a + (b - a) * p;
}

type Geo = {
  W: number; H: number;
  prodH: number; meioY: number; xs: { esquerda: number; meio: number; direita: number };
  fw: number; fh: number;
  faixaY: number; slotY: number; slotXs: number[]; SLOT: number;
};

function geometria(W: number, H: number): Geo {
  const faixaH = 78;
  const faixaY = H - faixaH - 12;
  const areaH = faixaY - 8;
  const prodH = Math.min(150, areaH * 0.74);
  const SLOT = 44;
  return {
    W, H, prodH,
    meioY: areaH / 2 + 6,
    xs: { esquerda: W * 0.19, meio: W * 0.5, direita: W * 0.81 },
    fw: prodH * 0.78, fh: prodH * 1.14,
    faixaY, slotY: faixaY + 10 + SLOT / 2,
    slotXs: [W * 0.22, W * 0.5, W * 0.78],
    SLOT,
  };
}

function Produto({ k, t, g }: { k: number; t: SharedValue<number>; g: Geo }) {
  const p = PRODUTOS[k];
  const h = g.prodH;
  const w = h * p.aspecto;
  const x0 = g.xs[p.de];
  const escalaSlot = (g.SLOT - 6) / h;
  const st = useAnimatedStyle(() => {
    const tt = t.get();
    const S = inicio(k);
    const entra = p.de === 'meio' ? 1 : prog(tt, S, S + ENTRA, EASE_OUT);
    const voa = prog(tt, S + VOA, S + POUSA, EASE_IN_OUT);
    const x = mix(mix(x0, g.xs.meio, entra), g.slotXs[k], voa);
    const y = mix(g.meioY, g.slotY, voa);
    const s = mix(mix(0.8, 1, entra), escalaSlot, voa);
    const o = mix(0.5, 1, entra) * (1 - prog(tt, S + POUSA - 90, S + POUSA));
    return { opacity: o, transform: [{ translateX: x }, { translateY: y }, { scale: s }] };
  });
  return (
    <Animated.Image
      source={p.img}
      resizeMode="contain"
      style={[{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h }, st]}
    />
  );
}

function Slot({ k, t, g }: { k: number; t: SharedValue<number>; g: Geo }) {
  const p = PRODUTOS[k];
  const thumbH = g.SLOT - 8;
  const pousa = inicio(k) + POUSA;
  const foto = useAnimatedStyle(() => ({ opacity: prog(t.get(), pousa - 90, pousa) }));
  const fundo = useAnimatedStyle(() => ({ opacity: prog(t.get(), pousa - 90, pousa) }));
  const selo = useAnimatedStyle(() => {
    const q = prog(t.get(), pousa, pousa + 320);
    const s = q < 0.55 ? mix(0.6, 1.12, EASE_OUT(q / 0.55)) : mix(1.12, 1, (q - 0.55) / 0.45);
    return { opacity: q > 0 ? 1 : 0, transform: [{ scale: s }] };
  });
  return (
    <View style={{ position: 'absolute', left: g.slotXs[k] - 40, top: g.faixaY + 10, width: 80, alignItems: 'center' }}>
      <View style={{
        width: g.SLOT, height: g.SLOT, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,94,168,0.35)', backgroundColor: 'rgba(255,255,255,0.6)',
      }}>
        <Animated.View style={[{ position: 'absolute', top: -1.5, left: -1.5, right: -1.5, bottom: -1.5, borderRadius: 14, backgroundColor: '#FFE3EF', borderWidth: 1.5, borderColor: 'rgba(255,94,168,0.5)' }, fundo]} />
        <Animated.Image source={p.img} resizeMode="contain" style={[{ width: thumbH * p.aspecto, height: thumbH }, foto]} />
        <Animated.View style={[{
          position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: PINK,
          alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF',
        }, selo]}>
          <Svg width={9} height={9} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#FFFFFF" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </Animated.View>
      </View>
      <Text numberOfLines={1} style={{ marginTop: 5, fontSize: 11, fontWeight: '600', letterSpacing: -0.1, color: '#6E6468' }}>{tr(p.passo)}</Text>
    </View>
  );
}

function Cena({ g }: { g: Geo }) {
  const focada = useTelaFocada();
  const reduzir = useReducedMotion();
  const t = useSharedValue(reduzir ? PARADO : 0);

  useEffect(() => {
    if (reduzir) { cancelAnimation(t); t.set(PARADO); return; }
    if (!focada) { cancelAnimation(t); return; }
    t.set(0);
    t.set(withRepeat(withTiming(LOOP, { duration: LOOP, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [focada, reduzir, t]);

  // A cena aparece e, completa, some para recomeçar.
  const tudo = useAnimatedStyle(() => {
    const tt = t.get();
    return { opacity: prog(tt, 0, ABRE) * (1 - prog(tt, LOOP - 350, LOOP)) };
  });

  // Moldura: pulsa de leve quando o scan termina ("pegou").
  const moldura = useAnimatedStyle(() => {
    const tt = t.get();
    let s = 1;
    for (let k = 0; k < 3; k++) {
      const ok = inicio(k) + SCAN_FIM;
      if (tt >= ok && tt <= ok + 300) s = 1 + 0.05 * Math.sin(Math.PI * ((tt - ok) / 300));
    }
    return { transform: [{ scale: s }] };
  });

  // Linha de scan: desce pela moldura na janela de cada produto.
  const linha = useAnimatedStyle(() => {
    const tt = t.get();
    let y = 0;
    let o = 0;
    for (let k = 0; k < 3; k++) {
      const a = inicio(k) + ENTRA;
      const b = inicio(k) + SCAN_FIM;
      if (tt >= a && tt <= b) { y = prog(tt, a, b, EASE_IN_OUT) * (g.fh - 4); o = 1; }
    }
    return { opacity: o, transform: [{ translateY: y }] };
  });

  // "+20": sobe e some logo depois do scan de cada produto.
  const ganho = useAnimatedStyle(() => {
    const tt = t.get();
    let o = 0;
    let y = 0;
    for (let k = 0; k < 3; k++) {
      const ok = inicio(k) + SCAN_FIM;
      if (tt >= ok && tt <= ok + 700) {
        const a = (tt - ok) / 700;
        o = a < 0.15 ? a / 0.15 : a > 0.7 ? (1 - a) / 0.3 : 1;
        y = -16 * EASE_OUT(a);
      }
    }
    return { opacity: o, transform: [{ translateY: y }] };
  });

  const fx = g.xs.meio - g.fw / 2;
  const fy = g.meioY - g.fh / 2;
  const CANTO = 22;
  const canto = (pos: object) => (
    <View style={[{ position: 'absolute', width: CANTO, height: CANTO, borderColor: PINK }, pos]} />
  );

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: g.W, height: g.H }, tudo]}>
      {/* Faixa "Sua rotina" */}
      <View style={{ position: 'absolute', left: 14, right: 14, top: g.faixaY, height: 78, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.75)' }} />
      {[0, 1, 2].map((k) => <Slot key={k} k={k} t={t} g={g} />)}

      {/* Moldura de scan (cantos rosa) */}
      <Animated.View style={[{ position: 'absolute', left: fx, top: fy, width: g.fw, height: g.fh }, moldura]}>
        {canto({ left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 10 })}
        {canto({ right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 10 })}
        {canto({ left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 10 })}
        {canto({ right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 10 })}
      </Animated.View>

      {/* Produtos (por cima da faixa: voam até o passo) */}
      {[2, 1, 0].map((k) => <Produto key={k} k={k} t={t} g={g} />)}

      {/* Linha de scan (por cima do produto do meio) */}
      <Animated.View pointerEvents="none" style={[{
        position: 'absolute', left: fx + 6, top: fy + 2, width: g.fw - 12, height: 3, borderRadius: 2, backgroundColor: PINK,
        shadowColor: PINK, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6,
      }, linha]} />

      {/* "+20" */}
      <Animated.View pointerEvents="none" style={[{
        position: 'absolute', left: g.xs.meio + g.fw / 2 - 18, top: fy - 14,
        paddingHorizontal: 9, height: 24, borderRadius: 12, backgroundColor: PINK, justifyContent: 'center',
        shadowColor: PINK, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6,
      }, ganho]}>
        <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: -0.2, color: '#FFFFFF' }}>+20</Text>
      </Animated.View>
    </Animated.View>
  );
}

/** O palco: um card claro que ocupa o espaço que sobrar; a cena se ajusta ao tamanho medido. */
export default function PalcoScan({ style }: { style?: object }) {
  const [tam, setTam] = useState<{ W: number; H: number } | null>(null);
  const medir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!tam || Math.abs(tam.W - width) > 1 || Math.abs(tam.H - height) > 1) setTam({ W: width, H: height });
  };
  return (
    <View onLayout={medir} style={[{ borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.55)', overflow: 'hidden' }, style]}>
      {tam && tam.H > 160 && <Cena g={geometria(tam.W, tam.H)} />}
    </View>
  );
}
