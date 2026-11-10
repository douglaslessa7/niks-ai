import FotoComMoldura from '../../components/medalhas/FotoComMoldura';
import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { useUserId } from '../../lib/currentUser';
import { grupoDetalhe, rankingGrupo, type LinhaRanking, type Periodo } from '../../lib/gruposServidor';
import { sessionDate } from '../../lib/routineProgress';
import { voltar as voltarOu } from '../../lib/navegar';

// ─────────────────────────────────────────────────────────────────────────────
// Ranking do grupo — réplica de 81l (Semana) e 81m (Geral) do Claude Design
// ("NIKS home redesign", NiksGrupoFlo.dc.html, rodada 81: linguagem do Flo). Fundo
// branco, abas em pílula (a escolhida rosa, as outras cinza-rosadas), linha fina embaixo, o período ("Semana de …", "Novembro", "2026", "Desde …,
// quando o grupo foi criado") e a lista: posição (top 3 em medalha ouro, prata e
// bronze), foto (a sua com anel rosa), nome (o seu em negrito), nível em rosa, semanas
// vencidas e os check-ins. Linha fina recuada entre as linhas. Trocar de aba: as linhas
// entram uma a uma (8 pt, 360 ms, 40 ms entre elas). Sem navbar.
// Frame de 393 × 852 com barra de status de 54: Y do design → insets.top + y − 54.
// As quatro listas vêm juntas, então trocar de aba não espera a rede.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const TABS: [Periodo, string][] = [['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['geral', 'Geral']];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_C = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const MEDALHA: [string, string][] = [['#FFD66B', '#6B4A00'], ['#E3E5EA', '#3F444B'], ['#F6C3A0', '#6E3511']];
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

function secao(p: Periodo, criadoEm: string | null): string {
  const hoje = sessionDate();
  if (p === 'semana') {
    const seg = new Date(hoje); seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    return `Semana de ${curta(seg)} a ${curta(dom)}`;
  }
  if (p === 'mes') return MESES[hoje.getMonth()];
  if (p === 'ano') return String(hoje.getFullYear());
  const c = criadoEm ? new Date(`${criadoEm.slice(0, 10)}T12:00:00`) : null;
  return c ? `Desde ${curta(c)}, quando o grupo foi criado` : 'Desde que o grupo foi criado';
}

function rodape(p: Periodo, lista: LinhaRanking[]): string {
  if (p === 'semana') return 'Até 2 check-ins por dia: manhã e noite.';
  if (p === 'ano') return 'Conta desde 1 de janeiro.';
  if (p === 'geral') return 'Todos os check-ins desde a criação do grupo.';
  const i = lista.findIndex((r) => r.voce);
  const v = lista[i];
  if (!v || v.checkins === 0) return 'Conta desde o dia 1.';
  if (i === 0) {
    if (!lista[1]) return 'Conta desde o dia 1.';
    const dif = v.checkins - lista[1].checkins;
    return dif > 0 ? `Você está na frente por ${plural(dif, 'check-in', 'check-ins')}.` : 'Você está empatada na frente.';
  }
  const dif = lista[i - 1].checkins - v.checkins;
  return dif > 0 ? `Você está a ${plural(dif, 'check-in', 'check-ins')} de ${lista[i - 1].nome}.` : 'Você está empatada.';
}

