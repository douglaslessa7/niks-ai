import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useAppStore } from '../../store/onboarding';
import { useFaceScan } from '../../hooks/useFaceScan';
import { supabase } from '../../lib/supabase';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { contarPassosMinhaRotina } from '../../lib/minhaRotina';
import { getUserId, useUserId } from '../../lib/currentUser';
import { scheduleRoutineReminders } from '../../lib/routineReminders';
import { onCoachPrepare, setCoachStageReady } from '../../lib/coachMarks';
import {
  getRoutineHistory, routineStreak, routinesDoneOn, sessionDate,
  RoutineHistory, RoutinePeriod,
} from '../../lib/routineProgress';
import { BG_STOPS, homeTheme, isNightTheme } from '../../lib/homeTheme';

// ─────────────────────────────────────────────────────────────────────────────
// Home — réplica do design 38e do Claude Design ("NIKS home redesign — rotina
// skincare", NiksScreen.dc.html → NiksHomeFlo com base=7 layout=pill header=greet
// streak-style=5). A partir das 18h vira a 38f (theme="night"): muda só o fundo,
// a bolha de cor e o fundo do cabeçalho rolado.
// Medidas copiadas do frame de 393×852: o topo do conteúdo (69) é a barra de status
// do frame (54) + 15, por isso aqui é `insets.top + 15`.
// Fonte = SF Pro (fonte do sistema, sem fontFamily), como no design.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_DEEP = '#C0206A';

// BG7 / BGN do design (mesmas paradas).
// Fundo dia (BG7) / noite (BGN) vem de lib/homeTheme (fonte única, também usada por
// "Seu progresso" e pelo alarme).

