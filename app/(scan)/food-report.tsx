import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Line, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { Canvas, Circle as SkiaCircle, RadialGradient, vec, BlurMask } from '@shopify/react-native-skia';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { useFonts } from 'expo-font';
import { Lato_400Regular_Italic, Lato_400Regular } from '@expo-google-fonts/lato';
import { Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';

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

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM = '#FFFFFF';
const PINK = '#FF9D9D';           // rosa padrão do app (design da tela de carregamento de produto)
const PINK_SOFT = '#FFC9C9';      // parada clara do gradiente do arco

const RING_SIZE = 250;
const RING_STROKE = 8;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const WHITE_D = RING_SIZE - 30;   // disco branco central (dentro do anel)

// Frases que rodam abaixo do círculo conforme a análise da refeição avança.
const FOOD_PHASES = [
  'Identificando os alimentos',
  'Avaliando os macronutrientes',
  'Analisando o índice glicêmico',
  'Verificando inflamação e oxidação',
  'Cruzando com o seu perfil de pele',
  'Calculando o impacto na sua pele',
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
          onPress={() => { haptics.tap(); setOpen(o => !o); }}
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

function FoodCard({ food, defaultOpen = false, fontItalic, fontReg, latoRegular }: {
  food: FoodItem;
  defaultOpen?: boolean;
  fontItalic: string | undefined;
  fontReg: string | undefined;
  latoRegular: string | undefined;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const swatch = impactSwatchConfig[food.impact] ?? impactSwatchConfig.neutro;

  return (
    <View style={{ borderRadius: 22, backgroundColor: '#fff', shadowColor: '#2B2724', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
      <View style={{ borderRadius: 22, borderWidth: 0.5, borderColor: 'rgba(43,39,36,0.06)', overflow: 'hidden' }}>
      <TouchableOpacity
        onPress={() => { haptics.tap(); setOpen(o => !o); }}
        activeOpacity={0.8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingHorizontal: 18 }}
      >
        {/* Colored dot with ring (replicates box-shadow: 0 0 0 4px ${swatch}33) */}
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: swatch + '33', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: swatch }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 18, fontFamily: fontReg, color: '#2B2724', letterSpacing: -0.3 }}>{food.name}</Text>
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
              <Text style={{ marginTop: 10, fontSize: 15, fontFamily: fontReg, color: '#2B2724', letterSpacing: -0.15, lineHeight: 21.75 }}>{food.substitution}</Text>
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
  const { foodImageBase64, foodImageMimeType, onboarding, selectedFoodResult, setSelectedFoodResult, selectedFoodImageUrl, setSelectedFoodImageUrl } = useAppStore();
  const { track } = useMixpanel();
  const [result, setResult] = useState<FoodAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const apiDoneRef = useRef(false);
  const analyzingRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentProgressRef = useRef(0);
  const [showDemandNotice, setShowDemandNotice] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const demandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const haloAnim = useRef(new Animated.Value(1)).current;
  const phraseFadeAnim = useRef(new Animated.Value(1)).current;

  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Regular': require('../../assets/fonts/PlayfairDisplay-Regular.ttf'),
    'PlayfairDisplay-Italic':  require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
    'Lato-Italic':             Lato_400Regular_Italic,
    'Lato-Regular':            Lato_400Regular,
    Nunito_800ExtraBold,
    Nunito_700Bold,
    Nunito_600SemiBold,
  });
  const fontItalic  = fontsLoaded ? 'PlayfairDisplay-Italic'  : undefined;
  const fontReg     = fontsLoaded ? 'PlayfairDisplay-Regular' : undefined;
  const latoItalic  = fontsLoaded ? 'Lato-Italic'            : undefined;
  const latoRegular = fontsLoaded ? 'Lato-Regular'           : undefined;
  const fExtra      = fontsLoaded ? 'Nunito_800ExtraBold'    : undefined;
  const fBold       = fontsLoaded ? 'Nunito_700Bold'         : undefined;
  const fSemi       = fontsLoaded ? 'Nunito_600SemiBold'     : undefined;

  useEffect(() => {
    const tickProgress = () => {
      const current = currentProgressRef.current;
      if (current >= 99 || apiDoneRef.current) return;
      let delay: number;
      if (current < 60) delay = 90;
      else if (current < 75) delay = 220;
      else if (current < 85) delay = 500;
      else if (current < 92) delay = 1200;
      else if (current < 96) delay = 3500;
      else delay = 8000;
      progressTimerRef.current = setTimeout(() => {
        const next = current + 1;
        currentProgressRef.current = next;
        setProgress(next);
        tickProgress();
      }, delay);
    };
    tickProgress();
    return () => { if (progressTimerRef.current) clearTimeout(progressTimerRef.current); };
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

  // 1. Halo pulsante suave atrás do círculo (respiro) — igual ao product-loading.tsx
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(haloAnim, { toValue: 1.1, duration: 1400, useNativeDriver: true }),
      Animated.timing(haloAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
    ])).start();
  }, []);

  // 2. Anima o arco de progresso a cada mudança de porcentagem.
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 450,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const phraseIdx = Math.min(FOOD_PHASES.length - 1, Math.floor(progress / (100 / FOOD_PHASES.length)));

  // 3. Fade da frase quando muda de fase.
  useEffect(() => {
    phraseFadeAnim.setValue(0);
    Animated.timing(phraseFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [phraseIdx]);

  const analyzeFood = async () => {
    if (analyzingRef.current) return;
    analyzingRef.current = true;
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
      analyzingRef.current = false;
    } finally {
      apiDoneRef.current = true;
      setProgress(100);
      await new Promise((r) => setTimeout(r, 400));
      setLoading(false);
    }
  };

  const ringOffsetAnim = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [RING_C, 0],
  });

  // ─── Loading state ─────────────────────────────────────────────
  // Mesmo design da tela de carregamento do scan de PRODUTO (círculo grande +
  // porcentagem no centro), com a copy adaptada para a análise da refeição.

  if (loading) {
    const currentPhrase = FOOD_PHASES[phraseIdx];
    const pct = Math.floor(progress);
    return (
      <View style={{ flex: 1, backgroundColor: CREAM }}>
        {/* Véu de fundo — leve gradiente rosa no topo, dissolvendo no branco */}
        <LinearGradient
          colors={['#FFF1F2', '#FFF8F8', '#FFFFFF']}
          locations={[0, 0.4, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

            {/* Aviso de alta demanda */}
            {showDemandNotice && (
              <View style={{
                marginHorizontal: 24, marginTop: 12,
                backgroundColor: PINK, borderRadius: 16, padding: 13,
                flexDirection: 'row', alignItems: 'flex-start', gap: 9,
              }}>
                <View style={{ marginTop: 1, flexShrink: 0 }}>
                  <Svg width={16} height={16} viewBox="0 0 16 16">
                    <Path d="M4 2h8v2.5C12 6.5 9.5 8 8 8C6.5 8 4 6.5 4 4.5V2z" stroke="white" strokeWidth={1.3} strokeLinejoin="round" fill="none" />
                    <Path d="M4 14h8v-2.5C12 9.5 9.5 8 8 8C6.5 8 4 9.5 4 11.5V14z" stroke="white" strokeWidth={1.3} strokeLinejoin="round" fill="none" />
                    <Line x1={3} y1={2} x2={13} y2={2} stroke="white" strokeWidth={1.3} strokeLinecap="round" />
                    <Line x1={3} y1={14} x2={13} y2={14} stroke="white" strokeWidth={1.3} strokeLinecap="round" />
                  </Svg>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fBold, fontSize: 13, color: '#FFFFFF', marginBottom: 3 }}>
                    Estamos com alta demanda agora
                  </Text>
                  {countdownPaused ? (
                    <Text style={{ fontFamily: fSemi, fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                      Por favor, aguarde só mais um pouco.
                    </Text>
                  ) : (
                    <Text style={{ fontFamily: fSemi, fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                      O impacto da sua refeição na pele está sendo calculado. Por favor, aguarde só mais{' '}
                      <Text style={{ fontFamily: fBold }}>{countdown}s</Text>.
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Círculo central com a porcentagem */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{
                width: RING_SIZE + 44, height: RING_SIZE + 44,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {/* Anel decorativo externo (hairline rosa) */}
                <View style={{
                  position: 'absolute',
                  width: RING_SIZE + 44, height: RING_SIZE + 44,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(255,157,157,0.18)',
                }} />

                {/* Halo pulsante suave */}
                <Animated.View style={{
                  position: 'absolute',
                  width: RING_SIZE, height: RING_SIZE,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,157,157,0.10)',
                  transform: [{ scale: haloAnim }],
                }} />

                {/* Disco branco central (card flutuante) */}
                <View style={{
                  position: 'absolute',
                  width: WHITE_D, height: WHITE_D,
                  borderRadius: 999,
                  backgroundColor: '#FFFFFF',
                  shadowColor: PINK,
                  shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: 0.28,
                  shadowRadius: 28,
                  elevation: 10,
                }} />

                {/* Anel de progresso */}
                <Svg
                  width={RING_SIZE} height={RING_SIZE}
                  style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
                >
                  <Defs>
                    <SvgLinearGradient id="fdRing" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0%" stopColor={PINK_SOFT} />
                      <Stop offset="100%" stopColor={PINK} />
                    </SvgLinearGradient>
                  </Defs>
                  {/* Trilho de fundo */}
                  <Circle
                    cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                    stroke="rgba(29,58,68,0.06)" strokeWidth={RING_STROKE} fill="none"
                  />
                  {/* Arco preenchido */}
                  <AnimatedCircle
                    cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                    stroke="url(#fdRing)" strokeWidth={RING_STROKE} fill="none"
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    strokeDashoffset={ringOffsetAnim}
                  />
                </Svg>

                {/* Número da porcentagem */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                  <Text style={{
                    fontFamily: fExtra, fontSize: 86, color: DEEP,
                    letterSpacing: -3, lineHeight: 92,
                  }}>
                    {pct}
                  </Text>
                  <Text style={{
                    fontFamily: fBold, fontSize: 28, color: DEEP,
                    letterSpacing: -1, marginBottom: 16, marginLeft: 2,
                  }}>
                    %
                  </Text>
                </View>
              </View>

              {/* Legenda rotativa (fase atual) */}
              <Animated.View style={{ opacity: phraseFadeAnim, marginTop: 44, paddingHorizontal: 24 }}>
                <Text style={{
                  fontFamily: fSemi, fontSize: 17, color: DEEP_SOFT,
                  letterSpacing: -0.2, textAlign: 'center',
                }}>
                  {currentPhrase}
                </Text>
              </Animated.View>

              {/* Subtexto fixo tranquilizador */}
              <Text style={{
                fontFamily: fSemi, fontSize: 13.5, color: 'rgba(29,58,68,0.38)',
                letterSpacing: -0.1, textAlign: 'center', marginTop: 10, paddingHorizontal: 32,
              }}>
                Isso leva só alguns segundos. Não feche o app.
              </Text>
            </View>

          </View>
        </SafeAreaView>
      </View>
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
          onPress={() => { haptics.action(); analyzeFood(); }}
          style={{ backgroundColor: '#FB7B6B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Tentar novamente</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ─── Result state ──────────────────────────────────────────────

  // When opened from history, selectedFoodResult is set and we use the stored image_url.
  // When coming fresh from a scan, selectedFoodImageUrl is null and foodImageBase64 holds the camera capture.
  const photoSource = selectedFoodResult
    ? (selectedFoodImageUrl ? { uri: selectedFoodImageUrl } : null)
    : (foodImageBase64 ? { uri: `data:${foodImageMimeType ?? 'image/jpeg'};base64,${foodImageBase64}` } : null);

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
            onPress={() => { haptics.tap(); setSelectedFoodResult(null); setSelectedFoodImageUrl(null); router.back(); }}
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
          <Text style={{ marginTop: 12, marginBottom: 18, fontSize: 26, fontFamily: fontReg, color: '#2B2724', letterSpacing: -0.5, lineHeight: 28.6 }}>
            {'Cada ingrediente, '}
            <Text style={{ fontFamily: fontItalic, color: '#FB7B6B' }}>decifrado.</Text>
          </Text>
          <View style={{ gap: 10 }}>
            {result.foods.map((f, i) => (
              <FoodCard key={i} food={f} defaultOpen={i === 0} fontItalic={fontItalic} fontReg={fontReg} latoRegular={latoRegular} />
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
              <Text style={{ fontSize: 22, fontFamily: fontReg, color: '#2B2724', letterSpacing: -0.5, lineHeight: 29.7 }}>
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
          onPress={() => { haptics.tap(); setSelectedFoodResult(null); setSelectedFoodImageUrl(null); router.replace('/(app)/home' as any); }}
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
