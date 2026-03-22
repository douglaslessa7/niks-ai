import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef } from 'react';
import { Check, Sun, Moon, Info, CheckCircle, ChevronDown, ChevronUp, Flame } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAppStore, ProtocolResult } from '../../store/onboarding';
import { BASE_PROTOCOLS } from '../../constants/protocols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { Colors } from '../../constants/colors';

interface Step {
  id: number;
  name: string;
  ingredient: string;
  instruction: string;
  color: string;
  waitTime?: string | null;
  product_suggestions?: string[];
}

interface Protocol {
  morning: Step[];
  night: Step[];
  introduction_warnings: string | null;
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

  // Animated values por card (arrays mutáveis)
  const cardOpacityRef = useRef<Animated.Value[]>([]);
  const cardScaleYRef = useRef<Animated.Value[]>([]);
  const cardGreenRef = useRef<Animated.Value[]>([]);

  const steps = period === 'morning' ? morningSteps : nightSteps;
  const isMorning = period === 'morning';
  const accentColor = isMorning ? Colors.scanBtn : Colors.tabActive;

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
          const todayDate = new Date().toISOString().split('T')[0];
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

  // Buscar dados do usuário (nome, streak)
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
      }
    };
    fetchUserData();
  }, []);

  useEffect(() => {
    generateProtocol();
  }, []);

  const getTodayKey = (tab: 'morning' | 'night') =>
    `protocolo_check_${new Date().toISOString().split('T')[0]}_${tab}`;

  const persistChecked = async (newSet: Set<number>) => {
    const key = getTodayKey(period);
    await AsyncStorage.setItem(key, JSON.stringify([...newSet]));
  };

  const updateStreak = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    const today = new Date().toDateString();
    const lastDay = lastCompletedAtRef.current ? new Date(lastCompletedAtRef.current).toDateString() : null;
    if (lastDay !== today) {
      const newStreak = streakDaysRef.current + 1;
      const nowIso = new Date().toISOString();
      await supabase.from('users').update({
        streak_days: newStreak,
        last_protocol_completed_at: nowIso,
      }).eq('id', user.id);
      setStreakDays(newStreak);
      streakDaysRef.current = newStreak;
      setLastCompletedAt(nowIso);
      lastCompletedAtRef.current = nowIso;
    }
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
              const todayDate = new Date().toISOString().split('T')[0];
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

  // Detecta se o texto contém info de dias da semana
  const DAY_REGEX = /(?:Seg|Ter|Qua|Qui|Sex|S[aá]b|Dom|segunda|terça|quarta|quinta|sexta|s[aá]bado|domingo)/i;

  const getDayTag = (step: Step): string | null => {
    if (step.waitTime && DAY_REGEX.test(step.waitTime)) {
      return step.waitTime;
    }
    if (step.ingredient) {
      const match = step.ingredient.match(/\(([^)]*(?:Seg|Ter|Qua|Qui|Sex|S[aá]b|Dom)[^)]*)\)/i);
      if (match) return match[1];
    }
    if (step.instruction && DAY_REGEX.test(step.instruction)) {
      const match = step.instruction.match(/\(([^)]*(?:Seg|Ter|Qua|Qui|Sex|S[aá]b|Dom)[^)]*)\)/i);
      if (match) return match[1];
    }
    return null;
  };

  const isTimeWait = (wt: string | null | undefined): boolean => {
    if (!wt) return false;
    if (DAY_REGEX.test(wt)) return false;
    return /\d/.test(wt);
  };

  const getSubSteps = (step: Step): string[] => {
    if (step.instruction) {
      const parts = step.instruction
        .split(/\.\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => (s.endsWith('.') ? s : `${s}.`));
      if (parts.length > 1) return parts;
    }
    return step.instruction ? [step.instruction] : ['Siga as instruções do fabricante.'];
  };

  const renderStepCard = (step: Step, index: number, isCompleted: boolean) => {
    const dayTag = getDayTag(step);

    if (isCompleted) {
      // Card concluído: esmaecido, sem botão "Ver passo a passo", toque desmarca
      return (
        <TouchableOpacity
          key={`completed-${step.id}`}
          onPress={() => toggleStepCompletion(index)}
          activeOpacity={0.75}
          style={{ opacity: 0.45 }}
        >
          <View
            style={{
              borderRadius: 16,
              padding: 16,
              backgroundColor: Colors.white,
              borderWidth: 1,
              borderColor: '#F0F0F0',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              {/* Círculo cinza com check */}
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  backgroundColor: Colors.disabled,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Check size={18} color={Colors.white} strokeWidth={3} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.gray, textDecorationLine: 'line-through', flexShrink: 1 }}>
                    {step.name}
                  </Text>
                  {dayTag && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#F3F3F5', flexShrink: 0, alignSelf: 'flex-start' }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.gray }}>{dayTag}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 13, color: Colors.gray, flexShrink: 1 }}>
                  {step.ingredient}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Card pendente: com animações
    const greenAnim = cardGreenRef.current[index];
    const bgColor = greenAnim
      ? greenAnim.interpolate({ inputRange: [0, 1], outputRange: [Colors.white, '#E8F5E9'] })
      : Colors.white;
    const circleColor = greenAnim
      ? greenAnim.interpolate({ inputRange: [0, 1], outputRange: [accentColor, '#4CAF50'] })
      : accentColor;

    return (
      <Animated.View
        key={step.id}
        style={{
          opacity: cardOpacityRef.current[index] ?? 1,
          transform: [{ scaleY: cardScaleYRef.current[index] ?? 1 }],
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            backgroundColor: bgColor,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: '#F0F0F0',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          {/* Top row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            {/* Number circle — só a cor anima para verde */}
            <Animated.View
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                backgroundColor: circleColor,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                shadowColor: accentColor,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 3,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.white }}>
                {index + 1}
              </Text>
            </Animated.View>

            {/* Text info */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1D3A44', flexShrink: 1 }}>
                  {step.name}
                </Text>
                {(() => {
                  if (dayTag) {
                    return (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#FFF5F4', borderWidth: 1, borderColor: '#FDE8E6', flexShrink: 0, alignSelf: 'flex-start' }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.scanBtn }}>{dayTag}</Text>
                      </View>
                    );
                  }
                  if (isTimeWait(step.waitTime)) {
                    return (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#F3F3F5', flexShrink: 0, alignSelf: 'flex-start' }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#8A8A8E' }}>{step.waitTime}</Text>
                      </View>
                    );
                  }
                  return null;
                })()}
              </View>
              <Text style={{ fontSize: 13, color: '#8A8A8E', marginBottom: 4, flexShrink: 1 }}>
                {step.ingredient}
              </Text>
              <Text style={{ fontSize: 12, color: '#A0A0A8', lineHeight: 18, flexShrink: 1 }}>
                {step.instruction}
              </Text>
            </View>

            {/* Checkbox direito */}
            <TouchableOpacity
              onPress={() => toggleStepCompletion(index)}
              activeOpacity={0.8}
              style={{ flexShrink: 0 }}
            >
              <Animated.View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  backgroundColor: greenAnim
                    ? greenAnim.interpolate({ inputRange: [0, 1], outputRange: ['transparent', '#4CAF50'] })
                    : 'transparent',
                  borderWidth: 1,
                  borderColor: greenAnim
                    ? greenAnim.interpolate({ inputRange: [0, 1], outputRange: [Colors.disabled, '#4CAF50'] })
                    : Colors.disabled,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Animated.View
                  style={{
                    opacity: greenAnim
                      ? greenAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
                      : 0,
                  }}
                >
                  <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                </Animated.View>
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* "Ver passo a passo" button */}
          <TouchableOpacity
            onPress={() => {
              setSelectedStep(step);
              setShowStepDetail(true);
            }}
            activeOpacity={0.8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: '#F0F9F5',
            }}
          >
            <Info size={14} color="#7CB69D" strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#7CB69D' }}>
              Ver passo a passo
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg, alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.scanBtn} />
        <Text style={{ marginTop: 16, color: '#8A8A8E', fontSize: 15 }}>Gerando seu protocolo personalizado...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }} edges={['top']}>
        <Text style={{ color: Colors.black, fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 16 }}>{error}</Text>
        {scanResult && (
          <TouchableOpacity
            onPress={generateProtocol}
            style={{ backgroundColor: Colors.scanBtn, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
          >
            <Text style={{ color: Colors.white, fontWeight: '600' }}>Tentar novamente</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  const pendingSteps = steps.map((step, index) => ({ step, index })).filter(({ index }) => !checkedItems.has(index));
  const completedSteps = steps.map((step, index) => ({ step, index })).filter(({ index }) => checkedItems.has(index));
  const total = steps.length;
  const completed = checkedItems.size;
  const allDone = total > 0 && completed === total;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24 }}>

          {/* Header */}
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#1D3A44', marginBottom: 24 }}>
            Seu Protocolo
          </Text>

          {/* Tab Toggle */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setPeriod('morning')}
              activeOpacity={0.8}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 999,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: isMorning ? Colors.scanBtn : 'transparent',
                borderWidth: 1,
                borderColor: isMorning ? Colors.scanBtn : '#1D3A44',
              }}
            >
              <Sun size={20} color={isMorning ? Colors.white : '#1D3A44'} strokeWidth={2} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: isMorning ? Colors.white : '#1D3A44' }}>
                Manhã
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPeriod('night')}
              activeOpacity={0.8}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 999,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: !isMorning ? Colors.scanBtn : 'transparent',
                borderWidth: 1,
                borderColor: !isMorning ? Colors.scanBtn : '#1D3A44',
              }}
            >
              <Moon size={20} color={!isMorning ? Colors.white : '#1D3A44'} strokeWidth={2} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: !isMorning ? Colors.white : '#1D3A44' }}>
                Noite
              </Text>
            </TouchableOpacity>
          </View>

          {/* Barra de progresso */}
          {total > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 13, color: Colors.muted, marginBottom: 8 }}>
                {completed} de {total} {completed === 1 ? 'passo concluído' : 'passos concluídos'}
              </Text>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: '#F0F0F0' }}>
                <Animated.View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: Colors.scanBtn,
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  }}
                />
              </View>
            </View>
          )}

          {/* Cards pendentes */}
          <View style={{ gap: 12 }}>
            {pendingSteps.map(({ step, index }) => renderStepCard(step, index, false))}
          </View>

          {/* Seção "Concluídos hoje" */}
          {completedSteps.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => setIsCompletedExpanded((prev) => !prev)}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}
              >
                <Text style={{ fontSize: 13, color: Colors.muted, fontWeight: '600' }}>
                  ✓ Concluídos hoje ({completedSteps.length})
                </Text>
                {isCompletedExpanded
                  ? <ChevronUp size={16} color={Colors.muted} />
                  : <ChevronDown size={16} color={Colors.muted} />
                }
              </TouchableOpacity>

              {isCompletedExpanded && (
                <View style={{ gap: 10 }}>
                  {completedSteps.map(({ step, index }) => renderStepCard(step, index, true))}
                </View>
              )}
            </View>
          )}

          {/* Card de celebração */}
          {allDone && (
            <Animated.View
              style={{
                opacity: celebrationAnim,
                transform: [{
                  scale: celebrationAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.85, 1],
                  }),
                }],
                backgroundColor: '#E8F5E9',
                borderWidth: 1.5,
                borderColor: '#4CAF50',
                borderRadius: 20,
                padding: 24,
                alignItems: 'center',
                marginTop: 20,
              }}
            >
              <CheckCircle size={48} color="#4CAF50" />
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1D3A44', marginTop: 12, textAlign: 'center' }}>
                Rotina de {isMorning ? 'Manhã' : 'Noite'} concluída!
              </Text>
              <Text style={{ fontSize: 14, color: Colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                Parabéns — você cuidou da sua pele hoje.
              </Text>
              {bothCompleted && streakDays > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 }}>
                  <Flame size={18} color="#4CAF50" strokeWidth={2} />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#4CAF50' }}>
                    {streakDays} {streakDays === 1 ? 'dia consecutivo' : 'dias consecutivos'}
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* Observação noturna */}
          {!isMorning && protocol?.introduction_warnings && (
            <View
              style={{
                borderRadius: 12,
                padding: 16,
                backgroundColor: '#FDFDFD',
                borderWidth: 1,
                borderColor: '#F0F0F0',
                marginTop: completedSteps.length > 0 || allDone ? 16 : 4,
              }}
            >
              <Text style={{ fontSize: 13, color: '#8A8A8E', lineHeight: 20 }}>
                <Text style={{ fontWeight: '700', color: '#1D3A44' }}>Observação: </Text>
                {protocol.introduction_warnings}
              </Text>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Step Detail Modal — preservado intacto */}
      <Modal
        visible={showStepDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStepDetail(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setShowStepDetail(false)}
          />
          <View
            style={{
              backgroundColor: Colors.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              maxHeight: '80%',
            }}
          >
            {/* Handle */}
            <View
              style={{
                width: 40,
                height: 4,
                backgroundColor: Colors.disabled,
                borderRadius: 999,
                alignSelf: 'center',
                marginBottom: 24,
              }}
            />

            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedStep && (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#1D3A44', marginBottom: 8 }}>
                    {selectedStep.name}
                  </Text>
                  <Text style={{ fontSize: 14, color: '#8A8A8E', marginBottom: 24, lineHeight: 20 }}>
                    {selectedStep.instruction}
                  </Text>

                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1D3A44', marginBottom: 16 }}>
                    Passo a passo:
                  </Text>

                  <View style={{ gap: 16, marginBottom: 24 }}>
                    {getSubSteps(selectedStep).map((subStep, index) => (
                      <View key={index} style={{ flexDirection: 'row', gap: 12 }}>
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            backgroundColor: Colors.scanBtn,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            shadowColor: Colors.scanBtn,
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.25,
                            shadowRadius: 8,
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.white }}>
                            {index + 1}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 14, color: '#1D3A44', lineHeight: 22, flex: 1, paddingTop: 3 }}>
                          {subStep}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    onPress={() => setShowStepDetail(false)}
                    activeOpacity={0.85}
                    style={{
                      height: 52,
                      borderRadius: 999,
                      backgroundColor: Colors.scanBtn,
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: Colors.scanBtn,
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.4,
                      shadowRadius: 24,
                      elevation: 6,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.white }}>
                      Entendi
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
