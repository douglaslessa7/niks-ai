import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Animated, Easing, StyleSheet, AccessibilityInfo, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { useUserId } from '../../lib/currentUser';
import { grupoDetalhe, rankingGrupo, type LinhaRanking, type Periodo } from '../../lib/gruposServidor';
import { sessionDate } from '../../lib/routineProgress';

// ─────────────────────────────────────────────────────────────────────────────
// Ranking do grupo — réplica de 80f (Semana) e 80g (Geral) do Claude Design
// (NiksGrupoV2.dc.html). Abas Semana · Mês · Ano · Geral no seletor rosa (pílula
// desliza 320 ms); a faixa da carta rara só na Semana ("Termina domingo à noite": a
// semana vira na segunda às 04:00). Lista: posição (top 3 com medalha), foto com o
// título do nível, nome, semanas vencidas e check-ins. Sua linha em rosa-claro.
// Trocar de aba: as linhas entram em cascata de 40 ms (6 pt → 0, 300 ms).
// As quatro listas vêm juntas, então trocar de aba não espera a rede.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const TABS: [Periodo, string][] = [['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['geral', 'Geral']];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_C = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const TROFEU = ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2Z'];

type Dados = { listas: Record<Periodo, LinhaRanking[]>; criado_em: string | null };

async function carregar(gid: string): Promise<Dados> {
  const [semana, mes, ano, geral, g] = await Promise.all([
    rankingGrupo(gid, 'semana'), rankingGrupo(gid, 'mes'), rankingGrupo(gid, 'ano'), rankingGrupo(gid, 'geral'), grupoDetalhe(gid),
  ]);
  return { listas: { semana, mes, ano, geral }, criado_em: g.criado_em };
}

const curta = (d: Date) => `${d.getDate()} de ${MESES_C[d.getMonth()]}`;
const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

function rodape(p: Periodo, lista: LinhaRanking[], criadoEm: string | null): string {
  const hoje = sessionDate();
  if (p === 'semana') {
    const seg = new Date(hoje); seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    return `Até 2 check-ins por dia: manhã e noite. Semana de ${curta(seg)} a ${curta(dom)}.`;
  }
  if (p === 'mes') {
    const base = `${MESES[hoje.getMonth()]}, desde o dia 1.`;
    const i = lista.findIndex((r) => r.voce);
    const v = lista[i];
    if (!v || v.checkins === 0) return base;
    if (i === 0) {
      const dif = v.checkins - (lista[1]?.checkins ?? 0);
      if (!lista[1]) return base;
      return dif > 0 ? `${base} Você está na frente por ${plural(dif, 'check-in', 'check-ins')}.` : `${base} Você está empatada na frente.`;
    }
    const acima = lista[i - 1];
    const dif = acima.checkins - v.checkins;
    return dif > 0 ? `${base} Você está a ${plural(dif, 'check-in', 'check-ins')} de ${acima.nome}.` : base;
  }
  if (p === 'ano') {
    const c = criadoEm ? new Date(`${criadoEm.slice(0, 10)}T12:00:00`) : null;
    return c && c.getFullYear() === hoje.getFullYear() ? `Desde que o grupo foi criado, em ${curta(c)}.` : `${hoje.getFullYear()}, desde 1º de janeiro.`;
  }
  return 'Todos os check-ins desde a criação do grupo.';
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

function Linha({ r, i, ultima, rm }: { r: LinhaRanking; i: number; ultima: boolean; rm: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: rm ? 200 : 300, delay: rm ? 0 : i * 40, easing: EO, useNativeDriver: true }).start();
  }, [v, i, rm]);
  const pos = r.posicao;
  const w = r.semanas_vencidas;
  return (
    <Animated.View
      style={[
        styles.row, { borderBottomWidth: ultima ? 0 : 1, backgroundColor: r.voce ? '#FFF0F7' : 'transparent' },
        { opacity: v, transform: rm ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] },
      ]}
    >
      {pos <= 3 ? (
        <View style={[styles.medal, pos === 1 ? styles.medal1 : { borderColor: pos === 2 ? PINK : 'rgba(255,94,168,0.45)' }]}>
          <Text style={[styles.medalT, { color: pos === 1 ? '#fff' : PINK }]}>{pos}</Text>
        </View>
      ) : (
        <Text style={styles.pos}>{pos}</Text>
      )}
      <View style={styles.who}>
        <View style={[styles.ring, { borderColor: r.voce ? PINK : 'rgba(255,94,168,0.35)' }]}>
          {r.foto ? <Image source={{ uri: r.foto }} style={styles.face} /> : <View style={[styles.face, { backgroundColor: '#F6D3E1' }]} />}
        </View>
        <Text style={styles.lvl} numberOfLines={2}>{r.titulo}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>{r.voce ? 'Você' : r.nome}</Text>
        <View style={styles.winsRow}>
          <Svg width={13} height={13} viewBox="0 0 24 24">
            {TROFEU.map((d, k) => <Path key={k} d={d} fill="none" stroke={w ? PINK : '#B5B5B5'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />)}
          </Svg>
          <Text style={styles.wins}>{w === 0 ? 'Nenhuma semana vencida' : plural(w, 'semana vencida', 'semanas vencidas')}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.n}>{r.checkins}</Text>
        <Text style={styles.nL}>check-ins</Text>
      </View>
    </Animated.View>
  );
}

