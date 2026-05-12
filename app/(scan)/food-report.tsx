import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { useFonts } from 'expo-font';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

type FoodItem = {
  name: string;
  impact: 'positivo' | 'neutro' | 'negativo';
  evidence: string;
  mechanism: string;
  relevance_to_skin: string;
  substitution: string | null;
};

type FoodAnalysisResult = {
  meal_name: string;
  meal_score: number;
  meal_label: 'Ótimo' | 'Bom' | 'Moderado' | 'Atenção';
  meal_summary: string;
  foods: FoodItem[];
  highlights: string[];
  watch_out: string[];
  science_note: string;
  disclaimer: string;
};

const foodSteps = [
  { label: 'Identificando os alimentos', delay: 500 },
  { label: 'Avaliando macronutrientes', delay: 1500 },
  { label: 'Analisando índice glicêmico', delay: 2500 },
  { label: 'Verificando inflamação e oxidação', delay: 3500 },
  { label: 'Correlacionando com seu perfil de pele', delay: 4500 },
  { label: 'Score de impacto na pele', delay: 5500 },
];

// ─── Design tokens ────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 75) return '#34D399';
  if (score >= 50) return '#FACC15';
  return '#EF4444';
}

const impactPillConfig = {
  positivo: { bg: '#ECFDF5', fg: '#065F46', dot: '#86EFAC', label: 'AJUDA' },
  neutro:   { bg: '#FFFBEB', fg: '#92400E', dot: '#FCD34D', label: 'NEUTRO' },
  negativo: { bg: '#FFF5F4', fg: '#991B1B', dot: '#FCA5A5', label: 'PIORA' },
};

const impactSwatchConfig = {
  positivo: '#86EFAC',
  neutro:   '#FCD34D',
  negativo: '#FCA5A5',
};

// ─── Sub-components ────────────────────────────────────────────

function ScoreRing({ score, size = 86, fontReg, fontItalic }: {
  score: number; size?: number;
  fontReg: string | undefined;
  fontItalic: string | undefined;
}) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={3} />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={[circumference]}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 32, fontFamily: fontReg, color, lineHeight: 34 }}>{score}</Text>
        <Text style={{ fontSize: 10, fontFamily: fontItalic, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>/100</Text>
      </View>
    </View>
  );
}

function ImpactPill({ impact }: { impact: 'positivo' | 'neutro' | 'negativo' }) {
  const cfg = impactPillConfig[impact] ?? impactPillConfig.neutro;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cfg.bg, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
      <View style={{ width: 5, height: 5, borderRadius: 99, backgroundColor: cfg.dot }} />
      <Text style={{ fontSize: 9, fontWeight: '600', color: cfg.fg, letterSpacing: 1.2 }}>{cfg.label}</Text>
    </View>
  );
}

function HighlightRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: 'rgba(43,39,36,0.08)' }}>
      <View style={{ width: 24, flexShrink: 0, paddingTop: 3 }}>
        <Svg width={20} height={20} viewBox="0 0 20 20">
          <Circle cx={10} cy={10} r={9.5} fill="#ECFDF5" stroke="#86EFAC" strokeWidth={0.5} />
          <Path d="M6 10.2L8.8 13L14 7.5" stroke="#065F46" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </View>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: '#2B2724', letterSpacing: -0.07 }}>{children}</Text>
    </View>
  );
}

function WatchOutRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: 'rgba(43,39,36,0.08)' }}>
      <View style={{ width: 24, flexShrink: 0, paddingTop: 3 }}>
        <Svg width={20} height={20} viewBox="0 0 20 20">
          <Circle cx={10} cy={10} r={9.5} fill="rgba(251,123,107,0.10)" stroke="#FB7B6B" strokeWidth={0.5} />
          <Path d="M10 5.5V10.5" stroke="#991B1B" strokeWidth={1.6} strokeLinecap="round" fill="none" />
          <Circle cx={10} cy={13.5} r={0.9} fill="#991B1B" />
        </Svg>
      </View>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: '#2B2724', letterSpacing: -0.07 }}>{children}</Text>
    </View>
  );
}

