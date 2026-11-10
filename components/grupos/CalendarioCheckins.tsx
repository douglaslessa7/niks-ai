import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { useUserId } from '../../lib/currentUser';
import { chavePerfilGrupos, perfilGrupos, type PerfilGrupos } from '../../lib/gruposServidor';
import { dateKey, sessionDate } from '../../lib/routineProgress';

// ─────────────────────────────────────────────────────────────────────────────
// Calendário de check-ins do mês — o card da 81a (NiksGrupoFlo.dc.html). FONTE ÚNICA:
// a aba Grupos e o hub Suas conquistas mostram este mesmo componente (antes o hub tinha
// um calendário próprio, do histórico de rotinas do celular, e os dois divergiam).
//   · Mês, "N check-ins" (ou "até agora" no mês atual), setas em círculo cinza-rosado e
//     a foto do check-in no lugar do dia (hoje com anel rosa).
//   · Trocar o mês: a grade desliza 14 pt (260 ms) e as fotos entram em cascata (18 ms).
//   · A cada `abertura` nova: o card sobe 10 pt (420 ms, se `entrada`) e as fotos do mês
//     entram uma a uma (260 ms + 22 ms cada, 0,8 → 1). Reduzir movimento: fade.
// Dados: função `grupos` (`perfil` do mês, com `checkins_mes`), fotos por URL assinada.
// A mesma chave de cache da aba Grupos, então as duas telas dividem a busca.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const WDS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Mola do design (ζ, resposta r) → física: rigidez (2π/r)², amortecimento 4πζ/r.
const mola = (z: number, r: number) => ({ stiffness: (2 * Math.PI / r) ** 2, damping: (4 * Math.PI * z) / r, mass: 1 });

export const mesKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

/** Salta ao montar (o `pop` do design): opacidade ×1,6 e escala `de` → 1. */
export function Salta({ delay, de, rm, children, style }: { delay: number; de: number; rm: boolean; children: React.ReactNode; style?: object }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(0);
    p.set(rm ? withDelay(delay, withTiming(1, { duration: 200 })) : withDelay(delay, withSpring(1, mola(0.72, 0.5))));
  }, [p, delay, rm]);
  const st = useAnimatedStyle(() => (rm
    ? { opacity: p.get() }
    : { opacity: Math.min(1, p.get() * 1.6), transform: [{ scale: de + (1 - de) * p.get() }] }), [rm, de]);
  return <Animated.View style={[style, st]}>{children}</Animated.View>;
}

