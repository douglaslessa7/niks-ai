import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Animated, Pressable, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore, ProtocolResult } from '../../store/onboarding';
import { BASE_PROTOCOLS } from '../../constants/protocols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { Colors } from '../../constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFonts } from 'expo-font';
// react-native-svg — ícones inline fiéis ao design (sol, lua, chevron, fechar, seta)
import Svg, {
  Line as SvgLine,
  Circle as SvgCircle,
  Path as SvgPath,
} from 'react-native-svg';
// Skia — radial gradient fiel ao orb + nebulosas do NightSky
import {
  Canvas, Circle,
  RadialGradient, vec, BlurMask,
} from '@shopify/react-native-skia';
import NightSky from '../../components/ui/NightSky';

interface Step {
  id: number;
  name: string;
  ingredient: string;
  instruction: string;
  steps?: string[];
  color: string;
  waitTime?: string | null;
  product_suggestions?: string[];
}

interface Protocol {
  morning: Step[];
  night: Step[];
  introduction_warnings: string | null;
  introduction_schedule?: string | null;
  expected_timeline: {
    two_weeks: string;
    one_month: string;
    three_months: string;
  };
}

export default function Protocolo() {
  const { scanResult, onboarding, protocolResult: cachedProtocol, setProtocolResult } = useAppStore();
  const [period, setPeriod] = useState<'morning' | 'night'>('morning');
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [morningSteps, setMorningSteps] = useState<Step[]>([]);
  const [nightSteps, setNightSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  const [showStepDetail, setShowStepDetail] = useState(false);

  const [isScheduleExpanded, setIsScheduleExpanded] = useState(false);

  // Progress & gamification state
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const [streakDays, setStreakDays] = useState<number>(0);
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null);
  const [celebrationTriggered, setCelebrationTriggered] = useState(false);
  const [bothCompleted, setBothCompleted] = useState(false);

  // Refs para evitar closure stale nas callbacks de animação
  const checkedItemsRef = useRef<Set<number>>(new Set());
  const celebrationTriggeredRef = useRef(false);
  const stepsRef = useRef<Step[]>([]);
  const morningStepsRef = useRef<Step[]>([]);
  const nightStepsRef = useRef<Step[]>([]);
  const streakDaysRef = useRef<number>(0);
  const lastCompletedAtRef = useRef<string | null>(null);

  // Animated values globais
  const progressAnim = useRef(new Animated.Value(0)).current;
  const celebrationAnim = useRef(new Animated.Value(0)).current;

  const player = useAudioPlayer(require('../../assets/sounds/check.mp3'));

  // ── Fontes serif fiéis ao design ──────────────────────────────────
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Regular': require('../../assets/fonts/PlayfairDisplay-Regular.ttf'),
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
    'DMSerifDisplay-Regular': require('../../assets/fonts/DMSerifDisplay-Regular.ttf'),
    'DMSerifDisplay-Italic': require('../../assets/fonts/DMSerifDisplay-Italic.ttf'),
  });
  const displayFont = fontsLoaded ? 'PlayfairDisplay-Italic' : undefined;
  const displayFontReg = fontsLoaded ? 'PlayfairDisplay-Regular' : undefined;
  const insets = useSafeAreaInsets();

  // ── Novos states — Quietude v3 ─────────────────────────────────────
  const [skinScore, setSkinScore] = useState<number | null>(null);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [ritualOpen, setRitualOpen] = useState(false);
  const [ritualStep, setRitualStep] = useState(0);
  const [ritualDone, setRitualDone] = useState(false);

  // ── Animated values orb breathing (Cerimônia) ─────────────────────
  const orbBreath1 = useRef(new Animated.Value(1)).current;
  const orbBreath2 = useRef(new Animated.Value(1)).current;
  // Bottom sheet slide-in
  const sheetSlide = useRef(new Animated.Value(500)).current;

  // Animated values por card (arrays mutáveis)
  const cardOpacityRef = useRef<Animated.Value[]>([]);
  const cardScaleYRef = useRef<Animated.Value[]>([]);
  const cardGreenRef = useRef<Animated.Value[]>([]);

  // Cerimônia celebration — staggered entrances
  const celebScreenOpacity = useRef(new Animated.Value(0)).current;
  const celebScreenScale = useRef(new Animated.Value(0.96)).current;
  const celebOrbScale = useRef(new Animated.Value(0.5)).current;
  const celebOrbOpacity = useRef(new Animated.Value(0)).current;
  const celebEyebrowAnim = useRef(new Animated.Value(0)).current;
  const celebTitleAnim = useRef(new Animated.Value(0)).current;
  const celebSubtextoAnim = useRef(new Animated.Value(0)).current;
  const celebFooterAnim = useRef(new Animated.Value(0)).current;

  const steps = period === 'morning' ? morningSteps : nightSteps;
  const isMorning = period === 'morning';
  const accentColor = isMorning ? Colors.scanBtn : Colors.tabActive;

  // ── Theme Quietude v3 ──────────────────────────────────────────────
  const isPM = period === 'night';
  const accent = Colors.scanBtn; // #FB7B6B coral — igual em ambos os modos
  const ink = isPM ? '#FFFFFF' : '#2B2724';
  const inkSoft = isPM ? 'rgba(255,255,255,0.65)' : 'rgba(43,39,36,0.55)';
  const inkHair = isPM ? 'rgba(255,255,255,0.14)' : 'rgba(43,39,36,0.10)';
  const inkWhisper = isPM ? 'rgba(255,255,255,0.42)' : 'rgba(43,39,36,0.35)';

  // ── Helpers ────────────────────────────────────────────────────────
  const toRoman = (n: number) =>
    ['I','II','III','IV','V','VI','VII','VIII','IX','X'][n - 1] ?? String(n);

  const totalLabel = (() => {
    const total = steps.reduce((acc, s) => {
      const m = (s.waitTime ?? '').match(/(\d+)\s*(min|seg)/i);
      if (!m) return acc;
      return acc + (m[2].toLowerCase() === 'min' ? parseInt(m[1]) * 60 : parseInt(m[1]));
    }, 0);
    if (total === 0) return '';
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return secs === 0 ? `${mins} min` : `${mins} min ${secs} seg`;
  })();

  const formattedDate = (() => {
    const d = new Date();
    d.setHours(d.getHours() - 3);
    const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    const days = ['dom','seg','ter','qua','qui','sex','sáb'];
    return `${d.getDate()} ${months[d.getMonth()]} · ${days[d.getDay()]}`;
  })();

  // Manter refs sincronizados
  useEffect(() => { checkedItemsRef.current = checkedItems; }, [checkedItems]);
  useEffect(() => { celebrationTriggeredRef.current = celebrationTriggered; }, [celebrationTriggered]);
  useEffect(() => { stepsRef.current = steps; }, [steps]);
  useEffect(() => { morningStepsRef.current = morningSteps; }, [morningSteps]);
  useEffect(() => { nightStepsRef.current = nightSteps; }, [nightSteps]);
  useEffect(() => { streakDaysRef.current = streakDays; }, [streakDays]);
  useEffect(() => { lastCompletedAtRef.current = lastCompletedAt; }, [lastCompletedAt]);

  // Rebuild animated values quando steps muda de tamanho ou período troca
  useEffect(() => {
    const count = steps.length;
    cardOpacityRef.current = Array.from({ length: count }, () => new Animated.Value(1));
    cardScaleYRef.current = Array.from({ length: count }, () => new Animated.Value(1));
    cardGreenRef.current = Array.from({ length: count }, () => new Animated.Value(0));
  }, [steps.length, period]);

  // Anéis respiratórios do orb na Cerimônia
  useEffect(() => {
    const breathe = (anim: Animated.Value, delay: number) => {
      Animated.loop(Animated.sequence([
        Animated.timing(anim, { toValue: 1.08, duration: 3000, useNativeDriver: true, delay }),
        Animated.timing(anim, { toValue: 1, duration: 3000, useNativeDriver: true, delay: 0 }),
      ])).start();
    };
    breathe(orbBreath1, 0);
    breathe(orbBreath2, 300);
  }, []);

  // Bottom sheet slide-in quando openStep muda
  useEffect(() => {
    if (openStep !== null) {
      sheetSlide.setValue(500);
      Animated.spring(sheetSlide, {
        toValue: 0,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }).start();
    }
  }, [openStep]);

  // Celebration screen — staggered entrances (fiel a cerimonia-celebration-*-in)
  useEffect(() => {
    if (!ritualDone) return;
    celebScreenOpacity.setValue(0);
    celebScreenScale.setValue(0.96);
    celebOrbScale.setValue(0.5);
    celebOrbOpacity.setValue(0);
    celebEyebrowAnim.setValue(0);
    celebTitleAnim.setValue(0);
    celebSubtextoAnim.setValue(0);
    celebFooterAnim.setValue(0);
    Animated.parallel([
      Animated.timing(celebScreenOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(celebScreenScale, { toValue: 1, tension: 80, friction: 12, useNativeDriver: true }),
      Animated.spring(celebOrbScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(celebOrbOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(celebEyebrowAnim, { toValue: 1, duration: 700, delay: 400, useNativeDriver: true }),
      Animated.timing(celebTitleAnim, { toValue: 1, duration: 700, delay: 550, useNativeDriver: true }),
      Animated.timing(celebSubtextoAnim, { toValue: 1, duration: 700, delay: 700, useNativeDriver: true }),
      Animated.timing(celebFooterAnim, { toValue: 1, duration: 700, delay: 850, useNativeDriver: true }),
    ]).start();
  }, [ritualDone]);

  // Carregar estado de conclusão do AsyncStorage ao trocar de aba ou quando steps carrega
  useEffect(() => {
    if (steps.length === 0) return;
    const loadChecked = async () => {
      const key = getTodayKey(period);
      const stored = await AsyncStorage.getItem(key);
      setBothCompleted(false);
      if (stored) {
        const parsed = JSON.parse(stored) as number[];
        const newSet = new Set(parsed);
        setCheckedItems(newSet);
        checkedItemsRef.current = newSet;
        // Se já estava tudo concluído: mostrar card de celebração sem animação
        if (newSet.size === steps.length && steps.length > 0) {
          setCelebrationTriggered(true);
          celebrationTriggeredRef.current = true;
          celebrationAnim.setValue(1);
          // Verificar se a outra rotina do dia também está concluída
          const todayDate = getProtocolDate();
          const otherPeriod = period === 'morning' ? 'night' : 'morning';
          const otherKey = `protocolo_check_${todayDate}_${otherPeriod}`;
          const otherData = await AsyncStorage.getItem(otherKey);
          const otherSteps = period === 'morning' ? nightStepsRef.current : morningStepsRef.current;
          if (otherData && otherSteps.length > 0 && JSON.parse(otherData).length === otherSteps.length) {
            setBothCompleted(true);
          }
        }
      } else {
        const emptySet = new Set<number>();
        setCheckedItems(emptySet);
        checkedItemsRef.current = emptySet;
        setCelebrationTriggered(false);
        celebrationTriggeredRef.current = false;
        celebrationAnim.setValue(0);
      }
    };
    loadChecked();
  }, [period, steps.length]);

  // Animar barra de progresso quando checkedItems muda
  useEffect(() => {
    const total = steps.length;
    const pct = total > 0 ? checkedItems.size / total : 0;
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [checkedItems.size, steps.length]);

  // Buscar dados do usuário (streak + skin_score)
  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data } = await supabase
          .from('users')
          .select('streak_days, last_protocol_completed_at')
          .eq('id', user.id)
          .single();
        if (data) {
          setStreakDays(data.streak_days ?? 0);
          setLastCompletedAt(data.last_protocol_completed_at ?? null);
        }
        // Fetch skin_score do último scan
        const { data: lastScan } = await supabase
          .from('skin_scans')
          .select('skin_score')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (lastScan?.skin_score != null) {
          setSkinScore(lastScan.skin_score);
        }
      }
    };
    fetchUserData();
  }, []);

  useEffect(() => {
    generateProtocol();
  }, []);

  const getProtocolDate = () => {
    const now = new Date();
    now.setHours(now.getHours() - 3);
    return now.toISOString().split('T')[0];
  };

  const getTodayKey = (tab: 'morning' | 'night') =>
    `protocolo_check_${getProtocolDate()}_${tab}`;

  const persistChecked = async (newSet: Set<number>) => {
    const key = getTodayKey(period);
    await AsyncStorage.setItem(key, JSON.stringify([...newSet]));
  };

  const updateStreak = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;

    const { data: userData } = await supabase
      .from('users')
      .select('streak_days, last_protocol_completed_at')
      .eq('id', user.id)
      .single();

    if (!userData) return;

    const todayStr = getProtocolDate();
    const lastStr = userData.last_protocol_completed_at
      ? (() => {
          const d = new Date(userData.last_protocol_completed_at);
          d.setHours(d.getHours() - 3);
          return d.toISOString().split('T')[0];
        })()
      : null;

    // Já foi contado hoje — não incrementar de novo
    if (lastStr === todayStr) return;

    // Calcula a data de ontem com offset de 3h
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 3 - 24);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const newStreak = lastStr === yesterdayStr
      ? (userData.streak_days ?? 0) + 1  // completou ontem — incrementa
      : 1;                                // pulou um dia — reinicia

    const nowIso = new Date().toISOString();
    await supabase.from('users').update({
      streak_days: newStreak,
      last_protocol_completed_at: nowIso,
    }).eq('id', user.id);

    setStreakDays(newStreak);
    streakDaysRef.current = newStreak;
    setLastCompletedAt(nowIso);
    lastCompletedAtRef.current = nowIso;
  };


  const generateProtocol = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Tentar carregar do cache do store (gerado na protocol-loading)
      if (cachedProtocol) {
        const withoutCompleted: Protocol = {
          ...cachedProtocol,
          morning: (cachedProtocol.morning as any[]).map((s) => ({ ...s })),
          night: (cachedProtocol.night as any[]).map((s) => ({ ...s })),
        };
        setProtocol(withoutCompleted);
        setMorningSteps(withoutCompleted.morning);
        setNightSteps(withoutCompleted.night);
        return;
      }

      // 2. Tentar buscar do Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: saved } = await supabase
          .from('protocolos')
          .select('rotina_am, rotina_pm, dicas')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (saved?.rotina_am && saved?.rotina_pm) {
          const fromDb: Protocol = {
            morning: saved.rotina_am,
            night: saved.rotina_pm,
            introduction_warnings: saved.dicas?.[0] ?? null,
            expected_timeline: {
              two_weeks: saved.dicas?.[1] ?? '',
              one_month: saved.dicas?.[2] ?? '',
              three_months: saved.dicas?.[3] ?? '',
            },
            introduction_schedule: saved.dicas?.[4] ?? null,
          };
          setProtocolResult(fromDb as ProtocolResult);
          setProtocol(fromDb);
          setMorningSteps(fromDb.morning);
          setNightSteps(fromDb.night);
          return;
        }
      }

      // 3. Fallback: regenerar via Edge Function
      if (!scanResult) {
        setError('Faça um scan de pele primeiro para gerar seu protocolo personalizado.');
        return;
      }

      const skinType = scanResult.skin_type_detected ?? 'normal';
      const baseProtocol = BASE_PROTOCOLS[skinType] ?? BASE_PROTOCOLS['normal'];

      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(
        'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/generate-protocol',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionData.session?.access_token
              ? { Authorization: `Bearer ${sessionData.session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ baseProtocol, scanResult, onboardingData: onboarding }),
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: ProtocolResult = await response.json();
      setProtocolResult(data);

      const protocol: Protocol = {
        ...data,
        morning: (data.morning as any[]).map((s) => ({ ...s })),
        night: (data.night as any[]).map((s) => ({ ...s })),
      };

      setProtocol(protocol);
      setMorningSteps(protocol.morning);
      setNightSteps(protocol.night);
    } catch (err) {
      console.error('Erro ao gerar protocolo:', err);
      setError('Não foi possível gerar seu protocolo. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const toggleStepCompletion = (index: number) => {
    const isChecked = checkedItemsRef.current.has(index);

    if (!isChecked) {
      // MARCAR
      // 1. Haptic + som imediatos
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      player.seekTo(0);
      player.play();

      const greenAnim = cardGreenRef.current[index];
      const opacityAnim = cardOpacityRef.current[index];
      const scaleAnim = cardScaleYRef.current[index];
      if (!greenAnim || !opacityAnim || !scaleAnim) return;

      // 2. Card vira verde em 200ms (número → check)
      Animated.timing(greenAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start(() => {
        // 3. Aguarda 1s para o usuário ver a conclusão
        setTimeout(() => {
          // 4. Anima saída: opacity + scaleY em 350ms
          Animated.parallel([
            Animated.timing(opacityAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
          ]).start(async () => {
            // 5. Atualiza state + persiste + verifica celebração
            const current = checkedItemsRef.current;
            const newSet = new Set(current);
            newSet.add(index);
            setCheckedItems(newSet);
            checkedItemsRef.current = newSet;
            await persistChecked(newSet);

            const currentSteps = stepsRef.current;
            if (
              newSet.size === currentSteps.length &&
              currentSteps.length > 0 &&
              !celebrationTriggeredRef.current
            ) {
              setCelebrationTriggered(true);
              celebrationTriggeredRef.current = true;
              celebrationAnim.setValue(0);
              Animated.spring(celebrationAnim, {
                toValue: 1,
                tension: 80,
                friction: 8,
                useNativeDriver: true,
              }).start();

              // Verificar se ambas as rotinas do dia estão concluídas
              const todayDate = getProtocolDate();
              const morningKey = `protocolo_check_${todayDate}_morning`;
              const nightKey = `protocolo_check_${todayDate}_night`;
              const morningData = await AsyncStorage.getItem(morningKey);
              const nightData = await AsyncStorage.getItem(nightKey);
              const morningCompleted = morningData
                ? JSON.parse(morningData).length === morningStepsRef.current.length
                : false;
              const nightCompleted = nightData
                ? JSON.parse(nightData).length === nightStepsRef.current.length
                : false;
              if (morningCompleted && nightCompleted) {
                setBothCompleted(true);
                await updateStreak();
              }
            }
          });
        }, 500);
      });
    } else {
      // DESMARCAR
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Reset animações do card
      if (cardOpacityRef.current[index]) cardOpacityRef.current[index].setValue(1);
      if (cardScaleYRef.current[index]) cardScaleYRef.current[index].setValue(1);
      if (cardGreenRef.current[index]) cardGreenRef.current[index].setValue(0);

      const current = checkedItemsRef.current;
      const newSet = new Set(current);
      newSet.delete(index);
      setCheckedItems(newSet);
      checkedItemsRef.current = newSet;
      persistChecked(newSet);

      if (newSet.size < stepsRef.current.length) {
        setCelebrationTriggered(false);
        celebrationTriggeredRef.current = false;
        celebrationAnim.setValue(0);
      }
    }
  };

  const stepsCountWord = (() => {
    const words = ['um','dois','três','quatro','cinco','seis','sete','oito','nove','dez'];
    return words[steps.length - 1] ?? String(steps.length);
  })();
  const periodWord = isPM ? 'Noite,' : 'Manhã,';

  // ── Computed vars para o return ───────────────────────────────────
  const currentOpenStep = openStep !== null ? steps[openStep] : null;

  const dayGradients: [string, string, string][] = [
    ['#FDE8E1', '#FBD5CA', '#F5B8A8'],
    ['#FEF0E6', '#FADBC7', '#EBB497'],
    ['#FCEAE5', '#F8C9B9', '#E89F8B'],
    ['#FFEDE8', '#FFD4C5', '#FB9F89'],
    ['#FFE5DD', '#FBBFAE', '#E88770'],
  ];
  const rtBg: [string, string, string] = isPM
    ? ['#0F1420', '#1A1F2E', '#2A1F28']
    : dayGradients[ritualStep % dayGradients.length];
  const rtInk = isPM ? '#FFFFFF' : '#1D3A44';
  const rtInkSoft = isPM ? 'rgba(255,255,255,0.65)' : '#486269';
  const rtInkHair = isPM ? 'rgba(255,255,255,0.18)' : 'rgba(29,58,68,0.2)';
  const chipBg = isPM ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)';
  const chipBorder = isPM ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)';
  const ritualCurrentStep = steps[ritualStep] ?? steps[steps.length - 1];
  const isRitualLast = ritualStep === steps.length - 1;

  // Cerimônia usa DM Serif Display (diferente da tela principal que usa Playfair)
  const cerimFont = fontsLoaded ? 'DMSerifDisplay-Italic' : undefined;
  const cerimFontReg = fontsLoaded ? 'DMSerifDisplay-Regular' : undefined;
  // Título partido: 1ª palavra italic + vírgula + restante normal
  const cerimTitleParts = (ritualCurrentStep?.name ?? '').split(' ');
  const cerimTitleFirst = cerimTitleParts[0] ?? '';
  const cerimTitleRest = cerimTitleParts.slice(1).join(' ');
  // Tema da tela de celebração (CerimoniaCelebration)
  const celebBgColors: string[] = isPM ? ['#1a2332', '#0a1420', '#050a12'] : ['#FFF8F3', '#FFEFE4'];
  const celebTextColor = isPM ? '#F5E6D3' : '#1D3A44';
  const celebSubtleColor = isPM ? 'rgba(245,230,211,0.6)' : 'rgba(29,58,68,0.55)';
  const celebRuleColor = isPM ? 'rgba(245,230,211,0.25)' : 'rgba(29,58,68,0.2)';
  const celebCtaBg = isPM ? '#F5E6D3' : '#1D3A44';
  const celebCtaText = isPM ? '#0a1420' : '#FFF8F3';

  // ── JSX ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.scanBtn} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 16, color: '#2B2724', textAlign: 'center', marginBottom: 20 }}>{error}</Text>
        {scanResult && (
          <TouchableOpacity
            onPress={generateProtocol}
            style={{ backgroundColor: Colors.scanBtn, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 100 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Tentar novamente</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: isPM ? '#0F1420' : '#FFFFFF' }}>
      {isPM && (
        <LinearGradient
          colors={['#0F1420', '#1A1F2E', '#2A1F28']}
          style={StyleSheet.absoluteFill}
        />
      )}
      {isPM && <NightSky />}

      {/* ── Scroll content ─────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1, zIndex: 1 }}
        contentContainerStyle={{ paddingBottom: 180 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Masthead */}
        <View style={{
          paddingTop: insets.top + 20,
          paddingHorizontal: 28,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Text style={{
            fontSize: 10, fontWeight: '600',
            letterSpacing: 2.8, color: inkSoft,
            textTransform: 'uppercase',
          }}>NIKS</Text>
          <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 0.5, color: inkSoft }}>
            {formattedDate}
          </Text>
        </View>

        {/* Orb 132×132 — Skia RadialGradient fiel ao design */}
        <View style={{ paddingTop: 56, paddingHorizontal: 28, alignItems: 'center' }}>
          <View style={{
            shadowColor: isPM ? '#FFF8DC' : '#E89178',
            shadowOffset: { width: 0, height: 18 },
            shadowOpacity: isPM ? 0.35 : 0.28,
            shadowRadius: 22,
            elevation: 8,
          }}>
            <Canvas style={{ width: 132, height: 132 }}>
              <Circle cx={66} cy={66} r={66}>
                <RadialGradient
                  c={vec(46, 40)}
                  r={120}
                  colors={isPM
                    ? ['#FFFFFF', '#F4EEE4', '#D8CDB8', '#A89676']
                    : ['#FFE8DF', '#F9C9B6', '#E89178', '#C86651']}
                />
              </Circle>
              <Circle cx={47} cy={27} r={21}>
                <RadialGradient
                  c={vec(47, 27)}
                  r={21}
                  colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                />
                <BlurMask blur={4} style="normal" />
              </Circle>
              {isPM && (
                <>
                  <Circle cx={77} cy={49} r={7}>
                    <RadialGradient c={vec(75, 47)} r={7}
                      colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']} />
                  </Circle>
                  <Circle cx={43} cy={77} r={5}>
                    <RadialGradient c={vec(41, 75)} r={5}
                      colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.16)', 'rgba(0,0,0,0)']} />
                  </Circle>
                  <Circle cx={96} cy={60} r={3.5}>
                    <RadialGradient c={vec(95, 59)} r={3.5}
                      colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.14)', 'rgba(0,0,0,0)']} />
                  </Circle>
                  <Circle cx={71} cy={91} r={3}>
                    <RadialGradient c={vec(70, 90)} r={3}
                      colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']} />
                  </Circle>
                  <Circle cx={53} cy={37} r={2.5}>
                    <RadialGradient c={vec(52, 36)} r={2.5}
                      colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0)']} />
                  </Circle>
                </>
              )}
            </Canvas>
          </View>
        </View>

        {/* Toggle AM/PM — serif italic + SVG fiéis ao design */}
        <View style={{
          paddingTop: 26, paddingHorizontal: 28,
          flexDirection: 'row', justifyContent: 'center',
          alignItems: 'center', gap: 14,
        }}>
          <TouchableOpacity
            onPress={() => setPeriod('morning')}
            activeOpacity={0.75}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingBottom: 3,
              borderBottomWidth: 0.5,
              borderBottomColor: !isPM ? accent : 'transparent',
            }}
          >
            <Svg width={13} height={13} viewBox="0 0 14 14" fill="none">
              <SvgCircle cx={7} cy={7} r={2.4} stroke={!isPM ? accent : inkWhisper} strokeWidth={0.8} />
              <SvgLine x1={7} y1={1} x2={7} y2={2.8} stroke={!isPM ? accent : inkWhisper} strokeWidth={0.8} strokeLinecap="round" />
              <SvgLine x1={7} y1={11.2} x2={7} y2={13} stroke={!isPM ? accent : inkWhisper} strokeWidth={0.8} strokeLinecap="round" />
              <SvgLine x1={1} y1={7} x2={2.8} y2={7} stroke={!isPM ? accent : inkWhisper} strokeWidth={0.8} strokeLinecap="round" />
              <SvgLine x1={11.2} y1={7} x2={13} y2={7} stroke={!isPM ? accent : inkWhisper} strokeWidth={0.8} strokeLinecap="round" />
              <SvgLine x1={2.76} y1={2.76} x2={4.04} y2={4.04} stroke={!isPM ? accent : inkWhisper} strokeWidth={0.8} strokeLinecap="round" />
              <SvgLine x1={9.96} y1={9.96} x2={11.24} y2={11.24} stroke={!isPM ? accent : inkWhisper} strokeWidth={0.8} strokeLinecap="round" />
              <SvgLine x1={11.24} y1={2.76} x2={9.96} y2={4.04} stroke={!isPM ? accent : inkWhisper} strokeWidth={0.8} strokeLinecap="round" />
              <SvgLine x1={4.04} y1={9.96} x2={2.76} y2={11.24} stroke={!isPM ? accent : inkWhisper} strokeWidth={0.8} strokeLinecap="round" />
            </Svg>
            <Text style={{
              fontFamily: displayFont, fontSize: 15, fontWeight: '400',
              color: !isPM ? accent : inkWhisper,
            }}>manhã</Text>
          </TouchableOpacity>

          <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: inkWhisper }} />

          <TouchableOpacity
            onPress={() => setPeriod('night')}
            activeOpacity={0.75}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingBottom: 3,
              borderBottomWidth: 0.5,
              borderBottomColor: isPM ? accent : 'transparent',
            }}
          >
            <Text style={{
              fontFamily: displayFont, fontSize: 15, fontWeight: '400',
              color: isPM ? accent : inkWhisper,
            }}>noite</Text>
            <Svg width={13} height={13} viewBox="0 0 14 14" fill="none">
              <SvgPath
                d="M11 8.5 A 5 5 0 1 1 5.5 3 A 4 4 0 0 0 11 8.5 Z"
                stroke={isPM ? accent : inkWhisper}
                strokeWidth={0.8}
                strokeLinejoin="round"
              />
            </Svg>
          </TouchableOpacity>
        </View>

        {/* Title block */}
        <View style={{ paddingTop: 26, paddingHorizontal: 28, alignItems: 'center' }}>
          <Text style={{
            fontFamily: displayFontReg,
            fontSize: 38, fontWeight: '400',
            color: ink, lineHeight: 40,
            letterSpacing: -0.95,
            textAlign: 'center',
          }}>
            <Text style={{ fontFamily: displayFont }}>{periodWord} </Text>
            {stepsCountWord} passos.
          </Text>

          <View style={{
            flexDirection: 'row', alignItems: 'center',
            justifyContent: 'center', gap: 10, marginTop: 22,
          }}>
            <View style={{ width: 36, height: 0.5, backgroundColor: inkHair }} />
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: accent }} />
            <View style={{ width: 36, height: 0.5, backgroundColor: inkHair }} />
          </View>

          <Text style={{
            fontSize: 11, fontWeight: '500', letterSpacing: 0.4,
            color: inkSoft, marginTop: 20,
          }}>
            {[totalLabel, skinScore != null ? `score ${skinScore}` : null].filter(Boolean).join('  ·  ')}
          </Text>
        </View>

        {/* Steps list */}
        <View style={{ paddingTop: 48, paddingHorizontal: 28 }}>
          {steps.map((s, i) => {
            const done = checkedItems.has(i);
            return (
              <TouchableOpacity
                key={s.id ?? i}
                onPress={() => setOpenStep(i)}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row', alignItems: 'flex-start',
                  gap: 20, paddingTop: 22, paddingBottom: 22, paddingLeft: 16,
                  borderBottomWidth: i < steps.length - 1 ? 0.5 : 0,
                  borderBottomColor: inkHair,
                  position: 'relative',
                  opacity: done ? 0.42 : 1,
                }}
              >
                <View style={{
                  position: 'absolute', left: 0, top: 22, bottom: 22,
                  width: 2, borderRadius: 1, backgroundColor: accent,
                }} />
                <Text style={{
                  fontFamily: displayFont,
                  fontSize: 16, fontWeight: '400',
                  color: accent, width: 22, flexShrink: 0,
                  paddingTop: 4, letterSpacing: -0.16,
                }}>{toRoman(i + 1)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontFamily: displayFontReg,
                    fontSize: 20, fontWeight: '400',
                    color: ink, lineHeight: 24, letterSpacing: -0.3,
                    textDecorationLine: done ? 'line-through' : 'none',
                    textDecorationColor: inkWhisper,
                  }}>{s.name}</Text>
                  <Text style={{
                    fontSize: 11, fontWeight: '500', letterSpacing: 0.3,
                    color: inkSoft, marginTop: 6,
                  }}>{s.ingredient}</Text>
                </View>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  flexShrink: 0, paddingTop: 6,
                }}>
                  {done ? (
                    <View style={{
                      width: 18, height: 18, borderRadius: 9,
                      backgroundColor: inkWhisper,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Svg width={10} height={10} viewBox="0 0 10 10">
                        <SvgPath d="M2 5L4.2 7L8 3" stroke="#fff" strokeWidth={1.4}
                          fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                  ) : (
                    <Text style={{
                      fontSize: 11, fontWeight: '500', letterSpacing: 0.3, color: inkSoft,
                    }}>{s.waitTime ?? ''}</Text>
                  )}
                  <Svg width={7} height={12} viewBox="0 0 7 12">
                    <SvgPath d="M1 1L6 6L1 11" stroke={accent} strokeWidth={1.2}
                      fill="none" strokeLinecap="round" />
                  </Svg>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* CTA flutuante */}
      <View style={{
        position: 'absolute', left: 0, right: 0,
        bottom: 112, paddingHorizontal: 24, zIndex: 25,
      }}>
        <TouchableOpacity
          onPress={() => { setRitualStep(0); setRitualDone(false); setRitualOpen(true); }}
          activeOpacity={0.9}
          style={{
            backgroundColor: accent, borderRadius: 100,
            paddingVertical: 18, paddingHorizontal: 24,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
            shadowColor: accent,
            shadowOffset: { width: 0, height: 14 },
            shadowOpacity: 0.22, shadowRadius: 32, elevation: 8,
          }}
        >
          <Text style={{
            color: '#fff', fontFamily: displayFont,
            fontSize: 14, fontWeight: '400', letterSpacing: -0.07,
          }}>Começar minha rotina</Text>
          <Svg width={13} height={13} viewBox="0 0 14 14" fill="none">
            <SvgPath d="M3 7h8m0 0L7.5 3.5M11 7L7.5 10.5"
              stroke="#fff" strokeWidth={1.3}
              strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* BOTTOM SHEET — detalhes do passo */}
      {currentOpenStep != null && openStep !== null && (
        <>
          <Pressable
            onPress={() => setOpenStep(null)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }}
          >
            <BlurView
              intensity={isPM ? 30 : 20}
              tint={isPM ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: isPM ? 'rgba(0,0,0,0.35)' : 'rgba(43,39,36,0.18)',
            }} />
          </Pressable>
          <Animated.View style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50,
            backgroundColor: isPM ? '#1A1F2E' : '#FFFFFF',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingBottom: insets.bottom + 24,
            shadowColor: '#000', shadowOffset: { width: 0, height: -12 },
            shadowOpacity: 0.12, shadowRadius: 40,
            maxHeight: '78%',
            transform: [{ translateY: sheetSlide }],
          }}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 14, paddingHorizontal: 28 }}
            >
              <View style={{
                width: 36, height: 4, borderRadius: 2,
                backgroundColor: inkHair,
                alignSelf: 'center', marginBottom: 20,
              }} />
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 14 }}>
                <Text style={{
                  fontFamily: displayFont, fontSize: 18, fontWeight: '400',
                  color: accent, letterSpacing: -0.18,
                }}>{toRoman(openStep + 1)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 9, fontWeight: '600', letterSpacing: 2.5,
                    color: accent, textTransform: 'uppercase',
                  }}>
                    Passo {openStep + 1}{currentOpenStep.waitTime ? ` · ${currentOpenStep.waitTime}` : ''}
                  </Text>
                  <Text style={{
                    fontFamily: displayFontReg,
                    fontSize: 28, fontWeight: '400',
                    color: ink, lineHeight: 31, letterSpacing: -0.56,
                    marginTop: 6,
                  }}>{currentOpenStep.name}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setOpenStep(null)}
                  style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: inkHair,
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Svg width={12} height={12} viewBox="0 0 12 12">
                    <SvgPath d="M2 2L10 10M10 2L2 10"
                      stroke={inkSoft} strokeWidth={1.3} strokeLinecap="round" />
                  </Svg>
                </TouchableOpacity>
              </View>

              <View style={{
                marginTop: 24, paddingVertical: 16,
                borderTopWidth: 0.5, borderBottomWidth: 0.5,
                borderColor: inkHair,
              }}>
                <Text style={{
                  fontFamily: displayFont,
                  fontSize: 17, fontWeight: '400',
                  color: ink, lineHeight: 24, letterSpacing: -0.17,
                }}>
                  {currentOpenStep.instruction
                    ? currentOpenStep.instruction.charAt(0).toUpperCase() + currentOpenStep.instruction.slice(1)
                    : ''}
                </Text>
              </View>

              <View style={{ marginTop: 22 }}>
                <Text style={{
                  fontSize: 9, fontWeight: '600', letterSpacing: 2.2,
                  color: inkSoft, textTransform: 'uppercase',
                }}>Como aplicar</Text>
                <Text style={{ fontSize: 14, color: ink, lineHeight: 22, marginTop: 8 }}>
                  {currentOpenStep.steps && currentOpenStep.steps.length > 0
                    ? currentOpenStep.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
                    : currentOpenStep.instruction}
                </Text>
              </View>

              <View style={{ marginTop: 22 }}>
                <Text style={{
                  fontSize: 9, fontWeight: '600', letterSpacing: 2.2,
                  color: inkSoft, textTransform: 'uppercase',
                }}>Ativos</Text>
                <Text style={{ fontSize: 14, color: ink, lineHeight: 22, marginTop: 8 }}>
                  {currentOpenStep.ingredient}
                </Text>
              </View>

              <View style={{ marginTop: 22, paddingBottom: 8 }}>
                <Text style={{
                  fontSize: 9, fontWeight: '600', letterSpacing: 2.2,
                  color: inkSoft, textTransform: 'uppercase',
                }}>Por que para você</Text>
                <Text style={{ fontSize: 14, color: ink, lineHeight: 22, marginTop: 8 }}>
                  {skinScore != null
                    ? `Sua análise apontou score ${skinScore} — ${currentOpenStep.name} é o ponto-chave deste passo na sua rotina atual.`
                    : `${currentOpenStep.name} foi selecionado com base no seu perfil de pele.`}
                </Text>
              </View>
            </ScrollView>
          </Animated.View>
        </>
      )}

      {/* CERIMÔNIA OVERLAY */}
      {ritualOpen && (
        ritualDone ? (
          <Animated.View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60,
            overflow: 'hidden',
            opacity: celebScreenOpacity,
            transform: [{ scale: celebScreenScale }],
          }}>
            <LinearGradient colors={celebBgColors} style={StyleSheet.absoluteFill} />
            {isPM && <NightSky />}

            {/* Masthead */}
            <View style={{
              paddingTop: insets.top + 20, paddingHorizontal: 28,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              zIndex: 2,
            }}>
              <Text style={{ fontFamily: cerimFont, fontSize: 12, letterSpacing: 1.2, color: celebSubtleColor }}>
                niks · {isPM ? 'noite' : 'manhã'}
              </Text>
              <Text style={{ fontFamily: cerimFontReg, fontSize: 12, letterSpacing: 1.92, color: celebSubtleColor, textTransform: 'uppercase' }}>
                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            {/* Centro: orb + texto */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, zIndex: 2 }}>

              {/* Orb 220×220 com glow, outer ring, body Skia, craters PM, checkmark */}
              <Animated.View style={{
                width: 220, height: 220, marginBottom: 48,
                alignItems: 'center', justifyContent: 'center',
                opacity: celebOrbOpacity,
                transform: [{ scale: celebOrbScale }],
              }}>
                {/* Glow radial */}
                <Canvas style={{ position: 'absolute', width: 300, height: 300, top: -40, left: -40 }}>
                  <Circle cx={150} cy={150} r={130}>
                    <RadialGradient
                      c={vec(150, 150)} r={130}
                      colors={isPM
                        ? ['rgba(245,230,211,0.25)', 'rgba(245,230,211,0)']
                        : ['rgba(251,123,107,0.33)', 'rgba(251,123,107,0)']}
                    />
                    <BlurMask blur={24} style="normal" />
                  </Circle>
                </Canvas>
                {/* Outer ring */}
                <View style={{
                  position: 'absolute', width: 252, height: 252, borderRadius: 126,
                  top: -16, left: -16,
                  borderWidth: 1,
                  borderColor: isPM ? 'rgba(245,230,211,0.18)' : 'rgba(251,123,107,0.25)',
                }} />
                {/* Orb body */}
                <Canvas style={{ width: 220, height: 220, position: 'absolute' }}>
                  <Circle cx={110} cy={110} r={110}>
                    <RadialGradient
                      c={vec(77, 77)} r={198}
                      colors={isPM
                        ? ['#FAF3E3', '#E8D9B8', '#B8A685']
                        : ['#FFD4B8', accent, '#E85D4E']}
                    />
                  </Circle>
                  {isPM && (
                    <>
                      <Circle cx={141.8} cy={123.2} r={7.7}>
                        <RadialGradient c={vec(138.8, 120.2)} r={7.7}
                          colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']} />
                      </Circle>
                      <Circle cx={82.6} cy={162.8} r={5.5}>
                        <RadialGradient c={vec(79.6, 159.8)} r={5.5}
                          colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.16)', 'rgba(0,0,0,0)']} />
                      </Circle>
                      <Circle cx={168.3} cy={143.0} r={4.4}>
                        <RadialGradient c={vec(165.3, 140.0)} r={4.4}
                          colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.14)', 'rgba(0,0,0,0)']} />
                      </Circle>
                      <Circle cx={116.6} cy={196.9} r={3.3}>
                        <RadialGradient c={vec(113.6, 193.9)} r={3.3}
                          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']} />
                      </Circle>
                    </>
                  )}
                </Canvas>
                {/* Checkmark sobreposto */}
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
                    <SvgPath d="M14 24.5L21 31.5L34 17"
                      stroke={isPM ? '#1D3A44' : '#FFF8F3'}
                      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
              </Animated.View>

              {/* Eyebrow: linha + "rotina concluída" + linha */}
              <Animated.View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
                opacity: celebEyebrowAnim,
                transform: [{ translateY: celebEyebrowAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              }}>
                <View style={{ width: 28, height: 1, backgroundColor: celebRuleColor }} />
                <Text style={{ fontFamily: cerimFont, fontSize: 13, letterSpacing: 1.04, color: celebSubtleColor, textTransform: 'lowercase' }}>
                  rotina concluída
                </Text>
                <View style={{ width: 28, height: 1, backgroundColor: celebRuleColor }} />
              </Animated.View>

              {/* Título */}
              <Animated.Text style={{
                fontFamily: cerimFontReg, fontSize: 44, lineHeight: 46,
                color: celebTextColor, textAlign: 'center', letterSpacing: -0.88,
                marginBottom: 20,
                opacity: celebTitleAnim,
                transform: [{ translateY: celebTitleAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              }}>
                <Text style={{ fontFamily: cerimFont }}>{isPM ? 'Boa' : 'Bem'}</Text>
                {isPM ? ' noite,\n' : ' feita,\n'}
                <Text>{isPM ? 'sua pele descansa.' : 'sua pele agradece.'}</Text>
              </Animated.Text>

              {/* Subtexto */}
              <Animated.Text style={{
                fontFamily: cerimFontReg, fontSize: 15, lineHeight: 23.25,
                color: celebSubtleColor, textAlign: 'center', maxWidth: 280,
                opacity: celebSubtextoAnim,
                transform: [{ translateY: celebSubtextoAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              }}>
                {isPM
                  ? 'Quatro gestos para selar o dia. Agora é a noite que cuida — descanse.'
                  : 'Quatro gestos simples, feitos com intenção. Leve essa calma pro resto do dia.'}
              </Animated.Text>
            </View>

            {/* Rodapé: data + CTA "voltar ao protocolo" */}
            <Animated.View style={{
              paddingHorizontal: 28, paddingBottom: insets.bottom + 40,
              zIndex: 2,
              opacity: celebFooterAnim,
              transform: [{ translateY: celebFooterAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}>
              <Text style={{
                fontFamily: cerimFont, fontSize: 13, letterSpacing: 0.13,
                color: celebSubtleColor, textAlign: 'center', marginBottom: 20, textTransform: 'lowercase',
              }}>
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              <TouchableOpacity
                onPress={() => { setRitualOpen(false); setRitualDone(false); }}
                activeOpacity={0.88}
                style={{
                  backgroundColor: celebCtaBg, borderRadius: 100,
                  paddingVertical: 20, paddingHorizontal: 24,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: isPM ? 0.4 : 0.22, shadowRadius: 40,
                }}
              >
                <Text style={{ color: celebCtaText, fontFamily: cerimFont, fontSize: 15, letterSpacing: -0.075 }}>
                  voltar ao protocolo
                </Text>
                <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
                  <SvgPath d="M6 3L11 8L6 13" stroke={celebCtaText} strokeWidth={1.5}
                    strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        ) : (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60,
            overflow: 'hidden',
          }}>
            <LinearGradient colors={rtBg} style={StyleSheet.absoluteFill} />
            {isPM && <NightSky />}
            {/* Vinheta diurna — radial-gradient(ellipse at 50% 110%, ...) */}
            {!isPM && (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <LinearGradient
                  colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.5)']}
                  start={{ x: 0.5, y: 0.3 }}
                  end={{ x: 0.5, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            )}

            <View style={{
              paddingTop: insets.top + 20, paddingHorizontal: 24,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              zIndex: 5,
            }}>
              <TouchableOpacity
                onPress={() => setRitualOpen(false)}
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: chipBg, borderWidth: 0.5, borderColor: chipBorder,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <SvgPath d="M18 6L6 18M6 6l12 12" stroke={rtInk} strokeWidth={2} strokeLinecap="round" />
                </Svg>
              </TouchableOpacity>

              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingVertical: 8, paddingHorizontal: 14, borderRadius: 100,
                backgroundColor: chipBg, borderWidth: 0.5, borderColor: chipBorder,
              }}>
                {isPM ? (
                  <Svg width={12} height={12} viewBox="0 0 14 14" fill="none">
                    <SvgPath d="M11 8.5 A 5 5 0 1 1 5.5 3 A 4 4 0 0 0 11 8.5 Z"
                      stroke={rtInk} strokeWidth={0.8} strokeLinejoin="round" />
                  </Svg>
                ) : (
                  <Svg width={12} height={12} viewBox="0 0 14 14" fill="none">
                    <SvgCircle cx={7} cy={7} r={2.4} stroke={rtInk} strokeWidth={0.8} />
                    <SvgLine x1={7} y1={1} x2={7} y2={2.8} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                    <SvgLine x1={7} y1={11.2} x2={7} y2={13} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                    <SvgLine x1={1} y1={7} x2={2.8} y2={7} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                    <SvgLine x1={11.2} y1={7} x2={13} y2={7} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                  </Svg>
                )}
                <Text style={{
                  fontFamily: cerimFont, fontSize: 13, color: rtInk, letterSpacing: -0.07,
                }}>{isPM ? 'rotina da noite' : 'rotina da manhã'}</Text>
              </View>

              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: chipBg, borderWidth: 0.5, borderColor: chipBorder,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <SvgPath d="M11 5L6 9H2v6h4l5 4V5z" stroke={rtInk} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  <SvgPath d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke={rtInk} strokeWidth={1.5} strokeLinecap="round" />
                </Svg>
              </View>
            </View>

            <View style={{
              paddingTop: 24, paddingHorizontal: 48,
              flexDirection: 'row', gap: 10, zIndex: 5,
            }}>
              {steps.map((_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setRitualStep(i)}
                  style={{
                    flex: 1, height: 1.5, borderRadius: 1,
                    backgroundColor: i <= ritualStep ? rtInk : rtInkHair,
                    opacity: i === ritualStep ? 1 : (i < ritualStep ? 0.9 : 0.4),
                  }}
                />
              ))}
            </View>

            <View style={{ paddingTop: 40, paddingHorizontal: 24, alignItems: 'center', zIndex: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 24, height: 0.5, backgroundColor: rtInkHair }} />
                <Text style={{
                  fontSize: 10, fontWeight: '500', letterSpacing: 2.5,
                  color: rtInkSoft, textTransform: 'uppercase',
                }}>
                  Passo {ritualStep + 1} · {steps.length}{ritualCurrentStep?.waitTime ? `  ·  ${ritualCurrentStep.waitTime}` : ''}
                </Text>
                <View style={{ width: 24, height: 0.5, backgroundColor: rtInkHair }} />
              </View>
            </View>

            <View style={{ paddingTop: 28, alignItems: 'center', zIndex: 5 }}>
              <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
                <Animated.View style={{
                  position: 'absolute',
                  width: 260, height: 260, borderRadius: 130,
                  borderWidth: 0.5,
                  borderColor: isPM ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
                  transform: [{ scale: orbBreath1 }],
                }} />
                <Animated.View style={{
                  position: 'absolute',
                  width: 300, height: 300, borderRadius: 150,
                  borderWidth: 0.5,
                  borderColor: isPM ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.3)',
                  transform: [{ scale: orbBreath2 }],
                }} />
                <Canvas style={{ width: 200, height: 200, position: 'absolute' }}>
                  <Circle cx={100} cy={100} r={100}>
                    <RadialGradient
                      c={vec(70, 60)}
                      r={180}
                      colors={isPM
                        ? ['#FFFFFF', '#F4EEE4', '#D8CDB8', '#A89676']
                        : ['rgba(255,255,255,0.9)', 'rgba(255,230,220,0.7)', 'rgba(251,123,107,0.4)']}
                    />
                  </Circle>
                  {isPM && (
                    <>
                      <Circle cx={143} cy={160} r={11}>
                        <RadialGradient c={vec(140, 157)} r={11}
                          colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']} />
                      </Circle>
                      <Circle cx={93} cy={198} r={8}>
                        <RadialGradient c={vec(91, 196)} r={8}
                          colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.16)', 'rgba(0,0,0,0)']} />
                      </Circle>
                      <Circle cx={172} cy={178} r={5.5}>
                        <RadialGradient c={vec(171, 177)} r={5.5}
                          colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.14)', 'rgba(0,0,0,0)']} />
                      </Circle>
                    </>
                  )}
                </Canvas>
                <Text style={{
                  position: 'absolute',
                  fontFamily: cerimFont,
                  fontSize: 84, fontWeight: '400',
                  color: isPM ? '#3D2F1F' : '#1D3A44',
                  letterSpacing: -3.36,
                  textShadowColor: isPM ? 'rgba(255,255,255,0.4)' : 'transparent',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 0,
                }}>
                  {String(ritualStep + 1).padStart(2, '0')}
                </Text>
              </View>
            </View>

            <View style={{ paddingTop: 36, paddingHorizontal: 32, alignItems: 'center', zIndex: 5 }}>
              {/* Título partido — 1ª palavra italic + vírgula + restante normal */}
              <Text style={{
                fontFamily: cerimFontReg,
                fontSize: 38, fontWeight: '400',
                color: rtInk, letterSpacing: -0.95, textAlign: 'center', lineHeight: 40,
              }}>
                <Text style={{ fontFamily: cerimFont }}>{cerimTitleFirst},</Text>
                {cerimTitleRest ? ` ${cerimTitleRest}` : ''}
              </Text>

              {/* Divider com dot — igual ao Quietude */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }}>
                <View style={{ width: 30, height: 0.5, backgroundColor: rtInkHair }} />
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: accent }} />
                <View style={{ width: 30, height: 0.5, backgroundColor: rtInkHair }} />
              </View>

              {/* Instrução (body text) */}
              <Text style={{
                fontSize: 14, color: rtInkSoft,
                textAlign: 'center', lineHeight: 21.7, marginTop: 16, maxWidth: 280,
              }}>{ritualCurrentStep?.instruction ?? ''}</Text>

              {/* Chip de ingrediente — glass pill */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingVertical: 7, paddingHorizontal: 13, marginTop: 18, borderRadius: 100,
                backgroundColor: chipBg, borderWidth: 0.5, borderColor: chipBorder,
              }}>
                <Svg width={11} height={11} viewBox="0 0 11 11" fill="none">
                  <SvgPath d="M5.5 1.5C5.5 1.5 2.5 5 2.5 7a3 3 0 1 0 6 0C8.5 5 5.5 1.5 5.5 1.5z"
                    stroke={rtInk} strokeWidth={0.9} fill="none" strokeLinejoin="round" />
                </Svg>
                <Text style={{ fontFamily: cerimFont, fontSize: 11, letterSpacing: 0.3, color: rtInk }}>
                  {ritualCurrentStep?.ingredient ?? ''}
                </Text>
              </View>
            </View>

            <View style={{
              position: 'absolute', left: 0, right: 0,
              bottom: insets.bottom + 50,
              paddingHorizontal: 24, zIndex: 10,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {/* Prev — 54×54 glass */}
                <TouchableOpacity
                  onPress={() => setRitualStep(prev => Math.max(0, prev - 1))}
                  activeOpacity={0.75}
                  style={{
                    width: 54, height: 54, borderRadius: 27, flexShrink: 0,
                    backgroundColor: chipBg, borderWidth: 0.5, borderColor: chipBorder,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: ritualStep === 0 ? 0.35 : 1,
                  }}
                >
                  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                    <SvgPath d="M10 3L5 8L10 13" stroke={rtInk} strokeWidth={1.5}
                      strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </TouchableOpacity>

                {/* Main CTA — check icon + texto + chevron */}
                <TouchableOpacity
                  onPress={() => {
                    toggleStepCompletion(ritualStep);
                    if (isRitualLast) {
                      setRitualDone(true);
                    } else {
                      setRitualStep(prev => prev + 1);
                    }
                  }}
                  activeOpacity={0.88}
                  style={{
                    flex: 1,
                    backgroundColor: isPM ? '#FFFFFF' : '#1D3A44',
                    borderRadius: 100,
                    paddingVertical: 18, paddingHorizontal: 20,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: isPM ? 0.4 : 0.25, shadowRadius: isPM ? 32 : 20,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{
                      width: 28, height: 28, borderRadius: 14,
                      backgroundColor: accent,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                        <SvgPath d="M3 7L5.8 9.5L11 4.5" stroke="#fff" strokeWidth={1.5}
                          fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                    <Text style={{
                      fontFamily: cerimFont, fontSize: 14,
                      color: isPM ? '#1D3A44' : '#FFFFFF', letterSpacing: -0.07,
                    }}>
                      {isRitualLast ? 'Finalizar rotina' : 'Concluir este passo'}
                    </Text>
                  </View>
                  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                    <SvgPath d="M6 3L11 8L6 13" stroke={isPM ? '#1D3A44' : '#FFFFFF'}
                      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )
      )}
    </View>
  );
}

