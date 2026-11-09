// ─────────────────────────────────────────────────────────────────────────────
// Card "Suas missões" — topo da home, logo abaixo do cabeçalho (06/nov/2026).
// Quatro desafios com progresso (08/nov/2026); o card guia o PRÓXIMO: tocar nele começa a
// DICA (`lib/guia.ts`), o recorte mostra onde tocar e ela faz a ação de verdade. Feito fora de
// ordem também conta. Concluídos os 4, "Missões concluídas!" e a carta rara abre sozinha.
//
// Animação (skill animate-expo):
//   • entra uma vez: esmaece + sobe 8 pt (240 ms, ease-out forte) — evita o "pulo" do card
//     aparecendo depois do resto;
//   • a barra enche por `scaleX` a partir da esquerda (300 ms, ease-out);
//   • a missão que ACABOU de ser concluída (feita agora, com o card na tela) ganha o check
//     com uma mola curta (0,6 → 1) e `haptics.success()` no mesmo quadro;
//   • "Reduzir movimento": só esmaece, sem subir e sem mola.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { proximoDesafio, quantasFeitas, textoProgressoRotina, type DesafioId, type EstadoMissoes } from '../../lib/missoes';

const INK = '#121212';
const MUTE = '#8A8387';
const PINK = '#FF5EA8';
const EO = Easing.bezier(0.23, 1, 0.32, 1);

export type MissaoId = DesafioId;
const TITULOS: Record<MissaoId, string> = {
  d1: 'Escanear um produto',
  d2: 'Colocar na estante',
  d3: 'Colocar os produtos na rotina',
  d4: 'Fazer o skincare',
};

function Check({ feito, numero }: { feito: boolean; numero: number }) {
  const reduzir = useReducedMotion();
  const antes = useRef(feito);
  const esc = useSharedValue(1);
  useEffect(() => {
    // Só a transição "faltava → feita" com o card na tela ganha a mola e a vibração.
    if (feito && !antes.current) {
      haptics.success();
      if (!reduzir) {
        esc.set(0.6);
        esc.set(withSpring(1, { duration: 380, dampingRatio: 0.55 }));
      }
    }
    antes.current = feito;
  }, [feito, reduzir, esc]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: esc.get() }] }));
  return (
    <Animated.View style={[styles.check, feito ? styles.checkFeito : styles.checkFalta, st]}>
      {feito ? (
        <Svg width={14} height={14} viewBox="0 0 24 24">
          <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : (
        <Text style={styles.checkNum}>{numero}</Text>
      )}
    </Animated.View>
  );
}

export default function CardMissoes({ estado, onMissao }: { estado: EstadoMissoes; onMissao: (m: MissaoId) => void }) {
  const reduzir = useReducedMotion();
  const feitas = quantasFeitas(estado);
  const concluidas = !!estado.concluidas_em;

  // Entrada (uma vez).
  const entra = useSharedValue(0);
  useEffect(() => { entra.set(withTiming(1, { duration: 240, easing: EO })); }, [entra]);
  const entraSt = useAnimatedStyle(() => (reduzir
    ? { opacity: entra.get() }
    : { opacity: entra.get(), transform: [{ translateY: 8 * (1 - entra.get()) }] }), [reduzir]);

  // Barra de progresso.
  const prog = useSharedValue(feitas / 4);
  useEffect(() => { prog.set(withTiming(feitas / 4, { duration: 300, easing: EO })); }, [feitas, prog]);
  const barraSt = useAnimatedStyle(() => ({ transform: [{ scaleX: prog.get() }] }));

  const proximo = proximoDesafio(estado);
  const linhas: { id: MissaoId; feito: boolean; sub: string | null }[] = [
    { id: 'd1', feito: estado.d1, sub: null },
    { id: 'd2', feito: estado.d2, sub: null },
    { id: 'd3', feito: estado.d3, sub: textoProgressoRotina(estado) },
    { id: 'd4', feito: estado.d4, sub: null },
  ];

  return (
    <Animated.View style={[styles.sombra, entraSt]}>
      <View style={styles.card}>
        <View style={styles.topo}>
          <Text style={styles.titulo}>{concluidas ? 'Missões concluídas!' : 'Suas missões'}</Text>
          <Text style={styles.contagem}>{`${feitas}/4`}</Text>
        </View>
        <View style={styles.trilho}>
          <Animated.View style={[styles.barra, barraSt]} />
        </View>
        {linhas.map((l, i) => {
          const vez = l.id === proximo;
          return (
          <TouchableOpacity
            key={l.id}
            activeOpacity={0.7}
            disabled={!vez}
            onPress={() => { haptics.select(); onMissao(l.id); }}
            style={[styles.linha, i > 0 && styles.linhaFio]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !vez, checked: l.feito }}
            accessibilityLabel={`${TITULOS[l.id]}${l.feito ? ', concluída' : ''}`}
          >
            <Check feito={l.feito} numero={i + 1} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.missao, !vez && styles.missaoFeita]} numberOfLines={2}>{TITULOS[l.id]}</Text>
              {!!l.sub && <Text style={styles.sub}>{l.sub}</Text>}
            </View>
            {vez && (
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path d="M9 6l6 6-6 6" fill="none" stroke={PINK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            )}
          </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sombra: {
    marginHorizontal: 20, marginTop: 14, borderRadius: 22, backgroundColor: '#fff',
    boxShadow: '0px 8px 22px rgba(192,32,106,0.10)',
  },
  card: { borderRadius: 22, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 6, overflow: 'hidden' },
  topo: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  titulo: { fontSize: 18, fontWeight: '700', letterSpacing: -0.45, color: INK },
  contagem: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: '#E8468F', fontVariant: ['tabular-nums'] },
  trilho: { marginTop: 10, marginBottom: 6, height: 6, borderRadius: 3, backgroundColor: '#F6E3EC', overflow: 'hidden' },
  barra: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', borderRadius: 3, backgroundColor: PINK, transformOrigin: 'left center' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  linhaFio: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(18,18,18,0.08)' },
  check: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  checkFeito: { backgroundColor: PINK },
  checkFalta: { borderWidth: 1.5, borderColor: '#F4C2D7', backgroundColor: '#fff' },
  checkNum: { fontSize: 13, fontWeight: '700', color: '#E8468F' },
  missao: { fontSize: 16, fontWeight: '600', letterSpacing: -0.35, color: INK },
  missaoFeita: { color: MUTE },
  sub: { marginTop: 2, fontSize: 13, letterSpacing: -0.1, color: MUTE },
});
