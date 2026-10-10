// ─────────────────────────────────────────────────────────────────────────────
// Calendário — réplica do design 42b do Claude Design (projeto "NIKS home redesign —
// rotina skincare", NiksCalendarFlo.dc.html com hdr="b"): cabeçalho em degradê com
// fechar + selo "N dias seguidos" + letras da semana, legenda e os meses (3 para
// trás, o atual e o próximo), abrindo rolado no mês atual.
// Abre pelos dias da semana e pela sequência da home. Tela cheia, sem a navbar.
// Dados reais: o histórico de rotinas concluídas (lib/routineProgress) — rosa cheio =
// manhã e noite; anel = só uma das duas. Fonte = SF Pro (sistema), rosa #FF5EA8.
// Medidas do frame 393×852: cabeçalho = barra de status (54) + barra (54) + letras (22).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import {
  getRoutineHistory, routineDayStreak, routinesDoneOn, sessionDate, dateKey, type RoutineHistory,
} from '../../lib/routineProgress';

const INK = '#121212';
const PINK = '#FF5EA8';
const SOFT = '#6E6468';
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS_BACK = 3;
const FLAME = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';

type Cell = { n: number; today: boolean; v: 0 | 1 | 2; future: boolean } | null;

// Quebra as células do mês em semanas de 7 (a última completada com vazios).
function chunkWeeks(cells: Cell[]): Cell[][] {
  const out: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const w = cells.slice(i, i + 7);
    while (w.length < 7) w.push(null);
    out.push(w);
  }
  return out;
}

