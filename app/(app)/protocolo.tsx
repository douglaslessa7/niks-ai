// ─────────────────────────────────────────────────────────────────────────────
// Rotina de Skincare — réplica do design 41d do Claude Design (projeto "NIKS home
// redesign — rotina skincare", NiksRoutineFlo2.dc.html com v="timeline"): cabeçalho
// com foto + "Sua rotina" + sequência, seletor Manhã/Noite, herói com "Iniciar
// rotina", passos em linha do tempo com o produto escolhido, "O que esperar" (cards
// que viram), "Como introduzir os ativos" e a rotina passo a passo (com a tela de
// concluída). "Escolher/Ver produto" leva para a tela de Produtos (não para a folha
// do design), no produto daquele passo.
// Fonte = SF Pro (sistema), rosa #FF5EA8. Medidas do frame 393×852: o topo do
// conteúdo (69) = barra de status do frame (54) + 15 → `insets.top + 15`.
// Os DADOS continuam reais: tabela `protocolos` (fonte de verdade) + store como
// fallback do vão + geração sob demanda para usuária legada — lógica intacta.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity, Animated, Easing, Modal,
  ActivityIndicator, StyleSheet, LayoutAnimation, Platform, UIManager,
  type StyleProp, type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Image as ExpoImage } from 'expo-image';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Device from 'expo-device';
import Svg, { Path, Line, Circle, Rect, Ellipse } from 'react-native-svg';
import { useAppStore, type OnboardingData, type ScanResult, type ProtocolResult } from '../../store/onboarding';
import { useFaceScan } from '../../hooks/useFaceScan';
import { supabase } from '../../lib/supabase';
import { generateAndSaveProtocol } from '../../lib/generateProtocol';
import { buildOnboardingDataFromUserRow } from '../../lib/buildOnboardingDataFromUserRow';
import {
  markStepCompleted, markRoutineDone, getCompletedSteps, getRoutineHistory, routineStreak,
  sessionDate, dateKey, type RoutineHistory,
  getRoutineFlow, saveRoutineFlow, clearRoutineFlow, type RoutineFlowState,
} from '../../lib/routineProgress';
import { cancelLateReminder } from '../../lib/routineReminders';
import { requestAppReview } from '../../lib/storeReview';
import { getSavedProducts, normStepKey, type SavedProduct } from '../../lib/savedProducts';
import { getCutoutsByImageUrl, type Cutout } from '../../lib/productCutouts';
import { getFacePhotoUrl } from '../../lib/facePhoto';
import { getPhotoJourney, saveRoutinePhoto } from '../../lib/routinePhotos';
import { useCachedQuery } from '../../lib/cache';
import { getUserId, useUserId } from '../../lib/currentUser';
import { haptics } from '../../lib/haptics';

// LayoutAnimation no Android (iOS já vem ligado) — expandir "Como introduzir os ativos".
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const PINK_DEEP = '#C0206A';
const MUTED = '#8A8387';
const BODY = '#3D3A3C';
const SOFT = '#6E6468';

// Degradês do design (BG.am / BG.pm) — mesmas paradas da home.
const BG = {
  am: ['#FFE3EF', '#FFD3E5', '#FFC6DC', '#FDDFEB', '#FBEEF3', '#F9F2F5'],
  pm: ['#EADCF4', '#F0D9EE', '#F6D3E5', '#F9E3EE', '#FBEFF4', '#F9F3F6'],
} as const;
const BG_STOPS = [0, 0.28, 0.5, 0.64, 0.8, 1] as const;

// Foco por período (texto do design).
const FOCUS: Record<'am' | 'pm', string> = {
  am: 'Proteção & antioxidação',
  pm: 'Reparação & barreira',
};

// Fundo da foto do produto: BRANCO para todos (pedido do usuário — só o produto, sem
// a cor por categoria do design). O quadrado "+" de quem ainda não escolheu produto
// segue rosado.
const PRODUCT_BG = '#FFFFFF';
const NO_PRODUCT_BG = '#FFF5F9';

const DEFAULT_AM = 7 * 60;
const DEFAULT_PM = 21 * 60;

// ── Tipos + mapeamento dos DADOS REAIS ───────────────────────────────────────
// Passo cru salvo pelo generate-protocol (ver README → mapeamento generate-protocol).
type RawStep = {
  id?: number; name?: string; ingredient?: string; instruction?: string;
  steps?: string[]; color?: string; waitTime?: string | null; product_suggestions?: string[];
};

// Categoria do passo — função `cat()` do design (palavras-chave do nome + ingrediente).
function cat(name: string, ing: string): string {
  const t = `${name} ${ing}`.toLowerCase();
  const has = (...k: string[]) => k.some((x) => t.includes(x));
  if (has('protetor', 'fps')) return 'Proteção';
  if (has('limpeza', 'demaquilante')) return 'Limpeza';
  if (has('tônico')) return 'Tônico';
  if (has('barreira')) return 'Barreira';
  if (has('hidratante', 'gel-creme')) return 'Hidratação';
  return 'Tratamento';
}

// "Como fazer": prioriza a instruction clínica; se ausente, junta os steps.
function howOf(raw: RawStep): string {
  return (raw?.instruction ?? '').trim()
    || (Array.isArray(raw?.steps) ? raw.steps.join(' ').trim() : '');
}

// Reconstrói o array `dicas` a partir do store (a tabela guarda `dicas` como coluna
// `text[]`; o store guarda os campos soltos). Usado só no ramo de fallback do store.
function storeDicas(r: ProtocolResult): (string | null)[] {
  return r.dicas?.length ? r.dicas : [
    r.introduction_warnings ?? null,
    r.expected_timeline?.two_weeks ?? null,
    r.expected_timeline?.one_month ?? null,
    r.expected_timeline?.three_months ?? null,
    r.introduction_schedule ?? null,
  ];
}

// Quebra o texto de "introdução gradual" (dicas[4]) em blocos por semana.
// Regex idêntico ao da tela antiga (ver README → parsing de dicas[4]).
// Rótulos no formato do design: "Semanas 1–2", "Semana 5+".
function parseCronograma(raw?: string | null): { week: string; body: string }[] {
  if (!raw) return [];
  const re = /(?:(?:Nas\s+)?Semanas?\s+([\d][\d\-–—]*\+?(?:\s+em diante)?)|A partir da semana\s+(\d+))\s*[,:]/gi;
  const matches = [...raw.matchAll(re)];
  if (matches.length < 2) return [{ week: 'Introdução gradual', body: raw }];
  return matches.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = matches[i + 1]?.index ?? raw.length;
    const rawLabel = (m[1] ?? m[2] ?? '').trim().replace(/\s+em diante/, '').replace('-', '–');
    const label = m[2] ? `${m[2]}+` : rawLabel;
    const plural = /[–—]/.test(label);
    return { week: `${plural ? 'Semanas' : 'Semana'} ${label}`, body: raw.slice(start, end).trim().replace(/\.$/, '') + '.' };
  });
}

