import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path, Circle, Defs, RadialGradient, Stop, Rect, Ellipse } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImageManipulator from 'expo-image-manipulator';
import { setShelfPos, type ColecaoItem, type ShelfPos } from '../../lib/colecao';
import { haptics } from '../../lib/haptics';

// ─────────────────────────────────────────────────────────────────────────────
// "Minha estante" — réplica do design 48a (Claude Design, NiksShelfFlo.dc.html),
// no TOPO da aba Produtos (`recomendacao-produtos.tsx`), dentro da rolagem da tela.
//
// ESTANTE = COLEÇÃO (out/2026): todo produto da coleção está numa prateleira. O
// "Fora da estante" deixou de existir — produto sem posição (recém-adicionado em
// "Adicionar à estante", ou antigo que estava fora) vai sozinho para o PRIMEIRO
// ESPAÇO LIVRE (prateleira de cima primeiro, da esquerda para a direita) e a posição
// é gravada em colecao_produtos.estante. Arrastar só reorganiza.
//
// Gestos (padrão da tela inicial do iPhone):
// - normal: tocar abre o produto (`onPick`); SEGURAR e arrastar reorganiza;
// - modo Editar (`editing`, botão no topo da tela): os produtos tremem e mostram um
//   x; tocar num produto chama `onRemove` (a tela pede a confirmação); arrastar
//   começa sem precisar segurar.
// `onDragActive` avisa a tela para travar a rolagem enquanto arrasta.
// `semArraste` (modo escolha — "Ver todos" da estante na folha "Escolher produto" da
// Rotina): só o toque vale (`onPick`); arrastar fica desligado.
// Coleção vazia mostra um convite sobre as prateleiras, não a estante sozinha.
// Coordenadas no frame do design (palco 393 de largura).
// ─────────────────────────────────────────────────────────────────────────────

// 🧪 TESTE (out/2026) — estante que CRESCE: mostra só as prateleiras que os produtos
// ocupam (+1 durante um arraste, para dar onde soltar). Para DESFAZER, troque para
// `false`: volta a ter sempre 3 prateleiras (e ganha uma 4ª só se as 3 lotarem).
// Com a coleção vazia são sempre 3 prateleiras + o convite, nos dois modos.
const GROW_SHELVES = true;

// 🧪 TESTE (out/2026) — espaço "+" tracejado logo DEPOIS do último produto (no tamanho
// de um produto); tocar abre o scan de produto. Aparece SÓ no modo Editar (some no
// estado normal, durante um arraste e com a estante vazia — lá fica o convite). Para
// DESFAZER, troque para `false`.
const SHOW_ADD_SLOT = true;
const ADD_W = 50, ADD_H = 86;                   // tamanho do espaço "+"

const INK = '#121212';
const STAGE_W = 393;
const SHELF_Y0 = 142, SHELF_DY = 138;           // base (y) da 1ª prateleira + distância entre elas
const shelfY = (i: number) => SHELF_Y0 + SHELF_DY * i;
const outerH = (n: number) => 30 + SHELF_DY * n; // caixa externa (3 prateleiras = 444, o design)
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
// Largura reservada ao escolher a vaga: sem recorte ainda, reserva a largura máxima
// (quando o recorte chegar, a miniatura não invade a vizinha).
const reserveW = (c: ColecaoItem) => (c.cutoutStatus === 'ok' && c.cutoutW && c.cutoutH ? sizeOf(c).w : MAX_W);

// Primeiro espaço livre: prateleira de cima primeiro, da esquerda para a direita.
// Nunca falha — se as existentes estão cheias, devolve a próxima prateleira.
function firstFree(taken: { s: number; x: number; w: number }[], w: number): ShelfPos {
  const lo = IN_L + w / 2 + 6, hi = IN_R - w / 2 - 6;
  for (let s = 0; ; s++) {
    const others = taken.filter((o) => o.s === s);
    const fits = (c: number) => c >= lo && c <= hi && others.every((o) => Math.abs(o.x - c) >= (o.w + w) / 2 + GAP);
    const cands = [lo, ...others.map((o) => o.x + (o.w + w) / 2 + GAP)].sort((a, b) => a - b);
    const x = cands.find(fits);
    if (x != null) return { s, x: Math.round(x) };
  }
}

