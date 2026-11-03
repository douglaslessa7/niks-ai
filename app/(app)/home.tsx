import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, Animated, Easing, StyleSheet,
  AccessibilityInfo, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../../store/onboarding';
import { useFaceScan } from '../../hooks/useFaceScan';
import { supabase } from '../../lib/supabase';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { contarPassosMinhaRotina } from '../../lib/minhaRotina';
import { getUserId, useUserId } from '../../lib/currentUser';
import { scheduleRoutineReminders } from '../../lib/routineReminders';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';
import { onCoachPrepare, setCoachStageReady, useCoachMark } from '../../lib/coachMarks';
import { useMeusGrupos } from '../../lib/gruposServidor';
import Avatar from '../../components/grupos/Avatar';
import { useEstadoCartas } from '../../lib/cartasServidor';
import SeloProtegida, { EscudoChama } from '../../components/conquistas/SeloProtegida';
import AvisoSequencia from '../../components/conquistas/AvisoSequencia';
import {
  getRoutineHistory, routineStreak, routineDayStreak, routinesDoneOn, sessionDate, dateKey,
  RoutineHistory, RoutinePeriod,
} from '../../lib/routineProgress';

// ─────────────────────────────────────────────────────────────────────────────
// Home — réplica das telas 74a, 74b e 74c do Claude Design (projeto "NIKS home
// redesign", NiksHomeHeat.dc.html, "Nível só do grupo"): os 3 estados da mesma home.
//   74a · com grupo, carta trancada · 74b · com grupo, carta pronta (+1) · 74c · sem grupo
// Medidas, cores e textos copiados do frame de 393×852. O topo do conteúdo no design é
// 72 = barra de status do frame (54) + 18, por isso aqui é `insets.top + 18`.
// Fonte = SF Pro (fonte do sistema, sem fontFamily), como no design.
//
// Dados reais: nome, foto, sequência, semana, horário/duração do skincare, produtos,
// NÍVEL (NIKS Points, do servidor — a linha sob o "Olá" abre a "Sua caminhada") e a
// CARTA DO DIA (servidor: 1 carta por rotina, manhã e noite).
// GRUPO: o card "Seu grupo" mostra o primeiro grupo dela (função `grupos`) e abre a
// tela do grupo; sem grupo, o convite para criar um.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';

const EO = Easing.bezier(0.23, 1, 0.32, 1);
const EIO = Easing.bezier(0.77, 0, 0.175, 1);

const LET = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const DEFAULT_AM = 7 * 60;
const DEFAULT_PM = 21 * 60;
const AM_WINDOW_END = 12 * 60; // a "hora" da rotina da manhã vai até o meio-dia
const NIGHT_WINDOW_END = 4 * 60; // a da noite, até as 04:00 (mesma virada da sessão)
const MIN_PER_STEP = 3; // mesma conta da Rotina (~3 min por passo)

// Aviso "Sua sequência agora conta dias" (79l): visto uma vez só.
const AVISO_SEQ_KEY = 'aviso_sequencia_dias:visto';

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
  /** created_at do último scan de rosto — conta os 7 dias até o próximo. */
  lastScanAt: string | null;
};

// Scan de rosto de 7 em 7 dias: dias que faltam a partir do último scan, contados em
// dias de calendário com a virada às 04:00 (a mesma da rotina).
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

// ── Herói: "hora" (74a) e "feita" (74b) ─────────────────────────────────────
// Antes do horário fica no layout "hora" com a contagem e o botão apagado (40%, sem toque).
// Na home NUNCA "rotina da manhã/noite": sempre "skincare matinal/noturno".
type Hero = { label: string; num: string; done: boolean; focus: RoutinePeriod; locked: boolean };

function heroFor(now: Date, d: HomeData, hist: RoutineHistory): Hero {
  const t = now.getHours() * 60 + now.getMinutes();
  const day = hist[dateKey(sessionDate(now))] ?? {};
  const amEnd = Math.min(AM_WINDOW_END, d.pmTime);
  const dur = (n: number) => fmtDuration(Math.max(n, 1) * MIN_PER_STEP);

  if (t >= d.pmTime || t < NIGHT_WINDOW_END) {
    if (day.pm) return { label: 'Skincare noturno concluído', num: '', done: true, focus: 'pm', locked: false };
    return { label: 'Hora do seu skincare noturno', num: dur(d.pmCount), done: false, focus: 'pm', locked: false };
  }
  if (t >= d.amTime && t < amEnd) {
    if (day.am) return { label: 'Skincare matinal concluído', num: '', done: true, focus: 'am', locked: false };
    return { label: 'Hora do seu skincare matinal', num: dur(d.amCount), done: false, focus: 'am', locked: false };
  }
  if (t < d.amTime) {
    return { label: 'Seu skincare matinal em', num: fmtDuration(minutesUntil(d.amTime, t)), done: false, focus: 'am', locked: true };
  }
  if (day.am && t < d.pmTime) {
    // Entre o fim da janela da manhã e a noite, com a manhã feita: segue "concluído".
    return { label: 'Skincare matinal concluído', num: '', done: true, focus: 'am', locked: false };
  }
  return { label: 'Seu skincare noturno em', num: fmtDuration(minutesUntil(d.pmTime, t)), done: false, focus: 'pm', locked: true };
}

// ── Semana (domingo → sábado da sessão de hoje) ─────────────────────────────
// 74: dia passado com skincare = círculo rosa com check · hoje = círculo branco 50
// (check rosa no canto quando já fez) · futuro = pontilhado.
type DayCell = { l: string; n: number; today: boolean; kind: 'done' | 'past' | 'future' | 'today' };

function weekFor(now: Date, hist: RoutineHistory): DayCell[] {
  const today = sessionDate(now);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  return LET.map((L, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isToday = d.getTime() === today.getTime();
    const kind = isToday ? 'today' : d.getTime() > today.getTime() ? 'future' : routinesDoneOn(hist, d) > 0 ? 'done' : 'past';
    return { l: isToday ? 'HOJE' : L, n: d.getDate(), today: isToday, kind };
  });
}

