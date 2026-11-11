// ─────────────────────────────────────────────────────────────────────────────
// Aviso "Sua sequência agora conta dias" — peça 5 do Claude Design (79l,
// NiksCartasPecas.dc.html). Aparece UMA vez, na primeira abertura depois da
// atualização, e só para quem via um número maior na chama (antes ela contava rotinas;
// agora conta dias, vindo do servidor). Folha branca sobe com mola (ζ0,9 r0,55) e o
// fundo escurece 32% em 420 ms; "Entendi" desce a folha (360 ms) e o fundo some (300 ms).
// Reduzir movimento: fades de 260/200 ms.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing, ReduceMotion } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptics } from '../../lib/haptics';

const INK = '#121212';
const PINK = '#FF5EA8';
const FLAME = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const EDR = Easing.bezier(0.32, 0.72, 0, 1);
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
const SUBIR = { stiffness: Math.pow((2 * Math.PI) / 0.55, 2), damping: (4 * Math.PI * 0.9) / 0.55, mass: 1, reduceMotion: ReduceMotion.Never };

type Props = { antes: number; agora: number; rm: boolean; onFechar: () => void };

export default function AvisoSequencia({ antes, agora, rm, onFechar }: Props) {
  const insets = useSafeAreaInsets();
  const p = useSharedValue(0);     // folha: 0 = fora (110%), 1 = no lugar
  const dim = useSharedValue(0);

  useEffect(() => {
    dim.set(withTiming(1, { duration: rm ? 260 : 420, easing: EO }));
    p.set(rm ? withTiming(1, { duration: 260, easing: EASE }) : withSpring(1, SUBIR));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha pelo "Entendi" ou tocando no fundo escuro (11/nov/2026); só uma vez.
  const fechando = useRef(false);
  const entendi = () => {
    if (fechando.current) return;
    fechando.current = true;
    haptics.action();
    dim.set(withTiming(0, { duration: rm ? 200 : 300, easing: EASE }));
    p.set(withTiming(0, { duration: rm ? 200 : 360, easing: rm ? EASE : EDR }, (ok) => { if (ok) scheduleOnRN(onFechar); }));
  };

  const dimSt = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const sheetSt = useAnimatedStyle(() => (rm
    ? { opacity: p.get() }
    : { transform: [{ translateY: `${(1 - p.get()) * 110}%` }] }) as any);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={entendi} accessibilityLabel="Fechar aviso">
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimSt]} />
      </Pressable>
      <Animated.View style={[styles.sheet, { paddingBottom: 44 + insets.bottom - 34 }, sheetSt]}>
        <View style={styles.grabber} />
        <View style={styles.icon}>
          <Svg width={30} height={30} viewBox="0 0 24 24"><Path d={FLAME} fill={PINK} /></Svg>
        </View>
        <Text style={styles.title} lineBreakStrategyIOS="standard">Sua sequência agora conta dias</Text>
        <Text style={styles.body} lineBreakStrategyIOS="standard">Cada dia com skincare vale 1. Seu número foi atualizado.</Text>
        <View style={styles.compare}>
          {/* Número antigo riscado: a linha de 2 pt do design (text-decoration-thickness) */}
          <View>
            <Text style={styles.old}>{antes}</Text>
            <View style={styles.strike} />
          </View>
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path d="M5 12h14" fill="none" stroke="#B5B5B5" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="m12 5 7 7-7 7" fill="none" stroke="#B5B5B5" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d={FLAME} fill={PINK} /></Svg>
            <Text style={styles.now}>{agora === 1 ? '1 dia' : `${agora} dias`}</Text>
          </View>
          <Text style={styles.before}>antes contava rotinas</Text>
        </View>
        {/* Estilo fixo: o NativeWind (cssInterop no Pressable) descarta `style` em forma de
            função — o botão ficava sem fundo e sem altura, invisível (bug de 11/nov/2026). */}
        <Pressable onPress={entendi} style={styles.btn} accessibilityRole="button">
          <Text style={styles.btnText}>Entendi</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(60,20,40,0.32)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, boxShadow: '0px -10px 30px rgba(190,70,120,0.12)',
    paddingTop: 10, paddingHorizontal: 24,
  },
  grabber: { width: 36, height: 5, borderRadius: 100, backgroundColor: '#F0F0F0', alignSelf: 'center' },
  icon: { marginTop: 22, width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF0F7', alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 16, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.7, color: INK },
  body: { marginTop: 8, fontSize: 15, lineHeight: 21, color: '#515151', letterSpacing: -0.2 },
  compare: {
    marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: '#F9F9F9',
  },
  old: { fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: '#B5B5B5' },
  strike: { position: 'absolute', left: 0, right: 0, top: '50%', height: 2, marginTop: 0, backgroundColor: '#B5B5B5' },
  now: { fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: INK },
  before: { marginLeft: 'auto', fontSize: 12, color: '#818181', letterSpacing: -0.1 },
  btn: {
    marginTop: 18, height: 52, borderRadius: 100, backgroundColor: PINK, boxShadow: '0px 6px 12px rgba(255,94,168,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
});
