// ─────────────────────────────────────────────────────────────────────────────
// Modo "Editar rotina" (plano da Rotina, Fase 3 — decisão 6): os passos de UM período
// em cards que tremem (padrão da tela inicial do iPhone — o mesmo do modo Editar da
// estante), com:
//   · x (canto de cima à esquerda) → `onRemover` (a tela pede a confirmação);
//   · alça ≡ (direita) → arrastar reordena; os outros cards abrem espaço;
//   · tocar no card → `onAbrir` (editar nome, dias e produto).
// Linhas de altura FIXA (o nome cabe em 1 linha) — é isso que deixa a troca de lugar
// previsível. Enquanto arrasta, `onArrastando(true)` trava a rolagem da tela.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';

const INK = '#121212';
const PINK_TEXT = '#E8468F';
const MUTED = '#8A8387';

const ROW_H = 72;
const GAP = 10;
const SLOT = ROW_H + GAP;

export type ItemEditavel = {
  id: string;
  nome: string;
  sub: string;            // produto (ou "Sem produto") · dias
  img: string | null;     // foto do produto (recorte sem fundo quando há)
};

const clamp = (v: number, a: number, b: number) => {
  'worklet';
  return Math.max(a, Math.min(b, v));
};

function Linha({ item, total, posicoes, onSoltar, onArrastando, onRemover, onAbrir }: {
  item: ItemEditavel;
  total: number;
  posicoes: SharedValue<Record<string, number>>;
  onSoltar: (pos: Record<string, number>) => void;
  onArrastando: (ativo: boolean) => void;
  onRemover: (id: string) => void;
  onAbrir: (id: string) => void;
}) {
  const top = useSharedValue((posicoes.value[item.id] ?? 0) * SLOT);
  const inicio = useSharedValue(0);
  const arrastando = useSharedValue(0);
  const wig = useSharedValue(0);

  // Tremidinha (cada card num tempo diferente, como os ícones do iPhone).
  useEffect(() => {
    wig.value = withDelay(Math.random() * 160, withRepeat(withSequence(
      withTiming(-0.7, { duration: 120, easing: Easing.inOut(Easing.quad) }),
      withTiming(0.7, { duration: 120, easing: Easing.inOut(Easing.quad) }),
    ), -1, true));
    return () => cancelAnimation(wig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outro card mudou a posição deste → desliza até o novo lugar.
  useAnimatedReaction(
    () => posicoes.value[item.id],
    (agora, antes) => {
      if (agora !== antes && agora != null && !arrastando.value) {
        top.value = withTiming(agora * SLOT, { duration: 180, easing: Easing.out(Easing.quad) });
      }
    },
  );

  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      arrastando.value = 1;
      inicio.value = top.value;
      runOnJS(onArrastando)(true);
      runOnJS(haptics.select)();
    })
    .onUpdate((e) => {
      top.value = clamp(inicio.value + e.translationY, -SLOT * 0.4, (total - 1) * SLOT + SLOT * 0.4);
      const novo = clamp(Math.round(top.value / SLOT), 0, total - 1);
      const velho = posicoes.value[item.id];
      if (novo !== velho) {
        const prox: Record<string, number> = { ...posicoes.value };
        for (const k in prox) if (prox[k] === novo) prox[k] = velho;
        prox[item.id] = novo;
        posicoes.value = prox;
      }
    })
    .onFinalize(() => {
      if (!arrastando.value) return;
      arrastando.value = 0;
      top.value = withTiming((posicoes.value[item.id] ?? 0) * SLOT, { duration: 180 });
      runOnJS(onArrastando)(false);
      runOnJS(onSoltar)(posicoes.value);
    });

  const estilo = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: arrastando.value ? 10 : 1,
    transform: [{ scale: arrastando.value ? 1.03 : 1 }, { rotate: `${arrastando.value ? 0 : wig.value}deg` }],
    shadowOpacity: arrastando.value ? 0.16 : 0.06,
  }));

  return (
    <Animated.View style={[s.linha, estilo]}>
      <TouchableOpacity activeOpacity={0.85} onPress={() => onAbrir(item.id)} style={s.corpo} accessibilityLabel={`Editar ${item.nome}`}>
        <View style={s.tile}>
          {item.img
            ? <ExpoImage source={{ uri: item.img }} style={{ width: 40, height: 40 }} contentFit="contain" />
            : <Text style={{ fontSize: 20, color: PINK_TEXT }}>+</Text>}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={s.nome} numberOfLines={1}>{item.nome}</Text>
          <Text style={s.sub} numberOfLines={1}>{item.sub}</Text>
        </View>
      </TouchableOpacity>
      <GestureDetector gesture={pan}>
        <View style={s.alca} accessibilityLabel={`Arrastar ${item.nome}`} hitSlop={8}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={2} strokeLinecap="round"><Path d="M5 8h14M5 12h14M5 16h14" /></Svg>
        </View>
      </GestureDetector>
      <TouchableOpacity onPress={() => onRemover(item.id)} hitSlop={10} style={s.x} accessibilityLabel={`Remover ${item.nome}`}>
        <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ListaEditavel({ itens, onReordenar, onArrastando, onRemover, onAbrir }: {
  itens: ItemEditavel[];
  onReordenar: (ids: string[]) => void;
  onArrastando: (ativo: boolean) => void;
  onRemover: (id: string) => void;
  onAbrir: (id: string) => void;
}) {
  const posicoes = useSharedValue<Record<string, number>>(Object.fromEntries(itens.map((it, i) => [it.id, i])));
  const assinatura = itens.map((it) => it.id).join('|');
  useEffect(() => {
    posicoes.value = Object.fromEntries(itens.map((it, i) => [it.id, i]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  const onSoltar = (pos: Record<string, number>) => {
    const ids = Object.keys(pos).sort((a, b) => pos[a] - pos[b]);
    if (ids.join('|') !== assinatura) onReordenar(ids);
  };

  return (
    <View style={{ height: Math.max(0, itens.length * SLOT - GAP) }}>
      {itens.map((it) => (
        <Linha
          key={it.id} item={it} total={itens.length} posicoes={posicoes}
          onSoltar={onSoltar} onArrastando={onArrastando} onRemover={onRemover} onAbrir={onAbrir}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  linha: {
    position: 'absolute', left: 0, right: 0, height: ROW_H, borderRadius: 16, backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowRadius: 8,
  },
  corpo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12 },
  tile: { width: 50, height: 50, borderRadius: 11, backgroundColor: '#FFF5F9', alignItems: 'center', justifyContent: 'center' },
  nome: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: INK },
  sub: { fontSize: 13, fontWeight: '500', color: MUTED },
  alca: { width: 48, height: ROW_H, alignItems: 'center', justifyContent: 'center' },
  // x do modo Editar: o mesmo círculo grafite da estante.
  x: {
    position: 'absolute', left: -7, top: -7, width: 22, height: 22, borderRadius: 11, zIndex: 5,
    backgroundColor: 'rgba(70,58,63,0.78)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
  },
});