const LET = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Fundo da foto do produto em "Seus produtos": branco para todos (pedido do usuário —
// só o produto, sem a cor por categoria do design).
const PRODUCT_BG = '#FFFFFF';

const DEFAULT_AM = 7 * 60;
const DEFAULT_PM = 21 * 60;
const AM_WINDOW_END = 12 * 60; // a "hora" da rotina da manhã vai até o meio-dia
const NIGHT_WINDOW_END = 4 * 60; // a da noite, até as 04:00 (mesma virada da sessão)
const MIN_PER_STEP = 3; // mesma conta da Rotina (~3 min por passo)

type HomeProduct = { id: string; name: string; img: string; step: string };

type HomeData = {
  fotoUrl: string | null;
  skinScore: number | null;
  firstName: string;
  amTime: number;
  pmTime: number;
  amCount: number;
  pmCount: number;
  products: { am: HomeProduct[]; pm: HomeProduct[] };
  homeTutorialSeenAt: string | null;
  /** created_at do último scan de rosto — conta os 7 dias até o próximo (51a). */
  lastScanAt: string | null;
};

// Scan de rosto de 7 em 7 dias (51a): dias que faltam a partir do último scan,
// contados em dias de calendário com a virada às 04:00 (a mesma da rotina).
const SCAN_INTERVAL_DAYS = 7;
function scanDaysLeft(lastScanAt: string | null, now: Date): number {
  if (!lastScanAt) return 0;
  const passed = Math.round((sessionDate(now).getTime() - sessionDate(new Date(lastScanAt)).getTime()) / 86_400_000);
  return Math.max(0, SCAN_INTERVAL_DAYS - passed);
}

function parseTime(v: unknown, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

// Minutos de agora até `target` (minuto do dia), sempre no futuro.
function minutesUntil(target: number, nowMin: number): number {
  const d = target - nowMin;
  return d > 0 ? d : d + 24 * 60;
}

// ── Os 3 estados do herói (ST7 a/b/c do design) ─────────────────────────────
// a · antes do horário: "Sua rotina da noite em" + contagem regressiva + "Ver rotina"
// b · na hora:          "Hora da sua rotina da manhã" + duração + "Iniciar rotina"
// c · concluída:        "Rotina da manhã concluída" + "Xh até a rotina da noite", sem botão
type Hero = {
  label: string; num: string; phrase: string; info: boolean;
  btn: string | null; done: boolean; focus: RoutinePeriod;
};

function heroFor(now: Date, d: HomeData, hist: RoutineHistory): Hero {
  const t = now.getHours() * 60 + now.getMinutes();
  const day = hist[keyOf(sessionDate(now))] ?? {};
  const amEnd = Math.min(AM_WINDOW_END, d.pmTime);
  const passos = (n: number) => `${n} ${n === 1 ? 'passo' : 'passos'}`;
  const dur = (n: number) => fmtDuration(Math.max(n, 1) * MIN_PER_STEP);

  if (t >= d.pmTime || t < NIGHT_WINDOW_END) {
    if (day.pm) {
      return { label: 'Rotina da noite concluída', num: fmtDuration(minutesUntil(d.amTime, t)), phrase: 'até a rotina da manhã', info: false, btn: null, done: true, focus: 'am' };
    }
    return { label: 'Hora da sua rotina da noite', num: dur(d.pmCount), phrase: passos(d.pmCount), info: true, btn: 'Iniciar rotina', done: false, focus: 'pm' };
  }
  if (t >= d.amTime && t < amEnd) {
    if (day.am) {
      return { label: 'Rotina da manhã concluída', num: fmtDuration(minutesUntil(d.pmTime, t)), phrase: 'até a rotina da noite', info: false, btn: null, done: true, focus: 'pm' };
    }
    return { label: 'Hora da sua rotina da manhã', num: dur(d.amCount), phrase: passos(d.amCount), info: true, btn: 'Iniciar rotina', done: false, focus: 'am' };
  }
  if (t < d.amTime) {
    return { label: 'Sua rotina da manhã em', num: fmtDuration(minutesUntil(d.amTime, t)), phrase: passos(d.amCount), info: true, btn: 'Ver rotina', done: false, focus: 'am' };
  }
  return { label: 'Sua rotina da noite em', num: fmtDuration(minutesUntil(d.pmTime, t)), phrase: passos(d.pmCount), info: true, btn: 'Ver rotina', done: false, focus: 'pm' };
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Semana (domingo → sábado da sessão de hoje) ─────────────────────────────
// Rosa cheio = manhã e noite · anel rosa = só uma · pontilhado = futuro · sem marca = nada.
type DayCell = {
  l: string; n: number; today: boolean;
  kind: 'full' | 'half' | 'empty' | 'future';
};

function weekFor(now: Date, hist: RoutineHistory): DayCell[] {
  const today = sessionDate(now);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  return LET.map((L, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isToday = d.getTime() === today.getTime();
    const done = routinesDoneOn(hist, d);
    const kind = d.getTime() > today.getTime() ? 'future' : done === 2 ? 'full' : done === 1 ? 'half' : 'empty';
    return { l: isToday ? 'HOJE' : L, n: d.getDate(), today: isToday, kind };
  });
}

// ── Ícones (paths copiados do design) ───────────────────────────────────────
const FLAME = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';

// Cards "Pra você · Hoje" do design 38x (for-you="p6", "Ícone como o dia do
// calendário"): um path por card, branco sobre o círculo rosa.
const CARD_ICONS = {
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8.5 14.5s1.3 1.5 3.5 1.5 3.5-1.5 3.5-1.5M9 9.5h.01M15 9.5h.01',
  prog: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  chat: 'M21 12a8.5 8.5 0 0 1-12.2 7.6L3.5 21l1.3-4.8A8.5 8.5 0 1 1 21 12zM8.5 11h7M8.5 14h4.5',
  prod: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M10.5 7h3M11 7v2M13 7v2M10.6 9h2.8a1.6 1.6 0 0 1 1.6 1.6v4.8a1.6 1.6 0 0 1-1.6 1.6h-2.8a1.6 1.6 0 0 1-1.6-1.6v-4.8a1.6 1.6 0 0 1 1.6-1.6z',
  coll: 'M10 2.5h4v3h-4zM9.5 5.5h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3v-10a3 3 0 0 1 3-3zM10.7 10h2.6a1.2 1.2 0 0 1 1.2 1.2v4.6a1.2 1.2 0 0 1-1.2 1.2h-2.6a1.2 1.2 0 0 1-1.2-1.2v-4.6a1.2 1.2 0 0 1 1.2-1.2z',
  alarm: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M5 3L2 6M22 6l-3-3',
  cal: 'M8 2v4M16 2v4M4.5 5h15A1.5 1.5 0 0 1 21 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-13A1.5 1.5 0 0 1 4.5 5zM3 10h18',
  tip: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
} as const;

type CardIcon = keyof typeof CARD_ICONS;

// Cadeado do card de scan bloqueado (51a), em #C0206A sobre o círculo #F6D3E3.
const LOCK_PATH = 'M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5';

// Anel pontilhado do dia futuro (`2px dotted rgba(192,32,106,.45)` do design). Em SVG
// porque borda `dotted` com raio não é confiável no Fabric.
function DottedRing({ size }: { size: number }) {
  const r = (size - 2) / 2;
  const c = 2 * Math.PI * r;
  const gap = c / Math.round(c / 4);
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(192,32,106,0.45)" strokeWidth={2}
        strokeDasharray={[0.001, gap]} strokeLinecap="round"
      />
    </Svg>
  );
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { startFaceScan } = useFaceScan();
  const setStoreSkinScore = useAppStore((s) => s.setSkinScore);
  const setProductDetailTarget = useAppStore((s) => s.setProductDetailTarget);
  const userId = useUserId();

  // Relógio da tela: o herói é uma contagem regressiva, então avança a cada minuto.
  const [now, setNow] = useState(() => new Date());
  const [hist, setHist] = useState<RoutineHistory>({});

  // Ao focar: relê o histórico (a cerimônia pode ter acabado de gravar).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setNow(new Date());
      getRoutineHistory().then((h) => { if (active) setHist(h); });
      const id = setInterval(() => setNow(new Date()), 30_000);
      return () => { active = false; clearInterval(id); };
    }, [])
  );

  // ── Carga da home, cacheada (stale-while-revalidate) ──────────────────────
  const fetchHome = useCallback(async (): Promise<HomeData> => {
    const uid = await getUserId();
    if (!uid) throw new Error('sem sessão');

    const [scanRes, userRes, protoRes, recRes, minhaCount] = await Promise.all([
      supabase
        .from('skin_scans')
        .select('foto_url, full_result, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // `home_tutorial_seen_at` pega carona nesta consulta — é a verdade de "esta
      // CONTA já viu o tutorial" (ver lib/homeTutorial.ts).
      supabase
        .from('users')
        .select('nome, foto_home_url, home_tutorial_seen_at, rotina_manha_horario, rotina_noite_horario')
        .eq('id', uid)
        .maybeSingle(),
      supabase
        .from('protocolos')
        .select('rotina_am, rotina_pm')
        .eq('user_id', uid)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('recomendacoes_produtos')
        .select('recomendacao')
        .eq('user_id', uid)
        .maybeSingle(),
      // Nº de passos = os da MINHA ROTINA (a que ela faz); antes de ela existir, os da ideal.
      contarPassosMinhaRotina(uid).catch(() => null),
    ]);

    const scan = scanRes.data;
    const user = userRes.data;
    const proto = protoRes.data;

    // "Seus produtos": o produto principal de cada passo, separado por período e
    // numerado na ordem dos passos daquele período ("Passo 2 · Hidratação").
    const passos: any[] = Array.isArray(recRes.data?.recomendacao) ? recRes.data!.recomendacao : [];
    const raw: Record<RoutinePeriod, { id: string; step: string }[]> = { am: [], pm: [] };
    for (const period of ['am', 'pm'] as const) {
      const doPeriodo = passos.filter((p) => p?.periodo === period || p?.periodo === 'am+pm');
      doPeriodo.forEach((p, i) => {
        if (p?.sem_produto) return;
        const prods = p?.produtos ?? [];
        const principal = prods.find((x: any) => x?.principal) ?? prods[0];
        if (!principal?.produto_id) return;
        raw[period].push({ id: principal.produto_id, step: `Passo ${i + 1} · ${p.categoria ?? ''}` });
      });
    }
    const ids = [...new Set([...raw.am, ...raw.pm].map((r) => r.id))];
    const byId = new Map<string, any>();
    if (ids.length) {
      const { data: prods } = await supabase
        .from('produtos')
        .select('id, nome, imagem_url, imagem_recorte_url, imagem_recorte_status')
        .in('id', ids);
      (prods ?? []).forEach((p: any) => byId.set(p.id, p));
    }
    const resolve = (list: typeof raw.am): HomeProduct[] => list
      .filter((r) => byId.has(r.id))
      .map((r) => {
        const p = byId.get(r.id);
        // Recorte sem fundo quando pronto — algumas fotos originais têm fundo cinza embutido.
        const img = p.imagem_recorte_status === 'ok' && p.imagem_recorte_url ? p.imagem_recorte_url : p.imagem_url;
        return { id: r.id, name: p.nome, img, step: r.step };
      });

    const full = (scan?.full_result ?? null) as { skin_score?: number } | null;
    return {
      // Precedência ABSOLUTA da foto escolhida na galeria (ver README).
      fotoUrl: user?.foto_home_url ?? scan?.foto_url ?? null,
      skinScore: typeof full?.skin_score === 'number' ? full.skin_score : null,
      firstName: String(user?.nome ?? '').trim().split(/\s+/)[0] ?? '',
      amTime: parseTime(user?.rotina_manha_horario, DEFAULT_AM),
      pmTime: parseTime(user?.rotina_noite_horario, DEFAULT_PM),
      amCount: minhaCount?.am ?? (Array.isArray(proto?.rotina_am) ? proto!.rotina_am.length : 0),
      pmCount: minhaCount?.pm ?? (Array.isArray(proto?.rotina_pm) ? proto!.rotina_pm.length : 0),
      products: { am: resolve(raw.am), pm: resolve(raw.pm) },
      homeTutorialSeenAt: (user?.home_tutorial_seen_at ?? null) as string | null,
      lastScanAt: (scan?.created_at ?? null) as string | null,
    };
  }, []);

  const { data: cached, state: homeState } = useCachedQuery<HomeData>(
    userId ? `home:${userId}` : null,
    fetchHome,
    { enabled: Boolean(userId) },
  );
  const loading = cached == null && homeState !== 'error';

  // Um cache gravado pela home anterior não tem os campos novos — completa com padrões.
  const d: HomeData = {
    fotoUrl: cached?.fotoUrl ?? null,
    skinScore: cached?.skinScore ?? null,
    firstName: cached?.firstName ?? '',
    amTime: cached?.amTime ?? DEFAULT_AM,
    pmTime: cached?.pmTime ?? DEFAULT_PM,
    amCount: cached?.amCount ?? 0,
    pmCount: cached?.pmCount ?? 0,
    products: cached?.products ?? { am: [], pm: [] },
    homeTutorialSeenAt: cached?.homeTutorialSeenAt as string | null,
    lastScanAt: cached?.lastScanAt ?? null,
  };

  useEffect(() => {
    if (cached) setStoreSkinScore(cached.skinScore ?? null);
  }, [cached, setStoreSkinScore]);

  // Lembretes diários da rotina no horário dela (notificação local; não reagenda se
  // nada mudou). Ver lib/routineReminders.ts.
  useEffect(() => {
    if (!cached) return;
    scheduleRoutineReminders({
      am: { minutes: d.amTime },
      pm: { minutes: d.pmTime },
    });
  }, [cached]);

  // ── Tutorial de primeiro acesso: aplica o "já viu" do servidor e SÓ DEPOIS
  // libera o palco, no mesmo efeito (ver README → "Quem vê").
  const homeTutorialSeenAt = cached?.homeTutorialSeenAt;
  const markHomeTutorialSeen = useAppStore((s) => s.markHomeTutorialSeen);
  useEffect(() => {
    if (homeTutorialSeenAt) markHomeTutorialSeen();
    setCoachStageReady(!loading && homeTutorialSeenAt !== undefined);
    return () => setCoachStageReady(false);
  }, [loading, homeTutorialSeenAt, markHomeTutorialSeen]);

  const scrollRef = useRef<ScrollView | null>(null);
  useEffect(() => onCoachPrepare(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }), []);

  // Cabeçalho fixo: transparente no topo; ao rolar ganha o fundo rosado + linha
  // (`transition: background .2s` do design).
  const [scrolled, setScrolled] = useState(false);
  const hdrAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(hdrAnim, { toValue: scrolled ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [scrolled, hdrAnim]);

  const theme = homeTheme(isNightTheme(now)); // 38f — a partir das 18h
  const hero = heroFor(now, d, hist);
  const days = weekFor(now, hist);
  const streak = routineStreak(hist, now);
  const products = d.products[hero.focus];

  const go = (path: string) => { haptics.tap(); router.push(path as any); };

  // Scan de rosto a cada 7 dias (51a): bloqueado enquanto faltam dias.
  const scanDays = scanDaysLeft(d.lastScanAt, now);

  // Cards "Pra você · Hoje" da 51a: depois do card de scan vem Progresso e então a
  // lista PC2 do design (sem o progresso repetido).
  const cards: { text: string; icon: CardIcon; onPress?: () => void }[] = [
    { text: 'Progresso', icon: 'prog', onPress: () => go('/progresso') },
    { text: 'NIKS Chat', icon: 'chat', onPress: () => go('/niks-chat') },
    { text: 'Escanear produto', icon: 'prod', onPress: () => go('/(scan)/product-camera') },
    { text: 'Minha coleção', icon: 'coll', onPress: () => go('/recomendacao-produtos') },
    { text: 'Alarme de rotina', icon: 'alarm', onPress: () => go('/alarme') },
    { text: 'Ver calendário', icon: 'cal', onPress: () => go('/calendario') },
    { text: 'Dica do dia', icon: 'tip' },
  ];

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={theme.bg}
        locations={BG_STOPS}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.circleWhite} pointerEvents="none" />
      <View style={[styles.circleBlob, { backgroundColor: theme.blob }]} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const v = e.nativeEvent.contentOffset.y > 8;
          if (v !== scrolled) setScrolled(v);
        }}
        contentContainerStyle={{ paddingBottom: 112 }}
      >
        {/* Espaço do cabeçalho fixo (ele flutua por cima, ver abaixo). */}
        <View style={{ height: insets.top + 15 + 32 + 8 }} />

        {/* ── Semana ───────────────────────────────────────────────────── */}
        <View style={styles.week}>
          {days.map((day, i) => {
            const sz = day.today ? 50 : 34;
            const fullToday = day.today && day.kind === 'full';
            const bg = fullToday ? PINK : day.today ? '#FFFFFF' : day.kind === 'full' ? PINK : 'transparent';
            // Número: branco sobre o círculo rosa cheio (manhã + noite); rosa escuro no dia com
            // só uma rotina (anel rosa) — o mesmo tom do calendário 42b; preto nos demais.
            const nc = day.kind === 'full' ? '#FFFFFF' : day.kind === 'half' ? PINK_DEEP : INK;
            return (
              // Tocar em qualquer dia abre o calendário (42b).
              <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => go('/calendario')} style={styles.dayCol}>
                <Text style={[styles.dayLetter, day.today && { fontWeight: '700', color: INK }]}>{day.l}</Text>
                <View style={styles.daySlot}>
                  <View
                    style={[
                      { width: sz, height: sz, borderRadius: sz / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
                      day.kind === 'half' && { borderWidth: 2, borderColor: PINK },
                      day.today && styles.todayShadow,
                    ]}
                  >
                    {day.kind === 'future' && <DottedRing size={sz} />}
                    <Text style={{ fontSize: day.today ? 18 : 17, fontWeight: day.today ? '700' : '400', letterSpacing: -0.3, color: nc }}>
                      {day.n}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Herói: rotina ─────────────────────────────────────────────── */}
        <Text style={styles.heroLabel}>{hero.label}</Text>
        <Text style={styles.heroNum}>{hero.num}</Text>
        {/* 51a: a linha da frase "N passos ⓘ" continua no lugar, vazia (phrase: '',
            info: false quando há o card de scan). */}
        <View style={styles.heroPhrase} />
        {/* ── Botão rosa da 38o: "Ver rotina"/"Iniciar rotina" (some com a rotina feita) ── */}
        {!hero.done && hero.btn && (
          <View style={{ marginTop: 28, alignItems: 'center' }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { haptics.action(); router.push('/protocolo' as any); }}
              style={styles.heroPill}
            >
              <Text style={styles.heroPillText}>{hero.btn}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Pra você · Hoje ──────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { marginTop: hero.done ? 56 : 40 }]}>Pra você · Hoje</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10 }}
          contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 18, paddingBottom: 14, gap: 8 }}
        >
          {/* Primeiro card = scan de rosto. Bloqueado (51a · scan-card="a"): contorno
              rosa a 35%, cadeado #C0206A sobre #F6D3E3, título apagado e "Faltam N
              dias". Liberado: card normal, abre o scan. */}
          {scanDays > 0 ? (
            <View style={[styles.card, styles.cardLocked]}>
              <View style={[styles.cardClip, styles.cardClipLocked]}>
                <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
                <View style={styles.cardInner}>
                  <View style={[styles.cardCircle, { backgroundColor: '#F6D3E3' }]}>
                    <Svg width={18} height={18} viewBox="0 0 24 24">
                      <Rect x={5} y={10.5} width={14} height={10} rx={2.5} fill="none" stroke={PINK_DEEP} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      <Path d={LOCK_PATH} fill="none" stroke={PINK_DEEP} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>
                  <View style={{ gap: 2 }}>
                    <Text style={[styles.cardText, { color: 'rgba(18,18,18,0.55)' }]}>Analisar minha pele</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: PINK_DEEP }}>
                      {scanDays === 1 ? 'Falta 1 dia' : `Faltam ${scanDays} dias`}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.action(); startFaceScan(); }} style={styles.card}>
              <View style={styles.cardClip}>
                <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
                <View style={styles.cardInner}>
                  <View style={styles.cardCircle}>
                    <Svg width={19} height={19} viewBox="0 0 24 24">
                      <Path d={CARD_ICONS.scan} fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>
                  <Text style={styles.cardText}>Analisar minha pele</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          {cards.map((c) => (
            // Vidro: branco 58% + desfoque (backdrop-filter blur 16) + contorno rosa.
            // A sombra fica no wrapper; o recorte arredondado do desfoque, no de dentro
            // (overflow:hidden e sombra não convivem na mesma View — README #20).
            <TouchableOpacity
              key={c.icon}
              activeOpacity={c.onPress ? 0.85 : 1}
              disabled={!c.onPress}
              onPress={c.onPress}
              style={styles.card}
            >
              <View style={styles.cardClip}>
                <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
                <View style={styles.cardInner}>
                  <View style={styles.cardCircle}>
                    <Svg width={19} height={19} viewBox="0 0 24 24">
                      <Path d={CARD_ICONS[c.icon]} fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>
                  <Text style={styles.cardText} lineBreakStrategyIOS="push-out">{c.text}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Seus produtos · Rotina da manhã/noite ───────────────────── */}
        {products.length > 0 && (
          <View style={styles.surface}>
            <Text style={styles.surfaceTitle}>
              Seus produtos · {hero.focus === 'am' ? 'Rotina da manhã' : 'Rotina da noite'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 9, paddingTop: 16, paddingHorizontal: 17, paddingBottom: 20 }}
            >
              {products.map((p) => (
                <TouchableOpacity
                  key={`${p.id}-${p.step}`}
                  activeOpacity={0.85}
                  style={styles.prod}
                  onPress={() => {
                    haptics.tap();
                    setProductDetailTarget(p.id);
                    router.push('/recomendacao-produtos' as any);
                  }}
                >
                  <View style={[styles.prodImgBox, { backgroundColor: PRODUCT_BG }]}>
                    <ExpoImage source={{ uri: p.img }} style={styles.prodImg} contentFit="contain" />
                  </View>
                  <View style={{ gap: 2 }}>
                    <Text style={styles.prodName}>{p.name}</Text>
                    <Text style={styles.prodStep}>{p.step}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* ── Cabeçalho fixo: foto + "Olá, Nome" · sequência ───────────────
          No design é `position: sticky; top: 0` no topo da rolagem — ou seja, nunca
          se move. Aqui é uma camada absoluta por cima do ScrollView (o
          `stickyHeaderIndices` deslocava tudo no Fabric). */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 15, paddingBottom: 8 }}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: hdrAnim,
              backgroundColor: theme.header,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(192,32,106,0.10)',
            },
          ]}
        />
        <View style={styles.hdrRow}>
          <View style={styles.hdrLeft}>
            <View style={styles.avatarWrap}>
              {d.fotoUrl ? (
                <Image source={{ uri: d.fotoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#F6D3E1' }]} />
              )}
              <View style={styles.avatarDot} />
            </View>
            <Text style={styles.greet}>{d.firstName ? `Olá, ${d.firstName}` : 'Olá'}</Text>
          </View>

          {/* Sequência — estilo 5: círculo branco + selo rosa. Abre o calendário (42b). */}
          <TouchableOpacity activeOpacity={0.85} onPress={() => go('/calendario')} style={styles.streakBtn} accessibilityLabel="Abrir calendário">
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d={FLAME} fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeText}>{streak}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, // sem overflow:hidden — pai de ScrollView (README #24)

  // Círculos decorativos do fundo (fixos, não rolam).
  circleWhite: {
    position: 'absolute', width: 620, height: 620, borderRadius: 310,
    left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)',
  },
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280,
    left: 190, top: -90,
  },

  hdrRow: {
    height: 32, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  hdrLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrap: { width: 32, height: 32 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarDot: {
    position: 'absolute', top: -1, right: -2, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: PINK, borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  greet: { fontSize: 17, fontWeight: '400', letterSpacing: -0.3, color: INK },
  streakBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
  },
  streakBadge: {
    position: 'absolute', top: -5, left: 21, minWidth: 21, height: 18,
    paddingHorizontal: 5, borderRadius: 100,
    backgroundColor: PINK, borderWidth: 1.5, borderColor: '#FDE6EF',
    alignItems: 'center', justifyContent: 'center',
  },
  streakBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', lineHeight: 15, letterSpacing: -0.2, textAlign: 'center' },

  week: { marginTop: 1, paddingHorizontal: 20, flexDirection: 'row' },
  dayCol: { flex: 1, alignItems: 'center' },
  dayLetter: { height: 14, lineHeight: 14, fontSize: 11.5, fontWeight: '400', letterSpacing: 0.3, color: '#6E6468' },
  daySlot: { marginTop: 4, height: 50, alignItems: 'center', justifyContent: 'center' },
  todayShadow: {
    shadowColor: PINK_DEEP, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 6,
  },

  // 51a (layout pill): label a 72, linha da frase a 24, botão a 28, "Pra você" a 40.
  heroLabel: {
    marginTop: 72, height: 22, lineHeight: 22, textAlign: 'center',
    fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: INK,
  },
  heroNum: {
    marginTop: 5, height: 56, lineHeight: 56, textAlign: 'center',
    fontSize: 48, fontWeight: '700', letterSpacing: -0.6, color: INK,
  },
  heroPhrase: { marginTop: 24, height: 22 },
  heroPill: {
    height: 48, paddingHorizontal: 32, borderRadius: 100, backgroundColor: PINK,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  heroPillText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },

  sectionTitle: {
    paddingHorizontal: 18, fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK,
  },
  card: {
    width: 120, height: 142, borderRadius: 18,
    shadowColor: PINK_DEEP, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.09, shadowRadius: 12,
  },
  cardClip: {
    flex: 1, borderRadius: 18, overflow: 'hidden',
    borderWidth: 2, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.58)',
  },
  cardInner: {
    flex: 1, paddingTop: 14, paddingHorizontal: 13, paddingBottom: 13, justifyContent: 'space-between',
  },
  // Card de scan bloqueado (51a): contorno a 35% e sombra mais fraca (.06).
  cardLocked: { shadowOpacity: 0.06 },
  cardClipLocked: { borderColor: 'rgba(255,94,168,0.35)' },
  cardCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  cardText: { fontSize: 16, fontWeight: '600', lineHeight: 19, letterSpacing: -0.4, color: INK },

  // Sem overflow:hidden: o ScrollView horizontal já recorta (README #24).
  surface: { marginTop: 22, marginHorizontal: 18, backgroundColor: '#FFFFFF', borderRadius: 13 },
  surfaceTitle: {
    paddingTop: 16, paddingHorizontal: 17, paddingBottom: 14,
    fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK,
    borderBottomWidth: 1, borderBottomColor: '#EEE8E8',
  },
  prod: { width: 137, gap: 8 },
  prodImgBox: { height: 130, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  prodImg: { width: 96, height: 96 },
  prodName: { fontSize: 16, fontWeight: '500', lineHeight: 20, letterSpacing: -0.3, color: INK },
  prodStep: { fontSize: 15, fontWeight: '400', lineHeight: 20, letterSpacing: -0.2, color: '#8A8385' },
});