export default function GrupoRanking() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const rm = useReduceMotion();
  const userId = useUserId();
  const { id, periodo } = useLocalSearchParams<{ id?: string; periodo?: Periodo }>();
  const gid = typeof id === 'string' ? id : '';
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const fetcher = useCallback(() => carregar(gid), [gid]);
  const { data, refresh } = useCachedQuery<Dados>(userId && gid ? `grupos:ranking:${userId}:${gid}` : null, fetcher, { staleMs: 0, enabled: Boolean(userId && gid) });

  const inicial: Periodo = periodo && TABS.some(([k]) => k === periodo) ? periodo : 'semana';
  const [tab, setTab] = useState<Periodo>(inicial);
  const idx = TABS.findIndex(([k]) => k === tab);
  const tabW = (width - 36 - 8) / 4;
  const seg = useRef(new Animated.Value(idx)).current;
  useEffect(() => {
    if (rm) { seg.setValue(idx); return; }
    Animated.timing(seg, { toValue: idx, duration: 320, easing: EO, useNativeDriver: true }).start();
  }, [idx, rm, seg]);

  useFocusEffect(
    useCallback(() => {
      // Sem navbar (80f/80g); cada abertura começa na aba pedida (Semana por padrão).
      setTabBarTheme('light');
      setTabBarVisible(false);
      setTab(inicial);
      void refresh?.();
      return () => setTabBarVisible(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gid, inicial])
  );

  const lista = data?.listas[tab] ?? [];

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient colors={['#FCE3EE', '#FDD5E6', '#FCDFEA', '#F9F1F4']} locations={[0, 0.45, 0.72, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleBlob} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 60 + insets.bottom }}>
        <View style={styles.head}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.navigate({ pathname: '/grupo', params: { id: gid } } as any); }} style={styles.roundBtn} accessibilityLabel="Voltar">
            <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m15 18-6-6 6-6" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </TouchableOpacity>
          <Text style={styles.headT} pointerEvents="none">Ranking</Text>
        </View>

        <View style={styles.segBox}>
          <Animated.View style={[styles.segPill, { width: tabW, transform: [{ translateX: Animated.multiply(seg, tabW) }] }]} />
          <View style={{ flexDirection: 'row', height: 36 }}>
            {TABS.map(([k, label]) => (
              <TouchableOpacity
                key={k}
                activeOpacity={1}
                onPress={() => { if (k !== tab) { haptics.select(); setTab(k); } }}
                style={styles.segItem}
                accessibilityRole="tab"
                accessibilityState={{ selected: k === tab }}
              >
                <Text style={[styles.segT, { color: k === tab ? '#fff' : '#515151' }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {tab === 'semana' && (
          <View style={styles.banner}>
            <View style={styles.bannerIcon}>
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" fill="#fff" />
                <Path d="M20 2v4M22 4h-4" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
              </Svg>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.bannerT}>A campeã da semana ganha uma carta rara</Text>
              <Text style={styles.bannerS}>Termina domingo à noite</Text>
            </View>
          </View>
        )}

        <View style={styles.list}>
          {lista.map((r, i) => <Linha key={`${tab}:${r.user_id}`} r={r} i={i} ultima={i === lista.length - 1} rm={rm} />)}
        </View>
        {data && <Text style={styles.foot}>{rodape(tab, lista, data.criado_em)}</Text>}
      </ScrollView>
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

  head: { height: 36, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  roundBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', zIndex: 1,
    boxShadow: '0px 4px 14px rgba(120,60,72,0.10)',
  },
  headT: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },

  segBox: { marginTop: 18, marginHorizontal: 18, height: 44, borderRadius: 100, backgroundColor: '#fff', padding: 4, boxShadow: '0px 4px 14px rgba(120,60,72,0.08)' },
  segPill: { position: 'absolute', top: 4, left: 4, height: 36, borderRadius: 100, backgroundColor: PINK, boxShadow: '0px 4px 10px rgba(255,94,168,0.35)' },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segT: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },

  banner: {
    marginTop: 12, marginHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 18, borderWidth: 1.5, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.8)', boxShadow: '0px 8px 22px rgba(255,94,168,0.12)',
  },
  bannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 6px 14px rgba(255,94,168,0.3)' },
  bannerT: { fontSize: 15, lineHeight: 19, fontWeight: '600', letterSpacing: -0.3, color: INK },
  bannerS: { marginTop: 2, fontSize: 13, lineHeight: 16, color: MUTE, letterSpacing: -0.1 },

  list: { marginTop: 12, marginHorizontal: 18, borderRadius: 18, borderWidth: 1.5, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.78)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 12, paddingRight: 14, borderBottomColor: 'rgba(18,18,18,0.06)' },
  medal: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  medal1: { backgroundColor: PINK, borderColor: PINK },
  medalT: { fontSize: 13, fontWeight: '800' },
  pos: { width: 28, textAlign: 'center', fontSize: 15, fontWeight: '600', color: MUTE, fontVariant: ['tabular-nums'] },
  who: { width: 64, alignItems: 'center', gap: 4 },
  ring: { width: 48, height: 48, borderRadius: 24, padding: 2, borderWidth: 2 },
  face: { width: 40, height: 40, borderRadius: 20 },
  lvl: { width: 72, marginHorizontal: -4, fontSize: 10, lineHeight: 12, fontWeight: '700', color: PINK, letterSpacing: 0.1, textAlign: 'center' },
  name: { fontSize: 17, lineHeight: 21, fontWeight: '600', letterSpacing: -0.4, color: INK },
  winsRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 5 },
  wins: { flexShrink: 1, fontSize: 13, lineHeight: 16, color: MUTE, letterSpacing: -0.1 },
  n: { fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -0.7, color: INK, fontVariant: ['tabular-nums'] },
  nL: { fontSize: 11, lineHeight: 13, color: MUTE, letterSpacing: -0.1 },
  foot: { marginTop: 14, marginHorizontal: 28, textAlign: 'center', fontSize: 13, lineHeight: 17, color: MUTE, letterSpacing: -0.1 },
});
