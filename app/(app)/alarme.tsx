// ─────────────────────────────────────────────────────────────────────────────
// Alarme da rotina — réplica dos designs 44a (tela) e 44b (alarme tocando) do Claude
// Design (projeto "NIKS home redesign — rotina skincare", NiksAlarmFlo.dc.html).
// Abre pelo card "Alarme de rotina" da home.
//   • "Seus horários": os horários REAIS da rotina (users.rotina_manha_horario /
//     rotina_noite_horario, os mesmos do onboarding). Editar abre a folha com o
//     seletor de hora (passo de 5 min) e "Salvar horário" grava no banco e reagenda
//     o lembrete diário (lib/routineReminders.ts). Vive em components/rotina/HorariosRotina
//     (FONTE ÚNICA — o Perfil usa o mesmo).
//   • "Alarme Niks": liga/desliga guardado no aparelho (AsyncStorage).
//   • "Testar Alarme Niks": abre a tela do alarme tocando (44b).
// Fonte = SF Pro (sistema), rosa #FF5EA8. Medidas do frame 393×852 (topo 69 = 54 + 15).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, Easing, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { BG_STOPS, homeTheme, isNightTheme } from '../../lib/homeTheme';
import HorariosRotina, { fmtHorario as fmt } from '../../components/rotina/HorariosRotina';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const BELL = 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0M2 4l2-2M22 4l-2-2';
const HOW = ['O alarme toca alto no seu horário', 'Você tira uma foto passando um produto no rosto', 'A NIKS confirma e o alarme para'];
const SUPER_KEY = 'alarme_niks_on';

// Cartão de vidro do design: branco 58% + desfoque + contorno rosa + sombra rosada.
// A sombra fica no wrapper e o recorte do desfoque no de dentro (README #20).
function Glass({ children, style, onPress }: { children: React.ReactNode; style?: object; onPress?: () => void }) {
  const inner = (
    <View style={styles.glassClip}>
      <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
  return onPress ? (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.glass, style]}>{inner}</TouchableOpacity>
  ) : (
    <View style={[styles.glass, style]}>{inner}</View>
  );
}

// Anel pulsante do alarme tocando (alPulse: escala 1→1.9, opacidade .55→0, 1,8 s).
function Pulse({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, {
        borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.55)',
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
      }]}
    />
  );
}