function Linha({ r, i, ultima, rm }: { r: LinhaRanking; i: number; ultima: boolean; rm: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(0);
    p.set(withDelay(rm ? 0 : i * 40, withTiming(1, { duration: rm ? 160 : 360, easing: EO })));
  }, [p, i, rm]);
  const st = useAnimatedStyle(() => (rm ? { opacity: p.get() } : { opacity: p.get(), transform: [{ translateY: 8 * (1 - p.get()) }] }), [rm]);
  const pos = r.posicao;
  const w = r.semanas_vencidas;
  const med = pos <= 3 ? MEDALHA[pos - 1] : null;
  return (
    <Animated.View style={[styles.row, st]}>
      <View style={styles.posBox}>
        <View style={[styles.medal, { backgroundColor: med ? med[0] : 'transparent' }]}>
          <Text style={[styles.medalT, { color: med ? med[1] : MUTE }]}>{pos}</Text>
        </View>
      </View>
      {/* A foto com a moldura da medalha atual dela (08/nov/2026); passa 9 pt de cada lado. */}
      <View style={{ width: 48, height: 48 }}>
        <FotoComMoldura nivel={r.nivel} foto={r.foto} nome={r.nome} tamanho={66} pequena vazio="#FCE3EE" style={{ position: 'absolute', left: -9, top: -9 }} />
      </View>
      <View style={[styles.rowBody, { borderBottomColor: ultima ? 'transparent' : 'rgba(18,18,18,0.07)' }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.nome, { fontWeight: r.voce ? '700' : '400' }]} numberOfLines={1}>{r.voce ? 'Você' : r.nome}</Text>
          <Text style={styles.nivel} numberOfLines={1}>{r.titulo}</Text>
          <View style={styles.winsRow}>
            <Svg width={13} height={13} viewBox="0 0 24 24">
              {TROFEU.map((d, k) => <Path key={k} d={d} fill="none" stroke={MUTE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />)}
            </Svg>
            <Text style={styles.wins} numberOfLines={1}>{w === 0 ? 'Nenhuma semana vencida' : plural(w, 'semana vencida', 'semanas vencidas')}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.n}>{r.checkins}</Text>
          <Text style={styles.nL}>check-ins</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function GrupoRanking() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rm = useReducedMotion();
  const userId = useUserId();
  const { id, periodo } = useLocalSearchParams<{ id?: string; periodo?: Periodo }>();
  const gid = typeof id === 'string' ? id : '';
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const fetcher = useCallback(() => carregar(gid), [gid]);
  const { data, refresh } = useCachedQuery<Dados>(userId && gid ? `grupos:ranking:${userId}:${gid}` : null, fetcher, { staleMs: 0, enabled: Boolean(userId && gid) });
  const y = (v: number) => insets.top + v - 54;

  const inicial: Periodo = periodo && TABS.some(([k]) => k === periodo) ? periodo : 'semana';
  const [tab, setTab] = useState<Periodo>(inicial);
  const [run, setRun] = useState(0);

  useFocusEffect(
    useCallback(() => {
      // Sem navbar; cada abertura começa na aba pedida (Semana por padrão).
      setTabBarTheme('light');
      setTabBarVisible(false);
      setTab(inicial);
      setRun((n) => n + 1);
      void refresh?.();
      return () => setTabBarVisible(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gid, inicial])
  );

  const lista = data?.listas[tab] ?? [];

  return (
    <View style={{ flex: 1 }}>
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={[styles.titleRow, { top: y(54) }]}><Text style={styles.title}>Ranking</Text></View>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => { haptics.tap(); voltarOu({ pathname: '/grupo', params: { id: gid } }); }}
        style={[styles.back, { top: y(54) }]}
        accessibilityLabel="Voltar"
      >
        <Svg width={26} height={26} viewBox="0 0 24 24"><Path d="m15 18-6-6 6-6" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </TouchableOpacity>

      <View style={[styles.tabs, { top: y(106) }]}>
        {TABS.map(([k, label]) => {
          const on = k === tab;
          return (
            <TouchableOpacity
              key={k}
              activeOpacity={0.7}
              onPress={() => { if (!on) { haptics.select(); setTab(k); } }}
              style={[styles.tab, { backgroundColor: on ? PINK : '#F2EDF0' }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.tabT, { color: on ? '#fff' : INK }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[styles.linha, { top: y(154) }]} />

      <ScrollView style={{ position: 'absolute', top: y(155), left: 0, right: 0, bottom: 0 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <Text style={styles.secao}>{data ? secao(tab, data.criado_em) : ' '}</Text>
        {lista.map((r, i) => <Linha key={`${tab}:${run}:${r.user_id}`} r={r} i={i} ultima={i === lista.length - 1} rm={rm} />)}
        {data && <Text style={styles.foot}>{rodape(tab, lista)}</Text>}
      </ScrollView>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  titleRow: { position: 'absolute', left: 0, right: 0, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
  back: { position: 'absolute', left: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  tabs: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 8 },
  tab: { height: 36, paddingHorizontal: 16, borderRadius: 100, justifyContent: 'center' },
  tabT: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  linha: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(18,18,18,0.08)' },

  secao: { marginTop: 20, marginHorizontal: 16, marginBottom: 2, fontSize: 15, lineHeight: 20, color: '#9A9A9A', letterSpacing: -0.2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16 },
  posBox: { width: 28, alignItems: 'center' },
  medal: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  medalT: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  foto: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, overflow: 'hidden', backgroundColor: '#FCE3EE' },
  rowBody: { flex: 1, minWidth: 0, height: 84, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  nome: { fontSize: 17, lineHeight: 22, letterSpacing: -0.4, color: INK },
  nivel: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: PINK },
  winsRow: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  wins: { flexShrink: 1, fontSize: 13, lineHeight: 17, color: MUTE },
  n: { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4, color: INK, fontVariant: ['tabular-nums'] },
  nL: { fontSize: 12, lineHeight: 15, color: MUTE },
  foot: { marginTop: 16, marginHorizontal: 16, fontSize: 13, lineHeight: 18, color: MUTE },
});