// Tempo até a próxima sessão (04:00 do dia seguinte da sessão de hoje).
function nextCardIn(now: Date): string {
  const next = sessionDate(now);
  next.setDate(next.getDate() + 1);
  next.setHours(4, 0, 0, 0);
  const mins = Math.max(0, Math.round((next.getTime() - now.getTime()) / 60_000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

// ── Ícones (paths copiados do design) ───────────────────────────────────────
const FLAME = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';
const CHECK = 'M5 12.5l4.5 4.5L19 7.5';
const CHEVRON = 'M9 6l6 6-6 6';
const SPARK = 'M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z';
const PEOPLE = ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'];

function Icon({ d, size, color, sw }: { d: string | string[]; size: number; color: string; sw: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(Array.isArray(d) ? d : [d]).map((p, i) => (
        <Path key={i} d={p} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

// Anel pontilhado do dia futuro (`1.5px dotted rgba(255,94,168,.6)` do design). Em SVG
// porque borda `dotted` com raio não é confiável no Fabric.
function DottedRing({ size }: { size: number }) {
  const sw = 1.5;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const gap = c / Math.round(c / (sw * 2));
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,94,168,0.6)" strokeWidth={sw}
        strokeDasharray={[0.001, gap]} strokeLinecap="round"
      />
    </Svg>
  );
}

// `lay(on, rm)` do design: opacidade 220 ms + deslocamento de 6 pt em 320 ms (cubic-bezier
// .23,1,.32,1). O `blur(3px)` do design não existe no iOS — fica só opacidade + movimento.
function useLayer(on: boolean, rm: boolean) {
  const o = useRef(new Animated.Value(on ? 1 : 0)).current;
  const y = useRef(new Animated.Value(on || rm ? 0 : 6)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    Animated.parallel([
      Animated.timing(o, { toValue: on ? 1 : 0, duration: 220, easing: EO, useNativeDriver: true }),
      Animated.timing(y, { toValue: on || rm ? 0 : 6, duration: rm ? 0 : 320, easing: EO, useNativeDriver: true }),
    ]).start();
  }, [on, rm, o, y]);
  return {
    style: { opacity: o, transform: [{ translateY: y }] },
    pointerEvents: (on ? 'auto' : 'none') as 'auto' | 'none',
  };
}

// Opacidade + escala de um selo (cadeado, check): opacity 200 ms, scale 300 ms EO, 0,6 → 1.
function useBadge(on: boolean, rm: boolean) {
  const o = useRef(new Animated.Value(on ? 1 : 0)).current;
  const s = useRef(new Animated.Value(on || rm ? 1 : 0.6)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    Animated.parallel([
      Animated.timing(o, { toValue: on ? 1 : 0, duration: 200, useNativeDriver: true }),
      Animated.timing(s, { toValue: on || rm ? 1 : 0.6, duration: 300, easing: EO, useNativeDriver: true }),
    ]).start();
  }, [on, rm, o, s]);
  return { opacity: o, transform: [{ scale: s }] };
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

type CardState = 'locked' | 'ready' | 'claimed';

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { startFaceScan } = useFaceScan();
  const setStoreSkinScore = useAppStore((s) => s.setSkinScore);
  const setProductDetailTarget = useAppStore((s) => s.setProductDetailTarget);
  const userId = useUserId();
  const rm = useReduceMotion();

  // Relógio da tela: o herói é uma contagem regressiva, então avança a cada 30 s.
  const [now, setNow] = useState(() => new Date());
  const [hist, setHist] = useState<RoutineHistory>({});
  const [histPronto, setHistPronto] = useState(false);

  // Ao focar: relê o histórico (a cerimônia pode ter acabado de gravar) e a carta.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setNow(new Date());
      getRoutineHistory().then((h) => { if (active) { setHist(h); setHistPronto(true); } });
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

  // Um cache gravado por uma home anterior pode não ter todos os campos — completa com padrões.
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

  // ── Tutorial de primeiro acesso: aplica o "já viu" do servidor e SÓ DEPOIS
  // libera o palco, no mesmo efeito (ver README → "Quem vê").
  const homeTutorialSeenAt = cached?.homeTutorialSeenAt;
  const markHomeTutorialSeen = useAppStore((s) => s.markHomeTutorialSeen);
  useEffect(() => {
    if (homeTutorialSeenAt) markHomeTutorialSeen();
    setCoachStageReady('home', !loading && homeTutorialSeenAt !== undefined);
    return () => setCoachStageReady('home', false);
  }, [loading, homeTutorialSeenAt, markHomeTutorialSeen]);

  const scrollRef = useRef<ScrollView | null>(null);
  const rowRef = useRef<ScrollView | null>(null);
  // Tutorial: nenhuma parada da home rola — tela e fileira "Pra você" no início.
  useEffect(() => onCoachPrepare(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    rowRef.current?.scrollTo({ x: 0, animated: false });
  }), []);

  const hero = heroFor(now, d, hist);
  const days = weekFor(now, hist);
  // Sequência = um número só (dias ativos seguidos), do SERVIDOR (estado da função
  // `cartas`); sem ele ainda, o histórico do celular. É o da chama e o do herói.
  const { data: estado } = useEstadoCartas();
  const dayStreak = estado?.sequencia.atual ?? routineDayStreak(hist, now);
  const streak = dayStreak;
  const protegida = (estado?.poderes.protecao ?? 0) > 0;
  const products = d.products[hero.focus];

  // Lembretes da rotina no horário dela, o "ainda dá tempo" com a sequência e a carta
  // misteriosa (notificações locais; não reagenda se nada mudou). Reagenda quando o
  // estado do servidor chega. Ver lib/routineReminders.ts.
  const pv = estado?.proxima_volta;
  useEffect(() => {
    if (!cached) return;
    scheduleRoutineReminders({
      am: { minutes: d.amTime },
      pm: { minutes: d.pmTime },
    });
  }, [cached, estado?.sequencia.atual, estado?.sequencia.ultimo_dia, pv?.dia, pv?.ok]);
  const fezHoje = routinesDoneOn(hist, sessionDate(now)) > 0;

  // Carta do dia (servidor): pronta enquanto houver carta a raspar; resgatada depois da
  // rotina de hoje; trancada até o 1º skincare do dia. "Raspar agora" abre a carta.
  const aRaspar = estado?.a_raspar ?? [];
  const card: CardState = estado
    ? (aRaspar.length ? 'ready' : estado.rotina_hoje ? 'claimed' : 'locked')
    : (fezHoje ? 'claimed' : 'locked');
  const cota = estado?.cartas_hoje.cota ?? 2;
  const dadas = card === 'locked' ? 0 : (estado?.cartas_hoje.dadas ?? 1);
  // 1 carta por rotina: fez só a da manhã → a próxima vem na rotina da noite.
  const hojeHist = hist[dateKey(sessionDate(now))];
  const proximaNaNoite = dadas < cota && !!hojeHist?.am && !hojeHist?.pm;

  // Nível (NIKS Points): "Nível 4 · Sem Filtro" + barra até o próximo nível.
  const pontos = estado?.pontos;
  const fracNivel = pontos ? Math.max(0, Math.min(1, (pontos.total - pontos.piso) / Math.max(1, pontos.teto - pontos.piso))) : 0;
  const claimCard = () => {
    const prox = aRaspar[0];
    if (!prox) return;
    haptics.action();
    router.push(`/(carta)/carta?id=${prox.id}` as any);
  };

  // Aviso 79l: uma vez só, para quem via um número maior na chama (antes ela contava
  // rotinas — 1 ponto por rotina; agora dias, do servidor).
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const [aviso, setAviso] = useState<{ antes: number; agora: number } | null>(null);
  const [avisoResolvido, setAvisoResolvido] = useState(false); // decidiu (não precisa) ou ela fechou
  const avisoChecado = useRef(false);
  useEffect(() => {
    if (!estado || !histPronto || avisoChecado.current) return;
    avisoChecado.current = true;
    const antes = routineStreak(hist, now);
    const agora = estado.sequencia.atual;
    AsyncStorage.getItem(AVISO_SEQ_KEY).then((visto) => {
      if (visto) { setAvisoResolvido(true); return; }
      if (antes > agora) { setAviso({ antes, agora }); setTabBarVisible(false); }
      else { AsyncStorage.setItem(AVISO_SEQ_KEY, '1').catch(() => {}); setAvisoResolvido(true); }
    }).catch(() => setAvisoResolvido(true));
  }, [estado, histPronto, hist, now, setTabBarVisible]);
  const fecharAviso = () => {
    AsyncStorage.setItem(AVISO_SEQ_KEY, '1').catch(() => {});
    setAviso(null);
    setTabBarVisible(true);
    setAvisoResolvido(true);
  };

  // Celebração de nível pendente (pontos retroativos ou uma subida que ela não viu):
  // abre a "Sua caminhada" uma vez por sessão do app, depois do aviso 79l e fora do
  // tutorial de primeiro acesso. A caminhada celebra e confirma no servidor.
  const tutorialPendente = useAppStore((s) => s.homeTutorialPending && !s.homeTutorialSeen);
  const celebrou = useRef(false);
  useEffect(() => {
    if (celebrou.current || !pontos?.celebrar || !avisoResolvido || tutorialPendente) return;
    celebrou.current = true;
    // A subida pelos pontos retroativos (a de carta é medida ao raspar).
    if (pontos.retro) trackFora('nivel_subiu', { nivel: pontos.nivel, origem: 'retro' });
    router.push('/caminhada?celebrar=1' as any);
  }, [pontos?.celebrar, avisoResolvido, tutorialPendente, router]);

  const { data: meusGrupos } = useMeusGrupos();
  const grupo = meusGrupos?.[0] ?? null;

  const go = (path: string) => { haptics.tap(); router.push(path as any); };

  // Alvos do tutorial de primeira entrada (58a–58d).
  const tutCnt = useCoachMark('home-cnt');
  const tutCnt2 = useCoachMark('home-cnt2');
  const tutRot = useCoachMark('home-rot', { enabled: !hero.done });
  const tutWeek = useCoachMark('home-week');
  const tutStreak = useCoachMark('home-streak');
  const tutScan = useCoachMark('home-scan');
  const tutRowTitle = useCoachMark('home-rowTitle');
  const tutRow = useCoachMark('home-row');

  // Scan de rosto a cada 7 dias: o card abre o scan só quando libera.
  // Poder "Scan antecipado" armado: o próximo scan já está liberado.
  const scanDays = estado?.poderes.scan_antecipado ? 0 : scanDaysLeft(d.lastScanAt, now);
  const onScan = () => {
    if (scanDays > 0) {
      haptics.tap();
      Alert.alert('Analisar minha pele', scanDays === 1 ? 'Seu próximo scan libera em 1 dia.' : `Seu próximo scan libera em ${scanDays} dias.`);
      return;
    }
    haptics.action();
    startFaceScan();
  };

  // ── Animações (valores do design) ─────────────────────────────────────────
  const hora = useLayer(!hero.done, rm);
  const feita = useLayer(hero.done, rm);
  const lk = useLayer(card === 'locked', rm);
  const rd = useLayer(card === 'ready', rm);
  const cl = useLayer(card === 'claimed', rm);
  const todayCheck = useBadge(fezHoje, rm);
  const lockBadge = useBadge(card === 'locked', rm);
  const checkBadge = useBadge(card === 'claimed', rm);

  const veil = useRef(new Animated.Value(card === 'locked' ? 1 : 0)).current;
  const bar = useRef(new Animated.Value(card === 'locked' ? 0 : 1)).current;
  const gxp = useRef(new Animated.Value(fracNivel)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const sheen = useRef(new Animated.Value(0)).current;
  const sparks = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const prevCard = useRef<CardState>(card);
  const firstGxp = useRef(true);

  useEffect(() => {
    if (firstGxp.current) { firstGxp.current = false; gxp.setValue(fracNivel); return; }
    if (rm) Animated.timing(gxp, { toValue: fracNivel, duration: 240, easing: Easing.ease, useNativeDriver: true }).start();
    else Animated.timing(gxp, { toValue: fracNivel, duration: 700, delay: 200, easing: EO, useNativeDriver: true }).start();
  }, [fracNivel, rm, gxp]);

  const runSheen = useCallback(() => {
    sheen.setValue(0);
    Animated.timing(sheen, { toValue: 1, duration: 820, easing: EIO, useNativeDriver: true }).start();
  }, [sheen]);

  useEffect(() => {
    const was = prevCard.current;
    prevCard.current = card;
    Animated.timing(veil, { toValue: card === 'locked' ? 1 : 0, duration: 300, useNativeDriver: true }).start();
    if (was === card) return;
    const to = card === 'locked' ? 0 : 1;
    // Barra: mola (z .78, período .6 s); com Reduzir movimento, 240 ms sem mola.
    if (rm) Animated.timing(bar, { toValue: to, duration: 240, easing: Easing.ease, useNativeDriver: true }).start();
    else Animated.spring(bar, { toValue: to, stiffness: 109.7, damping: 16.3, mass: 1, useNativeDriver: true }).start();
    if (card === 'ready' && !rm) {
      const t = setTimeout(() => {
        pop.setValue(1);
        Animated.sequence([
          Animated.timing(pop, { toValue: 1.08, duration: 217, easing: EO, useNativeDriver: true }),
          Animated.timing(pop, { toValue: 0.985, duration: 217, easing: EO, useNativeDriver: true }),
          Animated.timing(pop, { toValue: 1, duration: 186, easing: EO, useNativeDriver: true }),
        ]).start();
        runSheen();
        sparks.forEach((s, i) => {
          s.setValue(0);
          Animated.timing(s, { toValue: 1, duration: 700, delay: i * 70, easing: EO, useNativeDriver: true }).start();
        });
      }, 260);
      return () => clearTimeout(t);
    }
  }, [card, rm, veil, bar, pop, sparks, runSheen]);

  // Carta pronta brilha a cada 4 s.
  useEffect(() => {
    if (card !== 'ready' || rm) return;
    const id = setInterval(runSheen, 4000);
    return () => clearInterval(id);
  }, [card, rm, runSheen]);

  // translateX(-160%) → (320%) da faixa de brilho, que tem 46% da carta por dentro da borda (74 × .46).
  const SHEEN_W = 74 * 0.46;
  const sheenX = sheen.interpolate({ inputRange: [0, 1], outputRange: [-1.6 * SHEEN_W, 3.2 * SHEEN_W] });
  const miniShadow = card === 'ready'
    ? '0px 10px 28px rgba(255,94,168,0.5), 0px 0px 0px 4px rgba(255,94,168,0.18)'
    : '0px 6px 14px rgba(200,60,120,0.22)';

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={['#FCE3EE', '#FDD5E6', '#FCDFEA', '#F9F1F4']}
        locations={[0, 0.45, 0.72, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.circleBlob} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 150 }}
      >
        {/* ── Cabeçalho: foto + "Olá, Nome" + grupo · sequência ───────────── */}
        <View style={styles.hdrRow}>
          <View style={styles.hdrLeft}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => go('/perfil')} style={styles.avatarWrap} accessibilityLabel="Abrir perfil">
              {d.fotoUrl ? (
                <Image source={{ uri: d.fotoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#F6D3E1' }]} />
              )}
              <View style={styles.avatarDot} />
            </TouchableOpacity>
            <View style={{ gap: 1 }}>
              <Text style={styles.greet}>{d.firstName ? `Olá, ${d.firstName}` : 'Olá'}</Text>
              {/* Nível individual (NIKS Points) → "Sua caminhada". Antes de o estado chegar,
                  a linha fica vazia com a mesma altura (a tela não pula). */}
              {pontos ? (
                <TouchableOpacity activeOpacity={0.7} onPress={() => go('/caminhada')} style={styles.groupLine} accessibilityLabel={`Nível ${pontos.nivel}, ${pontos.titulo}. Abrir sua caminhada`}>
                  <Text style={styles.groupLineText}>Nível {pontos.nivel} · {pontos.titulo}</Text>
                  <View style={styles.miniTrack}>
                    <Animated.View style={[styles.miniFill, { transform: [{ scaleX: gxp }] }]} />
                  </View>
                  <Icon d={CHEVRON} size={10} color={MUTE} sw={2.6} />
                </TouchableOpacity>
              ) : (
                <View style={styles.groupLine} />
              )}
            </View>
          </View>

          {/* Sequência: círculo branco + selo rosa. Abre o hub "Suas conquistas" (77a). */}
          <View {...tutStreak}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => go('/conquistas')} style={styles.streakBtn} accessibilityLabel="Abrir suas conquistas">
              <Icon d={FLAME} size={20} color={INK} sw={1.7} />
              <View style={styles.streakBadge}>
                <Text style={styles.streakBadgeText}>{streak}</Text>
              </View>
              {/* 79h: escudinho no canto oposto ao número enquanto a Proteção está armada */}
              {protegida && <EscudoChama rm={rm} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Semana ───────────────────────────────────────────────────── */}
        <View style={styles.week} {...tutWeek}>
          {days.map((day, i) => (
            // Tocar em qualquer dia abre o calendário.
            <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => go('/calendario')} style={styles.dayCol}>
              <Text style={[styles.dayLetter, day.today && styles.dayLetterToday]}>{day.l}</Text>
              <View style={styles.daySlot}>
                {day.kind === 'today' && (
                  <View style={styles.today}>
                    <Text style={styles.todayNum}>{day.n}</Text>
                    <Animated.View style={[styles.todayCheck, todayCheck]}>
                      <Icon d={CHECK} size={10} color="#fff" sw={3.6} />
                    </Animated.View>
                  </View>
                )}
                {day.kind === 'done' && (
                  <View style={styles.dayDone}>
                    <Icon d={CHECK} size={16} color="#fff" sw={2.8} />
                  </View>
                )}
                {(day.kind === 'future' || day.kind === 'past') && (
                  <View style={styles.dayFut}>
                    {day.kind === 'future' && <DottedRing size={33} />}
                    <Text style={styles.dayFutNum}>{day.n}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Herói: "hora" / "feita" ───────────────────────────────────── */}
        <View style={styles.hero}>
          <Animated.View style={[styles.heroLayer, hora.style]} pointerEvents={hora.pointerEvents}>
            <Text style={styles.heroLabel} {...tutCnt}>{hero.done ? '' : hero.label}</Text>
            <Text style={styles.heroNum} {...tutCnt2}>{hero.done ? '' : hero.num}</Text>
            <View style={{ marginTop: 67 }} {...tutRot}>
              <TouchableOpacity
                activeOpacity={0.85}
                // Na hora, "Iniciar skincare" cai direto no guia passo a passo da Rotina.
                // Antes da hora fica apagado e não responde.
                disabled={hero.locked || hero.done}
                accessibilityState={{ disabled: hero.locked }}
                onPress={() => { haptics.action(); router.push(`/protocolo?iniciar=${hero.focus}` as any); }}
                style={[styles.heroBtn, hero.locked && { opacity: 0.4 }]}
              >
                <Svg width={16} height={16} viewBox="0 0 24 24">
                  <Path d="M6 3.8v16.4a1 1 0 0 0 1.5.86l13.6-8.2a1 1 0 0 0 0-1.72L7.5 2.94A1 1 0 0 0 6 3.8z" fill="#fff" />
                </Svg>
                <Text style={styles.heroBtnText}>Iniciar skincare</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
          <Animated.View style={[styles.heroLayer, feita.style]} pointerEvents={feita.pointerEvents}>
            <View style={styles.feitaRow}>
              <Text style={styles.heroLabelPlain}>{hero.done ? hero.label : ''}</Text>
              <Icon d={CHECK} size={18} color={PINK} sw={2.6} />
            </View>
            <View style={styles.feitaNumRow}>
              <Svg width={44} height={44} viewBox="0 0 24 24"><Path d={FLAME} fill={PINK} /></Svg>
              <Text style={styles.heroNumPlain}>{dayStreak === 1 ? '1 dia' : `${dayStreak} dias`}</Text>
            </View>
            {protegida && <SeloProtegida rm={rm} animar={false} style={{ marginTop: 6, alignSelf: 'center' }} />}
          </Animated.View>
        </View>

        {/* ── Sua carta do dia ─────────────────────────────────────────── */}
        <View style={styles.carta}>
          <View style={styles.cartaText}>
            <Animated.View style={[StyleSheet.absoluteFill, lk.style]} pointerEvents={lk.pointerEvents}>
              <Text style={styles.cartaTitle}>Sua carta do dia</Text>
              <Text style={styles.cartaSub}>Conclua sua rotina para liberar</Text>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, rd.style]} pointerEvents={rd.pointerEvents}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.cartaTitle}>Sua carta está pronta</Text>
                <Svg width={20} height={20} viewBox="0 0 24 24">
                  <Path fill={PINK} d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                  <Path d="M20 2v4M22 4h-4" stroke={PINK} strokeWidth={1.8} strokeLinecap="round" fill="none" />
                </Svg>
              </View>
              <TouchableOpacity activeOpacity={0.85} onPress={claimCard} style={styles.raspar}>
                <Icon
                  d={['M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2', 'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2', 'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8', 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15']}
                  size={15} color="#fff" sw={2}
                />
                <Text style={styles.rasparText}>Raspar agora</Text>
              </TouchableOpacity>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, cl.style]} pointerEvents={cl.pointerEvents}>
              <Text style={styles.cartaTitle}>Carta resgatada</Text>
              <View style={styles.nextRow}>
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Circle cx={12} cy={13} r={8} fill="none" stroke={MUTE} strokeWidth={2.2} />
                  <Path d="M12 9v4l2.5 1.5M9 2h6M12 2v3" fill="none" stroke={MUTE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text style={styles.cartaSubInline}>{proximaNaNoite ? 'Próxima carta na rotina da noite' : `Próxima carta em ${nextCardIn(now)}`}</Text>
              </View>
            </Animated.View>
          </View>
          <View style={styles.cartaTrack}>
            <Animated.View style={[styles.cartaFill, { transform: [{ scaleX: bar }] }]} />
            <View style={styles.cartaTrackLabelWrap}>
              <Text style={[styles.cartaTrackLabel, { color: card === 'locked' ? MUTE : '#fff' }]}>
                {`${dadas} / ${cota}`}
              </Text>
            </View>
          </View>

          {/* Mini carta inclinada (8°) à direita */}
          <Animated.View style={[styles.mini, { transform: [{ rotate: '8deg' }, { scale: pop }] }]}>
            <View style={[styles.miniCard, { boxShadow: miniShadow }]}>
              <View style={styles.miniClip}>
                <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(150deg, #FFE1EE 0%, #FBCDE5 38%, #EBD6FB 66%, #FFD9EA 100%)' }]} />
                <View style={styles.miniInner} />
                <Image source={require('../../assets/home/score-logo-pink.png')} style={styles.miniLogo} />
                <View
                  style={[StyleSheet.absoluteFill, {
                    mixBlendMode: 'overlay', opacity: 0.55,
                    experimental_backgroundImage: 'linear-gradient(115deg, rgba(255,255,255,0) 18%, rgba(255,170,215,0.9) 34%, rgba(205,180,255,0.9) 46%, rgba(255,255,255,1) 56%, rgba(190,175,255,0.85) 70%, rgba(255,255,255,0) 84%)',
                  }]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[styles.sheen, { transform: [{ translateX: sheenX }, { skewX: '-18deg' }] }]}
                />
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(252,236,243,0.55)', opacity: veil }]} />
              </View>
            </View>
            <Animated.View style={[styles.lockBadge, lockBadge]}>
              <Svg width={15} height={15} viewBox="0 0 24 24">
                <Rect x={4} y={11} width={16} height={10} rx={2.5} fill="none" stroke={PINK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke={PINK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Animated.View>
            <Animated.View style={[styles.checkBadge, checkBadge]}>
              <Icon d={CHECK} size={13} color="#fff" sw={3.4} />
            </Animated.View>
            {([
              { left: -12, top: -8, size: 14, fill: '#FF5EA8' },
              { left: 70, top: 4, size: 11, fill: '#D9B8FF' },
              { left: -9, top: 78, size: 10, fill: '#FF8CC0' },
              { left: 66, top: 92, size: 14, fill: '#FF5EA8' },
            ]).map((s, i) => (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute', left: s.left, top: s.top, width: s.size, height: s.size,
                  opacity: sparks[i].interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 1, 0] }),
                  transform: [
                    { scale: sparks[i].interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.4, 1, 0.4] }) },
                    { rotate: sparks[i].interpolate({ inputRange: [0, 0.45, 1], outputRange: ['0deg', '45deg', '90deg'] }) },
                  ],
                }}
              >
                <Svg width={s.size} height={s.size} viewBox="0 0 24 24"><Path d={SPARK} fill={s.fill} /></Svg>
              </Animated.View>
            ))}
          </Animated.View>
        </View>

        {/* ── Pra você · Hoje ──────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { marginTop: 26 }]} {...tutRowTitle}>Pra você · Hoje</Text>
        <View {...tutRow}>
          <ScrollView
            ref={rowRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 6 }}
          >
            <TouchableOpacity activeOpacity={0.85} onPress={() => go('/niks-chat')} style={styles.forCard}>
              <Text style={styles.forText}>{'Apareceu\numa espinha?'}</Text>
              <View style={[styles.forCircle, styles.forCirclePink]}>
                <Icon d={['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4.5', 'M12 17.2h.01']} size={30} color="#fff" sw={1.9} />
              </View>
              <View style={styles.novo}><Text style={styles.novoText}>Novo</Text></View>
            </TouchableOpacity>
            <View {...tutScan}>
              <TouchableOpacity activeOpacity={0.85} onPress={onScan} style={styles.forCard}>
                <Text style={styles.forText}>Analisar minha pele</Text>
                <View style={[styles.forCircle, styles.forCircleWhite]}>
                  <Svg width={30} height={30} viewBox="0 0 24 24">
                    <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" fill="none" stroke={PINK} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                    <Circle cx={12} cy={13} r={3} fill="none" stroke={PINK} strokeWidth={1.9} />
                  </Svg>
                </View>
              </TouchableOpacity>
            </View>
            <TouchableOpacity activeOpacity={0.85} onPress={() => go('/niks-chat')} style={styles.forCard}>
              <Text style={styles.forText}>NIKS Chat</Text>
              <View style={[styles.forCircle, styles.forCirclePink]}>
                <Icon d={['M21 12a8.5 8.5 0 0 1-12.2 7.6L3.5 21l1.3-4.8A8.5 8.5 0 1 1 21 12z', 'M8.5 11h7M8.5 14h4.5']} size={30} color="#fff" sw={1.9} />
              </View>
            </TouchableOpacity>
            {/* Cards da home anterior no padrão do design 74 (pedido do Douglas, 01/nov/2026),
                seguindo a alternância de círculo branco / rosa dos três primeiros. */}
            <TouchableOpacity activeOpacity={0.85} onPress={() => go('/progresso')} style={styles.forCard}>
              <Text style={styles.forText}>Progresso</Text>
              <View style={[styles.forCircle, styles.forCircleWhite]}>
                <Icon d="M3 17l6-6 4 4 8-8M15 7h6v6" size={30} color={PINK} sw={1.9} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.85} onPress={() => go('/(scan)/product-camera')} style={styles.forCard}>
              <Text style={styles.forText}>Escanear produto</Text>
              <View style={[styles.forCircle, styles.forCirclePink]}>
                <Icon
                  d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M10.5 7h3M11 7v2M13 7v2M10.6 9h2.8a1.6 1.6 0 0 1 1.6 1.6v4.8a1.6 1.6 0 0 1-1.6 1.6h-2.8a1.6 1.6 0 0 1-1.6-1.6v-4.8a1.6 1.6 0 0 1 1.6-1.6z"
                  size={30} color="#fff" sw={1.9}
                />
              </View>
            </TouchableOpacity>
            {/* Suas conquistas: abre o mesmo hub da chama (canto superior direito). */}
            <TouchableOpacity activeOpacity={0.85} onPress={() => go('/conquistas')} style={styles.forCard}>
              <Text style={styles.forText}>Suas conquistas</Text>
              <View style={[styles.forCircle, styles.forCircleWhite]}>
                <Icon
                  d={[
                    'M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16',
                    'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22',
                    'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22',
                    'M18 2H6v7a6 6 0 0 0 12 0V2Z',
                  ]}
                  size={30} color={PINK} sw={1.9}
                />
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* ── Seu grupo ───────────────────────────────────────────────── */}
        {meusGrupos && <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Seu grupo</Text>}
        {!meusGrupos ? null : grupo ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => go(`/grupo?id=${grupo.id}&de=home`)} style={styles.groupCard}>
            <View style={styles.groupHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.groupName} numberOfLines={2}>{grupo.nome}</Text>
                <Text style={styles.groupSub}>{grupo.total === 1 ? 'Só você · convide amigas' : `${grupo.total} integrantes`}</Text>
              </View>
              <Icon d={CHEVRON} size={16} color={PINK} sw={2.4} />
            </View>
            <View style={styles.groupFoot}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {grupo.integrantes.slice(0, 5).map((m) => (
                  <Avatar key={m.user_id} img={null} uri={m.voce ? (d.fotoUrl ?? m.foto) : m.foto} done={m.fez_hoje} size={40} />
                ))}
              </View>
              <Text style={styles.groupCount}>{grupo.feitos_hoje} de {grupo.total} hoje</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.groupCard}>
            <View style={styles.groupHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.groupName}>{'Faça skincare\ncom suas amigas'}</Text>
                <Text style={styles.groupSub}>Vocês liberam cartas juntas</Text>
              </View>
              <View style={styles.inviteIcon}>
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  {PEOPLE.map((p, i) => <Path key={i} d={p} fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />)}
                  <Circle cx={9} cy={7} r={4} fill="none" stroke="#fff" strokeWidth={1.9} />
                </Svg>
              </View>
            </View>
            <View style={styles.inviteBtns}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => go('/seus-grupos?criar=1')} style={styles.criarBtn}>
                <Icon d="M12 5v14M5 12h14" size={15} color="#fff" sw={2.6} />
                <Text style={styles.criarText}>Criar grupo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Seus produtos · Skincare matinal/noturno ───────────────────── */}
        {products.length > 0 && (
          <View style={styles.surfaceShadow}>
            <View style={styles.surface}>
              <Text style={styles.surfaceTitle}>
                Seus produtos · Skincare {hero.focus === 'am' ? 'matinal' : 'noturno'}
              </Text>
              <View style={styles.surfaceLine} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 16, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 24 }}
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
                    <View style={styles.prodImgBox}>
                      <ExpoImage source={{ uri: p.img }} style={styles.prodImg} contentFit="contain" />
                    </View>
                    <Text style={styles.prodName}>{p.name}</Text>
                    <Text style={styles.prodStep}>{p.step}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </ScrollView>

      {/* 79l: "Sua sequência agora conta dias" (uma vez só) */}
      {aviso && <AvisoSequencia antes={aviso.antes} agora={aviso.agora} rm={rm} onFechar={fecharAviso} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9F1F4' }, // sem overflow:hidden — pai de ScrollView (README #24)

  // Círculos decorativos do fundo (fixos, não rolam).
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280, left: 190, top: -90,
    experimental_backgroundImage: 'radial-gradient(circle at 30% 75%, rgba(255,170,205,0.34), rgba(255,255,255,0.2))',
  },
  circleWhite: {
    position: 'absolute', width: 620, height: 620, borderRadius: 310,
    left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)',
  },

  // Cabeçalho
  hdrRow: {
    height: 36, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  hdrLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatarWrap: { width: 32, height: 32 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarDot: {
    position: 'absolute', top: -1, right: -2, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: PINK, borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  greet: { fontSize: 17, fontWeight: '400', lineHeight: 20, letterSpacing: -0.3, color: INK },
  groupLine: { height: 15, flexDirection: 'row', alignItems: 'center', gap: 7 },
  groupLineText: { fontSize: 12, fontWeight: '500', letterSpacing: -0.1, color: '#515151' },
  miniTrack: { width: 38, height: 4, borderRadius: 100, backgroundColor: 'rgba(18,18,18,0.08)', overflow: 'hidden' },
  miniFill: { ...StyleSheet.absoluteFillObject, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },
  streakBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 4px 14px rgba(120,60,72,0.10)',
  },
  streakBadge: {
    position: 'absolute', top: -5, left: 21, minWidth: 21, height: 18,
    paddingHorizontal: 5, borderRadius: 100,
    backgroundColor: PINK, borderWidth: 1.5, borderColor: '#FDE6EF',
    alignItems: 'center', justifyContent: 'center',
  },
  streakBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', lineHeight: 15, letterSpacing: -0.2, textAlign: 'center' },

  // Semana
  week: { marginTop: 6, paddingHorizontal: 14, flexDirection: 'row' },
  dayCol: { flex: 1, alignItems: 'center' },
  dayLetter: { height: 14, lineHeight: 14, fontSize: 13, fontWeight: '400', letterSpacing: 0.3, color: MUTE },
  dayLetterToday: { fontWeight: '700', letterSpacing: 0.6, color: INK },
  daySlot: { marginTop: 4, height: 52, alignItems: 'center', justifyContent: 'center' },
  today: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 6px 16px rgba(192,32,106,0.12)',
  },
  todayNum: { fontSize: 20, fontWeight: '500', letterSpacing: -0.3, color: INK },
  todayCheck: {
    position: 'absolute', right: -2, bottom: -1, width: 18, height: 18, borderRadius: 9,
    backgroundColor: PINK, borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  dayDone: {
    width: 33, height: 33, borderRadius: 16.5, backgroundColor: PINK,
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 3px 8px rgba(255,94,168,0.25)',
  },
  dayFut: { width: 33, height: 33, borderRadius: 16.5, alignItems: 'center', justifyContent: 'center' },
  dayFutNum: { fontSize: 17, fontWeight: '400', letterSpacing: -0.3, color: INK },

  // Herói (camadas sobrepostas, 205 de altura)
  hero: { marginTop: 56, height: 205 },
  heroLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  heroLabel: { height: 22, fontSize: 17, fontWeight: '500', lineHeight: 22, letterSpacing: -0.3, color: INK },
  heroNum: { marginTop: 4, height: 64, fontSize: 56, fontWeight: '700', lineHeight: 64, letterSpacing: -1.6, color: INK },
  heroBtn: {
    height: 48, paddingHorizontal: 28, borderRadius: 100, backgroundColor: PINK,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    boxShadow: '0px 10px 22px rgba(255,94,168,0.35)',
  },
  heroBtnText: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: -0.4 },
  feitaRow: { height: 22, flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroLabelPlain: { fontSize: 17, fontWeight: '500', lineHeight: 22, letterSpacing: -0.3, color: INK },
  feitaNumRow: { marginTop: 4, height: 64, flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroNumPlain: { fontSize: 56, fontWeight: '700', lineHeight: 64, letterSpacing: -1.6, color: INK },

  // Sua carta do dia
  carta: {
    marginTop: 30, marginHorizontal: 18, borderRadius: 18, borderWidth: 1.5, borderColor: PINK,
    backgroundColor: 'rgba(255,255,255,0.8)', padding: 16,
    boxShadow: '0px 8px 22px rgba(255,94,168,0.12)',
  },
  cartaText: { height: 66, marginRight: 96 },
  cartaTitle: { fontSize: 20, fontWeight: '700', lineHeight: 24, letterSpacing: -0.5, color: INK },
  cartaSub: { marginTop: 5, fontSize: 14, lineHeight: 18, color: MUTE, letterSpacing: -0.1 },
  cartaSubInline: { fontSize: 14, lineHeight: 18, color: MUTE, letterSpacing: -0.1, fontVariant: ['tabular-nums'] },
  nextRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  raspar: {
    marginTop: 8, alignSelf: 'flex-start', height: 34, paddingHorizontal: 16, borderRadius: 100,
    backgroundColor: PINK, flexDirection: 'row', alignItems: 'center', gap: 7,
    boxShadow: '0px 6px 12px rgba(255,94,168,0.35)',
  },
  rasparText: { color: '#fff', fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  cartaTrack: {
    marginTop: 14, marginRight: 96, height: 12, borderRadius: 100,
    backgroundColor: 'rgba(18,18,18,0.08)', overflow: 'hidden',
  },
  cartaFill: { ...StyleSheet.absoluteFillObject, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },
  cartaTrackLabelWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  cartaTrackLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  mini: { position: 'absolute', right: -10, top: '50%', marginTop: -53, width: 78, height: 106 },
  miniCard: { ...StyleSheet.absoluteFillObject, borderRadius: 12 },
  miniClip: { flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  miniInner: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)' },
  miniLogo: { position: 'absolute', left: '50%', top: '50%', width: 38, height: 38, marginLeft: -19, marginTop: -19 },
  sheen: {
    position: 'absolute', top: '-30%', bottom: '-30%', left: 0, width: '46%',
    experimental_backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.9), rgba(255,255,255,0))',
  },
  lockBadge: {
    position: 'absolute', left: '50%', top: '50%', width: 30, height: 30, marginLeft: -15, marginTop: -15,
    borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 4px 10px rgba(200,60,120,0.2)',
  },
  checkBadge: {
    position: 'absolute', right: -6, bottom: -6, width: 26, height: 26, borderRadius: 13,
    backgroundColor: PINK, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },

  // Pra você · Hoje
  sectionTitle: { paddingHorizontal: 18, fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK },
  forCard: {
    width: 208, height: 104, borderRadius: 18, borderWidth: 1.5, borderColor: PINK,
    backgroundColor: 'rgba(255,255,255,0.78)', paddingVertical: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  forText: { width: 112, fontSize: 17, fontWeight: '700', lineHeight: 21, letterSpacing: -0.4, color: INK },
  forCircle: {
    position: 'absolute', right: -8, top: -12, width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  forCirclePink: { backgroundColor: PINK, boxShadow: '0px 10px 22px rgba(255,94,168,0.35)' },
  forCircleWhite: { backgroundColor: '#fff', boxShadow: '0px 10px 22px rgba(200,60,120,0.18)' },
  novo: {
    position: 'absolute', right: 10, bottom: 10, height: 22, paddingHorizontal: 9, borderRadius: 100,
    backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(255,94,168,0.35)', justifyContent: 'center',
  },
  novoText: { fontSize: 11, fontWeight: '700', color: PINK, letterSpacing: 0.1 },

  // Seu grupo
  groupCard: {
    marginTop: 12, marginHorizontal: 18, borderRadius: 18, borderWidth: 1.5, borderColor: PINK,
    backgroundColor: 'rgba(255,255,255,0.78)', paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16,
  },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupName: { fontSize: 20, fontWeight: '700', lineHeight: 24, letterSpacing: -0.5, color: INK },
  groupSub: { marginTop: 3, fontSize: 14, lineHeight: 18, color: MUTE, letterSpacing: -0.1 },
  groupFoot: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupCount: { fontSize: 14, color: MUTE, letterSpacing: -0.1 },
  inviteIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 8px 18px rgba(255,94,168,0.35)',
  },
  inviteBtns: { marginTop: 14, flexDirection: 'row', gap: 8 },
  criarBtn: {
    flex: 1, height: 44, borderRadius: 100, backgroundColor: PINK,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    boxShadow: '0px 6px 12px rgba(255,94,168,0.35)',
  },
  criarText: { color: '#fff', fontSize: 15, fontWeight: '600', letterSpacing: -0.3 },

  // Seus produtos — a sombra fica por fora, o recorte por dentro (README #20).
  surfaceShadow: {
    marginTop: 30, marginHorizontal: 18, borderRadius: 22, backgroundColor: '#fff',
    boxShadow: '0px 8px 24px rgba(192,32,106,0.06)',
  },
  surface: { borderRadius: 22 },
  surfaceTitle: {
    paddingTop: 18, paddingHorizontal: 20, paddingBottom: 14,
    fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK,
  },
  surfaceLine: { height: 1, backgroundColor: 'rgba(18,18,18,0.06)' },
  prod: { width: 132 },
  prodImgBox: { height: 118, alignItems: 'center', justifyContent: 'center' },
  prodImg: { width: 132, height: 112 },
  prodName: { marginTop: 14, fontSize: 16, fontWeight: '500', lineHeight: 20, letterSpacing: -0.3, color: INK },
  prodStep: { marginTop: 3, fontSize: 14, lineHeight: 18, color: MUTE, letterSpacing: -0.1 },
});
