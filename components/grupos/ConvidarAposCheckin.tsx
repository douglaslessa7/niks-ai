// ─────────────────────────────────────────────────────────────────────────────
// "Seu check-in está no grupo!" (12/nov/2026, pedido do produto). Aparece no grupo logo depois
// de ela publicar o check-in do skincare num grupo em que ela é a ÚNICA integrante (o caso de
// quem fez o skincare sem grupo, criou um para compartilhar e publicou): o convite para chamar
// as amigas, que vão ver o histórico. Mesmo cartão do "Compartilhar com o grupo?"
// (`FolhaCompartilhar`): pop-up no meio da tela, véu 200 ms, cartão crescendo de 96% com fade
// (240 ms, ease-out forte); saída em 160 ms. "Reduzir movimento": só esmaece.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptics } from '../../lib/haptics';

const INK = '#121212';
const PINK = '#FF5EA8';
const BODY = '#5E5560';
const FOTOS = [require('../../assets/review-mariana.png'), require('../../assets/home/profile-photo.png'), require('../../assets/review-larissa.png')];
const EO = Easing.bezier(0.23, 1, 0.32, 1);

export default function ConvidarAposCheckin({ aberto, onConvidar, onFechar }: {
  aberto: boolean;
  onConvidar: () => void;
  onFechar: () => void;
}) {
  const rm = useReducedMotion();
  const { width: W } = useWindowDimensions();
  const [montado, setMontado] = useState(false);
  const v = useSharedValue(0);
  const veu = useSharedValue(0);

  useEffect(() => {
    if (aberto) {
      setMontado(true);
      veu.set(0); v.set(0);
      veu.set(withTiming(1, { duration: 200 }));
      v.set(withTiming(1, { duration: rm ? 200 : 240, easing: EO }));
    } else if (montado) {
      veu.set(withTiming(0, { duration: 160 }));
      v.set(withTiming(0, { duration: 160, easing: EO }, (fim) => { if (fim) scheduleOnRN(setMontado, false); }));
    }
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const veuSt = useAnimatedStyle(() => ({ opacity: veu.get() }));
  const cardSt = useAnimatedStyle(() => (rm
    ? { opacity: v.get() }
    : { opacity: v.get(), transform: [{ scale: 0.96 + 0.04 * v.get() }] }), [rm]);
  if (!montado) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 90 }]} pointerEvents={aberto ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veu, veuSt]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityLabel="Fechar" />
      </Animated.View>
      <View style={styles.centro} pointerEvents="box-none">
        <Animated.View style={[styles.card, { width: Math.min(W - 40, 360) }, cardSt]}>
          <View style={styles.fotos}>
            {FOTOS.map((f, i) => <Image key={i} source={f} cachePolicy="memory" transition={0} style={styles.foto} />)}
          </View>
          <Text style={styles.titulo}>Seu check-in está no grupo!</Text>
          <Text style={styles.texto}>Convide suas amigas para fazer skincare com você. Elas vão ver seus check-ins e vocês acompanham a constância uma da outra.</Text>
          <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.action(); onConvidar(); }} style={styles.cta} accessibilityRole="button">
            <Text style={styles.ctaT}>Convidar amigas</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); onFechar(); }} style={styles.agoraNao} accessibilityRole="button">
            <Text style={styles.agoraNaoT}>Agora não</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: 'rgba(18,18,18,0.34)' },
  centro: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  card: {
    paddingTop: 22, paddingHorizontal: 16, paddingBottom: 16, borderRadius: 24, backgroundColor: '#fff',
    boxShadow: '0px 18px 44px rgba(18,18,18,0.18)',
  },
  fotos: { marginTop: 6, flexDirection: 'row', justifyContent: 'center', paddingLeft: 14 },
  foto: { width: 60, height: 60, marginLeft: -14, borderRadius: 30, borderWidth: 3, borderColor: '#fff', boxShadow: '0px 4px 12px rgba(200,60,120,0.14)' },
  titulo: { marginTop: 16, textAlign: 'center', fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.6, color: INK },
  texto: { marginTop: 8, marginHorizontal: 6, textAlign: 'center', fontSize: 15, lineHeight: 21, letterSpacing: -0.2, color: BODY },
  cta: { marginTop: 18, height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  ctaT: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },
  agoraNao: { marginTop: 10, height: 50, borderRadius: 100, backgroundColor: '#F2EDF0', alignItems: 'center', justifyContent: 'center' },
  agoraNaoT: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
});
