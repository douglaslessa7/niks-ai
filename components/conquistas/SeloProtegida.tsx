// ─────────────────────────────────────────────────────────────────────────────
// "Sequência protegida" — peça 3 do Claude Design (NiksCartasPecas.dc.html, 79g/79h):
// aparece enquanto a Proteção de sequência está armada.
//   • SeloProtegida: a pílula contornada com o escudo e SEQUÊNCIA PROTEGIDA (hub 79g e
//     embaixo de "N dias" na home 79h).
//   • EscudoChama: o escudinho de 18 pt no canto inferior direito da chama da home (79h).
// Entrada: mola pequena (ζ0,6 r0,42) de 50% → 100% com a opacidade dobrada, 400 ms depois
// de a tela abrir. Reduzir movimento: fade de 220 ms.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { Text, StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withSpring, withTiming, Easing, ReduceMotion } from 'react-native-reanimated';

const PINK = '#FF5EA8';
export const SHIELD = 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';

export function Escudo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={SHIELD} fill={PINK} stroke={PINK} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

// Mola do design: rigidez (2π/r)², amortecimento 4πζ/r.
const POP = { stiffness: Math.pow((2 * Math.PI) / 0.42, 2), damping: (4 * Math.PI * 0.6) / 0.42, mass: 1, reduceMotion: ReduceMotion.Never };

function usePop(run: number, rm: boolean, animar: boolean) {
  const p = useSharedValue(animar ? 0 : 1);
  useEffect(() => {
    if (!animar) { p.set(1); return; }
    p.set(0);
    p.set(rm ? withDelay(400, withTiming(1, { duration: 220, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })) : withDelay(400, withSpring(1, POP)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, rm, animar]);
  return useAnimatedStyle(() => {
    const v = p.get();
    if (rm) return { opacity: v };
    return { opacity: Math.min(1, v * 2), transform: [{ scale: 0.5 + 0.5 * v }] };
  });
}

type Props = { run?: number; rm: boolean; animar?: boolean; origem?: 'left' | 'center'; style?: ViewStyle };

export default function SeloProtegida({ run = 0, rm, animar = true, origem = 'center', style }: Props) {
  const st = usePop(run, rm, animar);
  return (
    <Animated.View style={[styles.selo, { transformOrigin: origem === 'left' ? 'left center' : 'center' }, style, st]}>
      <Escudo size={13} />
      <Text style={styles.seloText}>SEQUÊNCIA PROTEGIDA</Text>
    </Animated.View>
  );
}

export function EscudoChama({ run = 0, rm }: { run?: number; rm: boolean }) {
  const st = usePop(run, rm, true);
  return (
    <Animated.View pointerEvents="none" style={[styles.badge, st]}>
      <Escudo size={11} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  selo: {
    alignSelf: 'flex-start', height: 24, paddingLeft: 8, paddingRight: 10, borderRadius: 100, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: PINK, flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  seloText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, color: PINK },
  badge: {
    position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF',
    boxShadow: '0px 2px 6px rgba(120,60,72,0.22)', alignItems: 'center', justifyContent: 'center',
  },
});

