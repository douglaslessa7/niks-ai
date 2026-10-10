// ─────────────────────────────────────────────────────────────────────────────
// Rotina de Skincare — réplica do design 41d do Claude Design (projeto "NIKS home
// redesign — rotina skincare", NiksRoutineFlo2.dc.html com v="timeline"): cabeçalho
// com foto + "Sua rotina" + sequência, seletor Manhã/Noite, herói com "Iniciar
// rotina", passos em linha do tempo com o produto escolhido, "O que esperar" (cards
// que viram), "Como introduzir os ativos" e a rotina passo a passo (com a tela de
// concluída). "Escolher/Trocar produto" abre a folha "Escolher produto" (Fase 2 do
// plano da Rotina — components/rotina/EscolherProdutoSheet).
// Fonte = SF Pro (sistema), rosa #FF5EA8. Medidas do frame 393×852: o topo do
// conteúdo (69) = barra de status do frame (54) + 15 → `insets.top + 15`.
// DADOS: os PASSOS vêm da "Minha rotina" (`minha_rotina_passos`, lib/minhaRotina — a
// rotina que ela faz; nasce como cópia da ideal). A ROTINA IDEAL (`protocolos`) segue
// carregada como antes: dá os textos de "O que esperar"/"Como introduzir", cobre o vão
// antes de a Minha rotina existir (store como fallback) e a geração sob demanda para
// usuária legada — lógica intacta. A ideal nunca é alterada por esta tela.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity, Animated, Easing, Modal, Alert, useWindowDimensions,
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
  markStepCompleted, markRoutineDone, getCompletedSteps, getRoutineHistory, routineStreak, routineDayStreak,
  sessionDate, dateKey, type RoutineHistory, type StepKey,
  getRoutineFlow, saveRoutineFlow, clearRoutineFlow, type RoutineFlowState,
} from '../../lib/routineProgress';
import { cancelLateReminder } from '../../lib/routineReminders';
import { requestAppReview } from '../../lib/storeReview';
import {
  listarMinhaRotina, garantirMinhaRotina, temProdutosNoCelular, diaDaSemana, passoValeNoDia,
  reordenarPassos, removerPasso, nomeDoPasso, type MinhaRotina, type PassoRotina,
} from '../../lib/minhaRotina';
import EscolherProdutoSheet from '../../components/rotina/EscolherProdutoSheet';
import StepIcon from '../../components/rotina/StepIcon';
import RotinaIdealSheet from '../../components/rotina/RotinaIdealSheet';
import IntroRotina, { type EscolhaIntro } from '../../components/rotina/IntroRotina';
import { tipoDoPasso, ROTULO_TIPO } from '../../lib/tipoPasso';
import { diasDoPasso, seloFrequencia, fraseFrequencia } from '../../lib/frequencia';
import { useLote } from '../../lib/loteProdutos';
import { loteDeHoje } from '../../lib/rotinaLotes';
import { carregarRotinaIdeal, marcarIdealVista, calcularCobertura, type RotinaIdeal } from '../../lib/rotinaIdeal';
import ListaEditavel, { type ItemEditavel } from '../../components/rotina/ListaEditavel';
import PassoSheet, { type PassoSheetModo } from '../../components/rotina/PassoSheet';
import { getFacePhotoUrl } from '../../lib/facePhoto';
import { getPhotoJourney, saveRoutinePhoto } from '../../lib/routinePhotos';
import { useCachedQuery, invalidateCache } from '../../lib/cache';
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
// Card da rotina ideal recolhido: o quanto ele fica deslocado para a direita (a borda
// esquerda vai de 18 a 104 pt da tela).
const IDEAL_RECOLHIDO_X = 86;

const DEFAULT_AM = 7 * 60;
const DEFAULT_PM = 21 * 60;

// ── Tipos + mapeamento dos DADOS REAIS ───────────────────────────────────────
// Passo cru salvo pelo generate-protocol (ver README → mapeamento generate-protocol).
type RawStep = {
  id?: number; name?: string; ingredient?: string; instruction?: string;
  steps?: string[]; color?: string; waitTime?: string | null; product_suggestions?: string[];
};