// ── Miniatura arrastável ──────────────────────────────────────────────────────
function ShelfItem({ p, cx: tcx, by: tby, nonce, k, z, editing, semArraste, onStart, onMove, onDrop, onTap }: {
  p: Prod; cx: number; by: number; nonce: number; k: number; z: number; editing: boolean; semArraste: boolean;
  onStart: (id: string) => void;
  onMove: (id: string, cx: number, by: number) => void;
  onDrop: (id: string, cx: number, by: number) => void;
  onTap: (id: string) => void;
}) {
  const cx = useSharedValue(tcx);
  const by = useSharedValue(tby);
  const dragging = useSharedValue(0);
  const lift = useSharedValue(1);   // scale(1.12) enquanto arrasta
  const rot = useSharedValue(0);    // inclina conforme a velocidade (clamp ±12°)
  const wig = useSharedValue(0);    // tremidinha do modo Editar
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

  // Modo Editar: treme como os ícones do iPhone (±2°, cada um num tempo diferente).
  useEffect(() => {
    if (editing) {
      wig.value = withDelay(Math.random() * 140, withRepeat(withSequence(
        withTiming(-2, { duration: 115, easing: Easing.inOut(Easing.quad) }),
        withTiming(2, { duration: 115, easing: Easing.inOut(Easing.quad) }),
      ), -1, true));
    } else {
      cancelAnimation(wig);
      wig.value = withTiming(0, { duration: 120 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Fora do modo Editar só arrasta depois de SEGURAR (a rolagem da tela fica livre);
  // no modo Editar arrasta na hora.
  const pan = editing ? Gesture.Pan().minDistance(0) : Gesture.Pan().activateAfterLongPress(220);
  pan
    .enabled(!semArraste)
    .onStart(() => {
      dragging.value = 1;
      startX.value = cx.value;
      startY.value = by.value;
      lift.value = withTiming(1.12, { duration: 120 });
      runOnJS(onStart)(p.id);
    })
    .onUpdate((e) => {
      if (!dragging.value) return;
      cx.value = startX.value + e.translationX / k;
      by.value = startY.value + e.translationY / k;
      const r = clamp((e.velocityX / k) * 0.026, -12, 12);
      rot.value = r * 0.6 + rot.value * 0.4;
      runOnJS(onMove)(p.id, cx.value, by.value);
    })
    .onFinalize(() => {
      if (!dragging.value) return; // toque/segurada que não virou arraste
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
  // Toque curto: abre o produto (normal) ou pede para remover (modo Editar).
  const tap = Gesture.Tap().maxDuration(250).maxDistance(8).onEnd((_e, ok) => {
    if (ok) runOnJS(onTap)(p.id);
  });

  const boxStyle = useAnimatedStyle(() => ({
    left: cx.value - p.w / 2,
    top: by.value - p.h,
    transform: [{ scale: lift.value }, { scaleX: sx.value }, { scaleY: sy.value }, { rotate: `${rot.value + wig.value}deg` }],
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
    <GestureDetector gesture={Gesture.Simultaneous(pan, tap)}>
      <Animated.View
        accessibilityRole="button"
        accessibilityLabel={editing ? `Remover ${p.name}` : p.name}
        style={[{ position: 'absolute', width: p.w, height: p.h, zIndex: z, transformOrigin: '50% 100%' }, boxStyle]}
      >
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
        {/* x do modo Editar (canto de cima à esquerda, como no iPhone). O toque vale no
            produto inteiro — numa miniatura de ~44pt um alvo de 20pt seria pequeno demais. */}
        {editing && (
          <View style={s.xBadge} pointerEvents="none">
            <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
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

export type ShelfHandle = { share: () => Promise<void> };

type Props = {
  items: ColecaoItem[];
  loaded: boolean;
  editing: boolean;                        // modo Editar (botão no topo da tela)
  onPick: (c: ColecaoItem) => void;        // toque num produto (fora do modo Editar)
  onRemove: (c: ColecaoItem) => void;      // toque num produto no modo Editar
  onDragActive: (active: boolean) => void; // trava/destrava a rolagem da tela
  onScan: () => void;                      // convite da estante vazia + espaço "+"
  semArraste?: boolean;                    // modo escolha: só toque, sem arrastar
};

const Shelf = forwardRef<ShelfHandle, Props>(function Shelf({ items, loaded, editing, onPick, onRemove, onDragActive, onScan, semArraste = false }, ref) {
  const { width: W } = useWindowDimensions();
  // Palco no frame do design; encolhe só em tela mais estreita que 393.
  const k = Math.min(1, W / STAGE_W);

  const [pos, setPos] = useState<Record<string, ShelfPos>>({});
  const posRef = useRef<Record<string, ShelfPos>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ x: number; y: number; w: number; on: boolean }>({ x: 0, y: 0, w: 0, on: false });
  const [nonce, setNonce] = useState<Record<string, number>>({});
  const [capturing, setCapturing] = useState(false);
  const stageRef = useRef<View>(null);
  const lastTarget = useRef('');
  const dragRef = useRef<string | null>(null); // quem está sendo arrastado agora

  // Posição: a do banco na 1ª vez que o item aparece; depois vale a local (a escrita
  // no banco é otimista — um recarregamento no meio não pode desfazer um arraste).
  // Quem não tem posição ganha o primeiro espaço livre, e ela é gravada.
  useEffect(() => {
    const cur = posRef.current;
    const next: Record<string, ShelfPos> = {};
    items.forEach((c) => { const p = cur[c.id] ?? c.estante; if (p) next[c.id] = p; });
    const taken = items.filter((c) => next[c.id]).map((c) => ({ ...next[c.id], w: reserveW(c) }));
    const placed: [string, ShelfPos][] = [];
    items.forEach((c) => {
      if (next[c.id]) return;
      const p = firstFree(taken, reserveW(c));
      next[c.id] = p;
      taken.push({ ...p, w: reserveW(c) });
      placed.push([c.id, p]);
    });
    posRef.current = next;
    setPos(next);
    placed.forEach(([id, p]) => { void setShelfPos(id, p); });
  }, [items]);

  const prods: Prod[] = useMemo(() => items.filter((c) => pos[c.id]).map((c) => {
    const { w, h } = sizeOf(c);
    const cut = c.cutoutStatus === 'ok' && !!c.cutoutUrl;
    return {
      id: c.id, name: c.nome ?? 'Produto', img: cut ? c.cutoutUrl : (c.photoUrl ?? c.cutoutUrl),
      cut, pending: c.cutoutStatus === 'pendente', w, h, pos: pos[c.id],
    };
  }), [items, pos]);
  const byId = useMemo(() => new Map(prods.map((p) => [p.id, p])), [prods]);
  const itemById = useMemo(() => new Map(items.map((c) => [c.id, c])), [items]);
  const empty = loaded && items.length === 0;

  // Espaço "+": logo depois do último produto (prateleira mais baixa, mais à direita);
  // sem lugar nessa prateleira, começa a próxima.
  const addSlot = useMemo((): ShelfPos | null => {
    if (!SHOW_ADD_SLOT || !editing || dragId || capturing || !prods.length) return null;
    const last = prods.reduce((a, b) => (b.pos!.s > a.pos!.s || (b.pos!.s === a.pos!.s && b.pos!.x > a.pos!.x) ? b : a));
    const x = last.pos!.x + (last.w + ADD_W) / 2 + GAP;
    if (x <= IN_R - ADD_W / 2 - 6) return { s: last.pos!.s, x: Math.round(x) };
    return { s: last.pos!.s + 1, x: Math.round(IN_L + ADD_W / 2 + 6) };
  }, [prods, editing, dragId, capturing]);

  // Quantas prateleiras desenhar (o espaço "+" conta: pode abrir uma prateleira nova).
  const used = Math.max(prods.reduce((m, p) => Math.max(m, p.pos!.s + 1), 0), addSlot ? addSlot.s + 1 : 0);
  const nShelves = items.length === 0 ? 3
    : GROW_SHELVES ? Math.max(1, used + (dragId ? 1 : 0))
    : Math.max(3, used);
  const shelves = Array.from({ length: nShelves }, (_, i) => i);
  const boxH = outerH(nShelves);
  const stageH = boxH + 12;

  // Para onde vai ao soltar em (cx, by) — a regra do design: prateleira mais próxima,
  // sem sobrepor, vaga livre mais perto (sem vaga → volta).
  const target = useCallback((id: string, cx: number, by: number): ShelfPos | null => {
    const d = byId.get(id);
    if (!d) return null;
    let s = 0, best = 1e9;
    shelves.forEach((i) => { const y = shelfY(i); const dist = Math.abs(by - y) + (by > y + 20 ? 60 : 0); if (dist < best) { best = dist; s = i; } });
    const lo = IN_L + d.w / 2 + 6, hi = IN_R - d.w / 2 - 6;
    let x = clamp(cx, lo, hi);
    const others = prods.filter((q) => q.id !== id && q.pos!.s === s).map((q) => ({ x: q.pos!.x, w: q.w }));
    const fits = (c: number) => c >= lo && c <= hi && others.every((o) => Math.abs(o.x - c) >= (o.w + d.w) / 2 + GAP);
    if (!fits(x)) {
      const cands: number[] = [lo, hi];
      others.forEach((o) => { const off = (o.w + d.w) / 2 + GAP; cands.push(o.x - off, o.x + off); });
      const ok = cands.filter(fits).sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
      if (!ok.length) return null;
      x = ok[0];
    }
    return { s, x: Math.round(x) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId, prods, nShelves]);

  const onStart = useCallback((id: string) => {
    dragRef.current = id; haptics.select(); setDragId(id); onDragActive(true);
  }, [onDragActive]);
  const onMove = useCallback((id: string, cx: number, by: number) => {
    // Um último "movendo" que chegue depois do "soltou" não pode reacender a marca.
    if (dragRef.current !== id) return;
    const t = target(id, cx, by);
    const key = t ? `${t.s}:${t.x}` : 'none';
    if (key === lastTarget.current) return;
    lastTarget.current = key;
    if (t) {
      const dw = (byId.get(id)?.w ?? 40) * 1.8;
      setDrop({ x: t.x - dw / 2, y: shelfY(t.s) - 5, w: dw, on: true });
    } else {
      setDrop((d) => ({ ...d, on: false }));
    }
  }, [target, byId]);
  const onDrop = useCallback((id: string, cx: number, by: number) => {
    dragRef.current = null;
    lastTarget.current = '';
    setDragId(null);
    onDragActive(false);
    setDrop((d) => ({ ...d, on: false }));
    const t = target(id, cx, by);
    const cur = posRef.current[id];
    // Só grava se mudou de lugar (soltar no mesmo ponto não escreve nada).
    if (t && (!cur || cur.s !== t.s || cur.x !== t.x)) {
      posRef.current = { ...posRef.current, [id]: t };
      setPos(posRef.current);
      void setShelfPos(id, t);
      haptics.tap();
    }
    // Sem vaga → volta para onde estava (o nonce força a animação de volta).
    setNonce((n) => ({ ...n, [id]: (n[id] ?? 0) + 1 }));
  }, [target, onDragActive]);
  const onTap = useCallback((id: string) => {
    const c = itemById.get(id);
    if (!c) return;
    if (editing) { haptics.warning(); onRemove(c); } else { haptics.tap(); onPick(c); }
  }, [itemById, editing, onPick, onRemove]);

  // Compartilhar: foto só da estante, sobre o rosa do fundo.
  useImperativeHandle(ref, () => ({
    share: async () => {
      if (!stageRef.current) return;
      haptics.tap();
      setCapturing(true);
      try {
        await new Promise((r) => setTimeout(r, 60)); // deixa o frame sem o convite renderizar
        const uri = await captureRef(stageRef, { format: 'png', quality: 1, result: 'tmpfile' });
        const info = await ImageManipulator.manipulateAsync(uri, []);
        const px = info.width / STAGE_W; // pixels por pt no palco capturado
        const cropped = await ImageManipulator.manipulateAsync(uri, [{
          crop: { originX: 0, originY: 0, width: info.width, height: Math.min(info.height, Math.round((boxH + 26) * px)) },
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
    },
  }), [boxH]);

  return (
    // Caixa na altura visível do palco (o palco é escalado a partir do canto).
    <View style={{ height: stageH * k, width: W }}>
      <View
        ref={stageRef}
        collapsable={false}
        style={{
          position: 'absolute', top: 0, left: (W - STAGE_W * k) / 2, width: STAGE_W, height: stageH,
          transform: [{ scale: k }], transformOrigin: '0% 0%',
          backgroundColor: capturing ? '#FCEAF2' : 'transparent',
        }}
      >
        {/* Estante: caixa externa + fundo interno + luzes + prateleiras */}
        <View style={[s.outer, { height: boxH }]}>
          <LinearGradient colors={['#F9DCE8', '#F3C9DA']} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
          <View style={s.outerInset} />
        </View>
        <View style={[s.inner, { height: boxH - 20 }]}>
          <Svg width={341} height={boxH - 20} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="innerBg" cx="50%" cy="0%" rx="130%" ry="70%" fx="50%" fy="0%">
                <Stop offset="0" stopColor="#FFF8FB" />
                <Stop offset="0.5" stopColor="#FCEAF1" />
                <Stop offset="1" stopColor="#F4D5E2" />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={341} height={boxH - 20} fill="url(#innerBg)" />
          </Svg>
          {/* sombras internas (inset) */}
          <LinearGradient colors={['rgba(150,50,90,0.14)', 'rgba(150,50,90,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 26 }} />
          <LinearGradient colors={['rgba(150,50,90,0)', 'rgba(150,50,90,0.08)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 18 }} />
          <LinearGradient colors={['rgba(150,50,90,0.06)', 'rgba(150,50,90,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 18 }} />
          <LinearGradient colors={['rgba(150,50,90,0)', 'rgba(150,50,90,0.06)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 18 }} />
        </View>
        {/* Luz sobre cada prateleira (design: 10, 155, 293 → 17 + 138·i a partir da 2ª) */}
        {shelves.map((i) => {
          const y = i === 0 ? 10 : 17 + SHELF_DY * i;
          return (
            <Svg key={`l${i}`} width={313} height={70} style={{ position: 'absolute', left: 40, top: y }} pointerEvents="none">
              <Defs>
                <RadialGradient id={`light${i}`} cx="50%" cy="0%" rx="50%" ry="100%">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.75} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Ellipse cx={156.5} cy={35} rx={156.5} ry={35} fill={`url(#light${i})`} />
            </Svg>
          );
        })}
        {shelves.map((i) => {
          const y = shelfY(i);
          return (
            <View key={`p${i}`} pointerEvents="none">
              <LinearGradient colors={['#F6D6E3', '#FBE8F0']} style={{ position: 'absolute', left: 26, width: 341, top: y - 7, height: 7 }} />
              <View style={[s.plankFace, { top: y }]}>
                <LinearGradient colors={['#FCEBF2', '#F4CBDC', '#EDB9CF']} locations={[0, 0.45, 1]} style={[StyleSheet.absoluteFill, { borderRadius: 3 }]} />
                <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.9)', borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
              </View>
            </View>
          );
        })}

        {/* Coleção vazia: convite sobre as prateleiras do meio — a estante nunca fica
            sozinha e muda. O botão abre a câmera de produto. */}
        {empty && !capturing && (
          <View style={s.emptyCard}>
            <View style={s.emptyIcon}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#FF5EA8" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M3.5 3v18M20.5 3v18M3.5 10.5h17M3.5 20h17" />
                <Path d="M7 10.5V6.5M10 10.5V5.5M14.5 20v-5M17.5 20v-3.5" />
              </Svg>
            </View>
            <Text style={s.emptyTitle}>Sua estante está esperando</Text>
            <Text style={s.emptyText} lineBreakStrategyIOS="push-out">
              Escaneie um produto que você tem em casa ou toque em “Adicionar à estante” num recomendado.
            </Text>
            <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.action(); onScan(); }} style={s.emptyBtn}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M14.5 4.5h-5L8 6.5H5A1.5 1.5 0 0 0 3.5 8v10A1.5 1.5 0 0 0 5 19.5h14a1.5 1.5 0 0 0 1.5-1.5V8A1.5 1.5 0 0 0 19 6.5h-3z" />
                <Circle cx={12} cy={12.75} r={3.5} />
              </Svg>
              <Text style={s.emptyBtnText}>Escanear um produto</Text>
            </TouchableOpacity>
          </View>
        )}
        <DropMark {...drop} />

        {/* Espaço "+" (TESTE — ver SHOW_ADD_SLOT): tracejado no tamanho de um produto. */}
        {addSlot && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { haptics.action(); onScan(); }}
            accessibilityLabel="Escanear um produto para a estante"
            style={[s.addSlot, { left: addSlot.x - ADD_W / 2, top: shelfY(addSlot.s) - ADD_H - 2 }]}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#E8468F" strokeWidth={2.4} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
          </TouchableOpacity>
        )}

        {/* Produtos */}
        {prods.map((p, i) => (
          <ShelfItem
            key={p.id} p={p} cx={p.pos!.x} by={shelfY(p.pos!.s)} nonce={nonce[p.id] ?? 0} k={k}
            z={dragId === p.id ? 60 : 10 + i} editing={editing && !capturing} semArraste={semArraste}
            onStart={onStart} onMove={onMove} onDrop={onDrop} onTap={onTap}
          />
        ))}
      </View>
    </View>
  );
});

export default Shelf;

const s = StyleSheet.create({
  outer: {
    position: 'absolute', left: 16, top: 0, width: 361, borderRadius: 20, backgroundColor: '#F6D2E1',
    shadowColor: 'rgb(160,50,95)', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.16, shadowRadius: 20,
  },
  outerInset: {
    ...StyleSheet.absoluteFillObject, borderRadius: 20,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.7)',
    borderBottomWidth: 2, borderBottomColor: 'rgba(170,70,110,0.12)',
  },
  inner: { position: 'absolute', left: 26, top: 10, width: 341, borderRadius: 12, overflow: 'hidden' },
  plankFace: {
    position: 'absolute', left: 22, width: 349, height: 13, borderRadius: 3, backgroundColor: '#F4CBDC',
    shadowColor: 'rgb(150,50,90)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 7,
  },
  pending: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#FFFFFF' },
  addSlot: {
    position: 'absolute', width: ADD_W, height: ADD_H, borderRadius: 12, zIndex: 5,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(232,70,143,0.45)',
    backgroundColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  // x do modo Editar: círculo grafite translúcido com x branco (o do iPhone).
  xBadge: {
    position: 'absolute', left: -7, top: -7, width: 20, height: 20, borderRadius: 10, zIndex: 5,
    backgroundColor: 'rgba(70,58,63,0.78)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
  },
  // Convite da estante vazia: cartão branco translúcido entre a 1ª e a 3ª prateleira.
  emptyCard: {
    position: 'absolute', left: 46, width: 301, top: 92, paddingVertical: 22, paddingHorizontal: 20,
    borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.86)', alignItems: 'center',
    shadowColor: 'rgb(150,50,90)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 12,
  },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFE3EF', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 12, fontSize: 19, fontWeight: '600', letterSpacing: -0.4, color: INK, textAlign: 'center' },
  emptyText: { marginTop: 6, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: '#6E6468', textAlign: 'center' },
  emptyBtn: {
    marginTop: 16, height: 44, paddingHorizontal: 20, borderRadius: 100, backgroundColor: '#FF5EA8',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    shadowColor: 'rgb(255,94,168)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  emptyBtnText: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' },
});
