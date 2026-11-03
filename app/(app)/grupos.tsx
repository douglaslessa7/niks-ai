import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { useUserId } from '../../lib/currentUser';
import { useEstadoCartas } from '../../lib/cartasServidor';
import { chavePerfilGrupos, perfilGrupos, type PerfilGrupos } from '../../lib/gruposServidor';
import { sessionDate } from '../../lib/routineProgress';
import CalendarioCheckins, { Salta, mesKey } from '../../components/grupos/CalendarioCheckins';

// ─────────────────────────────────────────────────────────────────────────────
// Aba Grupos · Perfil — réplica de 81a/81b do Claude Design ("NIKS home redesign",
// NiksGrupoFlo.dc.html, rodada 81: as telas de grupo na linguagem do Flo). O último ícone
// da navbar abre aqui. Frame de 393 × 852 com barra de status de 54: Y do design → tela =
// insets.top + y − 54.
//   · Herói rosa com a curva embaixo: "Perfil", engrenagem (→ Perfil), foto 96 com borda
//     branca, nome, nível INDIVIDUAL (toque → Sua caminhada), Check-ins e Dias ativos, e a
//     pílula branca "Seus grupos".
//   · Calendário de check-ins do mês: components/grupos/CalendarioCheckins (o mesmo do hub
//     Suas conquistas).
//   · Ao abrir: a foto salta (mola ζ.72 .5 s, 0,86 → 1). Reduzir movimento: fade.
//   · "Ver todos os check-ins" (fora do 81a, mantido a pedido) abre o calendário completo.
// Dados reais: função `grupos` (`perfil`, com `checkins_mes`), fotos por URL assinada.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const SUB = '#3d3d3d';
const GEAR = ['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'];
const HERO_H = 414;

function Icon({ d, size, color, sw, circle }: { d: string[]; size: number; color: string; sw: number; circle?: [number, number, number] }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {d.map((p, i) => <Path key={i} d={p} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />)}
      {circle && <Circle cx={circle[0]} cy={circle[1]} r={circle[2]} fill="none" stroke={color} strokeWidth={sw} />}
    </Svg>
  );
}

export default function Grupos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const userId = useUserId();
  const rm = useReducedMotion();
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);
  const y = (v: number) => insets.top + v - 54;

  // O herói lê o perfil do mês atual (mesma chave do calendário quando ele está no mês atual).
  const mk = mesKey(sessionDate());
  const fetcher = useCallback(() => perfilGrupos(mk), [mk]);
  const { data: p } = useCachedQuery<PerfilGrupos>(userId ? chavePerfilGrupos(userId, mk) : null, fetcher, { staleMs: 0, enabled: Boolean(userId) });
  const { data: estado } = useEstadoCartas();
  const pontos = estado?.pontos;

  // ── Entrada (a cada foco): foto, card do calendário e as fotos do mês ──────────
  const [abertura, setAbertura] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
      setAbertura((n) => n + 1);
    }, [setTabBarTheme])
  );

  // Herói: retângulo com a curva embaixo (border-radius 0 0 50% 50% / 0 0 34px 34px).
  const hh = y(HERO_H);
  const heroPath = `M0 0 H${W} V${hh - 34} A${W / 2} 34 0 0 1 ${W / 2} ${hh} A${W / 2} 34 0 0 1 0 ${hh - 34} Z`;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 + Math.max(0, insets.bottom - 34) }}>
        <View style={{ height: hh }}>
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
            <Svg width={W} height={hh} style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgGrad id="heroG" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#FFEAF3" />
                  <Stop offset="0.55" stopColor="#FFC9E0" />
                  <Stop offset="1" stopColor="#FF9BC8" />
                </SvgGrad>
              </Defs>
              <Path d={heroPath} fill="url(#heroG)" />
              <Circle cx={-120 + 320} cy={y(-390) + 320} r={320} fill="rgba(255,255,255,0.38)" />
            </Svg>
          </View>
          <View pointerEvents="none" style={[styles.title, { top: y(54) }]}><Text style={styles.titleT}>Perfil</Text></View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.push('/perfil' as any); }} style={[styles.gear, { top: y(54) }]} accessibilityLabel="Perfil e configurações">
            <Icon d={GEAR} size={24} color={INK} sw={1.8} circle={[12, 12, 3]} />
          </TouchableOpacity>
          <Salta key={`foto${abertura}`} delay={60} de={0.86} rm={rm} style={[styles.foto, { top: y(106), left: W / 2 - 48 }]}>
            {p?.foto ? <Image source={{ uri: p.foto }} style={{ width: '100%', height: '100%' }} /> : null}
          </Salta>
          <Text style={[styles.nome, { top: y(216) }]} numberOfLines={1}>{p?.nome ?? ''}</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.push('/caminhada' as any); }} style={[styles.nivelBtn, { top: y(248) }]} accessibilityLabel="Sua caminhada">
            <Text style={styles.nivel}>{pontos ? `Nível ${pontos.nivel} · ${pontos.titulo}` : p ? `Nível ${p.nivel} · ${p.titulo}` : ' '}</Text>
          </TouchableOpacity>
          <View style={[styles.stats, { top: y(282) }]}>
            {[{ n: p?.checkins ?? 0, l: 'Check-ins' }, { n: p?.dias_ativos ?? 0, l: 'Dias ativos' }].map((x) => (
              <View key={x.l} style={styles.stat}>
                <Text style={styles.statN}>{x.n}</Text>
                <Text style={styles.statL}>{x.l}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.pillRow, { top: y(348) }]}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.push('/seus-grupos' as any); }} style={styles.pill}>
              <Text style={styles.pillT}>Seus grupos</Text>
            </TouchableOpacity>
          </View>
        </View>

        <CalendarioCheckins abertura={abertura} rm={rm} />

        <View style={{ marginTop: 18, alignItems: 'center' }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.push('/calendario?de=grupos' as any); }} style={styles.verTodos}>
            <Text style={styles.verTodosT}>Ver todos os check-ins</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F1F4' },
  title: { position: 'absolute', left: 0, right: 0, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleT: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
  gear: { position: 'absolute', right: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  foto: {
    position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: '#fff', overflow: 'hidden',
    backgroundColor: '#FCE3EE', boxShadow: '0px 8px 20px rgba(200,60,120,0.22)',
  },
  nome: { position: 'absolute', left: 20, right: 20, textAlign: 'center', fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.6, color: INK },
  nivelBtn: { position: 'absolute', alignSelf: 'center', height: 20, justifyContent: 'center', paddingHorizontal: 8 },
  nivel: { fontSize: 15, lineHeight: 20, color: SUB, letterSpacing: -0.2 },
  stats: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 56 },
  stat: { width: 110, alignItems: 'center' },
  statN: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8, color: INK, fontVariant: ['tabular-nums'] },
  statL: { marginTop: 2, fontSize: 14, lineHeight: 18, color: SUB, letterSpacing: -0.1 },
  pillRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: { height: 40, paddingHorizontal: 22, borderRadius: 100, backgroundColor: '#fff', justifyContent: 'center', boxShadow: '0px 2px 8px rgba(200,60,120,0.10)' },
  pillT: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: PINK },

  verTodos: { height: 44, paddingHorizontal: 22, borderRadius: 100, backgroundColor: '#fff', justifyContent: 'center', boxShadow: '0px 1px 2px rgba(18,18,18,0.04)' },
  verTodosT: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: INK },
});
