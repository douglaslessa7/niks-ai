import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Animated, Easing, StyleSheet, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { useUserId } from '../../lib/currentUser';
import { useEstadoCartas } from '../../lib/cartasServidor';
import { chavePerfilGrupos, perfilGrupos, type PerfilGrupos } from '../../lib/gruposServidor';
import { dateKey, sessionDate } from '../../lib/routineProgress';

// ─────────────────────────────────────────────────────────────────────────────
// Aba Grupos · seu perfil — réplica de 80q/80r (Claude Design, "NIKS home redesign",
// NiksGrupoV2.dc.html, rodada 80). O último ícone da navbar abre aqui. Medidas do frame
// 393×852; o conteúdo começa em 72 = barra de status (54) + 18 → `insets.top + 18`.
//   · Foto grande (132), nome, nível INDIVIDUAL com a mini barra (toque abre Sua
//     caminhada), três números (Check-ins, Dias ativos, Dias seguidos — de check-in),
//     "Seus grupos" e o calendário do mês com a foto do check-in no lugar do número
//     (hoje com anel rosa). A câmera faz o check-in. Engrenagem → Perfil.
//   · Ao abrir: a foto entra primeiro, depois nome e números (80 ms) e as fotos do
//     calendário em cascata de 25 ms. As setas trocam o mês: a grade desliza 14 pt do
//     lado de onde veio (260 ms). Reduzir movimento: só fade.
// Dados reais: função `grupos` (`perfil`), fotos por URL assinada.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const WDS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const GEAR = 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z';
const PEOPLE = ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'];
const CAMERA = 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z';

function Icon({ d, size, color, sw, circle }: { d: string | string[]; size: number; color: string; sw: number; circle?: [number, number, number] }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(Array.isArray(d) ? d : [d]).map((p, i) => (
        <Path key={i} d={p} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {circle && <Circle cx={circle[0]} cy={circle[1]} r={circle[2]} fill="none" stroke={color} strokeWidth={sw} />}
    </Svg>
  );
}

function useReduceMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setRm).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setRm);
    return () => sub.remove();
  }, []);
  return rm;
}

