// ─────────────────────────────────────────────────────────────────────────────
// Horários da rotina — os 2 cartões "Manhã / Noite" do Alarme (design 44a) + a folha
// com o seletor de hora (passo de 5 min). FONTE ÚNICA: usado no Alarme e no Perfil
// ("Mudar o horário da minha rotina" — enquanto o card do Alarme está ocultado na home).
//   • Lê os horários REAIS (users.rotina_manha_horario / rotina_noite_horario, os
//     mesmos do onboarding) a cada foco da tela.
//   • "Salvar horário" grava no banco, invalida home/rotina e reagenda o lembrete
//     diário (lib/routineReminders.ts).
// Fonte = SF Pro (sistema), rosa #FF5EA8.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, Easing, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { getUserId } from '../../lib/currentUser';
import { invalidateCache } from '../../lib/cache';
import { syncRoutineReminders } from '../../lib/routineReminders';
import { haptics } from '../../lib/haptics';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const SUN = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';
const MOON = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z';
const DEFAULT_AM = 7 * 60;
const DEFAULT_PM = 21 * 60;
const ROW = 40; // altura de cada linha do seletor

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtHorario = (m: number) => `${Math.floor(m / 60)}:${pad(m % 60)}`;
function parseTime(v: unknown, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
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

// `onHorarios`: avisa a tela dos horários carregados/salvos (o Alarme usa o da manhã
// no teste do alarme tocando).
export default function HorariosRotina({ onHorarios }: { onHorarios?: (am: number, pm: number) => void }) {
  const insets = useSafeAreaInsets();
  const [am, setAm] = useState(DEFAULT_AM);
  const [pm, setPm] = useState(DEFAULT_PM);
  const [edit, setEdit] = useState<'am' | 'pm' | null>(null);
  const [draft, setDraft] = useState(0);
  const [saving, setSaving] = useState(false);

  const onHorariosRef = useRef(onHorarios);
  onHorariosRef.current = onHorarios;
  useEffect(() => { onHorariosRef.current?.(am, pm); }, [am, pm]);

  // Horários reais, a cada abertura da tela.
  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      const uid = await getUserId();
      if (!uid) return;
      const { data } = await supabase
        .from('users')
        .select('rotina_manha_horario, rotina_noite_horario')
        .eq('id', uid)
        .maybeSingle();
      if (active && data) {
        setAm(parseTime(data.rotina_manha_horario, DEFAULT_AM));
        setPm(parseTime(data.rotina_noite_horario, DEFAULT_PM));
      }
    })();
    return () => { active = false; };
  }, []));

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

  const slots = [
    { k: 'am' as const, label: 'Manhã', d: SUN, t: fmtHorario(am) },
    { k: 'pm' as const, label: 'Noite', d: MOON, t: fmtHorario(pm) },
  ];

  return (
    <>
      <View style={styles.slots}>
        {slots.map((s) => (
          // Cartão de vidro: a sombra fica no wrapper e o recorte do desfoque no de dentro (README #20).
          <TouchableOpacity key={s.k} activeOpacity={0.85} onPress={() => openEdit(s.k)} style={[styles.glass, { flex: 1, height: 168 }]}>
            <View style={styles.glassClip}>
              <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
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
            </View>
          </TouchableOpacity>
        ))}
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
    </>
  );
}

const styles = StyleSheet.create({
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
});
