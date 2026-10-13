// ─────────────────────────────────────────────────────────────────────────────
// Seu progresso — réplica do design 43d do Claude Design (projeto "NIKS home
// redesign — rotina skincare", NiksProgressFlo.dc.html com v="home2" first): anel com
// a foto do último scan + Niks Score, o CARD DE MÉTRICAS da home antiga (versão B,
// commit 8ae3453 — Figma node 1:63: 6 métricas em 3 colunas × 2 linhas,
// barra no semáforo de `metricColor`; tocar = compartilhar), Sua evolução, Seus scans e
// Seu timelapse. Abre pelo atalho "Progresso" da home. As letras do card seguem a
// tipografia do app (fonte do sistema/SF Pro, #121212), não mais Lato/Exo 2. Sem botão de scan e sem a frase
// "Seu primeiro scan" (pedido do produto, out/2026).
// O mesmo arquivo do design desenha a versão com 2+ scans (43c — `notFirst`): abas +
// gráfico em "Sua evolução", variação nas métricas e todos os scans na fileira. A
// tela escolhe pela quantidade de scans da usuária.
// Dados reais: skin_scans (score, métricas, foto, data) e routine_photos (timelapse).
// Fonte = SF Pro (sistema), rosa #FF5EA8. Medidas do frame 393×852 (barra de status
// de 54 pt → `insets.top − 54`).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import Svg, { Path, Circle, Rect, Line, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useUserId } from '../../lib/currentUser';
import { useCachedQuery } from '../../lib/cache';
import { haptics } from '../../lib/haptics';
import { usePickProfilePhoto } from '../../lib/profilePhoto';
import { METRIC_DEFS, type Metricas } from '../../lib/metricDefs';
import { metricColor, type MetricKey } from '../../lib/metricColor';
import { sessionDate, dateKey } from '../../lib/routineProgress';
import { BG_STOPS } from '../../lib/homeTheme';
import { getScoreTheme, getScoreScreenTheme } from '../../lib/scoreTheme';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_DEEP = '#C0206A';
const SOFT = '#6E6468';
const MUTED = '#8A8387';
const BODY = '#3D3A3C';
const TRACK = '#F6E9EF';


const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_INTERVAL_DAYS = 7;
const TIMELAPSE_DAYS = 30;

// Quebras de linha dos nomes no card de métricas: "da pele" fica junto na 2ª linha
// (pedido do produto). Os outros usam o nome de `METRIC_DEFS` (que já quebra
// "Linhas de / expressão").
const CARD_LABEL: Partial<Record<MetricKey, string>> = { qualidade_pele: 'Qualidade\nda pele' };

// Abas de "Sua evolução" (SERIES do design, nesta ordem).
const SERIES: { key: 'score' | MetricKey; label: string; better: 'up' | 'down' }[] = [
  { key: 'score', label: 'Score', better: 'up' },
  { key: 'qualidade_pele', label: 'Qualidade da pele', better: 'up' },
  { key: 'acne', label: 'Acne', better: 'down' },
  { key: 'oleosidade', label: 'Oleosidade', better: 'down' },
  { key: 'linhas_expressao', label: 'Linhas de expressão', better: 'down' },
];

// Ícones do design (viewBox 24).
const LOCK_RECT = { x: 4.5, y: 10.5, width: 15, height: 10.5, rx: 2.5 };
const LOCK_PATH = 'M8 10.5V7.5a4 4 0 0 1 8 0v3';
const BACK_PATH = 'M15 5l-7 7 7 7';
const SHARE_PATH = 'M12 3v12M7.5 7.5L12 3l4.5 4.5M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12';

type ScanRow = { created_at: string; skin_score: number | null; foto_url: string | null; full_result: { metricas?: Metricas } | null };
type ProgressData = { scans: ScanRow[]; firstPhotoOn: string | null; fotoHomeUrl?: string | null };