// "A, B e C".
function juntarNomes(n: string[]): string {
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
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

  // ── Minha rotina (os passos que ela faz) ───────────────────────────────────
  // Revalidada a cada foco. Se ainda não existe (1ª abertura depois da atualização, ou
  // logo depois do cadastro), cria a cópia da ideal no servidor; se ainda não há ideal
  // salva, devolve vazia e a tela mostra a ideal até lá. Produtos salvos no celular
  // (antigo savedProducts) migram na mesma hora.
  const fetchMinhaRotina = useCallback(async (): Promise<MinhaRotina> => {
    const uid = await getUserId();
    if (!uid) return { am: [], pm: [] };
    let r = await listarMinhaRotina(uid);
    if ((!r.am.length && !r.pm.length) || (await temProdutosNoCelular())) {
      if ((await garantirMinhaRotina(uid)) === 'ok') r = await listarMinhaRotina(uid);
    }
    return r;
  }, []);
  const { data: minha, refresh: refreshMinha } = useCachedQuery(
    userId ? `minharotina:${userId}` : null,
    fetchMinhaRotina,
    { enabled: Boolean(userId), staleMs: 0 },
  );
  // A ideal acabou de ser salva (geração sob demanda / cadastro): tenta criar a Minha
  // rotina de novo, sem esperar o próximo foco.
  const temIdeal = Boolean((saved?.rotina_am as unknown[])?.length || (saved?.rotina_pm as unknown[])?.length);
  const temMinha = Boolean(minha?.am.length || minha?.pm.length);
  useEffect(() => {
    if (temIdeal && minha && !temMinha) void refreshMinha();
  }, [temIdeal, temMinha, minha, refreshMinha]);

  // ── Rotina ideal visível (Fase 4): card "Faltam N passos" + folha da ideal ──
  // Revalidada a cada foco: um scan de pele novo pode ter trocado a ideal.
  const fetchIdeal = useCallback(async (): Promise<RotinaIdeal | null> => {
    const uid = await getUserId();
    return uid ? carregarRotinaIdeal(uid) : null;
  }, []);
  const { data: ideal, refresh: refreshIdeal } = useCachedQuery(
    userId ? `rotinaideal:${userId}` : null,
    fetchIdeal,
    { enabled: Boolean(userId), staleMs: 0 },
  );
  const [idealAberta, setIdealAberta] = useState(false);
  const [idealMudanca, setIdealMudanca] = useState(false);
  const abrirIdeal = (mudanca: boolean) => {
    setIdealMudanca(mudanca);
    setIdealAberta(true);
    // Abriu a ideal: o aviso "mudou" some.
    if (ideal?.mudou) void getUserId().then((uid) => { if (uid) void marcarIdealVista(uid); });
  };
  // O card fica encostado na borda direita. No toque, ele sai do canto: desliza para a
  // esquerda, se expande até o meio da tela e, em seguida, abre a folha da ideal. Ao
  // fechar a folha, volta para o canto. Sair da aba também recolhe.
  // Lote "Montar minha rotina" de hoje (Fase 6) — o link provisório segue o estado dele.
  const fetchLoteHoje = useCallback(async () => {
    const uid = await getUserId();
    return uid ? loteDeHoje(uid) : null;
  }, []);
  const { data: loteHoje } = useCachedQuery(
    userId ? `lotehoje:${userId}` : null,
    fetchLoteHoje,
    { enabled: Boolean(userId), staleMs: 0 },
  );
  // Intro de 3 telas (Fase 7): uma vez por conta (`users.rotina_intro_status` null).
  const fetchIntro = useCallback(async () => {
    const uid = await getUserId();
    if (!uid) return null;
    const { data, error } = await supabase.from('users').select('rotina_intro_status').eq('id', uid).maybeSingle();
    if (error) throw error;
    return { status: (data?.rotina_intro_status ?? null) as EscolhaIntro | null };
  }, []);
  const { data: introDb } = useCachedQuery(
    userId ? `rotinaintro:${userId}` : null,
    fetchIntro,
    { enabled: Boolean(userId), staleMs: 0 },
  );
  const [introEscolhida, setIntroEscolhida] = useState<EscolhaIntro | null>(null);
  const introStatus = introEscolhida ?? introDb?.status ?? null;
  const escolherIntro = async (e: EscolhaIntro) => {
    setIntroEscolhida(e);
    const uid = await getUserId();
    if (uid) {
      const { error } = await supabase.from('users').update({ rotina_intro_status: e }).eq('id', uid);
      if (error) console.warn('[rotina] gravar intro falhou:', error.message);
      invalidateCache(`rotinaintro:${uid}`);
    }
    if (e === 'escanear') {
      if (loteHoje) Alert.alert('Você já montou uma rotina hoje', 'Dá para montar uma por dia. Tente de novo amanhã.');
      else { useLote.getState().limpar(); router.push('/(scan)/lote-camera' as any); }
    }
  };

  const tocarLoteLink = () => {
    haptics.select();
    if (loteHoje?.status === 'processando') {
      router.push({ pathname: '/(scan)/lote-montando', params: { id: loteHoje.id } } as any);
    } else if (loteHoje?.status === 'pronto' && !loteHoje.visto_em) {
      router.push({ pathname: '/(scan)/lote-resultado', params: { id: loteHoje.id } } as any);
    } else if (loteHoje) {
      Alert.alert('Você já montou uma rotina hoje', 'Dá para montar uma por dia. Tente de novo amanhã.');
    } else {
      useLote.getState().limpar();
      router.push('/(scan)/lote-camera' as any);
    }
  };

  // Fluidez: o card tem SEMPRE a largura de expandido (margens 18) e, recolhido, fica
  // deslocado para a direita (translateX) com um pedaço além da borda da tela. Só o
  // transform anima → roda no driver nativo, sem recalcular layout a cada quadro, e o
  // texto não muda de quebra no meio do movimento (largura do texto fixa = a do
  // recolhido). A folha começa a subir enquanto o card ainda desliza (um movimento só).
  const { width: winW } = useWindowDimensions();
  const idealAnim = useRef(new Animated.Value(0)).current;
  const idealAnimando = useRef(false);
  useFocusEffect(useCallback(() => () => { idealAnim.setValue(0); idealAnimando.current = false; }, [idealAnim]));
  const tocarCardIdeal = (mudanca: boolean) => {
    if (idealAnimando.current) return;
    idealAnimando.current = true;
    haptics.tap(); // (abrirIdeal não repete o haptic)
    Animated.spring(idealAnim, { toValue: 1, damping: 20, stiffness: 190, mass: 1, useNativeDriver: true })
      .start(() => { idealAnimando.current = false; });
    setTimeout(() => abrirIdeal(mudanca), 110);
  };
  const fecharIdeal = () => {
    setIdealAberta(false);
    void refreshIdeal();
    // Volta para o canto enquanto a folha desce, com a mesma mola.
    Animated.sequence([
      Animated.delay(90),
      Animated.spring(idealAnim, { toValue: 0, damping: 22, stiffness: 160, mass: 1, useNativeDriver: true }),
    ]).start();
  };

  // Progresso do dia (por CÓDIGO do passo) + sequência.
  const [doneSteps, setDoneSteps] = useState<{ am: StepKey[]; pm: StepKey[] }>({ am: [], pm: [] });
  const [hist, setHist] = useState<RoutineHistory>({});
  const [now, setNow] = useState(() => new Date());
  const reloadLocal = useCallback(() => {
    Promise.all([getCompletedSteps('am'), getCompletedSteps('pm')]).then(([a, p]) => setDoneSteps({ am: a, pm: p }));
    getRoutineHistory().then(setHist);
    setNow(new Date());
  }, []);
  useFocusEffect(useCallback(() => {
    reloadLocal();
    // Voltou para a Rotina: um "Escanear produto" pedido pela folha e não concluído não
    // pode ficar pendurado — o próximo scan avulso cairia num passo.
    useAppStore.getState().setRotinaPassoAlvo(null);
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
  // Folha "Escolher produto" (passo aberto nela; null = fechada).
  const [escolherPasso, setEscolherPasso] = useState<PassoRotina | null>(null);
  // Modo "Editar rotina" (Fase 3) + folha "Novo/Editar passo" + rolagem travada no arraste.
  const [editando, setEditando] = useState(false);
  const [passoModo, setPassoModo] = useState<PassoSheetModo | null>(null);
  const [scrollOn, setScrollOn] = useState(true);
  // Passo NOVO criado sem nome para escolher o produto: se ela fechar a folha sem
  // escolher, o passo (sem nome e sem produto) é desfeito — o passo precisa de um dos dois.
  const passoNovoSemNome = useRef<string | null>(null);
  useFocusEffect(useCallback(() => () => { setEditando(false); setScrollOn(true); }, []));
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

  // Passos exibidos: os da MINHA ROTINA; enquanto ela não existe, os da ideal (com
  // código sintético e sem produto — é só o vão até a cópia ser criada).
  const minhaList = minha ? (am ? minha.am : minha.pm) : [];
  const usandoMinha = minhaList.length > 0;
  const rawList: RawStep[] = usandoMinha
    ? minhaList.map((p) => ({ name: p.nome ?? '', ingredient: p.ingrediente ?? '', instruction: p.instrucao ?? '', steps: p.comoUsar ?? undefined }))
    : (am ? amRaw : pmRaw);
  const stepKey = (i: number): StepKey => (usandoMinha ? minhaList[i].id : `ideal:${period}:${i}`);
  const done = doneSteps[period];
  // Dia da semana da SESSÃO (até 04:00 ainda é ontem): passo que não vale hoje sai do
  // checklist/guia/contagem e aparece apagado na lista (decisão 4).
  const hojeDia = diaDaSemana(sessionDate(now));
  const finAt = hist[dateKey(sessionDate(now))]?.[period];
  const finToday = !!finAt;
  // "Feita às 7:18" (design 41f) — horário real em que a cerimônia gravou a rotina.
  const finLabel = finAt ? `Feita às ${new Date(finAt).getHours()}:${String(new Date(finAt).getMinutes()).padStart(2, '0')}` : '';
  const streak = routineStreak(hist, now);

  const stepsAll = rawList.map((raw, i) => {
    const name = (raw?.name ?? '').trim();
    const ingredient = (raw?.ingredient ?? '').trim();
    // Produto do passo vem da Minha rotina (servidor), já com o recorte sem fundo.
    const prod = usandoMinha ? minhaList[i].produto : null;
    const chosen = prod && (prod.recorteUrl || prod.imagemUrl) ? prod : null;
    return {
      i, key: stepKey(i), name, ingredient, instruction: howOf(raw),
      chosen, hasProd: !!chosen,
      img: chosen ? (chosen.recorteUrl ?? chosen.imagemUrl ?? '') : '', cut: !!chosen?.recorteUrl, // recorte sem fundo quando pronto
      tint: chosen ? PRODUCT_BG : NO_PRODUCT_BG,
      pline: chosen ? [chosen.marca, chosen.nome].filter(Boolean).join(' · ') : 'Escolher produto',
      // Ícone da categoria (sem produto) e o nome para mostrar onde cabe um só (nome
      // do passo; sem ele, o do produto) — o nome do passo é opcional (Fase 3).
      tipo: tipoDoPasso(name, ingredient),
      titulo: name || (chosen ? [chosen.marca, chosen.nome].filter(Boolean).join(' · ') : 'Passo'),
      // Aviso do produto pra pele dela (Fase 2): texto pequeno embaixo do produto.
      // (`?.`: o cache da tela pode trazer um passo salvo antes do campo existir.)
      aviso: usandoMinha && chosen && minhaList[i].aviso && minhaList[i].aviso.nivel !== 'nenhum' ? minhaList[i].aviso : null,
      // Passo não diário: dias na ordem da semana (null = todo dia → sem selo).
      dias: usandoMinha ? diasDoPasso(minhaList[i].dias) : null,
      hoje: usandoMinha ? passoValeNoDia(minhaList[i], hojeDia) : true,
    };
  });
  // Card da ideal (Fase 4): passos da ideal deste período que nenhum passo dela cobre.
  const idealDoPeriodo = ideal ? ideal[period] : [];
  const cardIdeal = ideal && idealDoPeriodo.length
    ? (() => {
      const cob = calcularCobertura(idealDoPeriodo, minhaList);
      return { mudou: ideal.mudou, faltam: idealDoPeriodo.filter((p) => !cob.has(p.indice)).map((p) => p.nome) };
    })()
    : null;

  // Os passos DE HOJE — checklist, guia, contagem e "concluir" usam só estes.
  const steps = stepsAll.filter((st) => st.hoje);
  const n = steps.length;
  const k = steps.filter((st) => done.includes(st.key)).length;
  const ft = steps.find((st) => !done.includes(st.key))?.i ?? -1; // índice na lista inteira

  // Toque em "Próximo passo": haptic + som + grava o passo (e a rotina no último).
  const completeStep = (key: StepKey) => {
    haptics.action();
    try { player.seekTo(0); player.play(); } catch {}
    markStepCompleted(period, key);
    setDoneSteps((d) => ({ ...d, [period]: d[period].includes(key) ? d[period] : [...d[period], key] }));
  };
  // Rotina concluída (pelo checklist ou pelo guia): todos os passos ficam feitos, a
  // rotina entra no histórico (sequência/semana) e — só na MANHÃ — vem a foto do dia.
  const finishRoutine = () => {
    haptics.success();
    try { player.seekTo(0); player.play(); } catch {}
    const keys = steps.map((st) => st.key);
    keys.forEach((key) => markStepCompleted(period, key));
    setDoneSteps((d) => ({ ...d, [period]: [...new Set([...d[period], ...keys])] }));
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
    if (steps[run]) completeStep(steps[run].key);
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
        const len = (minha?.[p]?.length || (p === 'am' ? amRaw : pmRaw).length);
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

  // "Escolher/Trocar produto": abre a folha para o passo `i` da Minha rotina. Com o
  // checklist/guia aberto, guarda o progresso e fecha antes (dois Modais ao mesmo tempo
  // falham no iOS) — como antes, quando o toque levava à tela de Produtos.
  const abrirEscolher = (i: number) => {
    haptics.tap();
    if (!usandoMinha || !minhaList[i]) return; // vão antes da cópia existir: nada a escolher
    const passo = minhaList[i];
    const tinhaFluxo = flow != null;
    parkFlow();
    closeFlow('escolher produto');
    setTimeout(() => setEscolherPasso(passo), tinhaFluxo ? 350 : 0);
  };

  // ── Modo "Editar rotina" (Fase 3) ────────────────────────────────────────────
  const itensEdicao: ItemEditavel[] = minhaList.map((p) => ({
    id: p.id,
    nome: nomeDoPasso(p),
    sub: [
      p.produto ? [p.produto.marca, p.produto.nome].filter(Boolean).join(' · ') : 'Sem produto',
      p.dias?.length ? p.dias.join(' · ') : null,
    ].filter(Boolean).join('  ·  '),
    img: p.produto ? (p.produto.recorteUrl ?? p.produto.imagemUrl) : null,
  }));
  const reordenar = async (ids: string[]) => {
    try {
      await reordenarPassos(ids);
    } catch (e) {
      console.warn('[rotina] reordenar falhou:', e);
      haptics.error();
      Alert.alert('Não deu pra salvar a nova ordem', 'Tente de novo em instantes.');
    } finally {
      void refreshMinha();
    }
  };
  const confirmarRemover = (id: string) => {
    haptics.warning();
    Alert.alert('Remover esse passo da sua rotina?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          try {
            await removerPasso(id);
            haptics.success();
          } catch (e) {
            console.warn('[rotina] remover falhou:', e);
            haptics.error();
            Alert.alert('Não deu pra remover o passo', 'Tente de novo em instantes.');
          } finally {
            void refreshMinha();
          }
        },
      },
    ]);
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
  // "N dias seguidos" conta DIAS (routineDayStreak), não os pontos do streak.
  const doneStreak = routineDayStreak(histNow, now);
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

      <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={scrollOn} contentContainerStyle={{ paddingBottom: 112 }}>
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
            {/* "Fazer isso depois" na intro (Fase 7): caminho VISÍVEL para escanear
                depois, no topo dos passos, enquanto ela não montar a rotina. */}
            {introStatus === 'depois' && !loteHoje && usandoMinha && !editando && (
              <TouchableOpacity activeOpacity={0.85} onPress={tocarLoteLink} style={styles.cardEscanear}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF0F6', alignItems: 'center', justifyContent: 'center' }}>
                  <StepIcon tipo={null} size={22} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: INK }}>Monte sua rotina com o que você tem</Text>
                  <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 19, color: SOFT }}>Me mostra seus produtos e eu monto uma rotina eficaz com eles.</Text>
                  <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '600', color: PINK_TEXT }}>Escanear meus produtos ›</Text>
                </View>
              </TouchableOpacity>
            )}
            <View style={styles.listHead}>
              <Text style={styles.sectionTitle}>{am ? 'Seus passos · Manhã' : 'Seus passos · Noite'}</Text>
              {editando ? (
                <TouchableOpacity onPress={() => { haptics.select(); setEditando(false); }} hitSlop={10} accessibilityLabel="Concluir edição da rotina">
                  <Text style={styles.okTxt}>OK</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: 15, color: MUTED }}>{`${finToday ? n : k}/${n}`}</Text>
              )}
            </View>
            <View style={{ marginTop: 12, paddingLeft: 14, paddingRight: 18 }}>
              {editando ? (
                <>
                  <ListaEditavel
                    itens={itensEdicao}
                    onReordenar={(ids) => { void reordenar(ids); }}
                    onArrastando={(ativo) => setScrollOn(!ativo)}
                    onRemover={confirmarRemover}
                    onAbrir={(id) => { const p = minhaList.find((x) => x.id === id); if (p) { haptics.tap(); setPassoModo({ tipo: 'editar', passo: p }); } }}
                  />
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => { haptics.tap(); setPassoModo({ tipo: 'novo', periodo: period }); }}
                    style={styles.novoPasso}
                    accessibilityLabel="Novo passo"
                  >
                    <PlusIcon size={16} />
                    <Text style={{ fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: PINK_TEXT }}>Novo passo</Text>
                  </TouchableOpacity>
                </>
              ) : stepsAll.map((s) => {
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
                      <DottedLine color={done.includes(s.key) ? PINK : 'rgba(192,32,106,0.28)'} hidden={s.i === stepsAll.length - 1} />
                    </View>
                    <View style={[styles.stepCard, open ? styles.stepCardOpen : styles.stepCardClosed, !s.hoje && { opacity: 0.5 }]}>
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
                            onPress={() => abrirEscolher(s.i)}
                            accessibilityLabel={`Escolher produto para ${s.titulo}`}
                            style={[styles.tile, { backgroundColor: s.tint }, finToday && { opacity: 0.55 }]}
                          >
                            <StepIcon tipo={s.tipo} size={24} />
                          </TouchableOpacity>
                        )}
                        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                          {/* Card mais limpo (pedido do usuário): sem a categoria. O nome do passo
                              vira o texto pequeno de cima e o produto sobe para o centro — ou
                              "Escolher produto" em rosa, se ainda não houver produto. */}
                          {/* Nome do passo + produto: nome pequeno em cima, produto grande.
                              Só produto: só ele, grande. Só nome: nome grande + "Escolher
                              produto". Nenhum dos dois: "Escolher produto" grande. */}
                          {s.hasProd && !!s.name && (
                            <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED }} numberOfLines={1}>{s.name}</Text>
                          )}
                          {/* O "Escolher produto" rosa é um botão próprio: abre direto a folha,
                              sem expandir o card. O resto do card continua abrindo/fechando. */}
                          {!s.hasProd && !s.name ? (
                            <TouchableOpacity
                              activeOpacity={0.6}
                              onPress={() => abrirEscolher(s.i)}
                              hitSlop={{ top: 8, bottom: 8 }}
                              accessibilityLabel={`Escolher produto para ${s.titulo}`}
                              style={{ alignSelf: 'flex-start' }}
                            >
                              <Text style={[styles.stepName, { color: PINK_TEXT }]} numberOfLines={2}>Escolher produto</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text
                              style={[styles.stepName, finToday && styles.stepNameDone]}
                              numberOfLines={2}
                              lineBreakStrategyIOS="push-out"
                            >
                              {s.hasProd ? s.pline : s.name}
                            </Text>
                          )}
                          {!s.hasProd && !!s.name && (
                            <TouchableOpacity
                              activeOpacity={0.6}
                              onPress={() => abrirEscolher(s.i)}
                              hitSlop={{ top: 8, bottom: 8 }}
                              accessibilityLabel={`Escolher produto para ${s.titulo}`}
                              style={{ alignSelf: 'flex-start' }}
                            >
                              <Text style={{ fontSize: 15, fontWeight: '500', letterSpacing: -0.3, color: PINK_TEXT }}>Escolher produto</Text>
                            </TouchableOpacity>
                          )}
                          {/* Frequência do passo não diário: selo rosa com calendário. */}
                          {!!s.dias && (
                            <View style={styles.seloDias}>
                              <Svg width={12} height={12} viewBox="0 0 24 24">
                                <Path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke={PINK_DEEP} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                              </Svg>
                              <Text style={styles.seloDiasTxt}>{seloFrequencia(s.dias, s.hoje)}</Text>
                            </View>
                          )}
                          {!!s.aviso && (
                            <Text style={[styles.stepAviso, s.aviso.nivel === 'forte' && { color: '#B42318' }]} numberOfLines={2}>
                              {s.aviso.texto}
                            </Text>
                          )}
                        </View>
                        <Chevron open={open} />
                      </TouchableOpacity>
                      {open && (
                        <View style={styles.stepBody}>
                          {!!s.dias && <Text style={[styles.stepInstruction, { fontWeight: '700', color: INK }]}>{fraseFrequencia(s.dias)}</Text>}
                          <Text style={[styles.stepInstruction, !!s.dias && { paddingTop: 0, marginTop: -6 }]} lineBreakStrategyIOS="push-out">{s.instruction}</Text>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => abrirEscolher(s.i)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
                          >
                            <Text style={{ fontSize: 15, fontWeight: '500', letterSpacing: -0.3, color: PINK_TEXT }}>
                              {s.hasProd ? 'Trocar produto' : 'Escolher produto'}
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
              {/* "Editar rotina" (Fase 3): liga o modo Editar — reordenar, remover, novo
                  passo, dias. (Antes abria o chat; a mudança pela NIKS volta na Fase 8.) */}
              {!editando && usandoMinha && <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => { haptics.select(); setOpenStep(-1); setEditando(true); }}
                style={{ marginTop: 10, marginLeft: -14, marginRight: -18, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: PINK_TEXT }}>Editar rotina</Text>
              </TouchableOpacity>}
              {/* Scan em lote "Montar minha rotina com meus produtos": entrada permanente
                  abaixo da lista (a intro da Fase 7 é a primeira; quem escolheu "Fazer
                  isso depois" vê o card no topo em vez deste link). */}
              {/* Segue o lote de hoje (Fase 6): montando → acompanhar; pronto e ainda não
                  visto → "Sua rotina está pronta"; depois → o teto de 1 por dia. */}
              {!editando && usandoMinha && !(introStatus === 'depois' && !loteHoje) && <TouchableOpacity
                activeOpacity={0.6}
                onPress={tocarLoteLink}
                style={{ marginLeft: -14, marginRight: -18, height: 40, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: PINK_TEXT }}>
                  {loteHoje?.status === 'processando'
                    ? 'Montando sua rotina…'
                    : loteHoje?.status === 'pronto' && !loteHoje.visto_em
                      ? 'Ver a rotina montada com seus produtos'
                      : 'Escanear meus produtos'}
                </Text>
              </TouchableOpacity>}
              {/* Card da rotina ideal (Fase 4): o que falta da ideal neste período, ou
                  "cobre tudo", ou o aviso de que a ideal mudou com o scan novo. */}
              {!editando && usandoMinha && !!cardIdeal && (
                <Animated.View style={[styles.idealCard, {
                  transform: [{ translateX: idealAnim.interpolate({ inputRange: [0, 1], outputRange: [IDEAL_RECOLHIDO_X, 0] }) }],
                }]}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => tocarCardIdeal(cardIdeal.mudou)}
                  style={{ padding: 16 }}
                >
                <View style={{ width: winW - 18 - IDEAL_RECOLHIDO_X - 32 }}>
                  {cardIdeal.mudou ? (
                    <Text style={styles.idealTitulo}>Sua rotina ideal mudou com o novo scan</Text>
                  ) : cardIdeal.faltam.length ? (
                    <Text style={styles.idealTitulo}>
                      {cardIdeal.faltam.length === 1 ? 'Falta 1 passo pra sua pele: ' : `Faltam ${cardIdeal.faltam.length} passos pra sua pele: `}
                      <Text style={styles.idealNomes}>{juntarNomes(cardIdeal.faltam)}</Text>
                    </Text>
                  ) : (
                    <Text style={styles.idealTitulo}>{'Sua rotina cobre tudo o que sua pele precisa\u00A0✓'}</Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                    <Text style={styles.idealLink}>{cardIdeal.mudou ? 'Ver o que mudou' : 'Ver rotina ideal'}</Text>
                    <Svg width={14} height={14} viewBox="0 0 24 24">
                      <Path d="M9 6l6 6-6 6" fill="none" stroke={PINK_TEXT} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>
                </View>
                </TouchableOpacity>
                </Animated.View>
              )}
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
                          <StepIcon tipo={s.tipo} size={24} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED }}>{s.tipo ? `Passo ${s.i + 1} · ${ROTULO_TIPO[s.tipo]}` : `Passo ${s.i + 1}`}</Text>
                        <Text style={styles.ckName} numberOfLines={1}>{s.titulo}</Text>
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
                {steps.map((_, i) => (
                  <View key={i} style={{ width: 30, height: 4, borderRadius: 2, backgroundColor: i <= run ? PINK : 'rgba(255,255,255,0.85)' }} />
                ))}
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 16 }} showsVerticalScrollIndicator={false}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => abrirEscolher(rs.i)} style={styles.runCircle}>
                  {rs.hasProd ? (
                    <ExpoImage source={{ uri: rs.img }} style={{ width: 120, height: 124 }} contentFit="contain" />
                  ) : (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <StepIcon tipo={rs.tipo} size={36} />
                      <Text style={{ color: PINK_TEXT, fontSize: 15, fontWeight: '500' }}>Escolher produto</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {!!rs.tipo && <Text style={{ marginTop: 24, fontSize: 15, fontWeight: '500', letterSpacing: -0.2, color: SOFT }}>{ROTULO_TIPO[rs.tipo]}</Text>}
                <Text style={[styles.runName, !rs.tipo && { marginTop: 24 }]}>{rs.titulo}</Text>
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

      {/* Folha "Novo passo" / "Editar passo" (Fase 3). */}
      <PassoSheet
        modo={passoModo}
        onClose={() => setPassoModo(null)}
        onSalvo={() => { void refreshMinha(); }}
        onEscolherProduto={(p) => {
          passoNovoSemNome.current = !p.nome && !p.produto ? p.id : null;
          setEscolherPasso(p);
        }}
      />

      {/* Folha "Escolher produto" (Fase 2). Ao escolher, recarrega a Minha rotina. */}
      <IntroRotina
        visivel={introDb !== undefined && introDb !== null && introStatus === null && usandoMinha && !!ideal && (ideal.am.length + ideal.pm.length) > 0}
        ideal={ideal ?? null}
        onEscolha={escolherIntro}
      />
      <RotinaIdealSheet
        aberta={idealAberta}
        periodoInicial={period}
        ideal={ideal ?? null}
        minha={minha ?? null}
        mostrarMudanca={idealMudanca}
        onClose={fecharIdeal}
        onAdicionado={() => refreshMinha()}
      />
      <EscolherProdutoSheet
        passo={escolherPasso}
        onClose={() => {
          setEscolherPasso(null);
          const semNome = passoNovoSemNome.current;
          passoNovoSemNome.current = null;
          // Foi escanear ou abriu "Ver todos" para este passo → o produto ainda vem; não desfaz.
          const st = useAppStore.getState();
          const seguiu = st.rotinaPassoAlvo?.passoId === semNome || st.escolhaParaPasso?.passoId === semNome;
          if (semNome && !seguiu) void removerPasso(semNome).catch(() => {}).finally(() => { void refreshMinha(); });
        }}
        onEscolhido={() => { passoNovoSemNome.current = null; void refreshMinha(); }}
      />
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
  // Card "Monte sua rotina com o que você tem" (Fase 7, quem escolheu "Fazer isso depois").
  cardEscanear: {
    marginHorizontal: 18, marginTop: 22, flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16,
    backgroundColor: '#FFFFFF', shadowColor: '#783C48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6,
  },
  // Card da rotina ideal (Fase 4), abaixo dos passos.
  idealCard: {
    // Geometria do EXPANDIDO (margens 18 dos dois lados: marginLeft 4 + paddingLeft 14
    // da lista). Recolhido = o mesmo card deslocado IDEAL_RECOLHIDO_X para a direita,
    // com a ponta direita (e os cantos dela) além da borda da tela.
    marginTop: 14, marginLeft: 4, borderRadius: 13, backgroundColor: '#FFFFFF',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 1,
  },
  idealTitulo: { fontSize: 16, fontWeight: '600', lineHeight: 21, letterSpacing: -0.3, color: INK },
  idealNomes: { fontWeight: '400', color: SOFT },
  idealLink: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: PINK_TEXT },
  stepCardOpen: { shadowColor: '#783C48', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 9 },
  stepCardClosed: { shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 1 },
  tile: { width: 52, height: 52, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepName: { fontSize: 17, fontWeight: '600', lineHeight: 21, letterSpacing: -0.4, color: INK },
  // Dias da semana do passo (Fase 3) — "Ter · Qui · Sáb" / "Hoje não · …".
  // Selo da frequência (passo não diário): "3x por semana · Seg, Qua, Sex".
  seloDias: {
    // Quebra em 2 linhas quando não cabe (nunca corta os dias).
    marginTop: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#FFE8F2', maxWidth: '100%',
  },
  seloDiasTxt: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: -0.1, color: PINK_DEEP },
  okTxt: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: PINK_TEXT },
  novoPasso: {
    marginTop: 14, height: 56, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(232,70,143,0.45)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.5)',
  },
  // Aviso do produto pra pele dela (Fase 2): leve em rosa escuro, forte em vermelho.
  stepAviso: { marginTop: 3, fontSize: 13, fontWeight: '500', lineHeight: 17, letterSpacing: -0.1, color: PINK_DEEP },
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
