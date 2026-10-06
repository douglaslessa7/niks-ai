// ─────────────────────────────────────────────────────────────────────────────
// Alarme da rotina — réplica dos designs 44a (tela) e 44b (alarme tocando) do Claude
// Design (projeto "NIKS home redesign — rotina skincare", NiksAlarmFlo.dc.html).
// Abre pelo card "Alarme de rotina" da home.
//   • "Seus horários": os horários REAIS da rotina (users.rotina_manha_horario /
//     rotina_noite_horario, os mesmos do onboarding). Editar abre a folha com o
//     seletor de hora (passo de 5 min) e "Salvar horário" grava no banco e reagenda
//     o lembrete diário (lib/routineReminders.ts).
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
import { supabase } from '../../lib/supabase';
import { getUserId } from '../../lib/currentUser';
import { invalidateCache } from '../../lib/cache';
import { syncRoutineReminders } from '../../lib/routineReminders';
import { haptics } from '../../lib/haptics';
import { BG_STOPS, homeTheme, isNightTheme } from '../../lib/homeTheme';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const SUN = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';
const MOON = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z';
const BELL = 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0M2 4l2-2M22 4l-2-2';
const HOW = ['O alarme toca alto no seu horário', 'Você tira uma foto passando um produto no rosto', 'A NIKS confirma e o alarme para'];
const DEFAULT_AM = 7 * 60;
const DEFAULT_PM = 21 * 60;
const SUPER_KEY = 'alarme_niks_on';
const ROW = 40; // altura de cada linha do seletor

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (m: number) => `${Math.floor(m / 60)}:${pad(m % 60)}`;
function parseTime(v: unknown, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

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

// Coluna do seletor (horas ou minutos): rola com encaixe de 40pt; a linha do meio
// (faixa rosa) é a escolhida. Tocar numa linha também escolhe.
function PickerColumn({ values, value, onChange }: { values: number[]; value: number; onChange: (v: number) => void }) {
  const ref = useRef<ScrollView>(null);
  const idx = Math.max(0, values.indexOf(value));
  useEffect(() => {
    const id = setTimeout(() => ref.current?.scrollTo({ y: idx * ROW, animated: false }), 0);
    return () => clearTimeout(id);
    // só na montagem: depois disso quem manda é a rolagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const settle = (y: number) => {
    const i = Math.min(values.length - 1, Math.max(0, Math.round(y / ROW)));
    if (values[i] !== value) { haptics.select(); onChange(values[i]); }
  };
  return (
    <View style={{ width: 80, height: 200 }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: 80 }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
      >
        {values.map((v, i) => {
          const on = v === value;
          return (
            <TouchableOpacity
              key={v}
              activeOpacity={0.7}
              onPress={() => { haptics.select(); onChange(v); ref.current?.scrollTo({ y: i * ROW, animated: true }); }}
              style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: on ? 24 : 20, fontWeight: on ? '700' : '400', color: on ? INK : '#B5ADB1', letterSpacing: -0.4 }}>
                {pad(v)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
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

  const [am, setAm] = useState(DEFAULT_AM);
  const [pm, setPm] = useState(DEFAULT_PM);
  const [superOn, setSuperOn] = useState(true);
  const [edit, setEdit] = useState<'am' | 'pm' | null>(null);
  const [draft, setDraft] = useState(0);
  const [saving, setSaving] = useState(false);
  const [ringing, setRinging] = useState(false);

  // Horários reais + preferência do Alarme Niks, a cada abertura.
  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      const uid = await getUserId();
      if (uid) {
        const { data } = await supabase
          .from('users')
          .select('rotina_manha_horario, rotina_noite_horario')
          .eq('id', uid)
          .maybeSingle();
        if (active && data) {
          setAm(parseTime(data.rotina_manha_horario, DEFAULT_AM));
          setPm(parseTime(data.rotina_noite_horario, DEFAULT_PM));
        }
      }
      const v = await AsyncStorage.getItem(SUPER_KEY).catch(() => null);
      if (active) setSuperOn(v !== 'false');
    })();
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

  // ── Folha de edição do horário ───────────────────────────────────────────
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const [sheetMounted, setSheetMounted] = useState(false);
  useEffect(() => {
    if (edit) {
      setSheetMounted(true);
      Animated.timing(sheetAnim, { toValue: 1, duration: 320, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
    } else {
      Animated.timing(sheetAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setSheetMounted(false));
    }
  }, [edit, sheetAnim]);

  const openEdit = (k: 'am' | 'pm') => {
    haptics.tap();
    const cur = k === 'am' ? am : pm;
    setDraft(Math.floor(cur / 60) * 60 + Math.round((cur % 60) / 5) * 5 % 60);
    setEdit(k);
  };
  const saveEdit = async () => {
    if (!edit || saving) return;
    haptics.action();
    setSaving(true);
    const k = edit;
    const value = draft;
    try {
      const uid = await getUserId();
      if (uid) {
        const col = k === 'am' ? 'rotina_manha_horario' : 'rotina_noite_horario';
        const { error } = await supabase.from('users').update({ [col]: `${pad(Math.floor(value / 60))}:${pad(value % 60)}` }).eq('id', uid);
        if (!error) {
          if (k === 'am') setAm(value); else setPm(value);
          // Home e Rotina mostram contagens a partir desses horários.
          invalidateCache(`home:${uid}`);
          invalidateCache(`rotina:${uid}`);
          // O lembrete diário passa a tocar no horário novo.
          syncRoutineReminders(uid);
          haptics.success();
        } else {
          haptics.error();
        }
      }
    } finally {
      setSaving(false);
      setEdit(null);
    }
  };

  const dh = Math.floor(draft / 60);
  const dm = draft % 60;
  const headerH = insets.top + 15 + 36 + 10;

  const slots = [
    { k: 'am' as const, label: 'Manhã', d: SUN, t: fmt(am) },
    { k: 'pm' as const, label: 'Noite', d: MOON, t: fmt(pm) },
  ];

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
        <View style={styles.slots}>
          {slots.map((s) => (
            <Glass key={s.k} style={{ flex: 1, height: 168 }} onPress={() => openEdit(s.k)}>
              <View style={styles.slotInner}>
                <View style={styles.iconCircle}>
                  <Svg width={19} height={19} viewBox="0 0 24 24">
                    <Path d={s.d} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
                <View style={{ gap: 2 }}>
                  <Text style={styles.slotLabel}>{s.label}</Text>
                  <Text style={styles.slotTime}>{s.t}</Text>
                  <Text style={styles.slotEdit}>Editar</Text>
                </View>
              </View>
            </Glass>
          ))}
        </View>

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

      {/* ── Folha "Rotina da manhã/noite": seletor de horário ────────────── */}
      <Modal visible={sheetMounted} transparent animationType="none" onRequestClose={() => setEdit(null)}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,18,0.35)', opacity: sheetAnim }]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEdit(null)} />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, {
            paddingBottom: Math.max(insets.bottom, 20),
            transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }],
          }]}
        >
          <View style={styles.handle} />
          <Text style={{ textAlign: 'center', fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK }}>
            {edit === 'pm' ? 'Rotina da noite' : 'Rotina da manhã'}
          </Text>
          <View style={styles.pickerWrap}>
            <View style={styles.pickerBand} pointerEvents="none" />
            {sheetMounted && (
              <>
                <PickerColumn values={Array.from({ length: 24 }, (_, h) => h)} value={dh} onChange={(h) => setDraft(h * 60 + dm)} />
                <Text style={{ alignSelf: 'center', fontSize: 24, fontWeight: '700', color: INK }}>:</Text>
                <PickerColumn values={Array.from({ length: 12 }, (_, i) => i * 5)} value={dm} onChange={(m) => setDraft(dh * 60 + m)} />
              </>
            )}
          </View>
          <TouchableOpacity activeOpacity={0.85} disabled={saving} onPress={saveEdit} style={[styles.bigBtn, { marginTop: 20, opacity: saving ? 0.7 : 1 }]}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 }}>Salvar horário</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); setEdit(null); }} style={{ marginTop: 10, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: PINK_TEXT }}>Cancelar</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>

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
  slots: { marginTop: 10, marginHorizontal: 18, flexDirection: 'row', gap: 8 },
  slotInner: { flex: 1, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 13, justifyContent: 'space-between' },
  iconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  slotLabel: { fontSize: 16, fontWeight: '600', lineHeight: 19, letterSpacing: -0.4, color: INK },
  slotTime: { fontSize: 34, fontWeight: '700', lineHeight: 40, letterSpacing: -0.8, color: INK },
  slotEdit: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2, color: PINK_TEXT },

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

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingHorizontal: 21,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 14,
  },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#E3DCDF', alignSelf: 'center', marginBottom: 14 },
  pickerWrap: { marginTop: 16, height: 200, flexDirection: 'row', justifyContent: 'center', gap: 24 },
  pickerBand: { position: 'absolute', left: 0, right: 0, top: 80, height: 40, borderRadius: 10, backgroundColor: '#FDEEF4' },
  bigBtn: {
    height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },

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