/** Diferença em dias de calendário (virada às 04:00, igual à rotina). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((sessionDate(b).getTime() - sessionDate(a).getTime()) / DAY_MS);
}

function dayLabel(iso: string, now: Date, hojeLabel: string): string {
  const d = new Date(iso);
  if (dateKey(sessionDate(d)) === dateKey(sessionDate(now))) return hojeLabel;
  const s = sessionDate(d);
  return `${s.getDate()} ${MONTHS[s.getMonth()]}`;
}

function signed(n: number): string {
  return (n > 0 ? '+' : '−') + Math.abs(n);
}

function metricOf(scan: ScanRow | undefined, key: 'score' | MetricKey): number | null {
  if (!scan) return null;
  const v = key === 'score' ? scan.skin_score : scan.full_result?.metricas?.[key];
  return typeof v === 'number' ? v : null;
}

export default function Progresso() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const uid = useUserId();
  const [scrolled, setScrolled] = useState(false);
  const [tab, setTab] = useState<(typeof SERIES)[number]['key']>('score');
  const [tipW, setTipW] = useState(0);

  const fetchProgress = useCallback(async (): Promise<ProgressData> => {
    const [{ data: scans }, { data: photo }, { data: userRow }] = await Promise.all([
      supabase.from('skin_scans')
        .select('created_at, skin_score, foto_url, full_result')
        .eq('user_id', uid!)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('routine_photos')
        .select('taken_on')
        .eq('user_id', uid!)
        .order('taken_on', { ascending: true })
        .limit(1)
        .maybeSingle(),
      // A foto escolhida pela usuária (galeria → ajuste) vale mais que a do scan, como na home.
      supabase.from('users').select('foto_home_url').eq('id', uid!).maybeSingle(),
    ]);
    return {
      scans: (scans ?? []) as ScanRow[],
      firstPhotoOn: photo?.taken_on ?? null,
      fotoHomeUrl: userRow?.foto_home_url ?? null,
    };
  }, [uid]);

  // Revalida a cada foco (um scan novo tem de aparecer na volta), sem piscar.
  const { data } = useCachedQuery(uid ? `progresso:${uid}` : null, fetchProgress, { enabled: Boolean(uid), staleMs: 0 });

  const now = new Date();
  // Noturno a partir das 18h, como a home (38f).
  const scans = data?.scans ?? [];
  const last = scans[0];
  const prev = scans[1];
  const first = scans.length <= 1;

  // ── Topo: anel + Niks Score ──
  const score = last?.skin_score ?? null;
  // A tela muda de cor pela faixa do score (como a home antiga): 0–25 vermelho,
  // 26–50 laranja, 51–75 amarelo, 76–100 rosa. Fundo, número e anel acompanham.
  const theme = getScoreScreenTheme(score);
  const scoreColor = getScoreTheme(score).score;
  // Tom claro do fim do degradê do arco (`band.med` da 43g).
  const ringLight = score == null ? '#FFDEED' : score <= 25 ? '#FFEBEB' : score <= 50 ? '#FFE3D5' : score <= 75 ? '#FFF3D2' : '#FFDEED';
  // Só com 2+ scans: "+N desde o último scan". (A frase "Seu primeiro scan" saiu.)
  const deltaT = first || score == null || prev?.skin_score == null
    ? ''
    : `${signed(score - prev.skin_score)} desde o último scan`;

  // ── Próximo scan (de 7 em 7 dias a partir do último) ──
  const daysLeft = last ? Math.max(0, SCAN_INTERVAL_DAYS - daysBetween(new Date(last.created_at), now)) : 0;
  const nextT = daysLeft === 0 ? 'liberado' : daysLeft === 1 ? 'amanhã' : `em ${daysLeft} dias`;
  const lockedT = daysLeft === 0
    ? 'Seu gráfico começa no segundo scan.'
    : `Seu gráfico começa no segundo scan, daqui a ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}.`;

  // ── Card de métricas (grade 3 × 2) ──
  const metricas: Metricas = last?.full_result?.metricas ?? null;
  // Scan anterior às 6 métricas (`full_result` sem `metricas`): aviso por cima.
  const legacyScan = score != null && metricas == null;

  // ── Sua evolução (2+ scans): até 6 scans, do mais antigo ao mais novo ──
  const S = SERIES.find((s) => s.key === tab)!;
  const pts = scans.slice(0, 6).reverse()
    .map((s) => ({ v: metricOf(s, S.key), d: dayLabel(s.created_at, now, 'Hoje'), at: s.created_at }))
    .filter((p): p is { v: number; d: string; at: string } => p.v != null);
  const CW = 323, top = 34, bot = 128, n = pts.length;
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals), span = Math.max(1, max - min);
  const xy = pts.map((p, i) => [
    n > 1 ? 20 + i * (CW - 40) / (n - 1) : CW / 2,
    bot - (p.v - min) / span * (bot - top),
  ]);
  const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  const area = n ? `${line} L ${xy[n - 1][0]} 150 L ${xy[0][0]} 150 Z` : '';
  const diff = n ? vals[n - 1] - vals[0] : 0;
  const improved = S.better === 'up' ? diff > 0 : diff < 0;
  const weeks = n > 1 ? Math.max(1, Math.round(daysBetween(new Date(pts[0].at), new Date(pts[n - 1].at)) / 7)) : 0;
  const evoSub = `${S.label}: ${improved ? (S.better === 'up' ? '+' : '−') + Math.abs(diff) : diff} em ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
  const chartW = width - 36 - 34; // card (18 + 18 de margem) − 17 + 17 de respiro
  const sx = chartW / CW;

  // ── Seu timelapse (fotos do dia: 30 dias a partir da primeira) ──
  const tlDay = data?.firstPhotoOn
    ? Math.min(TIMELAPSE_DAYS, daysBetween(new Date(`${data.firstPhotoOn}T12:00:00`), now) + 1)
    : 1;
  const tlLeft = TIMELAPSE_DAYS - tlDay;

  const photo = data?.fotoHomeUrl ?? last?.foto_url ?? null;
  const pickPhoto = usePickProfilePhoto();

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const v = e.nativeEvent.contentOffset.y > 8;
    if (v !== scrolled) setScrolled(v);
  };

  const headerH = insets.top + 15 + 36 + 10;

  return (
    <View style={{ flex: 1, backgroundColor: theme.base }}>
      <StatusBar style="dark" />
      <LinearGradient colors={theme.bg} locations={BG_STOPS} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />
      <View style={[styles.circleBlob, { backgroundColor: theme.blob }]} pointerEvents="none" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentContainerStyle={{ paddingTop: headerH, paddingBottom: 112 }}
      >
        {/* Foto do último scan (Ø140, o tamanho de sempre) com o ARCO da tela 43g (Claude
            Design, NiksProgressScore v="home2"): anel de 5 pt em degradê 160° da cor da faixa
            do score até o tom claro da faixa, sombra 0 14 30 rgba(120,60,72,.14). O bloco
            ocupa os mesmos 168 pt de antes, para o resto da tela não se mover. */}
        <View style={{ marginTop: 22, height: 168, alignItems: 'center', justifyContent: 'center' }}>
          {/* Tocar na foto = trocar pela galeria e enquadrar no círculo (como na home antiga). */}
          <TouchableOpacity activeOpacity={0.85} onPress={pickPhoto} style={styles.photoRing} accessibilityLabel="Trocar foto de perfil">
            <LinearGradient
              colors={[scoreColor, ringLight]}
              start={{ x: 0.33, y: 0 }}
              end={{ x: 0.67, y: 1 }}
              style={styles.photoRingFill}
            >
              <View style={styles.photoInner}>
                {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        {/* Número primeiro e "Niks score" embaixo dele (referência do produto, out/2026). */}
        <Text style={[styles.center, { marginTop: 22, height: 70, fontSize: 64, fontWeight: '800', lineHeight: 70, letterSpacing: -1.8, color: scoreColor }]}>{score ?? '—'}</Text>
        <Text style={[styles.center, { marginTop: 2, height: 25, fontSize: 20, fontWeight: '700', lineHeight: 25, letterSpacing: -0.4 }]}>Niks score</Text>
        {/* Linha ondulada sob "Niks score" — cópia da tela 43g (Claude Design, NiksProgressScore
            v="home2"): 150 × 12, traço 3 na cor da faixa do score. */}
        <View style={{ marginTop: 4, alignItems: 'center' }}>
          <Svg width={150} height={12} viewBox="0 0 150 12">
            <Path
              d="M3 6 q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0"
              fill="none" stroke={scoreColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
            />
          </Svg>
        </View>
        {!!deltaT && (
          <Text style={[styles.center, { marginTop: 14, height: 22, fontSize: 17, fontWeight: '400', lineHeight: 22, letterSpacing: -0.3 }]}>{deltaT}</Text>
        )}

        {/* ── Card de métricas da home antiga (versão B, Figma node 1:63) ──
            Grade 3 × 2 (mais quadrada, referência do produto). Cada métrica = label (SF Pro) +
            valor (SF Pro bold) + barra no semáforo de `metricColor`. TOCAR NO CARD =
            compartilhar (como na home antiga). O toque fica num wrapper POR FORA: o card
            tem `overflow: 'hidden'`, que já atrapalhou toque no New Architecture. */}
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={score == null}
          accessibilityRole="button"
          accessibilityLabel="Compartilhar minhas métricas"
          style={styles.metricsCardTouch}
          onPress={() => { haptics.tap(); router.push('/(share)/share-capture' as any); }}
        >
          <View style={styles.metricsCard}>
            {/* Grade 3 × 2 (referência do produto, out/2026): em cada célula o nome fica
                numa área de 2 linhas alinhada por baixo — todos os números na mesma
                altura — e a barra ocupa a largura toda da coluna. */}
            <View style={[styles.metricsGrid, legacyScan && { opacity: 0.22 }]}>
              {METRIC_DEFS.map((m) => {
                const v = metricas?.[m.key] ?? null;
                const fill = v == null ? 0 : v / 100;
                const barColor = v == null ? 'transparent' : metricColor(v, m.positive);
                return (
                  <View key={m.label} style={styles.metricCell}>
                    <View style={styles.metricLabelBox}>
                      <Text numberOfLines={2} style={styles.metricLabel}>{CARD_LABEL[m.key] ?? m.label}</Text>
                    </View>
                    <Text style={styles.metricValue}>{v == null ? '—' : v}</Text>
                    <View style={styles.metricTrack}>
                      <View style={[styles.metricFill, { width: `${fill * 100}%`, backgroundColor: barColor }]} />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Scan anterior às 6 métricas: as métricas ficam de fundo e o aviso por cima. */}
            {legacyScan && (
              <View style={styles.metricsLock} pointerEvents="none">
                <Text style={{ color: INK, textAlign: 'center', letterSpacing: -0.3, fontWeight: '800', fontSize: 15 }}>
                  Aprimoramos a análise de pele.
                </Text>
                <Text style={{ color: '#818181', textAlign: 'center', fontWeight: '600', fontSize: 12.5, lineHeight: 17, marginTop: 6 }}>
                  Faça um novo scan para desbloquear suas 6 novas métricas e ter uma análise mais precisa.
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Sua evolução */}
        <SectionHead style={{ marginTop: 30 }} title="Sua evolução" />
        <View style={styles.card}>
          {first ? (
            <View style={{ paddingTop: 16, paddingHorizontal: 17, paddingBottom: 17, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <LockBadge size={38} icon={19} />
              <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: BODY }}>{lockedT}</Text>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal showsHorizontalScrollIndicator={false}
                style={{ marginTop: 14, marginHorizontal: 14, borderRadius: 100, backgroundColor: '#F8F1F4' }}
                contentContainerStyle={{ padding: 3, gap: 2 }}
              >
                {SERIES.map((s) => {
                  const on = s.key === tab;
                  return (
                    <TouchableOpacity
                      key={s.key} activeOpacity={0.85}
                      onPress={() => { haptics.select(); setTab(s.key); }}
                      style={[styles.tab, on && styles.tabOn]}
                    >
                      <Text style={{ fontSize: 15, fontWeight: on ? '600' : '500', letterSpacing: -0.2, color: on ? INK : SOFT }}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={{ paddingTop: 14, paddingHorizontal: 17, fontSize: 15, letterSpacing: -0.2, color: SOFT }}>{evoSub}</Text>
              <View style={{ marginTop: 16, marginHorizontal: 17, height: 150 }}>
                <Svg width="100%" height={150} viewBox={`0 0 ${CW} 150`} preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgLinearGradient id="pgFillH2" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={PINK} stopOpacity={0.22} />
                      <Stop offset="100%" stopColor={PINK} stopOpacity={0} />
                    </SvgLinearGradient>
                  </Defs>
                  {[20, 75, 130].map((y) => (
                    <Line key={y} x1={0} y1={y} x2={CW} y2={y} stroke="#F1E6EB" strokeWidth={1} strokeDasharray="3 4" />
                  ))}
                  {n > 0 && <Path d={area} fill="url(#pgFillH2)" />}
                  {n > 0 && <Path d={line} fill="none" stroke={PINK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
                </Svg>
                {xy.map((p, i) => {
                  const sz = i === n - 1 ? 14 : 10;
                  return (
                    <View key={i} style={{
                      position: 'absolute', left: p[0] * sx - sz / 2, top: p[1] - sz / 2, width: sz, height: sz,
                      borderRadius: sz / 2, borderWidth: 2.5, borderColor: PINK, backgroundColor: i === n - 1 ? PINK : '#FFFFFF',
                    }} />
                  );
                })}
                {n > 0 && (
                  // `translate(-50%, -100%)` do design: centrado no último ponto, base 12 pt acima dele.
                  <View
                    onLayout={(e) => setTipW(e.nativeEvent.layout.width)}
                    style={[styles.tip, { position: 'absolute', left: xy[n - 1][0] * sx - tipW / 2, top: xy[n - 1][1] - 12 - 26 }]}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600', letterSpacing: -0.2 }}>{vals[n - 1]}</Text>
                  </View>
                )}
              </View>
              <View style={{ marginTop: 10, marginHorizontal: 17, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
                {pts.map((p, i) => (
                  <Text key={i} style={{
                    width: 40, textAlign: 'center', fontSize: 13, letterSpacing: -0.1,
                    color: i === n - 1 ? INK : MUTED, fontWeight: i === n - 1 ? '600' : '400',
                  }}>{p.d}</Text>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Seus scans */}
        <SectionHead style={{ marginTop: 30 }} title="Seus scans" right={`${scans.length} ${scans.length === 1 ? 'scan' : 'scans'}`} />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={{ marginTop: 9 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 18, paddingBottom: 14 }}
        >
          <View style={[styles.scanCard, { paddingTop: 14, paddingHorizontal: 13, paddingBottom: 13, justifyContent: 'space-between' }]}>
            <LockBadge size={38} icon={19} />
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', lineHeight: 19, letterSpacing: -0.4, color: INK }}>Próximo scan</Text>
              <Text style={{ fontSize: 15, letterSpacing: -0.2, color: SOFT }}>{nextT}</Text>
            </View>
          </View>
          {scans.map((s) => (
            <View key={s.created_at} style={[styles.scanCard, { padding: 3 }]}>
              <View style={styles.scanInner}>
                {s.foto_url ? <Image source={{ uri: s.foto_url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                <View style={styles.scanBadge}>
                  <Text style={{ fontSize: 14, fontWeight: '700', letterSpacing: -0.3, color: '#FFFFFF' }}>{s.skin_score ?? '—'}</Text>
                </View>
                <LinearGradient
                  colors={['rgba(18,18,18,0)', 'rgba(18,18,18,0.55)']}
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 22, paddingHorizontal: 9, paddingBottom: 8 }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: '#FFFFFF' }}>{dayLabel(s.created_at, now, 'Hoje')}</Text>
                </LinearGradient>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Seu timelapse */}
        <SectionHead style={{ marginTop: 16 }} title="Seu timelapse" right={`Dia ${tlDay} de ${TIMELAPSE_DAYS}`} />
        <View style={styles.card}>
          <View style={{ height: 170, overflow: 'hidden', backgroundColor: '#FDE6EF' }}>
            {photo ? (
              <Image
                source={{ uri: photo }} contentFit="cover" blurRadius={14}
                style={{ position: 'absolute', top: -20, left: -20, right: -20, bottom: -20, opacity: 0.75 }}
              />
            ) : null}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,227,239,0.35)' }]} />
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 10 }]}>
              <LockBadge size={50} icon={24} glow />
              <Text style={{ fontSize: 28, fontWeight: '700', lineHeight: 33, letterSpacing: -0.6, color: INK }}>
                {tlLeft === 0 ? 'Seu vídeo está pronto' : `Faltam ${tlLeft} ${tlLeft === 1 ? 'dia' : 'dias'}`}
              </Text>
            </View>
          </View>
          <View style={{ paddingTop: 14, paddingHorizontal: 17 }}>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${(tlDay / TIMELAPSE_DAYS) * 100}%` }]} /></View>
          </View>
          <View style={{ paddingTop: 12, paddingHorizontal: 17, paddingBottom: 16 }}>
            <Text style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.3, color: BODY }}>
              Tire a foto do dia sempre que terminar sua rotina da manhã. Em 30 dias, elas viram um vídeo da sua evolução.
            </Text>
          </View>
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Cabeçalho fixo: transparente no topo; ao rolar, rosado + desfoque (blur 18 do
          design) + linha embaixo — sem o desfoque o conteúdo aparece por trás. */}
      <View style={[
        styles.header,
        { paddingTop: insets.top + 15 },
        scrolled && { borderBottomColor: 'rgba(192,32,106,0.10)' },
      ]}>
        {scrolled && (
          <>
            <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.header }]} />
          </>
        )}
        <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); router.back(); }} style={styles.hdrBtn}>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d={BACK_PATH} fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: INK }}>Seu progresso</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!last}
          onPress={() => { haptics.tap(); router.push('/(share)/share-capture' as any); }}
          style={styles.hdrBtn}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d={SHARE_PATH} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SectionHead({ title, right, style }: { title: string; right?: string; style?: object }) {
  return (
    <View style={[{ paddingHorizontal: 18, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }, style]}>
      <Text style={{ fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK }}>{title}</Text>
      {right ? <Text style={{ fontSize: 15, color: MUTED }}>{right}</Text> : null}
    </View>
  );
}

function LockBadge({ size, icon, glow }: { size: number; icon: number; glow?: boolean }) {
  return (
    <View style={[
      { width: size, height: size, borderRadius: size / 2, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
      glow && { shadowColor: PINK, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 7 },
    ]}>
      <Svg width={icon} height={icon} viewBox="0 0 24 24">
        <Rect {...LOCK_RECT} fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={LOCK_PATH} fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
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
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    paddingHorizontal: 20, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: 'transparent',
  },
  hdrBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
  },
  center: { textAlign: 'center', color: INK },
  photoRing: {
    width: 150, height: 150, borderRadius: 75,
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.14, shadowRadius: 15,
    elevation: 6,
  },
  photoRingFill: { flex: 1, borderRadius: 75, padding: 5 },
  photoInner: { flex: 1, borderRadius: 70, overflow: 'hidden', backgroundColor: '#FDE6EF' },
  card: { marginTop: 10, marginHorizontal: 18, backgroundColor: '#FFFFFF', borderRadius: 13, overflow: 'hidden' },
  // Card de métricas da home antiga (versão B).
  metricsCardTouch: { marginTop: 36, marginHorizontal: 17 },
  metricsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingTop: 14, paddingBottom: 18, paddingHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10,
  },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 22 },
  metricCell: { width: '29.5%' },
  metricLabelBox: { height: 36, justifyContent: 'flex-end' },
  metricLabel: { fontSize: 13.5, lineHeight: 17, fontWeight: '500', letterSpacing: -0.2, color: '#4A4448' },
  metricValue: { marginTop: 4, fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.6, color: INK },
  metricTrack: { marginTop: 8, height: 5, borderRadius: 3, backgroundColor: '#F1ECEE', overflow: 'hidden' },
  metricFill: { height: '100%', borderRadius: 3 },
  metricsLock: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  baselineRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  bar: { height: 4, borderRadius: 2, backgroundColor: TRACK, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: PINK },
  tab: { height: 32, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 100 },
  tabOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 5,
  },
  tip: { height: 26, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 100, backgroundColor: PINK, alignSelf: 'flex-start' },
  scanCard: {
    width: 120, height: 142, borderRadius: 18, borderWidth: 2, borderColor: PINK,
    backgroundColor: 'rgba(255,255,255,0.58)',
    shadowColor: '#C0206A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.09, shadowRadius: 12,
  },
  scanInner: { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#FDE6EF' },
  scanBadge: {
    position: 'absolute', top: 7, left: 7, width: 34, height: 34, borderRadius: 17,
    backgroundColor: PINK, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
});