function parseTime(v: unknown, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

// ── Ícones ───────────────────────────────────────────────────────────────────
function Chevron({ open, size = 18, color = '#A39A9F' }: { open: boolean; size?: number; color?: string }) {
  const rot = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(rot, { toValue: open ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [open, rot]);
  return (
    <Animated.View style={{ transform: [{ rotate: rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M6 9l6 6 6-6" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}
function PlusIcon({ size, sw = 2.2 }: { size: number; sw?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" fill="none" stroke={PINK_TEXT} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}

// Linha pontilhada vertical da linha do tempo (`2px dotted` do design). Em SVG porque
// borda pontilhada de um lado só não é confiável no Fabric.
function DottedLine({ color, hidden }: { color: string; hidden: boolean }) {
  const [h, setH] = useState(0);
  return (
    <View style={{ flex: 1, width: 2, marginTop: 4, opacity: hidden ? 0 : 1 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {h > 0 && (
        // Absoluta: o desenho não pode entrar no cálculo da altura (senão a linha
        // aumenta o card, que aumenta a linha… em ciclo).
        <Svg width={2} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Line x1={1} y1={1} x2={1} y2={h} stroke={color} strokeWidth={2} strokeDasharray={[0.001, 4]} strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
}

// Quadradinho tracejado do passo SEM produto (`1.5px dashed #F4B5CF`).
function DashedTile({ size, radius }: { size: number; radius: number }) {
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Rect x={0.75} y={0.75} width={size - 1.5} height={size - 1.5} rx={radius - 0.75} fill="none" stroke="#F4B5CF" strokeWidth={1.5} strokeDasharray={[4, 3]} />
    </Svg>
  );
}

// `text-wrap: balance` do design (45c), que o RN não tem: se o texto quebrar em
// exatamente 2 linhas, reparte no espaço mais perto do meio para as duas ficarem
// do mesmo tamanho (em vez de uma linha cheia e uma palavra sozinha embaixo).
function BalancedText({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const [out, setOut] = useState(text);
  useEffect(() => setOut(text), [text]);
  return (
    <Text
      style={style}
      onTextLayout={(e) => {
        if (out !== text || e.nativeEvent.lines.length !== 2) return;
        const mid = text.length / 2;
        let cut = -1;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
        }
        if (cut > 0) setOut(`${text.slice(0, cut)}\n${text.slice(cut + 1)}`);
      }}
    >
      {out}
    </Text>
  );
}

// Card "O que esperar" que vira no toque (frente colorida / verso com o texto).
function FlipCard({ label, body, bg }: { label: string; body: string; bg: string }) {
  const [flipped, setFlipped] = useState(false);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: flipped ? 1 : 0, duration: 550, easing: Easing.bezier(0.3, 0.7, 0.2, 1), useNativeDriver: true }).start();
  }, [flipped, v]);
  const front = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const back = v.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  return (
    <TouchableOpacity activeOpacity={1} onPress={() => { haptics.tap(); setFlipped((f) => !f); }} style={{ width: 160, height: 176 }}>
      <Animated.View style={[styles.flipFace, { backgroundColor: bg, padding: 14, justifyContent: 'space-between', transform: [{ perspective: 900 }, { rotateY: front }] }]}>
        <View style={{ gap: 1 }}>
          <Text style={styles.flipEm}>Em</Text>
          <Text style={styles.flipLabel}>{label}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.flipEm}>Toque para ver</Text>
          <View style={styles.flipBtn}>
            <Svg width={15} height={15} viewBox="0 0 24 24">
              {['M3 12a9 9 0 0 1 15.5-6.2L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-15.5 6.2L3 16', 'M3 21v-5h5'].map((d) => (
                <Path key={d} d={d} fill="none" stroke={PINK_TEXT} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </Svg>
          </View>
        </View>
      </Animated.View>
      <Animated.View style={[styles.flipFace, styles.flipBack, { transform: [{ perspective: 900 }, { rotateY: back }] }]}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: PINK_DEEP }}>Em {label}</Text>
        <Text style={{ fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: INK }} numberOfLines={6} lineBreakStrategyIOS="push-out">{body}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function Protocolo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Abre na rotina que importa agora — mesma regra da home: manhã até o meio-dia.
  const [period, setPeriod] = useState<'am' | 'pm'>(() => {
    const h = new Date().getHours();
    return h >= 4 && h < 12 ? 'am' : 'pm';
  });
  const am = period === 'am';

  // A navbar desta tela é sempre clara (o design não tem versão escura).
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
      return () => { setTabBarTheme('light'); setTabBarVisible(true); };
    }, [setTabBarTheme, setTabBarVisible])
  );

  // ── Rotina REAL do usuário ────────────────────────────────────────────────
  const protocolResult = useAppStore((s) => s.protocolResult);
  const setProtocolResult = useAppStore((s) => s.setProtocolResult);
  const { startFaceScan } = useFaceScan();
  // Passos crus (name/ingredient/instruction/steps) por período.
  const [amRaw, setAmRaw] = useState<RawStep[]>([]);
  const [pmRaw, setPmRaw] = useState<RawStep[]>([]);
  // dicas[]: [0]=visão geral/aviso, [1]=2 semanas, [2]=1 mês, [3]=3 meses, [4]=cronograma
  const [dicas, setDicas] = useState<(string | null)[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'generating' | 'ready' | 'empty' | 'error'>('loading');
  // Trava: no máximo UMA geração sob demanda por montagem da tela. Rearmada só no
  // toque explícito de "Tentar de novo".
  const triedGenerate = useRef(false);

  // FALLBACK do vão: o store cobre a janela em que a tabela ainda não tem o protocolo
  // (timing do onboarding OU insert falho). A FONTE DE VERDADE é a tabela `protocolos`.
  const fromStore = protocolResult?.morning?.length && protocolResult?.night?.length
    ? protocolResult
    : null;

  // FONTE DE VERDADE: tabela `protocolos`, revalidada A CADA FOCO (staleMs:0) — é isso
  // que faz uma alteração feita no servidor (card do Coach) aparecer ao voltar.
  const userId = useUserId();
  const fetchProtocolo = useCallback(async () => {
    const uid = await getUserId();
    if (!uid) return null;
    const { data, error } = await supabase
      .from('protocolos')
      .select('rotina_am, rotina_pm, dicas')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }, []);

  const { data: saved, state: savedState, refresh: refreshProtocolo } = useCachedQuery(
    userId ? `protocolo:${userId}` : null,
    fetchProtocolo,
    { enabled: Boolean(userId), staleMs: 0 },
  );

  // ── Geração SOB DEMANDA do protocolo — usuária legada ─────────────────────────
  // Só dispara se a usuária CHEGAR nesta tela e não houver protocolo salvo. Piso
  // mínimo: scan aproveitável (skin_score + skin_type_detected). 'ok' SÓ depois de
  // ler de volta a linha em `protocolos` (o insert não lança em falha de RLS).
  const generateOnDemand = useCallback(
    async (uid: string): Promise<'ok' | 'sem-scan' | 'falhou'> => {
      const { data: scan, error: scanErr } = await supabase
        .from('skin_scans')
        .select('id, full_result')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (scanErr) return 'falhou';

      const scanResult = scan?.full_result as ScanResult | undefined;
      if (
        !scanResult ||
        typeof scanResult.skin_score !== 'number' ||
        !(scanResult.skin_type_detected ?? '').trim()
      ) {
        return 'sem-scan';
      }

      const { data: urow } = await supabase
        .from('users')
        .select(
          'genero, pregnancy_status, skincare_routine_type, skincare_routine_description, allergy_type, allergy_description, tipo_pele, concerns, sun_exposure, hydration, sleep, birthday',
        )
        .eq('id', uid)
        .maybeSingle();

      const onboardingData: OnboardingData = buildOnboardingDataFromUserRow(urow, scanResult);

      let produced: ProtocolResult | null = null;
      await new Promise<void>((resolve) => {
        generateAndSaveProtocol({
          scanResult,
          onboardingData,
          skinScanId: scan!.id,
          userId: uid,
          onSuccess: (result) => { produced = result; },
          onFinally: () => resolve(),
        });
      });
      if (!produced) return 'falhou';

      const { data: savedRow } = await supabase
        .from('protocolos')
        .select('id')
        .eq('user_id', uid)
        .limit(1)
        .maybeSingle();
      if (!savedRow) return 'falhou';

      setProtocolResult(produced);
      void refreshProtocolo();
      return 'ok';
    },
    [setProtocolResult, refreshProtocolo],
  );

  const runOnDemandGeneration = useCallback(async () => {
    if (!userId) return;
    triedGenerate.current = true;
    setLoadState('generating');
    const gen = await generateOnDemand(userId);
    if (gen === 'sem-scan') { setLoadState('empty'); return; }
    // Falha nunca cai no empty de "faça a avaliação" — seria mentira com quem já escaneou.
    if (gen === 'falhou') { triedGenerate.current = false; setLoadState('error'); return; }
  }, [userId, generateOnDemand]);

  const aplica = useCallback((amS: RawStep[], pmS: RawStep[], ds: (string | null)[]) => {
    setAmRaw(amS); setPmRaw(pmS);
    setDicas(ds);
  }, []);

  useEffect(() => {
    if (!userId) return;

    // A tabela ganha quando QUALQUER período tem dado (||, não &&).
    const amS = (saved?.rotina_am as RawStep[]) ?? [];
    const pmS = (saved?.rotina_pm as RawStep[]) ?? [];
    if (amS.length || pmS.length) {
      aplica(amS, pmS, Array.isArray(saved?.dicas) ? saved!.dicas : []);
      setLoadState('ready');
      return;
    }

    // VÃO — tabela vazia por timing do onboarding OU insert falho: o store cobre.
    if (fromStore) {
      aplica(fromStore.morning as RawStep[], fromStore.night as RawStep[], storeDicas(fromStore));
      setLoadState('ready');
      return;
    }

    if (savedState === 'error') { setLoadState('error'); return; }
    if (savedState === 'loading') return;
    if (!triedGenerate.current) {
      void runOnDemandGeneration();
    } else {
      setLoadState('empty');
    }
  }, [fromStore, saved, savedState, userId, runOnDemandGeneration, aplica]);

  // Sincroniza o store a partir da tabela (fonte de verdade). Guard de igualdade evita laço.
  useEffect(() => {
    const amS = (saved?.rotina_am as RawStep[]) ?? [];
    const pmS = (saved?.rotina_pm as RawStep[]) ?? [];
    if (!amS.length && !pmS.length) return;
    const same = protocolResult
      && JSON.stringify(protocolResult.morning) === JSON.stringify(amS)
      && JSON.stringify(protocolResult.night) === JSON.stringify(pmS);
    if (same) return;
    setProtocolResult({
      ...(protocolResult ?? ({} as ProtocolResult)),
      morning: amS as unknown as ProtocolResult['morning'],
      night: pmS as unknown as ProtocolResult['night'],
      dicas: Array.isArray(saved?.dicas) ? saved!.dicas : [],
    });
  }, [saved, protocolResult, setProtocolResult]);

  // ── Extras da tela: foto, horários da rotina e o produto recomendado de cada passo ─
  const fetchExtras = useCallback(async () => {
    const uid = await getUserId();
    if (!uid) throw new Error('sem sessão');
    const [foto, userRes] = await Promise.all([
      getFacePhotoUrl(uid),
      supabase.from('users').select('rotina_manha_horario, rotina_noite_horario').eq('id', uid).maybeSingle(),
    ]);
    return {
      foto,
      amTime: parseTime(userRes.data?.rotina_manha_horario, DEFAULT_AM),
      pmTime: parseTime(userRes.data?.rotina_noite_horario, DEFAULT_PM),
    };
  }, []);
  const { data: extras } = useCachedQuery(
    userId ? `rotina:${userId}` : null,
    fetchExtras,
    { enabled: Boolean(userId) },
  );

  // Produtos escolhidos (AsyncStorage, por nome do passo) + progresso do dia + sequência.
  const [savedProducts, setSavedProducts] = useState<Record<string, SavedProduct>>({});
  // Recorte sem fundo (catálogo, Fase 2) de cada produto escolhido — chave = URL da foto original.
  const [cutouts, setCutouts] = useState<Record<string, Cutout>>({});
  const [doneSteps, setDoneSteps] = useState<{ am: number[]; pm: number[] }>({ am: [], pm: [] });
  const [hist, setHist] = useState<RoutineHistory>({});
  const [now, setNow] = useState(() => new Date());
  const reloadLocal = useCallback(() => {
    getSavedProducts().then((sp) => {
      setSavedProducts(sp);
      getCutoutsByImageUrl(Object.values(sp).map((p) => p.imageUrl)).then(setCutouts).catch(() => {});
    });
    Promise.all([getCompletedSteps('am'), getCompletedSteps('pm')]).then(([a, p]) => setDoneSteps({ am: a, pm: p }));
    getRoutineHistory().then(setHist);
    setNow(new Date());
  }, []);
  useFocusEffect(useCallback(() => {
    reloadLocal();
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [reloadLocal]));

  // ── Fluxo do "Iniciar rotina" (designs 45a–45c) ──────────────────────────────
  // check = checklist rápido (45a) · guide = guia passo a passo · cam = foto do dia
  // (45b, só na manhã) · done = rotina concluída (45c).
  const [flow, setFlow] = useState<null | 'check' | 'guide' | 'cam' | 'done'>(null);
  const [run, setRun] = useState(0);            // passo atual do guia
  const [lit, setLit] = useState<number[]>([]); // produtos marcados no checklist
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [journey, setJourney] = useState({ day: 1, left: 29 });
  const [flash, setFlash] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const shootingRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [openStep, setOpenStep] = useState(-1);
  const [cronOpen, setCronOpen] = useState(false);
  const setProductDetailStep = useAppStore((st) => st.setProductDetailStep);
  const player = useAudioPlayer(require('../../assets/sounds/check.mp3'));
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // [dev] Diagnóstico do "fluxo fechou sozinho": registra quem fechou e se a tela foi
  // recriada (o que zeraria o fluxo). Some do build de produção (__DEV__ é false).
  useEffect(() => {
    if (!__DEV__) return;
    console.log('[rotina] tela montada');
    return () => console.log('[rotina] tela desmontada');
  }, []);
  const closeFlow = (origin: string) => {
    if (__DEV__ && flow) {
      console.log(`[rotina] fluxo fechado (${flow ?? '-'}) por: ${origin}`, new Error().stack?.split('\n').slice(1, 6).join('\n'));
    }
    setFlow(null);
  };

  // Fluxo em andamento gravado por dia + período (lib/routineProgress): se a tela for
  // recriada ou o app morrer no meio, reabre onde parou. O checklist/guia grava a cada
  // toque; a foto do dia grava a etapa; a concluída apaga.
  const flowLoadedRef = useRef(false); // não grava nada antes de ler o que havia
  useEffect(() => {
    if (!flowLoadedRef.current) return;
    if (flow === 'check' || flow === 'guide' || flow === 'cam') {
      void saveRoutineFlow(period, { step: flow, open: true, lit, run });
    } else if (flow === 'done') {
      void clearRoutineFlow(period);
    }
  }, [flow, lit, run, period]);
  // Guarda o progresso sem reabrir sozinho (fechou no X / foi escolher produto).
  const parkFlow = () => {
    if (flow === 'check' || flow === 'guide') void saveRoutineFlow(period, { step: flow, open: false, lit, run });
    else if (flow === 'cam') void clearRoutineFlow(period);
  };

  const rawList = am ? amRaw : pmRaw;
  const n = rawList.length;
  const done = doneSteps[period];
  const k = done.length;
  const ft = rawList.findIndex((_, i) => !done.includes(i));
  const finAt = hist[dateKey(sessionDate(now))]?.[period];
  const finToday = !!finAt;
  // "Feita às 7:18" (design 41f) — horário real em que a cerimônia gravou a rotina.
  const finLabel = finAt ? `Feita às ${new Date(finAt).getHours()}:${String(new Date(finAt).getMinutes()).padStart(2, '0')}` : '';
  const streak = routineStreak(hist, now);

  const steps = rawList.map((raw, i) => {
    const name = (raw?.name ?? '').trim();
    const ingredient = (raw?.ingredient ?? '').trim();
    const c = cat(name, ingredient);
    const chosen = savedProducts[normStepKey(name)];
    const cut = chosen ? cutouts[chosen.imageUrl] : undefined;
    return {
      i, name, ingredient, cat: c, instruction: howOf(raw),
      chosen, hasProd: !!chosen,
      img: cut?.url ?? chosen?.imageUrl ?? '', cut: !!cut, // recorte sem fundo quando pronto
      tint: chosen ? PRODUCT_BG : NO_PRODUCT_BG,
      pline: chosen ? [chosen.brand, chosen.name].filter(Boolean).join(' · ') : 'Escolher produto',
    };
  });

  // Toque em "Próximo passo": haptic + som + grava o passo (e a rotina no último).
  const completeStep = (index: number) => {
    haptics.action();
    try { player.seekTo(0); player.play(); } catch {}
    markStepCompleted(period, index);
    setDoneSteps((d) => ({ ...d, [period]: d[period].includes(index) ? d[period] : [...d[period], index] }));
  };
  // Rotina concluída (pelo checklist ou pelo guia): todos os passos ficam feitos, a
  // rotina entra no histórico (sequência/semana) e — só na MANHÃ — vem a foto do dia.
  const finishRoutine = () => {
    haptics.success();
    try { player.seekTo(0); player.play(); } catch {}
    rawList.forEach((_, i) => markStepCompleted(period, i));
    setDoneSteps((d) => ({ ...d, [period]: rawList.map((_, i) => i) }));
    markRoutineDone(period).then(() => getRoutineHistory().then(setHist));
    // Já fez: o lembrete "ainda dá tempo" de hoje não vai mais.
    cancelLateReminder(period);
    setPhotoUri(null);
    if (am) {
      getUserId().then((uid) => { if (uid) void getPhotoJourney(uid).then(setJourney); });
      if (!camPermission?.granted) requestCamPermission();
      setFlow('cam');
    } else {
      setFlow('done');
    }
  };
  const nextStep = () => {
    completeStep(run);
    if (run + 1 >= n) finishRoutine();
    else setRun(run + 1);
  };

  // Foto do dia: dispara, mostra o clarão e conclui; o envio roda em segundo plano
  // (falhar o upload não desfaz a rotina — ela já está concluída).
  const shoot = async () => {
    if (shootingRef.current) return;
    shootingRef.current = true;
    haptics.action();
    try {
      let uri: string | null = null;
      if (__DEV__ && !Device.isDevice) {
        // Simulador não tem câmera: em dev, a galeria fornece a foto.
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8 });
        uri = r.canceled ? null : r.assets?.[0]?.uri ?? null;
      } else {
        const pic = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
        uri = pic?.uri ?? null;
      }
      if (!uri) return;
      const small = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1080 } }], {
        compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true,
      });
      setFlash(true);
      setPhotoUri(small.uri);
      const uid = await getUserId();
      if (uid && small.base64) {
        saveRoutinePhoto(uid, small.base64).catch((e) => console.warn('[foto do dia] falhou ao salvar', e));
      }
      setTimeout(() => { setFlash(false); setFlow('done'); }, 260);
    } catch (e) {
      console.warn('[foto do dia] falhou', e);
    } finally {
      shootingRef.current = false;
    }
  };
  const skipPhoto = () => { haptics.tap(); setPhotoUri(null); setFlow('done'); };

  // ── Herói ──────────────────────────────────────────────────────────────────
  // Antes do horário: "Sua rotina começa em" + contagem. Na janela da rotina:
  // "Rotina da manhã" + "N passos". Concluída hoje: "… concluída" + "Concluída".
  const t = now.getHours() * 60 + now.getMinutes();
  const amTime = extras?.amTime ?? DEFAULT_AM;
  const pmTime = extras?.pmTime ?? DEFAULT_PM;
  const start = am ? amTime : pmTime;
  // Janela em que a rotina pode ser feita: a da manhã vai do horário dela até o
  // horário da noite (dá para fazer atrasada); a da noite vai do horário dela até as
  // 04:00 (a virada da sessão-do-dia). Fora da janela o botão fica bloqueado.
  const windowOpen = (p: 'am' | 'pm') => (p === 'am' ? (t >= amTime && t < pmTime) : (t >= pmTime || t < 4 * 60));
  const inWindow = windowOpen(period);
  const canStart = inWindow && !finToday;

  // Reabre o fluxo que estava ABERTO quando a tela foi recriada / o app morreu — uma
  // vez, quando a rotina já carregou. Checklist/guia só se a rotina daquele período
  // ainda não foi feita e a janela está aberta; a foto do dia só se a manhã já foi
  // concluída (é a etapa logo depois). Se a usuária já abriu outro fluxo, não mexe.
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || loadState !== 'ready') return;
    restoredRef.current = true;
    let alive = true;
    void Promise.all([getRoutineHistory(), getRoutineFlow('am'), getRoutineFlow('pm')]).then(([h, amF, pmF]) => {
      if (!alive) return;
      flowLoadedRef.current = true;
      if (flowRef.current) return;
      const today = h[dateKey(sessionDate())] ?? {};
      const other: 'am' | 'pm' = period === 'am' ? 'pm' : 'am';
      const cands: ['am' | 'pm', RoutineFlowState | null][] = [
        [period, period === 'am' ? amF : pmF],
        [other, other === 'am' ? amF : pmF],
      ];
      for (const [p, s] of cands) {
        if (!s?.open) continue;
        const len = (p === 'am' ? amRaw : pmRaw).length;
        const ok = s.step === 'cam' ? p === 'am' && !!today.am : !today[p] && windowOpen(p) && len > 0;
        if (!ok) continue;
        if (p !== period) setPeriod(p);
        setLit(s.lit.filter((i) => i < len));
        setRun(Math.min(s.run, Math.max(0, len - 1)));
        if (s.step === 'cam') {
          setPhotoUri(null);
          getUserId().then((uid) => { if (uid) void getPhotoJourney(uid).then(setJourney); });
          if (!camPermission?.granted) requestCamPermission();
        }
        setFlow(s.step);
        if (__DEV__) console.log(`[rotina] fluxo reaberto onde parou: ${p} · ${s.step}`);
        break;
      }
    });
    return () => { alive = false; };
  }, [loadState]);
  const untilStart = start - t > 0 ? start - t : start - t + 24 * 60;
  const hero = finToday
    ? { label: am ? 'Rotina da manhã concluída' : 'Rotina da noite concluída', big: 'Concluída' }
    : inWindow
      ? { label: am ? 'Rotina da manhã' : 'Rotina da noite', big: `${n} ${n === 1 ? 'passo' : 'passos'}` }
      : { label: 'Sua rotina começa em', big: fmtDuration(untilStart) };

  // ── Recomendações ──────────────────────────────────────────────────────────
  const marcos = [
    { l: '2 semanas', b: dicas[1] },
    { l: '1 mês', b: dicas[2] },
    { l: '3 meses', b: dicas[3] },
  ].map((m, i) => ({ ...m, bg: ['#FFE3EE', '#F1E4F7', '#E2F1EF'][i] }))
    .filter((m): m is { l: string; b: string; bg: string } => !!(m.b ?? '').trim());
  const cron = parseCronograma(dicas[4]);
  const alert = (dicas[0] ?? '').trim();

  // "Escolher/Ver produto": abre a tela de Produtos já no produto deste passo — o
  // casamento passo↔produto é pelo NOME do passo (normStepKey), igual a antes.
  const openProducts = (stepName: string) => {
    haptics.tap();
    parkFlow();
    closeFlow('openProducts (escolher produto)');
    setProductDetailStep({ passo: stepName, periodo: period });
    router.push('/recomendacao-produtos' as any);
  };

  // "Iniciar rotina" abre o checklist (45a) — ou retoma onde parou hoje (produtos
  // marcados, ou o passo do guia), se a usuária tinha fechado no meio.
  const startRun = () => {
    if (!n) return;
    haptics.action();
    flowLoadedRef.current = true;
    void getRoutineFlow(period).then((s) => {
      const resume = s && s.step !== 'cam' ? s : null;
      setLit(resume ? resume.lit.filter((i) => i < n) : []);
      setRun(resume ? Math.min(resume.run, n - 1) : 0);
      setFlow(resume?.step ?? 'check');
    });
  };
  const stopRun = (origin: string) => {
    haptics.tap();
    const wasDone = flow === 'done';
    parkFlow();
    closeFlow(origin);
    if (wasDone) requestAppReview();
  };
  const toggleLit = (i: number) => {
    haptics.select();
    setLit((l) => (l.includes(i) ? l.filter((x) => x !== i) : [...l, i]));
  };

  const rs = flow === 'guide' ? steps[Math.min(run, n - 1)] : null;
  const modalVisible = flow != null;
  const doneSub = photoUri
    ? (journey.left > 0
      ? `Foto do dia ${journey.day} salva · seu vídeo fica pronto em ${journey.left} ${journey.left === 1 ? 'dia' : 'dias'}`
      : `Foto do dia ${journey.day} salva · seu vídeo já está pronto`)
    : (am ? 'Sem foto hoje. Seu vídeo só não terá este dia.' : 'Até amanhã de manhã');
  // Linha da sequência na 45c. Qualquer rotina concluída já vale o dia, então hoje
  // sempre conta. Inclui a rotina recém-concluída mesmo antes de o histórico
  // (AsyncStorage) responder, para não piscar um número menor.
  const todayKey = dateKey(sessionDate(now));
  const histNow: RoutineHistory = {
    ...hist,
    [todayKey]: { ...hist[todayKey], [period]: hist[todayKey]?.[period] ?? Date.now() },
  };
  const doneStreak = routineStreak(histNow, now);
  const doneStreakLine = `${doneStreak} ${doneStreak === 1 ? 'dia seguido' : 'dias seguidos'}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  const segBtn = (value: 'am' | 'pm', label: string) => {
    const on = period === value;
    const ink = on ? INK : SOFT;
    return (
      <TouchableOpacity
        key={value}
        activeOpacity={0.85}
        onPress={() => { haptics.select(); setPeriod(value); setOpenStep(-1); }}
        style={[styles.seg, on && styles.segOn]}
      >
        <Svg width={16} height={16} viewBox="0 0 24 24">
          {value === 'am' ? (
            <>
              <Circle cx={12} cy={12} r={4} fill="none" stroke={ink} strokeWidth={1.9} />
              <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" fill="none" stroke={ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : (
            <Path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="none" stroke={ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </Svg>
        <Text style={{ fontSize: 15, fontWeight: on ? '600' : '500', letterSpacing: -0.2, color: ink }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <LinearGradient colors={BG[period]} locations={BG_STOPS} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />
      <View style={styles.circleBlob} pointerEvents="none" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 112 }}>
        <View style={{ height: insets.top + 15 }} />

        {/* ── Cabeçalho: foto + "Sua rotina" · sequência ─────────────────── */}
        <View style={styles.hdrRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32 }}>
              {extras?.foto ? (
                <Image source={{ uri: extras.foto }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#F6D3E1' }]} />
              )}
              <View style={styles.avatarDot} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '400', letterSpacing: -0.3, color: INK }}>Sua rotina</Text>
          </View>
          <View style={styles.streakBtn}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeText}>{streak}</Text>
            </View>
          </View>
        </View>

        {/* ── Manhã / Noite ─────────────────────────────────────────────── */}
        <View style={styles.segWrap}>
          {segBtn('am', 'Manhã')}
          {segBtn('pm', 'Noite')}
        </View>

        {loadState === 'loading' || loadState === 'generating' ? (
          <View style={{ paddingTop: 64, alignItems: 'center', gap: 14 }}>
            <ActivityIndicator size="large" color={PINK} />
            <Text style={{ fontSize: 15, color: MUTED }}>
              {loadState === 'generating' ? 'Montando seu protocolo…' : 'Carregando sua rotina…'}
            </Text>
          </View>
        ) : loadState === 'ready' && n > 0 ? (
          <>
            {/* ── Herói ─────────────────────────────────────────────────── */}
            <Text style={styles.heroLabel}>{hero.label}</Text>
            <Text style={styles.heroBig}>{hero.big}</Text>
            <Text style={styles.heroSub}>{FOCUS[period]}</Text>
            {finToday ? (
              // Concluída — "linha simples" do design 41f: check rosa + "Feita às H:MM".
              // Não é botão: a rotina não reabre no mesmo dia.
              <View style={styles.doneLine}>
                <View style={styles.doneLineCheck}>
                  <Svg width={14} height={14} viewBox="0 0 24 24">
                    <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
                <Text style={styles.doneLineText}>{finLabel}</Text>
              </View>
            ) : (
              <View style={{ marginTop: 26, alignItems: 'center' }}>
                {/* Só dá para iniciar a partir do horário da rotina (antes disso o botão
                    fica rosa-claro, bloqueado). */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={!canStart}
                  onPress={startRun}
                  accessibilityState={{ disabled: !canStart }}
                  style={[styles.heroBtn, !inWindow && styles.heroBtnLocked]}
                >
                  <Svg width={13} height={14} viewBox="0 0 13 14">
                    <Path d="M1 1.6v10.8c0 .8.9 1.3 1.6.9l9-5.4c.6-.4.6-1.3 0-1.7l-9-5.4C1.9.4 1 .8 1 1.6z" fill="#fff" />
                  </Svg>
                  <Text style={styles.heroBtnText}>Iniciar rotina</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Seus passos (linha do tempo) ─────────────────────────────── */}
            <View style={styles.listHead}>
              <Text style={styles.sectionTitle}>{am ? 'Seus passos · Manhã' : 'Seus passos · Noite'}</Text>
              <Text style={{ fontSize: 15, color: MUTED }}>{`${finToday ? n : k}/${n}`}</Text>
            </View>
            <View style={{ marginTop: 12, paddingLeft: 14, paddingRight: 18 }}>
              {steps.map((s) => {
                const open = openStep === s.i;
                return (
                  <View key={`${period}-${s.i}`} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ width: 30, alignItems: 'center' }}>
                      {finToday ? (
                        // Rotina concluída (41f): todo passo vira check rosa.
                        <View style={[styles.num, styles.numDone]}>
                          <Svg width={14} height={14} viewBox="0 0 24 24">
                            <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                        </View>
                      ) : (
                        <View style={[styles.num, s.i === ft ? { borderWidth: 2, borderColor: PINK } : { borderWidth: 1.5, borderColor: '#F4C2D7' }]}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: PINK_TEXT }}>{s.i + 1}</Text>
                        </View>
                      )}
                      <DottedLine color={done.includes(s.i) ? PINK : 'rgba(192,32,106,0.28)'} hidden={s.i === n - 1} />
                    </View>
                    <View style={[styles.stepCard, open ? styles.stepCardOpen : styles.stepCardClosed]}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => { haptics.tap(); setOpenStep(open ? -1 : s.i); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}
                      >
                        {s.hasProd ? (
                          <View style={[styles.tile, { backgroundColor: s.tint }, finToday && { opacity: 0.55 }]}>
                            <ExpoImage source={{ uri: s.img }} style={{ width: 42, height: 42 }} contentFit="contain" />
                          </View>
                        ) : (
                          // Sem produto: o quadradinho "+" é um botão próprio e vai direto
                          // escolher o produto. O resto do card continua abrindo/fechando.
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => openProducts(s.name)}
                            accessibilityLabel={`Escolher produto para ${s.name}`}
                            style={[styles.tile, { backgroundColor: s.tint }, finToday && { opacity: 0.55 }]}
                          >
                            <DashedTile size={52} radius={11} />
                            <PlusIcon size={18} />
                          </TouchableOpacity>
                        )}
                        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                          {/* Card mais limpo (pedido do usuário): sem a categoria. O nome do passo
                              vira o texto pequeno de cima e o produto sobe para o centro — ou
                              "Escolher produto" em rosa, se ainda não houver produto. */}
                          <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED }} numberOfLines={1}>{s.name}</Text>
                          <Text
                            style={[styles.stepName, !s.hasProd ? { color: PINK_TEXT } : finToday && styles.stepNameDone]}
                            numberOfLines={2}
                            lineBreakStrategyIOS="push-out"
                          >
                            {s.pline}
                          </Text>
                        </View>
                        <Chevron open={open} />
                      </TouchableOpacity>
                      {open && (
                        <View style={styles.stepBody}>
                          <Text style={styles.stepInstruction} lineBreakStrategyIOS="push-out">{s.instruction}</Text>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => openProducts(s.name)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
                          >
                            <Text style={{ fontSize: 15, fontWeight: '500', letterSpacing: -0.3, color: PINK_TEXT }}>
                              {s.hasProd ? 'Ver produto' : 'Escolher produto'}
                            </Text>
                            <Svg width={14} height={14} viewBox="0 0 24 24">
                              <Path d="M9 6l6 6-6 6" fill="none" stroke={PINK_TEXT} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                            </Svg>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
              {/* "Editar rotina": a rotina muda pela NIKS (ela propõe, você aprova). */}
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => { haptics.tap(); router.push('/niks-chat' as any); }}
                style={{ marginTop: 10, marginLeft: -14, marginRight: -18, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: PINK_TEXT }}>Editar rotina</Text>
              </TouchableOpacity>
            </View>

            {/* ── O que esperar ───────────────────────────────────────────── */}
            {marcos.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 30, paddingHorizontal: 18 }]}>O que esperar</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 9 }} contentContainerStyle={{ gap: 9, paddingHorizontal: 18 }}>
                  {marcos.map((m) => <FlipCard key={m.l} label={m.l} body={m.b} bg={m.bg} />)}
                </ScrollView>
              </>
            )}

            {/* ── Como introduzir os ativos ───────────────────────────────── */}
            {(cron.length > 0 || !!alert) && (
              <View style={styles.cronCard}>
                {/* Fechado por padrão: o toque no cabeçalho abre o cronograma e o aviso. */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    haptics.tap();
                    LayoutAnimation.configureNext(LayoutAnimation.create(260, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
                    setCronOpen((o) => !o);
                  }}
                  style={[styles.cronHead, !cronOpen && { borderBottomWidth: 0 }]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.sectionTitle}>Como introduzir os ativos</Text>
                    <Text style={{ fontSize: 15, letterSpacing: -0.2, color: MUTED }}>Sem agredir a pele</Text>
                  </View>
                  <Chevron open={cronOpen} />
                </TouchableOpacity>
                {cronOpen && cron.map((c, i) => (
                  <View key={i} style={[styles.cronRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#EFE8EB' }]}>
                    <Text style={styles.cronWeek}>{c.week}</Text>
                    <Text style={styles.cronBody}>{c.body}</Text>
                  </View>
                ))}
                {cronOpen && !!alert && (
                  <View style={styles.alert}>
                    <Svg width={18} height={18} viewBox="0 0 24 24" style={{ marginTop: 2 }}>
                      <Circle cx={12} cy={12} r={9.5} fill="none" stroke={PINK_TEXT} strokeWidth={1.9} />
                      <Path d="M12 11v6M12 7.5v.01" fill="none" stroke={PINK_TEXT} strokeWidth={1.9} strokeLinecap="round" />
                    </Svg>
                    <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, letterSpacing: -0.25, color: BODY }}>{alert}</Text>
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          /* sem protocolo salvo ou erro de carregamento */
          <View style={styles.stateBox}>
            <View style={{ gap: 8 }}>
              <Text style={styles.stateTitle}>
                {loadState === 'error' ? 'Não conseguimos carregar sua rotina' : 'Sua rotina ainda não está pronta'}
              </Text>
              <Text style={{ fontSize: 15, lineHeight: 21, letterSpacing: -0.25, color: MUTED, textAlign: 'center' }}>
                {loadState === 'error'
                  ? 'Verifique sua conexão e tente novamente.'
                  : 'Faça uma análise de pele para gerar seu protocolo de skincare personalizado.'}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.heroBtn}
              onPress={() => {
                haptics.action();
                if (loadState !== 'error') { startFaceScan(); return; }
                // "Tentar de novo": rearma a trava e re-lê da rede. Se ainda não houver
                // protocolo (usuária legada), o efeito re-dispara a geração — uma vez por
                // toque, nunca em cadeia automática. Re-ler antes de gerar evita protocolo
                // duplicado caso a falha tenha sido só na leitura de volta.
                triedGenerate.current = false;
                setLoadState('loading');
                void refreshProtocolo();
              }}
            >
              <Text style={styles.heroBtnText}>{loadState === 'error' ? 'Tentar novamente' : 'Escanear minha pele'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── "Iniciar rotina": checklist (45a) · guia · foto do dia (45b) · concluída (45c) ── */}
      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={() => stopRun('onRequestClose (voltar do Android / gesto)')}>
        {/* 45a — Checklist rápido */}
        {flow === 'check' && (
          <View style={{ flex: 1 }}>
            <LinearGradient colors={BG[period]} locations={BG_STOPS} style={StyleSheet.absoluteFill} />
            <View style={{ flex: 1, paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom - 6, 16) }}>
              <View style={{ height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => stopRun('X do checklist')} activeOpacity={0.85} style={styles.circleBtn}>
                  <Svg width={16} height={16} viewBox="0 0 24 24">
                    <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
                  </Svg>
                </TouchableOpacity>
                <Text style={{ fontSize: 17, fontWeight: '400', letterSpacing: -0.3, color: INK }}>{am ? 'Rotina da manhã' : 'Rotina da noite'}</Text>
                <View style={{ width: 36 }} />
              </View>
              <Text style={styles.ckHint}>Toque em cada produto ao passar</Text>
              <Text style={styles.ckCount}>{`${lit.length} de ${n}`}</Text>
              <ScrollView style={{ marginTop: 20, flex: 1 }} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} showsVerticalScrollIndicator={false}>
                {steps.map((s) => {
                  const on = lit.includes(s.i);
                  return (
                    <TouchableOpacity
                      key={s.i}
                      activeOpacity={0.9}
                      onPress={() => toggleLit(s.i)}
                      style={[styles.ckItem, on ? styles.ckItemOn : styles.ckItemOff]}
                    >
                      <View style={[styles.ckTile, { backgroundColor: s.tint, opacity: on ? 1 : 0.55 }]}>
                        {s.hasProd ? (
                          s.cut
                            // Recorte sem fundo: o produto "flutua" sobre o quadro branco.
                            ? <ExpoImage source={{ uri: s.img }} style={{ width: 46, height: 46 }} contentFit="contain" />
                            // Sem recorte ainda: a foto preenche o quadro (a original tem fundo branco,
                            // e "contain" deixava um quadrado branco dentro do quadro colorido).
                            : <ExpoImage source={{ uri: s.img }} style={StyleSheet.absoluteFill} contentFit="cover" />
                        ) : (
                          <PlusIcon size={18} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED }}>{`Passo ${s.i + 1} · ${s.cat}`}</Text>
                        <Text style={styles.ckName} numberOfLines={1}>{s.name}</Text>
                      </View>
                      <View style={[styles.ckCheck, on ? { backgroundColor: PINK } : { borderWidth: 1.5, borderColor: '#D6CCD1', backgroundColor: '#FFFFFF' }]}>
                        {on && (
                          <Svg width={15} height={15} viewBox="0 0 24 24">
                            <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {(() => {
                const all = n > 0 && lit.length === n;
                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={!all}
                    onPress={finishRoutine}
                    style={[styles.bigBtn, { marginTop: 14 }, !all && { backgroundColor: '#FFC2DB', shadowOpacity: 0 }]}
                  >
                    <Text style={styles.heroBtnText}>{all ? 'Concluir rotina' : `Faltam ${n - lit.length} ${n - lit.length === 1 ? 'produto' : 'produtos'}`}</Text>
                  </TouchableOpacity>
                );
              })()}
              <TouchableOpacity activeOpacity={0.6} onPress={() => { haptics.tap(); setRun(0); setFlow('guide'); }} style={{ marginTop: 6, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: PINK_TEXT }}>Ver guia passo a passo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Guia passo a passo (o "Iniciar rotina" antigo) */}
        {flow === 'guide' && rs && (
          <View style={{ flex: 1 }}>
            <LinearGradient colors={BG[period]} locations={BG_STOPS} style={StyleSheet.absoluteFill} />
            <View style={{ flex: 1, paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20) }}>
              <View style={{ height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => stopRun('X do guia')} activeOpacity={0.85} style={styles.circleBtn}>
                  <Svg width={16} height={16} viewBox="0 0 24 24">
                    <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
                  </Svg>
                </TouchableOpacity>
                <Text style={{ fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: INK }}>{`Passo ${run + 1} de ${n}`}</Text>
                <View style={{ width: 36 }} />
              </View>
              <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
                {rawList.map((_, i) => (
                  <View key={i} style={{ width: 30, height: 4, borderRadius: 2, backgroundColor: i <= run ? PINK : 'rgba(255,255,255,0.85)' }} />
                ))}
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 16 }} showsVerticalScrollIndicator={false}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => openProducts(rs.name)} style={styles.runCircle}>
                  {rs.hasProd ? (
                    <ExpoImage source={{ uri: rs.img }} style={{ width: 120, height: 124 }} contentFit="contain" />
                  ) : (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <PlusIcon size={28} sw={2} />
                      <Text style={{ color: PINK_TEXT, fontSize: 15, fontWeight: '500' }}>Escolher produto</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={{ marginTop: 24, fontSize: 15, fontWeight: '500', letterSpacing: -0.2, color: SOFT }}>{rs.cat}</Text>
                <Text style={styles.runName}>{rs.name}</Text>
                <Text style={{ marginTop: 6, fontSize: 15, letterSpacing: -0.2, color: rs.hasProd ? MUTED : PINK_TEXT, textAlign: 'center' }}>{rs.pline}</Text>
                <Text style={styles.runInstruction} lineBreakStrategyIOS="push-out">{rs.instruction}</Text>
              </ScrollView>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <TouchableOpacity activeOpacity={0.85} onPress={nextStep} style={[styles.bigBtn, { alignSelf: 'stretch' }]}>
                  <Text style={styles.heroBtnText}>{run === n - 1 ? 'Concluir rotina' : 'Próximo passo'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  disabled={run === 0}
                  onPress={() => { haptics.tap(); setRun(Math.max(0, run - 1)); }}
                  style={{ height: 40, justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: run ? PINK_TEXT : 'rgba(232,70,143,0)' }}>Passo anterior</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* 45b — Foto do dia (só ao concluir a manhã; opcional) */}
        {flow === 'cam' && (
          <View style={{ flex: 1, backgroundColor: INK }}>
            <StatusBar style="light" />
            {camPermission?.granted && (
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mirror={facing === 'front'} />
            )}
            <LinearGradient colors={['rgba(18,18,18,0.62)', 'rgba(18,18,18,0)']} style={styles.camTopShade} pointerEvents="none" />
            <LinearGradient colors={['rgba(18,18,18,0)', 'rgba(18,18,18,0.66)']} style={styles.camBottomShade} pointerEvents="none" />
            {/* Moldura oval tracejada (250×330) para enquadrar o rosto */}
            <Svg width={250} height={330} style={{ position: 'absolute', top: insets.top + 174, alignSelf: 'center' }} pointerEvents="none">
              <Ellipse cx={125} cy={165} rx={124} ry={164} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={2} strokeDasharray={[6, 5]} />
            </Svg>
            <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 58, alignItems: 'center', gap: 6 }} pointerEvents="none">
              <Text style={styles.camTitle}>{`Foto do dia ${journey.day}`}</Text>
              <Text style={styles.camSub}>
                {journey.left > 0
                  ? `Dia ${journey.day} de 30 · faltam ${journey.left} ${journey.left === 1 ? 'dia' : 'dias'} para o seu vídeo`
                  : `Dia ${journey.day} · seu vídeo já está pronto`}
              </Text>
              <View style={styles.camBar}>
                <View style={{ width: `${Math.min(100, (journey.day / 30) * 100)}%`, height: '100%', backgroundColor: '#FFFFFF', borderRadius: 2 }} />
              </View>
            </View>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom, alignItems: 'center', gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 40 }}>
                <View style={{ width: 48 }} />
                <TouchableOpacity activeOpacity={0.85} onPress={shoot} style={styles.shutter} accessibilityLabel="Tirar foto">
                  <View style={styles.shutterInner} />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); setFacing((f) => (f === 'front' ? 'back' : 'front')); }} style={styles.camFlipBtn} accessibilityLabel="Virar câmera">
                  <Svg width={22} height={22} viewBox="0 0 24 24">
                    <Path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </TouchableOpacity>
              </View>
              <TouchableOpacity activeOpacity={0.6} onPress={skipPhoto} style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: '#FFFFFF' }}>Pular foto hoje</Text>
                <Svg width={16} height={16} viewBox="0 0 24 24">
                  <Path d="M9 6l6 6-6 6" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>
              <Text style={{ marginTop: -12, fontSize: 13, letterSpacing: -0.1, color: '#FFFFFF', opacity: 0.85 }}>Sua sequência continua mesmo sem foto</Text>
            </View>
            {flash && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} pointerEvents="none" />}
          </View>
        )}

        {/* 45c — Rotina concluída (com ou sem foto) */}
        {flow === 'done' && (
          <View style={{ flex: 1 }}>
            <StatusBar style="dark" />
            <LinearGradient colors={BG[period]} locations={BG_STOPS} style={StyleSheet.absoluteFill} />
            <View style={{ flex: 1, paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 20) }}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                {photoUri ? (
                  // Sombra num View por fora: a Image recorta os cantos e engoliria a sombra.
                  <View style={styles.donePhotoShadow}>
                    <Image source={{ uri: photoUri }} style={styles.donePhoto} />
                    <View style={styles.donePhotoCheck}>
                      <Svg width={20} height={20} viewBox="0 0 24 24">
                        <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                  </View>
                ) : (
                  <View style={styles.doneCircle}>
                    <Svg width={56} height={56} viewBox="0 0 24 24">
                      <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>
                )}
                <Text style={styles.doneTitle}>{am ? 'Rotina da manhã concluída' : 'Rotina da noite concluída'}</Text>
                <BalancedText text={doneSub} style={styles.doneSub} />
                <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Svg width={15} height={15} viewBox="0 0 24 24">
                    <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="none" stroke={PINK_TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                  <Text style={{ fontSize: 15, fontWeight: '500', letterSpacing: -0.2, color: SOFT }}>
                    {doneStreakLine}
                  </Text>
                </View>
              </View>
              <TouchableOpacity activeOpacity={0.85} onPress={() => stopRun('Voltar para a rotina')} style={styles.bigBtn}>
                <Text style={styles.heroBtnText}>Voltar para a rotina</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
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
    left: 190, top: -90, backgroundColor: 'rgba(255,226,236,0.40)',
  },

  hdrRow: { height: 36, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarDot: {
    position: 'absolute', top: -1, right: -2, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: PINK, borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  streakBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
  },
  streakBadge: {
    position: 'absolute', top: -5, left: 21, minWidth: 21, height: 18, paddingHorizontal: 5, borderRadius: 100,
    backgroundColor: PINK, borderWidth: 1.5, borderColor: '#FDE6EF', alignItems: 'center', justifyContent: 'center',
  },
  streakBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', lineHeight: 15, letterSpacing: -0.2, textAlign: 'center' },

  segWrap: {
    marginTop: 18, alignSelf: 'center', flexDirection: 'row', gap: 2, padding: 3,
    borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.55)',
  },
  seg: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, borderRadius: 100 },
  segOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 5,
  },

  heroLabel: { marginTop: 44, height: 22, lineHeight: 22, textAlign: 'center', fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: INK },
  heroBig: { marginTop: 5, height: 56, lineHeight: 56, textAlign: 'center', fontSize: 48, fontWeight: '700', letterSpacing: -0.6, color: INK },
  heroSub: { marginTop: 14, paddingHorizontal: 24, textAlign: 'center', fontSize: 17, fontWeight: '400', lineHeight: 22, letterSpacing: -0.3, color: INK },
  heroBtn: {
    height: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 32, borderRadius: 100,
    backgroundColor: PINK,
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  // Antes do horário: o mesmo rosa-claro do "Enviar" desabilitado do chat, sem brilho.
  heroBtnLocked: { backgroundColor: '#FFD3E5', shadowOpacity: 0 },
  doneLine: { marginTop: 26, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  doneLineCheck: { width: 26, height: 26, borderRadius: 13, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  doneLineText: { fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: INK },
  heroBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },

  sectionTitle: { fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK },
  listHead: { marginTop: 36, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  num: {
    marginTop: 14, width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  numDone: {
    backgroundColor: PINK,
    shadowColor: PINK, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 5,
  },
  stepCard: { flex: 1, minWidth: 0, marginBottom: 10, backgroundColor: '#FFFFFF', borderRadius: 13 },
  stepCardOpen: { shadowColor: '#783C48', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 9 },
  stepCardClosed: { shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 1 },
  tile: { width: 52, height: 52, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepName: { fontSize: 17, fontWeight: '600', lineHeight: 21, letterSpacing: -0.4, color: INK },
  stepNameDone: { color: MUTED, textDecorationLine: 'line-through' },
  stepBody: { paddingTop: 2, paddingHorizontal: 14, paddingBottom: 14, gap: 12, borderTopWidth: 1, borderTopColor: '#F3EDF0' },
  stepInstruction: { paddingTop: 12, fontSize: 16, lineHeight: 22, letterSpacing: -0.3, color: BODY },

  flipFace: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 13, backfaceVisibility: 'hidden' },
  flipBack: {
    backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: PINK,
    paddingTop: 13, paddingHorizontal: 13, paddingBottom: 12, gap: 6,
  },
  flipEm: { fontSize: 13, fontWeight: '500', color: SOFT },
  flipLabel: { fontSize: 24, fontWeight: '700', lineHeight: 28, letterSpacing: -0.7, color: INK },
  flipBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 5,
  },

  cronCard: { marginTop: 26, marginHorizontal: 18, backgroundColor: '#FFFFFF', borderRadius: 13 },
  cronHead: { paddingTop: 16, paddingHorizontal: 17, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#EEE8E8' },
  cronRow: { flexDirection: 'row', gap: 14, paddingVertical: 13, paddingHorizontal: 17 },
  cronWeek: { width: 96, fontSize: 15, fontWeight: '600', letterSpacing: -0.3, color: PINK_DEEP },
  cronBody: { flex: 1, fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: BODY },
  alert: {
    marginTop: 4, marginHorizontal: 17, marginBottom: 17, flexDirection: 'row', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#FDEEF4',
  },

  stateBox: { paddingTop: 56, paddingHorizontal: 32, alignItems: 'center', gap: 20 },
  stateTitle: { fontSize: 17, fontWeight: '500', lineHeight: 22, letterSpacing: -0.3, color: INK, textAlign: 'center' },

  circleBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
  },
  runCircle: {
    width: 180, height: 180, borderRadius: 90, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: PINK_DEEP, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 15,
  },
  runName: { marginTop: 4, fontSize: 28, fontWeight: '700', lineHeight: 33, letterSpacing: -0.6, color: INK, textAlign: 'center' },
  runInstruction: { marginTop: 16, fontSize: 17, lineHeight: 23, letterSpacing: -0.3, color: BODY, textAlign: 'center' },
  bigBtn: {
    height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  ckHint: { marginTop: 22, height: 22, lineHeight: 22, textAlign: 'center', fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: INK },
  ckCount: { marginTop: 5, height: 56, lineHeight: 56, textAlign: 'center', fontSize: 48, fontWeight: '700', letterSpacing: -0.6, color: INK },
  ckItem: {
    height: 76, borderRadius: 18, borderWidth: 2, paddingLeft: 9, paddingRight: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  ckItemOn: {
    borderColor: PINK, backgroundColor: '#FFFFFF',
    shadowColor: PINK, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 10,
  },
  ckItemOff: { borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.55)' },
  ckTile: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ckName: { fontSize: 17, fontWeight: '600', lineHeight: 21, letterSpacing: -0.4, color: INK },
  ckCheck: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  camTopShade: { position: 'absolute', left: 0, right: 0, top: 0, height: 280 },
  camBottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 300 },
  camTitle: { fontSize: 28, fontWeight: '700', lineHeight: 33, letterSpacing: -0.6, color: '#FFFFFF' },
  camSub: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2, color: '#FFFFFF' },
  camBar: { marginTop: 6, width: 180, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' },
  camFlipBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },

  // Design: box-shadow 0 10px 30px rgba(192,32,106,0.18).
  donePhotoShadow: {
    width: 150, height: 190, borderRadius: 18, backgroundColor: '#FFFFFF',
    shadowColor: '#C0206A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 15,
  },
  donePhoto: {
    width: 150, height: 190, borderRadius: 18, borderWidth: 3, borderColor: '#FFFFFF',
  },
  donePhotoCheck: {
    position: 'absolute', right: -12, bottom: -12, width: 44, height: 44, borderRadius: 22,
    backgroundColor: PINK, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  doneTitle: { marginTop: 28, fontSize: 28, fontWeight: '700', lineHeight: 33, letterSpacing: -0.6, color: INK, textAlign: 'center' },
  doneSub: { marginTop: 8, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, color: '#3D3A3C', textAlign: 'center' },
  doneCircle: {
    width: 128, height: 128, borderRadius: 64, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 15,
  },

});