export default function Calendario() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const [hist, setHist] = useState<RoutineHistory>({});
  const [now, setNow] = useState(() => new Date());

  // Tela cheia (no design o calendário cobre a navbar) + histórico fresco a cada abertura.
  useFocusEffect(useCallback(() => {
    setTabBarVisible(false);
    setNow(new Date());
    getRoutineHistory().then(setHist);
    userMovedRef.current = false;
    scrollToCurrent();
    return () => setTabBarVisible(true);
  }, [setTabBarVisible]));

  // Abre rolado no mês atual (`target.offsetTop - 6` do design). O pedido é refeito a
  // cada mudança de altura do conteúdo — feito uma vez só, o ScrollView o limitava à
  // altura que já conhecia e parava no mês anterior. Para quando a usuária rola.
  const scrollRef = useRef<ScrollView>(null);
  const targetYRef = useRef<number | null>(null);
  const userMovedRef = useRef(false);
  const scrollToCurrent = () => {
    if (userMovedRef.current || targetYRef.current == null) return;
    scrollRef.current?.scrollTo({ y: targetYRef.current, animated: false });
  };
  const onCurrentMonthLayout = (y: number) => {
    targetYRef.current = Math.max(0, y - 6);
    scrollToCurrent();
  };

  const today = sessionDate(now);
  const todayKey = dateKey(today);
  // Só os DIAS SEGUIDOS (dias com alguma rotina) — o streak em pontos fica no selo
  // da chama da home e da Rotina.
  const dayStreak = routineDayStreak(hist, now);

  const months = [];
  for (let i = MONTHS_BACK; i >= -1; i--) {
    const first = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const y = first.getFullYear();
    const m = first.getMonth();
    const len = new Date(y, m + 1, 0).getDate();
    const cells: Cell[] = [];
    for (let b = 0; b < first.getDay(); b++) cells.push(null);
    for (let d = 1; d <= len; d++) {
      const date = new Date(y, m, d);
      const k = dateKey(date);
      const future = k > todayKey;
      cells.push({ n: d, today: k === todayKey, future, v: future ? 0 : (routinesDoneOn(hist, date) as 0 | 1 | 2) });
    }
    months.push({ key: `${y}-${m}`, title: MONTHS[m], current: i === 0, first: i === MONTHS_BACK, cells });
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="dark" />

      {/* ── Cabeçalho: fechar · "N dias seguidos" · letras da semana ────────── */}
      <LinearGradient
        colors={['#FFE3EF', '#FFEAF2', '#FDF2F6']}
        locations={[0, 0.55, 1]}
        style={[styles.header, { paddingTop: insets.top }]}
      >
        <View style={styles.bar}>
          <TouchableOpacity
            onPress={() => { haptics.tap(); router.navigate('/home' as any); }}
            activeOpacity={0.85}
            style={styles.close}
            accessibilityLabel="Fechar"
          >
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Path d="M5.5 5.5l13 13M18.5 5.5l-13 13" fill="none" stroke={INK} strokeWidth={1.9} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
          <View style={styles.streakPill}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path d={FLAME} fill={PINK} stroke={PINK} strokeWidth={1.4} strokeLinejoin="round" />
            </Svg>
            <Text style={styles.streakText}>{`${dayStreak} ${dayStreak === 1 ? 'dia seguido' : 'dias seguidos'}`}</Text>
          </View>
        </View>
        <View style={styles.letters}>
          {LETTERS.map((l, i) => (
            <Text key={i} style={styles.letter}>{l}</Text>
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToCurrent}
        onScrollBeginDrag={() => { userMovedRef.current = true; }}
      >
        {/* ── Legenda ───────────────────────────────────────────────────── */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PINK }]} />
            <Text style={styles.legendText}>Manhã e noite</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { borderWidth: 2, borderColor: PINK }]} />
            <Text style={styles.legendText}>Só uma das duas</Text>
          </View>
        </View>

        {/* ── Meses ─────────────────────────────────────────────────────── */}
        {months.map((mo) => (
          <View
            key={mo.key}
            style={!mo.first && { borderTopWidth: 1, borderTopColor: '#EFE8EB' }}
            onLayout={mo.current ? (e) => onCurrentMonthLayout(e.nativeEvent.layout.y) : undefined}
          >
            <Text style={[styles.monthTitle, mo.current ? { fontSize: 18, fontWeight: '700' } : { fontSize: 17, fontWeight: '400' }]}>
              {mo.title}
            </Text>
            {/* Semanas em linhas explícitas de 7 (flexWrap com folga zero quebra no
                Fabric — README #29). */}
            <View style={styles.grid}>
              {chunkWeeks(mo.cells).map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row' }}>
              {week.map((c, i) => (
                <View key={i} style={styles.cell}>
                  {c?.today && <Text style={styles.todayLabel}>HOJE</Text>}
                  {c && (
                    <View
                      style={[
                        styles.dot,
                        c.v === 2 && { backgroundColor: PINK },
                        c.v === 1 && { borderWidth: 2, borderColor: PINK },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: c.today ? '700' : '400',
                          letterSpacing: -0.3,
                          color: c.v === 2 ? '#FFFFFF' : c.v === 1 ? '#C0206A' : c.future ? '#B5AEB1' : INK,
                        }}
                      >
                        {c.n}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
              </View>
              ))}
            </View>
          </View>
        ))}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { zIndex: 5, borderBottomWidth: 1, borderBottomColor: '#F0E4EA' },
  bar: { height: 54, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', left: 12, top: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  // Sequência integrada ao cabeçalho: sem a pílula branca atrás (pedido do usuário).
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36 },
  streakText: { fontSize: 17, fontWeight: '600', letterSpacing: -0.35, color: INK },
  // Respiro entre a sequência e as letras da semana, e embaixo delas (pedido do usuário).
  letters: { marginTop: 10, height: 26, paddingBottom: 4, flexDirection: 'row', paddingHorizontal: 19 },
  letter: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500', color: SOFT },

  legend: { flexDirection: 'row', justifyContent: 'center', gap: 18, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 13, color: SOFT },

  monthTitle: { paddingTop: 18, height: 42, lineHeight: 24, textAlign: 'center', letterSpacing: -0.4, color: INK },
  grid: { marginTop: 10, paddingHorizontal: 19, paddingBottom: 8 },
  cell: { flex: 1, height: 68, alignItems: 'center', justifyContent: 'center' },
  todayLabel: { position: 'absolute', top: 2, left: 0, right: 0, textAlign: 'center', fontSize: 11, fontWeight: '700', letterSpacing: 0.3, color: INK },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
