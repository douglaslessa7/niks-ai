import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path, Defs, RadialGradient, Stop, Rect, Ellipse } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImageManipulator from 'expo-image-manipulator';
import { getUserId } from '../../lib/currentUser';
import { listColecao, requestCutout, setShelfPos, type ColecaoItem, type ShelfPos } from '../../lib/colecao';
import { haptics } from '../../lib/haptics';

// ─────────────────────────────────────────────────────────────────────────────
// "Minha estante" — réplica do design 48a (Claude Design, NiksShelfFlo.dc.html).
// Os produtos da Minha coleção viram miniaturas (recorte sem fundo) que a usuária
// arrasta para as 3 prateleiras; o que ainda não está na estante fica no cartão
// "Fora da estante". Mesma lógica do design: prateleira mais próxima, sem
// sobrepor (procura a vaga livre mais perto), indicador de onde vai cair, e a
// queda com "squash & settle". A posição fica em colecao_produtos.estante.
// O botão de compartilhar gera a imagem da estante e abre o menu do iPhone.
// Coordenadas no frame do design (palco 393×630, topo em 120 no frame de 852).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const STAGE_W = 393;
const STAGE_H = 630;
const SHELF = [142, 280, 418];                 // base (y) de cada prateleira
const TRAY_Y = 604, TRAY_X0 = 60, TRAY_DX = 62; // "Fora da estante"
const IN_L = 26, IN_R = 367, GAP = 8;           // miolo da estante + folga entre produtos
const BASE_H = 96, MAX_W = 64, MIN_W = 18;      // tamanho da miniatura (o design usa 86–106 de altura)

// Usada também dentro do gesto (UI thread) — precisa ser worklet.
const clamp = (v: number, a: number, b: number) => {
  'worklet';
  return Math.max(a, Math.min(b, v));
};

type Prod = {
  id: string; name: string; img: string | null; cut: boolean; pending: boolean;
  w: number; h: number; pos: ShelfPos | null;
};

// Tamanho da miniatura pela proporção do recorte (altura ~96, largura até 64).
function sizeOf(c: ColecaoItem): { w: number; h: number } {
  if (c.cutoutStatus === 'ok' && c.cutoutW && c.cutoutH) {
    const a = c.cutoutW / c.cutoutH;
    let w = BASE_H * a, h = BASE_H;
    if (w > MAX_W) { w = MAX_W; h = MAX_W / a; }
    if (w < MIN_W) w = MIN_W;
    return { w: Math.round(w), h: Math.round(h) };
  }
  return { w: 44, h: 58 }; // ainda sem recorte: cartãozinho com a foto
}