// Foto do check-in no calendário: acende ao montar (fade + 0,9 → 1), 25 ms × posição.
function FotoDia({ uri, hoje, ordem, rm }: { uri: string; hoje: boolean; ordem: number; rm: boolean }) {
  const v = useRef(new Animated.Value(rm ? 1 : 0)).current;
  useEffect(() => {
    if (rm) return;
    Animated.timing(v, { toValue: 1, duration: 260, delay: 120 + ordem * 25, easing: EO, useNativeDriver: true }).start();
  }, [v, ordem, rm]);
  return (
    <Animated.View style={[styles.cellPhoto, hoje && styles.cellToday, {
      opacity: v, transform: rm ? [] : [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
    }]}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
    </Animated.View>
  );
}

const mesKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

export default function Grupos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const rm = useReduceMotion();
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);

  const hoje = sessionDate();
  const hojeKey = dateKey(hoje);
  const [mes, setMes] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const mk = mesKey(mes);
  const fetcher = useCallback(() => perfilGrupos(mk), [mk]);
  const { data: p, refresh } = useCachedQuery<PerfilGrupos>(userId ? chavePerfilGrupos(userId, mk) : null, fetcher, { staleMs: 0, enabled: Boolean(userId) });
  const { data: estado } = useEstadoCartas();
  const pontos = estado?.pontos;
  const frac = pontos ? Math.max(0, Math.min(1, (pontos.total - pontos.piso) / Math.max(1, pontos.teto - pontos.piso))) : 0;

  // ── Entrada: foto (0), nome+nível (1), números e o resto (2) ─────────────────
  const hd = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
      hd.forEach((v) => v.setValue(0));
      Animated.stagger(rm ? 0 : 80, hd.map((v) => Animated.timing(v, {
        toValue: 1, duration: rm ? 220 : 420, easing: rm ? Easing.ease : EO, useNativeDriver: true,
      }))).start();
      void refresh?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rm])
  );
  const hdStyle = (i: number) => (rm ? { opacity: hd[i] } : {
    opacity: hd[i],
    transform: i === 0
      ? [{ scale: hd[i].interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }]
      : [{ translateY: hd[i].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  });

  // ── Troca de mês: a grade desliza 14 pt do lado de onde veio; fotos em cascata ──
  const slide = useRef(new Animated.Value(0)).current;
  const trocar = (dir: -1 | 1) => {
    const alvo = new Date(mes.getFullYear(), mes.getMonth() + dir, 1);
    haptics.select();
    setMes(alvo);
    slide.setValue(rm ? 0 : dir * 14);
    Animated.timing(slide, { toValue: 0, duration: 260, easing: EO, useNativeDriver: true }).start();
  };
  const primeiro = p?.primeiro_mes ? new Date(`${p.primeiro_mes}T12:00:00`) : null;
  const podeVoltar = !!primeiro && mes > new Date(primeiro.getFullYear(), primeiro.getMonth(), 1);
  const podeAvancar = mes < new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  // ── Células do calendário (domingo primeiro, como no design) ───────────────────
  const fotos = new Map((p && p.mes === mk ? p.dias : []).map((d) => [d.dia, d.foto_url]));
  const inicio = mes.getDay();
  const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const cells: ({ n: number; key: string; foto: string | null; today: boolean; future: boolean } | null)[] = [
    ...Array.from({ length: inicio }, () => null),
    ...Array.from({ length: total }, (_, i) => {
      const key = `${mk.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
      return { n: i + 1, key, foto: fotos.get(key) ?? null, today: key === hojeKey, future: key > hojeKey };
    }),
  ];
  // Fotos do mês carregadas: a grade remonta e cada foto acende sozinha (cascata de 25 ms).
  const carregado = !!p && p.mes === mk;

  const nGrupos = p?.grupos ?? 0;
  const stats = [
    { n: p?.checkins ?? 0, l: 'Check-ins' },
    { n: p?.dias_ativos ?? 0, l: 'Dias ativos' },
    { n: p?.dias_seguidos ?? 0, l: 'Dias seguidos' },
  ];
  let iFoto = 0;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient colors={['#FCE3EE', '#FDD5E6', '#FCDFEA', '#F9F1F4']} locations={[0, 0.45, 0.72, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleBlob} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 170 }}>
        <View style={styles.topRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.push('/perfil' as any); }} style={styles.roundBtn} accessibilityLabel="Perfil e configurações">
            <Icon d={GEAR} size={19} color={INK} sw={1.7} circle={[12, 12, 3]} />
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Animated.View style={[styles.photoRing, hdStyle(0)]}>
            {p?.foto ? <Image source={{ uri: p.foto }} style={styles.photo} /> : <View style={[styles.photo, { backgroundColor: '#F6D3E1' }]} />}
          </Animated.View>
          <Animated.Text style={[styles.name, hdStyle(1)]} numberOfLines={1}>{p?.nome ?? ''}</Animated.Text>
          <Animated.View style={hdStyle(1)}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.push('/caminhada' as any); }} style={styles.nivel} accessibilityLabel="Sua caminhada">
              <Text style={styles.nivelText}>{pontos ? `Nível ${pontos.nivel} · ${pontos.titulo}` : p ? `Nível ${p.nivel} · ${p.titulo}` : ' '}</Text>
              <View style={styles.miniTrack}><View style={[styles.miniFill, { transform: [{ scaleX: frac }] }]} /></View>
              <Icon d="M9 6l6 6-6 6" size={10} color={MUTE} sw={2.6} />
            </TouchableOpacity>
          </Animated.View>
          <Animated.View style={[styles.stats, hdStyle(2)]}>
            {stats.map((x) => (
              <View key={x.l} style={styles.stat}>
                <Text style={styles.statN}>{x.n}</Text>
                <Text style={styles.statL}>{x.l}</Text>
              </View>
            ))}
          </Animated.View>
        </View>

        <Animated.View style={hdStyle(2)}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); router.push('/seus-grupos' as any); }} style={styles.seus}>
            <View style={styles.seusIcon}><Icon d={PEOPLE} size={20} color="#fff" sw={1.9} circle={[9, 7, 4]} /></View>
            <Text style={styles.seusText}>Seus grupos</Text>
            <Text style={styles.seusCount}>{`${nGrupos} ${nGrupos === 1 ? 'grupo' : 'grupos'}`}</Text>
            <Icon d="M9 6l6 6-6 6" size={16} color={PINK} sw={2.4} />
          </TouchableOpacity>

          <View style={styles.mesRow}>
            <TouchableOpacity activeOpacity={0.6} disabled={!podeVoltar} onPress={() => trocar(-1)} style={[styles.roundBtn, { opacity: podeVoltar ? 1 : 0.35 }]} accessibilityLabel="Mês anterior">
              <Icon d="m15 18-6-6 6-6" size={16} color={INK} sw={2.2} />
            </TouchableOpacity>
            <Text style={styles.mesLabel}>{`${MESES[mes.getMonth()]} ${mes.getFullYear()}`}</Text>
            <TouchableOpacity activeOpacity={0.6} disabled={!podeAvancar} onPress={() => trocar(1)} style={[styles.roundBtn, { opacity: podeAvancar ? 1 : 0.35 }]} accessibilityLabel="Próximo mês">
              <Icon d="m9 18 6-6-6-6" size={16} color={INK} sw={2.2} />
            </TouchableOpacity>
          </View>
          <View style={styles.wds}>
            {WDS.map((w) => <Text key={w} style={styles.wd}>{w}</Text>)}
          </View>
          <View style={styles.calCard}>
            <Animated.View key={`${mk}:${carregado}`} style={[styles.grid, { transform: [{ translateX: slide }] }]}>
              {cells.map((c, i) => {
                if (!c) return <View key={`v${i}`} style={styles.cell} />;
                if (c.foto) {
                  return (
                    <View key={c.key} style={styles.cell}>
                      <FotoDia uri={c.foto} hoje={c.today} ordem={iFoto++} rm={rm} />
                    </View>
                  );
                }
                return (
                  <View key={c.key} style={styles.cell}>
                    <View style={[styles.cellNum, c.today && styles.cellToday]}>
                      <Text style={[styles.cellN, { color: c.future ? '#B5AEB1' : INK, fontWeight: c.today ? '700' : '400' }]}>{c.n}</Text>
                    </View>
                  </View>
                );
              })}
            </Animated.View>
          </View>
          <View style={{ marginTop: 18, alignItems: 'center' }}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.push('/calendario?de=grupos' as any); }} style={styles.verTodos}>
              <Text style={styles.verTodosText}>Ver todos os check-ins</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>

      <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.action(); router.push('/checkin?de=grupos' as any); }} style={[styles.fab, { bottom: 112 + Math.max(0, insets.bottom - 34) }]} accessibilityLabel="Fazer check-in">
        <Icon d={CAMERA} size={24} color="#fff" sw={1.9} circle={[12, 13, 3]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9F1F4' },
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280, left: 190, top: -90,
    experimental_backgroundImage: 'radial-gradient(circle at 30% 75%, rgba(255,170,205,0.34), rgba(255,255,255,0.2))',
  },
  circleWhite: { position: 'absolute', width: 620, height: 620, borderRadius: 310, left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)' },

  topRow: { height: 36, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  roundBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 4px 14px rgba(120,60,72,0.10)',
  },
  photoRing: {
    width: 132, height: 132, borderRadius: 66, borderWidth: 2, borderColor: PINK, padding: 4,
    boxShadow: '0px 12px 28px rgba(255,94,168,0.18)',
  },
  photo: { width: 120, height: 120, borderRadius: 60 },
  name: { marginTop: 14, fontSize: 24, fontWeight: '700', lineHeight: 29, letterSpacing: -0.7, color: INK, maxWidth: 330 },
  nivel: { marginTop: 4, height: 18, flexDirection: 'row', alignItems: 'center', gap: 7 },
  nivelText: { fontSize: 14, fontWeight: '500', letterSpacing: -0.1, color: '#515151' },
  miniTrack: { width: 38, height: 4, borderRadius: 100, backgroundColor: 'rgba(18,18,18,0.08)', overflow: 'hidden' },
  miniFill: { ...StyleSheet.absoluteFillObject, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },
  stats: { marginTop: 20, width: 330, flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 1 },
  statN: { fontSize: 24, fontWeight: '700', lineHeight: 28, letterSpacing: -0.7, color: INK, fontVariant: ['tabular-nums'] },
  statL: { fontSize: 14, lineHeight: 17, color: MUTE, letterSpacing: -0.1 },

  seus: {
    marginTop: 22, marginHorizontal: 18, height: 60, paddingLeft: 10, paddingRight: 16, borderRadius: 100,
    borderWidth: 1.5, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.8)', boxShadow: '0px 8px 22px rgba(255,94,168,0.12)',
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  seusIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 6px 14px rgba(255,94,168,0.3)',
  },
  seusText: { flex: 1, fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
  seusCount: { fontSize: 14, color: MUTE, letterSpacing: -0.1 },

  mesRow: { marginTop: 28, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mesLabel: { fontSize: 22, fontWeight: '700', lineHeight: 27, letterSpacing: -0.6, color: INK },
  wds: { marginTop: 14, marginHorizontal: 26, flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontSize: 13, color: MUTE, letterSpacing: -0.1 },
  calCard: {
    marginTop: 8, marginHorizontal: 18, borderRadius: 22, borderWidth: 1.5, borderColor: PINK,
    backgroundColor: 'rgba(255,255,255,0.8)', boxShadow: '0px 8px 22px rgba(255,94,168,0.10)', padding: 8, overflow: 'hidden',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  cell: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' },
  cellPhoto: { width: 42, height: 42, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F4F4F4', boxShadow: '0px 3px 8px rgba(200,60,120,0.14)' },
  cellNum: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cellToday: { borderWidth: 2, borderColor: PINK },
  cellN: { fontSize: 17, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  verTodos: { height: 44, paddingHorizontal: 22, borderRadius: 100, backgroundColor: '#fff', justifyContent: 'center', boxShadow: '0px 4px 14px rgba(120,60,72,0.10)' },
  verTodosText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: INK },

  fab: {
    position: 'absolute', right: 20, zIndex: 31, width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: PINK,
    backgroundColor: PINK, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 10px 22px rgba(255,94,168,0.4)',
  },
});