function CollapsibleSection({
  title, count, kind, items, renderRow, fontReg,
}: {
  title: string;
  count: number;
  kind: 'positive' | 'attention';
  items: string[];
  renderRow: (item: string, index: number) => React.ReactNode;
  fontReg: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const isPositive = kind === 'positive';

  return (
    <View style={{ borderRadius: 22, backgroundColor: '#fff', shadowColor: '#2B2724', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
      <View style={{ borderRadius: 22, borderWidth: 0.5, borderColor: open ? (isPositive ? 'rgba(16,185,129,0.45)' : 'rgba(251,123,107,0.5)') : 'rgba(43,39,36,0.06)', overflow: 'hidden' }}>
        <TouchableOpacity
          onPress={() => setOpen(o => !o)}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingHorizontal: 18 }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 18, fontFamily: fontReg, color: isPositive ? '#065F46' : '#991B1B', letterSpacing: -0.3 }}>{title}</Text>
            <Text style={{ marginTop: 6, fontSize: 10, fontWeight: '500', letterSpacing: 0.4, color: 'rgba(43,39,36,0.55)', textTransform: 'uppercase' }}>
              {count} {count === 1 ? 'item' : 'itens'}
            </Text>
          </View>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(43,39,36,0.04)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Svg width={11} height={7} viewBox="0 0 11 7">
              <Path d="M1 1l4.5 4.5L10 1" stroke="#2B2724" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </View>
        </TouchableOpacity>
        {open && (
          <View style={{ paddingHorizontal: 18, paddingBottom: 14 }}>
            {items.map((item, i) => renderRow(item, i))}
          </View>
        )}
      </View>
    </View>
  );
}

function FoodSection({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase', color: 'rgba(43,39,36,0.55)' }}>{eyebrow}</Text>
      <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 20.9, color: '#2B2724', letterSpacing: -0.05 }}>{children}</Text>
    </View>
  );
}