export default function Alarme() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [am, setAm] = useState(7 * 60); // horário da manhã (vem do HorariosRotina) — usado no teste 44b
  const [superOn, setSuperOn] = useState(true);
  const [ringing, setRinging] = useState(false);

  // Preferência do Alarme Niks, a cada abertura.
  useFocusEffect(useCallback(() => {
    let active = true;
    AsyncStorage.getItem(SUPER_KEY).catch(() => null).then((v) => { if (active) setSuperOn(v !== 'false'); });
    return () => { active = false; };
  }, []));

  // Cabeçalho fixo: transparente no topo; ao rolar ganha o fundo rosado + linha.
  const [scrolled, setScrolled] = useState(false);
  const hdrAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(hdrAnim, { toValue: scrolled ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [scrolled, hdrAnim]);

  const toggleSuper = () => {
    haptics.select();
    const next = !superOn;
    setSuperOn(next);
    AsyncStorage.setItem(SUPER_KEY, next ? 'true' : 'false').catch(() => {});
  };

  const headerH = insets.top + 15 + 36 + 10;

  // Noturno a partir das 18h, como a home (38f).
  const theme = homeTheme(isNightTheme(), 'rgba(255,226,236,0.40)');

  return (
    <View style={{ flex: 1, backgroundColor: theme.base }}>
      <StatusBar style="dark" />
      <LinearGradient colors={theme.bg} locations={BG_STOPS} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />
      <View style={[styles.circleBlob, { backgroundColor: theme.blob }]} pointerEvents="none" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => { const v = e.nativeEvent.contentOffset.y > 8; if (v !== scrolled) setScrolled(v); }}
        contentContainerStyle={{ paddingTop: headerH, paddingBottom: 112 }}
      >
        {/* ── Seus horários ─────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { marginTop: 26 }]}>Seus horários</Text>
        <HorariosRotina onHorarios={(a) => setAm(a)} />

        {/* ── Alarme Niks ───────────────────────────────────────────────── */}
        <View style={styles.superRow}>
          <Text style={styles.sectionTitleBare}>Alarme Niks</Text>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={toggleSuper}
            accessibilityRole="switch"
            accessibilityState={{ checked: superOn }}
            style={[styles.switch, { backgroundColor: superOn ? PINK : '#E6DEE2', alignItems: superOn ? 'flex-end' : 'flex-start' }]}
          >
            <View style={styles.knob} />
          </TouchableOpacity>
        </View>
        <Glass style={{ marginTop: 10, marginHorizontal: 18 }}>
          <View style={styles.superTop}>
            <View style={styles.iconCircle}>
              <Svg width={19} height={19} viewBox="0 0 24 24">
                <Path d={BELL} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <Text style={styles.superText} lineBreakStrategyIOS="push-out">
              Toca alto e só para quando você manda uma foto passando um produto no rosto.
            </Text>
          </View>
          <View style={{ paddingTop: 8, paddingHorizontal: 14, paddingBottom: 4 }}>
            {HOW.map((t, i) => (
              <View key={t} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 38, alignItems: 'center' }}>
                  <View style={styles.howNum}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: PINK_TEXT }}>{i + 1}</Text>
                  </View>
                  <HowLine hidden={i === HOW.length - 1} />
                </View>
                <Text style={styles.howText}>{t}</Text>
              </View>
            ))}
          </View>
          <View style={styles.testRow}>
            <TouchableOpacity activeOpacity={0.6} onPress={() => { haptics.action(); setRinging(true); }} style={{ height: 48, justifyContent: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '500', letterSpacing: -0.3, color: PINK_TEXT }}>Testar Alarme Niks</Text>
            </TouchableOpacity>
          </View>
        </Glass>
      </ScrollView>

      {/* ── Cabeçalho fixo: voltar · "Alarme da rotina" ──────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 15 }]}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, {
            opacity: hdrAnim, backgroundColor: theme.header,
            borderBottomWidth: 1, borderBottomColor: 'rgba(192,32,106,0.10)',
          }]}
        />
        <TouchableOpacity onPress={() => { haptics.tap(); router.navigate('/home' as any); }} activeOpacity={0.85} style={styles.backBtn} accessibilityLabel="Voltar">
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M15 5l-7 7 7 7" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '400', letterSpacing: -0.3, color: INK }}>Alarme da rotina</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* ── 44b: Alarme Niks tocando (teste) ─────────────────────────────── */}
      <Modal visible={ringing} animationType="fade" onRequestClose={() => setRinging(false)}>
        <StatusBar style="light" />
        <LinearGradient colors={['#FF8DBD', '#FF5EA8', '#E8468F']} locations={[0, 0.55, 1]} style={{ flex: 1 }}>
          <View style={{ flex: 1, alignItems: 'center', paddingTop: insets.top + 42, paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 20) + 6 }}>
            <Text style={{ fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: '#fff' }}>Hora da rotina da manhã</Text>
            <Text style={{ marginTop: 6, fontSize: 76, fontWeight: '700', lineHeight: 84, letterSpacing: -2, color: '#fff' }}>{fmt(am)}</Text>
            <Text style={{ marginTop: 6, fontSize: 17, letterSpacing: -0.3, color: '#fff', opacity: 0.92 }}>Alarme Niks</Text>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
                <Pulse delay={0} />
                <Pulse delay={900} />
                <View style={styles.ringCircle}>
                  <Svg width={54} height={54} viewBox="0 0 24 24">
                    <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" fill="none" stroke={PINK_TEXT} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                    <Circle cx={12} cy={13} r={3.5} fill="none" stroke={PINK_TEXT} strokeWidth={1.7} />
                  </Svg>
                </View>
              </View>
            </View>
            <Text style={{ fontSize: 20, fontWeight: '600', lineHeight: 25, letterSpacing: -0.5, color: '#fff', textAlign: 'center' }}>
              Para parar, tire uma foto passando um produto no rosto
            </Text>
            <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); setRinging(false); }} style={styles.ringBtn}>
              <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: PINK_TEXT }}>Abrir câmera</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Modal>
    </View>
  );
}

// Linha pontilhada entre os passos do "como funciona" (`2px dotted`) — em SVG absoluto,
// fora do cálculo de altura (senão cresce em ciclo).
function HowLine({ hidden }: { hidden: boolean }) {
  const [h, setH] = useState(0);
  return (
    <View style={{ flex: 1, width: 2, marginTop: 3, opacity: hidden ? 0 : 1 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {h > 0 && (
        <Svg width={2} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Line x1={1} y1={1} x2={1} y2={h} stroke="rgba(192,32,106,0.28)" strokeWidth={2} strokeDasharray={[0.001, 4]} strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circleWhite: {
    position: 'absolute', width: 620, height: 620, borderRadius: 310,
    left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)',
  },
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280,
    left: 190, top: -90, // cor: `theme.blob` (dia/noite)
  },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
  },

  sectionTitle: { paddingHorizontal: 18, fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK },
  sectionTitleBare: { fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK },

  glass: {
    borderRadius: 18,
    shadowColor: '#C0206A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.09, shadowRadius: 12,
  },
  glassClip: {
    flexGrow: 1, borderRadius: 18, overflow: 'hidden',
    borderWidth: 2, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.58)',
  },
  iconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },

  superRow: { marginTop: 30, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switch: { width: 51, height: 31, borderRadius: 100, padding: 2, justifyContent: 'center' },
  knob: {
    width: 27, height: 27, borderRadius: 13.5, backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 3,
  },
  superTop: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 4, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  superText: { flex: 1, fontSize: 16, lineHeight: 21, letterSpacing: -0.3, color: INK },
  howNum: {
    marginTop: 5, width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: '#F4C2D7',
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  howText: { flex: 1, paddingTop: 8, paddingBottom: 12, fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: '#3D3A3C' },
  testRow: { borderTopWidth: 1, borderTopColor: 'rgba(192,32,106,0.10)', alignItems: 'center' },

  ringCircle: {
    width: 150, height: 150, borderRadius: 75, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#78143C', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 16,
  },
  ringBtn: {
    marginTop: 22, alignSelf: 'stretch', height: 50, borderRadius: 100, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#78143C', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 8,
  },
});