function Seta({ d, color }: { d: string; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

type Props = {
  /** Muda a cada abertura da tela: refaz a entrada do card e das fotos. */
  abertura: number;
  rm: boolean;
  /** Sobe o card ao abrir. Desligue quando a tela já anima o widget por fora. */
  entrada?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function CalendarioCheckins({ abertura, rm, entrada = true, style }: Props) {
  const userId = useUserId();
  const router = useRouter();
  const pathname = usePathname();
  const hoje = sessionDate();
  const hojeKey = dateKey(hoje);
  const [mes, setMes] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const mk = mesKey(mes);
  const fetcher = useCallback(() => perfilGrupos(mk), [mk]);
  // staleMs 0: o próprio useCachedQuery revalida a cada foco da tela.
  const { data: p } = useCachedQuery<PerfilGrupos>(userId ? chavePerfilGrupos(userId, mk) : null, fetcher, { staleMs: 0, enabled: Boolean(userId) });

  const cardIn = useSharedValue(entrada ? 0 : 1);
  const [trocou, setTrocou] = useState(false);
  useEffect(() => {
    setTrocou(false);
    if (!entrada) return;
    cardIn.set(0);
    cardIn.set(withDelay(80, withTiming(1, { duration: rm ? 200 : 420, easing: EO })));
  }, [abertura, entrada, rm, cardIn]);
  const cardSt = useAnimatedStyle(() => (rm
    ? { opacity: cardIn.get() }
    : { opacity: cardIn.get(), transform: [{ translateY: 10 * (1 - cardIn.get()) }] }), [rm]);

  // ── Troca de mês: a grade desliza 14 pt do lado de onde veio (260 ms) ─────────
  const slide = useSharedValue(0);
  const fade = useSharedValue(1);
  const trocar = (dir: -1 | 1) => {
    haptics.select();
    setMes(new Date(mes.getFullYear(), mes.getMonth() + dir, 1));
    setTrocou(true);
    fade.set(0);
    fade.set(withTiming(1, { duration: rm ? 160 : 260, easing: EO }));
    slide.set(rm ? 0 : dir * 14);
    slide.set(withTiming(0, { duration: 260, easing: EO }));
  };
  const gridSt = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ translateX: slide.get() }] }));
  const primeiro = p?.primeiro_mes ? new Date(`${p.primeiro_mes}T12:00:00`) : null;
  const podeVoltar = !!primeiro && mes > new Date(primeiro.getFullYear(), primeiro.getMonth(), 1);
  const podeAvancar = mes < new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  // ── Calendário (domingo primeiro) ──────────────────────────────────────────────
  const carregado = !!p && p.mes === mk;
  const fotos = new Map((carregado ? p.dias : []).map((d) => [d.dia, d.foto_url]));
  // Os check-ins do dia (manhã/noite) → tela de detalhes, voltando para esta tela.
  const doDia = new Map((carregado ? p.dias : []).map((d) => [d.dia, (d.checkins ?? []).map((c) => c.id)]));
  const abrirDia = (key: string) => {
    const ids = doDia.get(key) ?? [];
    if (!ids.length) return;
    haptics.tap();
    router.push({ pathname: '/checkin-detalhe', params: { ids: ids.join(','), volta: pathname } } as any);
  };
  const inicio = mes.getDay();
  const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const cells: ({ n: number; key: string; foto: string | null; today: boolean } | null)[] = [
    ...Array.from({ length: inicio }, () => null),
    ...Array.from({ length: total }, (_, i) => {
      const key = `${mk.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
      return { n: i + 1, key, foto: fotos.get(key) ?? null, today: key === hojeKey };
    }),
  ];
  while (cells.length % 7) cells.push(null);
  // Semanas em linhas explícitas de 7 (README #29): com flexWrap e células de 100/7 %, um
  // sub-pixel faz o 7º dia descer de linha (aconteceu no hub, com 18 pt de margem).
  const semanas: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) semanas.push(cells.slice(i, i + 7));
  const nMes = carregado ? (p.checkins_mes ?? p.dias.length) : null;
  const atual = mk === mesKey(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const subMes = nMes == null ? ' ' : `${nMes} ${nMes === 1 ? 'check-in' : 'check-ins'}${atual ? ' até agora' : ''}`;
  let iFoto = 0;

  return (
    <Animated.View style={[styles.cal, style, cardSt]}>
      <View style={styles.calHead}>
        <Text style={styles.mesLabel}>{MESES[mes.getMonth()]}</Text>
        <TouchableOpacity activeOpacity={0.7} disabled={!podeVoltar} onPress={() => trocar(-1)} style={styles.seta} accessibilityLabel="Mês anterior">
          <Seta d="m15 18-6-6 6-6" color={podeVoltar ? INK : '#C9C1C5'} />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} disabled={!podeAvancar} onPress={() => trocar(1)} style={styles.seta} accessibilityLabel="Próximo mês">
          <Seta d="m9 18 6-6-6-6" color={podeAvancar ? INK : '#C9C1C5'} />
        </TouchableOpacity>
      </View>
      <Text style={styles.mesSub}>{subMes}</Text>
      <View style={styles.wds}>{WDS.map((w, i) => <Text key={i} style={styles.wd}>{w}</Text>)}</View>
      <Animated.View key={`${mk}:${carregado}:${abertura}`} style={[styles.grid, gridSt]}>
        {semanas.map((sem, si) => (
          <View key={si} style={[styles.semana, si > 0 && { marginTop: 6 }]}>
            {sem.map((c, i) => {
              if (!c) return <View key={`v${i}`} style={styles.cell} />;
              if (c.foto) {
                const ordem = iFoto++;
                return (
                  <TouchableOpacity key={c.key} activeOpacity={0.75} disabled={!doDia.get(c.key)?.length} onPress={() => abrirDia(c.key)} style={styles.cell} accessibilityLabel={`Check-in do dia ${c.n}`}>
                    <Salta delay={trocou ? 60 + ordem * 18 : 260 + ordem * 22} de={trocou ? 0.85 : 0.8} rm={rm} style={[styles.fotoDia, { borderColor: c.today ? PINK : '#fff' }]}>
                      <Image source={{ uri: c.foto }} style={styles.fotoImg} />
                    </Salta>
                  </TouchableOpacity>
                );
              }
              return (
                <View key={c.key} style={styles.cell}>
                  <Text style={styles.cellN}>{c.n}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cal: {
    marginTop: 16, marginHorizontal: 16, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, borderRadius: 16,
    backgroundColor: '#fff', boxShadow: '0px 1px 2px rgba(18,18,18,0.04)',
  },
  calHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mesLabel: { flex: 1, fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.45, color: INK },
  seta: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F4EFF2', alignItems: 'center', justifyContent: 'center' },
  mesSub: { marginTop: 4, fontSize: 15, lineHeight: 20, color: MUTE, letterSpacing: -0.2 },
  wds: { marginTop: 14, flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '600', color: MUTE },
  grid: { marginTop: 8 },
  semana: { flexDirection: 'row' },
  cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  fotoDia: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, overflow: 'hidden', backgroundColor: '#FCE3EE' },
  fotoImg: { width: 38, height: 38 },
  cellN: { fontSize: 15, color: INK, fontVariant: ['tabular-nums'] },
});
