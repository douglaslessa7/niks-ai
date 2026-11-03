import { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  interpolate, interpolateColor, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler,
  useAnimatedStyle, useSharedValue, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { haptics } from '../../lib/haptics';

// ─────────────────────────────────────────────────────────────────────────────
// Roda de hora do Novo check-in (81j, "Hora do check-in"): duas colunas que rolam —
// horas e minutos — com encaixe de 44 pt, 3 linhas à vista e a faixa rosa-clara da
// linha escolhida (as medidas do seletor do design: 132 de altura, a do meio 22/600 em
// tinta, as de fora 19 em cinza). A linha do meio cresce e escurece conforme passa pela
// faixa (no UI thread). Um toque leve a cada passo, como os seletores do iOS.
// Limites: do início do dia de sessão (04:00) até agora — passar de agora volta sozinho
// para o último minuto permitido.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const CINZA = '#B5B5B5';
const ITEM = 44;

type Props = { valor: Date; min: Date; max: Date; onChange: (d: Date) => void };

function Item({ texto, i, off }: { texto: string; i: number; off: SharedValue<number> }) {
  const st = useAnimatedStyle(() => {
    const d = Math.min(1, Math.abs(off.get() / ITEM - i));
    return { color: interpolateColor(d, [0, 1], [INK, CINZA]), transform: [{ scale: interpolate(d, [0, 1], [1, 19 / 22]) }] };
  });
  return (
    <View style={styles.item}>
      <Animated.Text style={[styles.itemT, st]}>{texto}</Animated.Text>
    </View>
  );
}

function Coluna({ itens, indice, onIndice, largura }: { itens: string[]; indice: number; onIndice: (i: number) => void; largura: number }) {
  const ref = useAnimatedRef<Animated.ScrollView>();
  const off = useSharedValue(indice * ITEM);
  const arrastando = useSharedValue(false);
  const ultimo = useRef(indice);

  const fim = (y: number) => {
    const i = Math.max(0, Math.min(itens.length - 1, Math.round(y / ITEM)));
    ultimo.current = i;
    onIndice(i);
  };
  const handler = useAnimatedScrollHandler({
    onScroll: (e) => { off.set(e.contentOffset.y); },
    onBeginDrag: () => { arrastando.set(true); },
    onEndDrag: (e) => {
      arrastando.set(false);
      if (Math.abs(e.velocity?.y ?? 0) < 0.05) scheduleOnRN(fim, e.contentOffset.y);
    },
    onMomentumEnd: (e) => { scheduleOnRN(fim, e.contentOffset.y); },
  });
  // Um toque a cada linha que passa pela faixa (só quando é ela que rola).
  useAnimatedReaction(
    () => Math.round(off.get() / ITEM),
    (n, ant) => { if (ant != null && n !== ant && arrastando.get()) scheduleOnRN(haptics.select); },
  );
  // Mudança de fora (limite de agora / troca da hora): a coluna vai até o novo índice.
  useEffect(() => {
    if (indice === ultimo.current && Math.abs(off.get() - indice * ITEM) < 1) return;
    ultimo.current = indice;
    const y = indice * ITEM;
    scheduleOnUI(() => { 'worklet'; scrollTo(ref, 0, y, true); });
  }, [indice, off, ref]);

  return (
    <Animated.ScrollView
      ref={ref}
      style={{ width: largura, height: ITEM * 3, flexGrow: 0, flexShrink: 0 }}
      contentOffset={{ x: 0, y: indice * ITEM }}
      onScroll={handler}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM}
      decelerationRate="fast"
      contentContainerStyle={{ paddingVertical: ITEM }}
    >
      {itens.map((t, i) => <Item key={`${t}-${i}`} texto={t} i={i} off={off} />)}
    </Animated.ScrollView>
  );
}

export default function RodaHora({ valor, min, max, onChange }: Props) {
  // Horas do intervalo, na ordem (pode passar da meia-noite: dia de sessão vai até 04:00).
  const horas = useMemo(() => {
    const out: Date[] = [];
    const h = new Date(min); h.setMinutes(0, 0, 0);
    while (h <= max) { out.push(new Date(h)); h.setHours(h.getHours() + 1); }
    return out;
  }, [min, max]);
  const minutos = useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')), []);
  const iHora = Math.max(0, horas.findIndex((h) => h.getHours() === valor.getHours() && h.getDate() === valor.getDate()));

  const montar = (ih: number, m: number) => {
    const d = new Date(horas[ih] ?? horas[0]);
    d.setMinutes(m, 0, 0);
    if (d > max) return new Date(max);
    if (d < min) return new Date(min);
    return d;
  };

  return (
    <View style={styles.roda}>
      <View pointerEvents="none" style={styles.faixa} />
      <Coluna largura={72} itens={horas.map((h) => String(h.getHours()))} indice={iHora} onIndice={(i) => onChange(montar(i, valor.getMinutes()))} />
      <Text style={styles.doisPontos}>:</Text>
      <Coluna largura={72} itens={minutos} indice={valor.getMinutes()} onIndice={(i) => onChange(montar(iHora, i))} />
    </View>
  );
}

const styles = StyleSheet.create({
  roda: { height: ITEM * 3, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  faixa: { position: 'absolute', left: 0, right: 0, top: ITEM, height: ITEM, borderRadius: 12, backgroundColor: '#FFF0F7' },
  item: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
  itemT: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  doisPontos: { width: 14, textAlign: 'center', fontSize: 22, fontWeight: '600', color: INK, marginTop: -2 },
});