// ── Miniatura arrastável ──────────────────────────────────────────────────────
function ShelfItem({ p, cx: tcx, by: tby, nonce, k, z, onStart, onMove, onDrop }: {
  p: Prod; cx: number; by: number; nonce: number; k: number; z: number;
  onStart: (id: string) => void;
  onMove: (id: string, cx: number, by: number) => void;
  onDrop: (id: string, cx: number, by: number) => void;
}) {
  const cx = useSharedValue(tcx);
  const by = useSharedValue(tby);
  const dragging = useSharedValue(0);
  const lift = useSharedValue(1);   // scale(1.12) enquanto arrasta
  const rot = useSharedValue(0);    // inclina conforme a velocidade (clamp ±12°)
  const sx = useSharedValue(1);     // squash ao pousar
  const sy = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Vai (ou volta) para o lugar dela: "left" desacelera, "top" acelera (cai).
  useEffect(() => {
    if (dragging.value) return;
    cx.value = withTiming(tcx, { duration: 260, easing: Easing.bezier(0.2, 0.8, 0.3, 1) });
    by.value = withTiming(tby, { duration: 260, easing: Easing.bezier(0.55, 0, 1, 0.45) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcx, tby, nonce]);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      dragging.value = 1;
      startX.value = cx.value;
      startY.value = by.value;
      lift.value = withTiming(1.12, { duration: 120 });
      runOnJS(onStart)(p.id);
    })
    .onUpdate((e) => {
      cx.value = startX.value + e.translationX / k;
      by.value = startY.value + e.translationY / k;
      const r = clamp((e.velocityX / k) * 0.026, -12, 12);
      rot.value = r * 0.6 + rot.value * 0.4;
      runOnJS(onMove)(p.id, cx.value, by.value);
    })
    .onFinalize(() => {
      dragging.value = 0;
      lift.value = withTiming(1, { duration: 300 });
      rot.value = withTiming(0, { duration: 300 });
      // queda (260ms) → squash (90ms) → settle com "quique" (450ms)
      sx.value = withDelay(260, withSequence(
        withTiming(1.07, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 450, easing: Easing.bezier(0.3, 1.8, 0.5, 1) }),
      ));
      sy.value = withDelay(260, withSequence(
        withTiming(0.9, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 450, easing: Easing.bezier(0.3, 1.8, 0.5, 1) }),
      ));
      runOnJS(onDrop)(p.id, cx.value, by.value);
    });

  const boxStyle = useAnimatedStyle(() => ({
    left: cx.value - p.w / 2,
    top: by.value - p.h,
    transform: [{ scale: lift.value }, { scaleX: sx.value }, { scaleY: sy.value }, { rotate: `${rot.value}deg` }],
  }));
  // Sombra no chão: desce e clareia quando o produto está no ar.
  const groundStyle = useAnimatedStyle(() => {
    const t = (lift.value - 1) / 0.12;
    return { bottom: -5 - 17 * t, opacity: 1 - 0.55 * t };
  });
  // "drop-shadow" do próprio produto (segue o recorte): leve no lugar, maior no ar.
  const imgStyle = useAnimatedStyle(() => {
    const t = (lift.value - 1) / 0.12;
    return {
      shadowOffset: { width: 0, height: 1 + 15 * t },
      shadowRadius: 1.5 + 5.5 * t,
      shadowOpacity: 0.18 + 0.04 * t,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ position: 'absolute', width: p.w, height: p.h, zIndex: z, transformOrigin: '50% 100%' }, boxStyle]}>
        <Animated.View style={[{ position: 'absolute', left: -p.w * 0.25, width: p.w * 1.5, height: 10 }, groundStyle]} pointerEvents="none">
          <Svg width={p.w * 1.5} height={10}>
            <Defs>
              <RadialGradient id={`g${p.id}`} cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor="rgb(110,30,60)" stopOpacity={0.34} />
                <Stop offset="1" stopColor="rgb(110,30,60)" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={(p.w * 1.5) / 2} cy={5} rx={(p.w * 1.5) / 2} ry={5} fill={`url(#g${p.id})`} />
          </Svg>
        </Animated.View>
        {p.cut && p.img ? (
          <Animated.View style={[StyleSheet.absoluteFill, { shadowColor: 'rgb(110,30,60)' }, imgStyle]}>
            <ExpoImage source={{ uri: p.img }} style={StyleSheet.absoluteFill} contentFit="contain" contentPosition="bottom" accessibilityLabel={p.name} />
          </Animated.View>
        ) : (
          // Recorte ainda sendo feito (ou falhou): cartãozinho com a foto original.
          <View style={[StyleSheet.absoluteFill, s.pending]}>
            {p.img ? <ExpoImage source={{ uri: p.img }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            {p.pending && (
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.45)' }]}>
                <ActivityIndicator size="small" color="#FF5EA8" />
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// ── Indicador de onde o produto vai cair (elipse rosa na prateleira) ──────────
function DropMark({ x, y, w, on }: { x: number; y: number; w: number; on: boolean }) {
  const style = useAnimatedStyle(() => ({
    left: withTiming(x, { duration: 120 }),
    top: withTiming(y, { duration: 120 }),
    width: withTiming(w, { duration: 120 }),
    opacity: withTiming(on ? 1 : 0, { duration: 150 }),
  }), [x, y, w, on]);
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', height: 10, borderRadius: 999, backgroundColor: 'rgba(255,94,168,0.28)' }, style]} />;
}

export default function Estante() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  // Palco no frame do design; encolhe só se a tela for baixa demais (iPhone SE).
  const stageTop = insets.top + 66;
  const avail = H - stageTop - (53 + insets.bottom) - 8;
  const k = Math.min(1, avail / STAGE_H);
  const stageLeft = (W - STAGE_W * k) / 2;

  const [items, setItems] = useState<ColecaoItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pos, setPos] = useState<Record<string, ShelfPos | null>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ x: number; y: number; w: number; on: boolean }>({ x: 0, y: 0, w: 0, on: false });
  const [nonce, setNonce] = useState<Record<string, number>>({});
  const [capturing, setCapturing] = useState(false);
  const stageRef = useRef<View>(null);
  const lastTarget = useRef('');
  const dragRef = useRef<string | null>(null); // quem está sendo arrastado agora

  const load = useCallback(async () => {
    const uid = await getUserId();
    if (!uid) return;
    try {
      const list = await listColecao(uid);
      setItems(list);
      setPos((cur) => {
        const next: Record<string, ShelfPos | null> = {};
        list.forEach((c) => { next[c.id] = c.id in cur ? cur[c.id] : c.estante; });
        return next;
      });
      // Recorte ainda não feito (ou que falhou antes): pede de novo (uma vez por sessão).
      list.filter((c) => c.cutoutStatus !== 'ok').forEach((c) => { void requestCutout(c.id); });
    } catch (e) {
      console.warn('[estante] falha ao carregar', e);
    } finally {
      setLoaded(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Enquanto houver recorte em andamento, recarrega a cada 4s (no máximo 15 vezes).
  const polls = useRef(0);
  useEffect(() => {
    if (!items.some((c) => c.cutoutStatus === 'pendente') || polls.current >= 15) return;
    const t = setTimeout(() => { polls.current += 1; void load(); }, 4000);
    return () => clearTimeout(t);
  }, [items, load]);

  const prods: Prod[] = useMemo(() => items.map((c) => {
    const { w, h } = sizeOf(c);
    const cut = c.cutoutStatus === 'ok' && !!c.cutoutUrl;
    return {
      id: c.id, name: c.nome ?? 'Produto', img: cut ? c.cutoutUrl : (c.photoUrl ?? c.cutoutUrl),
      cut, pending: c.cutoutStatus === 'pendente', w, h, pos: pos[c.id] ?? null,
    };
  }), [items, pos]);
  const byId = useMemo(() => new Map(prods.map((p) => [p.id, p])), [prods]);
  const tray = prods.filter((p) => !p.pos);
  const trayDx = tray.length > 1 ? Math.min(TRAY_DX, (STAGE_W - TRAY_X0 * 2) / (tray.length - 1)) : TRAY_DX;

  // Onde cada produto está (centro x + base y).
  const where = (p: Prod) => {
    if (!p.pos) return { cx: TRAY_X0 + tray.findIndex((q) => q.id === p.id) * trayDx, by: TRAY_Y };
    return { cx: p.pos.x, by: SHELF[p.pos.s] };
  };

  // Para onde vai ao soltar em (cx, by) — a mesma regra do design.
  const target = useCallback((id: string, cx: number, by: number): ShelfPos | 'tray' | null => {
    const d = byId.get(id);
    if (!d) return null;
    if (by > 450) return 'tray';
    let s = 0, best = 1e9;
    SHELF.forEach((y, i) => { const dist = Math.abs(by - y) + (by > y + 20 ? 60 : 0); if (dist < best) { best = dist; s = i; } });
    const lo = IN_L + d.w / 2 + 6, hi = IN_R - d.w / 2 - 6;
    let x = clamp(cx, lo, hi);
    const others = prods.filter((q) => q.id !== id && q.pos && q.pos.s === s).map((q) => ({ x: q.pos!.x, w: q.w }));
    const fits = (c: number) => c >= lo && c <= hi && others.every((o) => Math.abs(o.x - c) >= (o.w + d.w) / 2 + GAP);
    if (!fits(x)) {
      const cands: number[] = [lo, hi];
      others.forEach((o) => { const off = (o.w + d.w) / 2 + GAP; cands.push(o.x - off, o.x + off); });
      const ok = cands.filter(fits).sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
      if (!ok.length) return null;
      x = ok[0];
    }
    return { s, x: Math.round(x) };
  }, [byId, prods]);

  const onStart = useCallback((id: string) => { dragRef.current = id; haptics.select(); setDragId(id); }, []);
  const onMove = useCallback((id: string, cx: number, by: number) => {
    // Um último "movendo" que chegue depois do "soltou" não pode reacender a marca.
    if (dragRef.current !== id) return;
    const t = target(id, cx, by);
    const key = t && t !== 'tray' ? `${t.s}:${t.x}` : 'none';
    if (key === lastTarget.current) return;
    lastTarget.current = key;
    if (t && t !== 'tray') {
      const dw = (byId.get(id)?.w ?? 40) * 1.8;
      setDrop({ x: t.x - dw / 2, y: SHELF[t.s] - 5, w: dw, on: true });
    } else {
      setDrop((d) => ({ ...d, on: false }));
    }
  }, [target, byId]);
  const onDrop = useCallback((id: string, cx: number, by: number) => {
    dragRef.current = null;
    lastTarget.current = '';
    setDragId(null);
    setDrop((d) => ({ ...d, on: false }));
    const t = target(id, cx, by);
    if (t) {
      const next = t === 'tray' ? null : t;
      setPos((cur) => ({ ...cur, [id]: next }));
      void setShelfPos(id, next);
      haptics.tap();
    }
    // Sem vaga → volta para onde estava (o nonce força a animação de volta).
    setNonce((n) => ({ ...n, [id]: (n[id] ?? 0) + 1 }));
  }, [target]);

  // Compartilhar: foto só da estante (sem o "Fora da estante"), sobre o rosa do fundo.
  const share = async () => {
    if (!stageRef.current) return;
    haptics.tap();
    setCapturing(true);
    try {
      await new Promise((r) => setTimeout(r, 60)); // deixa o frame sem o cartão renderizar
      const uri = await captureRef(stageRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const info = await ImageManipulator.manipulateAsync(uri, []);
      const px = info.width / STAGE_W; // pixels por pt no palco capturado
      const cropped = await ImageManipulator.manipulateAsync(uri, [{
        crop: { originX: 0, originY: 0, width: info.width, height: Math.min(info.height, Math.round(470 * px)) },
      }], { format: ImageManipulator.SaveFormat.PNG });
      setCapturing(false);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(cropped.uri, { mimeType: 'image/png', dialogTitle: 'Minha estante', UTI: 'public.png' });
      }
    } catch (e) {
      console.warn('[estante] falha ao compartilhar', e);
      haptics.error();
    } finally {
      setCapturing(false);
    }
  };

  const hint = dragId ? 'Solte aqui pra tirar' : 'Arraste pra estante';

  return (
    <View style={{ flex: 1, backgroundColor: '#F9F2F5' }}>
      <LinearGradient colors={['#FFE3EF', '#FCEAF2', '#F9F2F5', '#F9F2F5']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />

      {/* Cabeçalho: voltar + "Minha estante" · compartilhar */}
      <View style={[s.header, { top: insets.top + 15 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); router.back(); }} style={s.circle36} accessibilityLabel="Voltar">
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 6l-6 6 6 6" /></Svg>
          </TouchableOpacity>
          <Text style={s.title}>Minha estante</Text>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={share} style={s.circle36} accessibilityLabel="Compartilhar estante">
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5v6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-6" /></Svg>
        </TouchableOpacity>
      </View>

      {/* Palco 393×630 */}
      <View
        ref={stageRef}
        collapsable={false}
        style={{
          position: 'absolute', top: stageTop, left: stageLeft, width: STAGE_W, height: STAGE_H,
          transform: [{ scale: k }], transformOrigin: '0% 0%',
          backgroundColor: capturing ? '#FCEAF2' : 'transparent',
        }}
      >
        {/* Estante: caixa externa + fundo interno + luzes + prateleiras */}
        <View style={s.outer}>
          <LinearGradient colors={['#F9DCE8', '#F3C9DA']} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
          <View style={s.outerInset} />
        </View>
        <View style={s.inner}>
          <Svg width={341} height={424} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="innerBg" cx="50%" cy="0%" rx="130%" ry="70%" fx="50%" fy="0%">
                <Stop offset="0" stopColor="#FFF8FB" />
                <Stop offset="0.5" stopColor="#FCEAF1" />
                <Stop offset="1" stopColor="#F4D5E2" />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={341} height={424} fill="url(#innerBg)" />
          </Svg>
          {/* sombras internas (inset) */}
          <LinearGradient colors={['rgba(150,50,90,0.14)', 'rgba(150,50,90,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 26 }} />
          <LinearGradient colors={['rgba(150,50,90,0)', 'rgba(150,50,90,0.08)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 18 }} />
          <LinearGradient colors={['rgba(150,50,90,0.06)', 'rgba(150,50,90,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 18 }} />
          <LinearGradient colors={['rgba(150,50,90,0)', 'rgba(150,50,90,0.06)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 18 }} />
        </View>
        {[10, 155, 293].map((y) => (
          <Svg key={`l${y}`} width={313} height={70} style={{ position: 'absolute', left: 40, top: y }} pointerEvents="none">
            <Defs>
              <RadialGradient id={`light${y}`} cx="50%" cy="0%" rx="50%" ry="100%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.75} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={156.5} cy={35} rx={156.5} ry={35} fill={`url(#light${y})`} />
          </Svg>
        ))}
        {SHELF.map((y) => (
          <View key={`p${y}`} pointerEvents="none">
            <LinearGradient colors={['#F6D6E3', '#FBE8F0']} style={{ position: 'absolute', left: 26, width: 341, top: y - 7, height: 7 }} />
            <View style={[s.plankFace, { top: y }]}>
              <LinearGradient colors={['#FCEBF2', '#F4CBDC', '#EDB9CF']} locations={[0, 0.45, 1]} style={[StyleSheet.absoluteFill, { borderRadius: 3 }]} />
              <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.9)', borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
            </View>
          </View>
        ))}

        {/* "Fora da estante" */}
        {!capturing && (
          <>
            <View style={s.tray} />
            <View style={s.trayHead} pointerEvents="none">
              <Text style={s.trayTitle}>Fora da estante</Text>
              <Text style={s.trayHint}>{hint}</Text>
            </View>
            {loaded && tray.length === 0 && (
              <Text style={s.trayEmpty} pointerEvents="none">
                {prods.length === 0 ? 'Adicione produtos na Minha coleção' : 'Tudo na estante'}
              </Text>
            )}
          </>
        )}
        <DropMark {...drop} />

        {/* Produtos (na estante e fora dela) */}
        {prods.filter((p) => !capturing || p.pos).map((p, i) => {
          const w = where(p);
          return (
            <ShelfItem
              key={p.id} p={p} cx={w.cx} by={w.by} nonce={nonce[p.id] ?? 0} k={k}
              z={dragId === p.id ? 60 : 10 + i}
              onStart={onStart} onMove={onMove} onDrop={onDrop}
            />
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    position: 'absolute', left: 0, right: 0, height: 36, paddingHorizontal: 20, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  circle36: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 7,
  },
  title: { fontSize: 17, fontWeight: '400', letterSpacing: -0.3, color: INK },
  outer: {
    position: 'absolute', left: 16, top: 0, width: 361, height: 444, borderRadius: 20, backgroundColor: '#F6D2E1',
    shadowColor: 'rgb(160,50,95)', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.16, shadowRadius: 20,
  },
  outerInset: {
    ...StyleSheet.absoluteFillObject, borderRadius: 20,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.7)',
    borderBottomWidth: 2, borderBottomColor: 'rgba(170,70,110,0.12)',
  },
  inner: { position: 'absolute', left: 26, top: 10, width: 341, height: 424, borderRadius: 12, overflow: 'hidden' },
  plankFace: {
    position: 'absolute', left: 22, width: 349, height: 13, borderRadius: 3, backgroundColor: '#F4CBDC',
    shadowColor: 'rgb(150,50,90)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 7,
  },
  tray: {
    position: 'absolute', left: 16, top: 462, width: 361, height: 156, borderRadius: 13, backgroundColor: '#FFFFFF',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 7,
  },
  trayHead: { position: 'absolute', left: 33, right: 33, top: 476, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  trayTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
  trayHint: { fontSize: 15, letterSpacing: -0.2, color: '#8A8385' },
  trayEmpty: { position: 'absolute', left: 0, right: 0, top: 548, textAlign: 'center', fontSize: 15, letterSpacing: -0.2, color: '#8A8385' },
  pending: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#FFFFFF' },
});