function FoodCard({ food, defaultOpen = false, fontItalic }: {
  food: FoodItem;
  defaultOpen?: boolean;
  fontItalic: string | undefined;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const swatch = impactSwatchConfig[food.impact] ?? impactSwatchConfig.neutro;

  return (
    <View style={{ borderRadius: 22, backgroundColor: '#fff', shadowColor: '#2B2724', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
      <View style={{ borderRadius: 22, borderWidth: 0.5, borderColor: 'rgba(43,39,36,0.06)', overflow: 'hidden' }}>
      <TouchableOpacity
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingHorizontal: 18 }}
      >
        {/* Colored dot with ring (replicates box-shadow: 0 0 0 4px ${swatch}33) */}
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: swatch + '33', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: swatch }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 18, fontFamily: fontItalic, color: '#2B2724', letterSpacing: -0.3 }}>{food.name}</Text>
          <View style={{ marginTop: 6, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <ImpactPill impact={food.impact} />
            {food.substitution && (
              <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 0.4, color: '#FB7B6B', textTransform: 'uppercase' }}>· substituição</Text>
            )}
          </View>
        </View>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(43,39,36,0.04)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Svg width={11} height={7} viewBox="0 0 11 7">
            <Path d="M1 1l4.5 4.5L10 1" stroke="#2B2724" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </View>
      </TouchableOpacity>

      {open && (
        <View style={{ paddingHorizontal: 18, paddingBottom: 20, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: 'rgba(43,39,36,0.08)' }}>
          <FoodSection eyebrow="EVIDÊNCIA">{food.evidence}</FoodSection>
          <FoodSection eyebrow="MECANISMO">{food.mechanism}</FoodSection>
          <FoodSection eyebrow="RELEVÂNCIA PARA SUA PELE">{food.relevance_to_skin}</FoodSection>
          {food.substitution && (
            <View style={{ marginTop: 14, backgroundColor: 'rgba(251,123,107,0.06)', borderWidth: 0.5, borderColor: '#FB7B6B', borderRadius: 14, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Svg width={11} height={11} viewBox="0 0 11 11">
                  <Path d="M1 5.5h7M5 2.5l3 3-3 3" stroke="#FB7B6B" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <Path d="M10 5.5h-7M6 8.5l-3-3 3-3" stroke="#FB7B6B" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} fill="none" />
                </Svg>
                <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase', color: '#FB7B6B' }}>substitua por</Text>
              </View>
              <Text style={{ marginTop: 10, fontSize: 15, fontFamily: fontItalic, color: '#2B2724', letterSpacing: -0.15, lineHeight: 21.75 }}>{food.substitution}</Text>
            </View>
          )}
        </View>
      )}
      </View>
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────

export default function FoodReport() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { foodImageBase64, foodImageMimeType, onboarding, selectedFoodResult, setSelectedFoodResult } = useAppStore();
  const { track } = useMixpanel();
  const [result, setResult] = useState<FoodAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const apiDoneRef = useRef(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [showDemandNotice, setShowDemandNotice] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const demandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Regular': require('../../assets/fonts/PlayfairDisplay-Regular.ttf'),
    'PlayfairDisplay-Italic':  require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const fontItalic = fontsLoaded ? 'PlayfairDisplay-Italic'  : undefined;
  const fontReg    = fontsLoaded ? 'PlayfairDisplay-Regular' : undefined;

  useEffect(() => {
    const TOTAL_DURATION = 10000;
    const increment = 90 / (TOTAL_DURATION / 50);

    progressIntervalRef.current = setInterval(() => {
      if (apiDoneRef.current) {
        clearInterval(progressIntervalRef.current!);
        return;
      }
      setProgress((prev) => {
        if (prev >= 98) return 98;
        if (prev >= 90) return prev + 0.03;
        return Math.min(prev + increment, 90);
      });
    }, 50);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (selectedFoodResult) {
      setResult(selectedFoodResult as FoodAnalysisResult);
      setLoading(false);
    } else {
      analyzeFood();
    }
  }, []);

  useEffect(() => {
    foodSteps.forEach((step, index) => {
      setTimeout(() => setCurrentStep(index + 1), step.delay);
    });
  }, []);

  useEffect(() => {
    if (Math.floor(progress) >= 99) {
      demandTimerRef.current = setTimeout(() => {
        setShowDemandNotice(true);
      }, 3000);
    } else {
      if (demandTimerRef.current) clearTimeout(demandTimerRef.current);
      setShowDemandNotice(false);
    }
    return () => { if (demandTimerRef.current) clearTimeout(demandTimerRef.current); };
  }, [progress]);

  useEffect(() => {
    if (!showDemandNotice) {
      if (countdownRef.current) clearTimeout(countdownRef.current);
      setCountdown(60);
      setCountdownPaused(false);
      return;
    }

    const tick = (current: number, paused: boolean) => {
      if (paused) return;
      if (current <= 1) {
        setCountdownPaused(true);
        setCountdown(0);
        countdownRef.current = setTimeout(() => {
          setCountdown(60);
          setCountdownPaused(false);
          countdownRef.current = setTimeout(() => tick(60, false), 1000);
        }, 3000);
        return;
      }
      const next = current - 1;
      setCountdown(next);
      countdownRef.current = setTimeout(() => tick(next, false), 1000);
    };

    countdownRef.current = setTimeout(() => tick(60, false), 1000);

    return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
  }, [showDemandNotice]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const analyzeFood = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('foodImageBase64 size KB:', Math.round(((foodImageBase64?.length ?? 0) * 0.75) / 1024));
      console.log('foodImageMimeType:', foodImageMimeType);

      if (!foodImageBase64) {
        console.error('[food-report] foodImageBase64 está null — abortando análise');
        setError('Imagem não disponível. Tente tirar a foto novamente.');
        return;
      }

      let data: any = null;
      let lastError: any = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(
            'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/analyze-food',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI`,
              },
              body: JSON.stringify({
                imageBase64: foodImageBase64,
                mimeType: foodImageMimeType ?? 'image/jpeg',
                skinProfile: {
                  skin_type: onboarding.skin_type,
                  concerns: onboarding.concerns,
                },
              }),
            }
          );

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`analyze-food error: ${response.status} ${errBody}`);
          }

          data = await response.json();
          lastError = null;
          break;
        } catch (fetchErr: any) {
          lastError = fetchErr;
          if (attempt < 3) {
            console.warn(`[food-report] Tentativa ${attempt}/3 falhou, aguardando 2s...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      if (lastError) {
        console.error('[food-report] Erro após 3 tentativas:', lastError.message);
        throw lastError;
      }

      setResult(data);
      track('food_scan_completed', { meal_score: data.meal_score, meal_label: data.meal_label });

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          let imageUrl: string | null = null;
          if (foodImageBase64) {
            try {
              const ext = (foodImageMimeType ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
              const path = `${user.id}/food_${Date.now()}.${ext}`;
              const binaryStr = atob(foodImageBase64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const { error: upErr } = await supabase.storage
                .from('scans').upload(path, bytes.buffer, { contentType: foodImageMimeType ?? 'image/jpeg', upsert: false });
              if (!upErr) {
                const { data: signed } = await supabase.storage.from('scans').createSignedUrl(path, 31536000);
                imageUrl = signed?.signedUrl ?? null;
              }
            } catch (upEx) {
              console.warn('Falha ao fazer upload da foto de comida:', upEx);
            }
          }

          const { error: insertErr } = await supabase.from('food_scans').insert({
            user_id: user.id,
            meal_name: data.meal_name,
            meal_score: data.meal_score,
            meal_label: data.meal_label,
            meal_summary: data.meal_summary,
            image_url: imageUrl,
            full_result: data,
          });
          if (insertErr) console.warn('Falha ao salvar food_scan:', JSON.stringify(insertErr));
        } else {
          console.warn('food_scan não salvo: usuário não autenticado');
        }
      } catch (saveErr) {
        console.warn('Falha ao salvar food_scan (exception):', saveErr);
      }
    } catch (err: any) {
      console.error('Erro ao analisar refeição:', String(err));
      track('food_scan_failed', { error: err?.message ?? 'unknown' });
      setError('Não foi possível analisar a refeição. Tente novamente.');
    } finally {
      apiDoneRef.current = true;
      setProgress(100);
      await new Promise((r) => setTimeout(r, 400));
      setLoading(false);
    }
  };

  const widthInterp = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // ─── Loading state ─────────────────────────────────────────────

  if (loading) {
    const displayProgress = Math.floor(progress);
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 justify-center">
          {showDemandNotice && (
            <View style={{
              width: '100%',
              backgroundColor: '#FB7B6B',
              borderRadius: 10,
              padding: 12,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 9,
              marginBottom: 20,
            }}>
              <Svg width={16} height={16} viewBox="0 0 16 16" style={{ marginTop: 1, flexShrink: 0 }}>
                <Path d="M4 2h8v2.5C12 6.5 9.5 8 8 8C6.5 8 4 6.5 4 4.5V2z" stroke="white" strokeWidth={1.3} strokeLinejoin="round" fill="none"/>
                <Path d="M4 14h8v-2.5C12 9.5 9.5 8 8 8C6.5 8 4 9.5 4 11.5V14z" stroke="white" strokeWidth={1.3} strokeLinejoin="round" fill="none"/>
                <Line x1={3} y1={2} x2={13} y2={2} stroke="white" strokeWidth={1.3} strokeLinecap="round"/>
                <Line x1={3} y1={14} x2={13} y2={14} stroke="white" strokeWidth={1.3} strokeLinecap="round"/>
              </Svg>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 }}>
                  Estamos com alta demanda agora
                </Text>
                {countdownPaused ? (
                  <Text style={{ fontSize: 12, fontWeight: '400', color: '#FFFFFF', lineHeight: 18 }}>
                    Por favor, aguarde só mais um pouco.
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, fontWeight: '400', color: '#FFFFFF', lineHeight: 18 }}>
                    O impacto da sua refeição na pele está sendo calculado. Por favor, aguarde só mais{' '}
                    <Text style={{ fontWeight: '700', color: '#FFFFFF' }}>{countdown}s</Text>.
                  </Text>
                )}
              </View>
            </View>
          )}

          <Text className="text-[64px] font-bold text-[#1A1A1A] text-center tracking-tight mb-4">
            {displayProgress}%
          </Text>
          <Text className="text-[20px] font-semibold text-[#1A1A1A] text-center mb-8">
            Analisando sua refeição...
          </Text>
          <View className="mb-12 h-1 bg-[#E5E7EB] rounded-full overflow-hidden">
            <Animated.View style={{ width: widthInterp, height: '100%' }}>
              <LinearGradient
                colors={['#EF4444', '#3B82F6', '#9CA3AF']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flex: 1, borderRadius: 99 }}
              />
            </Animated.View>
          </View>
          <View className="gap-4">
            {foodSteps.map((step, index) => {
              const isCompleted = currentStep > index;
              const isInProgress = currentStep === index;
              const isPending = currentStep < index;
              return (
                <View key={index} className="flex-row items-center gap-3" style={{ opacity: isPending ? 0.4 : 1 }}>
                  <View className="w-6 h-6 items-center justify-center flex-shrink-0">
                    {isCompleted ? (
                      <Check size={20} color="#1A1A1A" />
                    ) : isInProgress ? (
                      <Text style={{ fontSize: 18, color: '#1A1A1A' }}>→</Text>
                    ) : null}
                  </View>
                  <Text className={`text-[17px] ${isCompleted || isInProgress ? 'text-[#1A1A1A] font-medium' : 'text-[#9CA3AF]'}`}>
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Error state ───────────────────────────────────────────────

  if (error || !result) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 16 }}>
          {error ?? 'Erro inesperado'}
        </Text>
        <TouchableOpacity
          onPress={analyzeFood}
          style={{ backgroundColor: '#FB7B6B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Tentar novamente</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ─── Result state ──────────────────────────────────────────────

  const photoSource = foodImageBase64
    ? { uri: `data:${foodImageMimeType ?? 'image/jpeg'};base64,${foodImageBase64}` }
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>

        {/* Photo Hero */}
        <View style={{ height: 400, backgroundColor: '#1a1209' }}>
          {photoSource && (
            <Image
              source={photoSource}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          )}

          {/* Bottom scrim */}
          <LinearGradient
            colors={['rgba(20,12,8,0)', 'rgba(20,12,8,0)', 'rgba(20,12,8,0.45)', 'rgba(20,12,8,0.88)']}
            locations={[0, 0.3, 0.65, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* Top scrim */}
          <LinearGradient
            colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120 }}
          />

          {/* Back button */}
          <TouchableOpacity
            onPress={() => { setSelectedFoodResult(null); router.back(); }}
            activeOpacity={0.8}
            style={{ position: 'absolute', top: 50, left: 18, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.32)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={18} color="#fff" strokeWidth={2} />
          </TouchableOpacity>

          {/* Hero info block */}
          <View style={{ position: 'absolute', bottom: 26, left: 22, right: 22 }}>
            <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase', color: '#fff', opacity: 0.85 }}>
              RELATÓRIO DE IMPACTO
            </Text>
            <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <ScoreRing score={result.meal_score} size={86} fontReg={fontReg} fontItalic={fontItalic} />
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* Frosted label badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.28)', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 100 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 99, backgroundColor: '#FB7B6B' }} />
                  <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.2, color: '#fff' }}>{result.meal_label.toUpperCase()}</Text>
                </View>
                {/* meal_name: Regular (non-italic) per design reference */}
                <Text style={{ marginTop: 10, fontSize: 22, fontFamily: fontReg, color: '#fff', letterSpacing: -0.4, lineHeight: 26.4 }}>
                  {result.meal_name}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Summary — Regular per design reference */}
        <View style={{ paddingHorizontal: 22, paddingTop: 32 }}>
          <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase', color: 'rgba(43,39,36,0.55)' }}>RESUMO</Text>
          <Text style={{ marginTop: 14, fontSize: 14, lineHeight: 21.7, fontFamily: fontReg, color: '#2B2724', letterSpacing: -0.1 }}>
            {result.meal_summary}
          </Text>
        </View>

        {/* Highlights */}
        {result.highlights.length > 0 && (
          <View style={{ paddingHorizontal: 22, paddingTop: 32 }}>
            <CollapsibleSection
              title="Pontos Positivos"
              count={result.highlights.length}
              kind="positive"
              items={result.highlights}
              fontReg={fontReg}
              renderRow={(h, i) => <HighlightRow key={i}>{h}</HighlightRow>}
            />
          </View>
        )}

        {/* Watch out */}
        {result.watch_out.length > 0 && (
          <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
            <CollapsibleSection
              title="Pontos de Atenção"
              count={result.watch_out.length}
              kind="attention"
              items={result.watch_out}
              fontReg={fontReg}
              renderRow={(h, i) => <WatchOutRow key={i}>{h}</WatchOutRow>}
            />
          </View>
        )}

        {/* Foods */}
        <View style={{ paddingHorizontal: 22, paddingTop: 36 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase', color: 'rgba(43,39,36,0.55)' }}>ALIMENTOS IDENTIFICADOS</Text>
            <Text style={{ fontSize: 11, color: 'rgba(43,39,36,0.35)' }}>
              {result.foods.length} itens · toque para abrir
            </Text>
          </View>
          {/* Italic per design reference */}
          <Text style={{ marginTop: 12, marginBottom: 18, fontSize: 26, fontFamily: fontItalic, color: '#2B2724', letterSpacing: -0.5, lineHeight: 28.6 }}>
            cada ingrediente, decifrado.
          </Text>
          <View style={{ gap: 10 }}>
            {result.foods.map((f, i) => (
              <FoodCard key={i} food={f} defaultOpen={i === 0} fontItalic={fontItalic} />
            ))}
          </View>
        </View>

        {/* Science note — Italic per design reference */}
        {!!result.science_note && (
          <View style={{ paddingHorizontal: 22, paddingTop: 36 }}>
            <View style={{ paddingHorizontal: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                <Text style={{ fontSize: 32, fontFamily: fontItalic, color: '#FB7B6B', letterSpacing: -1, lineHeight: 36 }}>—</Text>
                <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 2.4, textTransform: 'uppercase', color: '#FB7B6B' }}>você sabia</Text>
                <View style={{ flex: 1, height: 0.5, backgroundColor: 'rgba(251,123,107,0.4)' }} />
              </View>
              <Text style={{ fontSize: 22, fontFamily: fontItalic, color: '#2B2724', letterSpacing: -0.5, lineHeight: 29.7 }}>
                {result.science_note}
              </Text>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Floating CTA — gradient is non-interactive, button receives touches */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 130 }}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', '#fff']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1 }}
        />
      </View>
      <View style={{ position: 'absolute', left: 22, right: 22, bottom: 24 + insets.bottom }}>
        <TouchableOpacity
          onPress={() => { setSelectedFoodResult(null); router.replace('/(app)/home' as any); }}
          activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FB7B6B', borderRadius: 100, paddingVertical: 17, shadowColor: '#FB7B6B', shadowOpacity: 0.188, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: -0.075 }}>Voltar para tela inicial</Text>
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
