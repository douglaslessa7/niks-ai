import { useEffect, useState, useRef } from 'react';
import { View, Text, Animated, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
import { useAppStore } from '../../store/onboarding';

const steps = [
  { label: 'Textura e poros', delay: 500 },
  { label: 'Hidratação', delay: 1500 },
  { label: 'Oleosidade', delay: 2500 },
  { label: 'Manchas e pigmentação', delay: 3500 },
  { label: 'Sinais de envelhecimento', delay: 4500 },
  { label: 'Score geral da pele', delay: 5500 },
];

export default function Loading() {
  const router = useRouter();
  const { skinImageBase64, skinImageUri, onboarding, setScanResult, scanSource, setSelectedScan } = useAppStore();
  const { track } = useMixpanel();

  const [percentage, setPercentage] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [showDemandNotice, setShowDemandNotice] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const [showError, setShowError] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const retryCount = useRef(0);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPercentageRef = useRef(0);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 15, step_name: 'Analisando Pele', step_total: 23 });
    retryCount.current = 0;

    // Progresso visual — velocidade decresce conforme se aproxima de 100%
    const tickProgress = () => {
      const current = currentPercentageRef.current;
      if (current >= 99) return; // pausa em 99 até a API responder

      let delay: number;
      if (current < 60) delay = 50;
      else if (current < 75) delay = 120;
      else if (current < 85) delay = 300;
      else if (current < 92) delay = 800;
      else if (current < 96) delay = 2500;
      else delay = 6000;

      progressTimerRef.current = setTimeout(() => {
        const next = current + 1;
        currentPercentageRef.current = next;
        setPercentage(next);
        tickProgress();
      }, delay);
    };
    tickProgress();

    steps.forEach((step, index) => {
      setTimeout(() => setCurrentStep(index + 1), step.delay);
    });

    // Chama a Edge Function
    const runAnalysis = async () => {
      try {
        const token = SUPABASE_ANON_KEY;
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/analyze-skin`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              imageBase64: skinImageBase64,
              skinProfile: {
                skin_type: onboarding.skin_type,
                concerns: onboarding.concerns,
                genero: onboarding.genero,
                idade: onboarding.birthday
                  ? Math.floor((Date.now() - new Date(onboarding.birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                  : null,
                sun_exposure: onboarding.sun_exposure,
                hydration: onboarding.hydration,
                sleep: onboarding.sleep,
                sunscreen: onboarding.sunscreen,
                objetivo: onboarding.objetivo,
              },
            }),
          }
        );
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(JSON.stringify(errBody));
        }
        const data = await response.json();

        setSelectedScan(null);
        setScanResult(data, skinImageUri ?? '');
        track('scan_completed', { skin_score: data.skin_score, skin_type: data.skin_type_detected });
        setPercentage(100);

        // Salvar scan no banco ANTES de navegar (garantia de persistência)
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { skinImageBase64: b64 } = useAppStore.getState();
            let fotoUrl = '';
            if (b64) {
              const path = `${user.id}/${Date.now()}.jpg`;
              const binaryStr = atob(b64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const { error: upErr } = await supabase.storage
                .from('scans').upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: false });
              if (!upErr) {
                const { data: signed } = await supabase.storage.from('scans').createSignedUrl(path, 31536000);
                fotoUrl = signed?.signedUrl ?? supabase.storage.from('scans').getPublicUrl(path).data.publicUrl;
              }
            }
            await supabase.from('skin_scans').insert({
              user_id: user.id,
              foto_url: fotoUrl,
              skin_score: data.skin_score,
              tipo_pele: data.skin_type_detected,
              metricas: { acne: data.acne, skin_age: data.skin_age },
              areas_atencao: data.pontos_fracos,
              resumo: data.headline,
              full_result: data,
            });
          }
        } catch (e) {
          console.warn('Failed to save scan to DB:', e);
        }

        setTimeout(() => {
          track('onboarding_step_completed', { step_number: 15, step_name: 'Analisando Pele', step_total: 23 });
          if (scanSource === 'app') {
            router.replace('/(app)/skin-result' as any);
          } else {
            router.push('/(scan)/rate-us');
          }
        }, 500);
      } catch (err) {
        if (retryCount.current < 2) {
          retryCount.current += 1;
          console.warn(`Tentativa ${retryCount.current} falhou, aguardando 2s antes de retry...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          await runAnalysis();
        } else {
          console.error('Erro na análise após retries:', err);
          track('scan_failed', { error: (err as any)?.message ?? 'unknown' });
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
          setShowError(true);
        }
      }
    };

    runAnalysis();

    return () => { if (progressTimerRef.current) clearTimeout(progressTimerRef.current); };
  }, []);

  const demandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (percentage >= 99 && !showError) {
      demandTimerRef.current = setTimeout(() => {
        setShowDemandNotice(true);
      }, 3000);
    } else {
      if (demandTimerRef.current) clearTimeout(demandTimerRef.current);
      setShowDemandNotice(false);
    }
    return () => { if (demandTimerRef.current) clearTimeout(demandTimerRef.current); };
  }, [percentage, showError]);

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
      toValue: percentage,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  const widthInterp = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 justify-center">
        {!showError && (<>
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
                    A rotina de skincare perfeita para sua pele está sendo finalizada. Por favor, aguarde só mais{' '}
                    <Text style={{ fontWeight: '700', color: '#FFFFFF' }}>{countdown}s</Text>.
                  </Text>
                )}
              </View>
            </View>
          )}

          <Text className="text-[64px] font-bold text-[#1A1A1A] text-center tracking-tight mb-4">
            {percentage}%
          </Text>
          <Text className="text-[20px] font-semibold text-[#1A1A1A] text-center mb-8">
            Analisando sua pele...
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
            {steps.map((step, index) => {
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
        </>)}

        {showError && (
          <View style={{ width: '100%', alignItems: 'center' }}>
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
                <Path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="white" strokeWidth={1.4} strokeLinejoin="round" fill="none"/>
                <Line x1={8} y1={6.5} x2={8} y2={10} stroke="white" strokeWidth={1.4} strokeLinecap="round"/>
                <Circle cx={8} cy={11.8} r={0.75} fill="white"/>
              </Svg>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 }}>
                  Não conseguimos analisar sua pele
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '400', color: '#FFFFFF', lineHeight: 18 }}>
                  Estamos com alta demanda no momento. Tente novamente em instantes.
                </Text>
              </View>
            </View>

            <Svg width={72} height={72} viewBox="0 0 72 72" style={{ marginBottom: 12 }}>
              <Circle cx={36} cy={36} r={33} stroke="#E24B4A" strokeWidth={3} fill="none"/>
              <Circle cx={24} cy={30} r={4} fill="#E24B4A"/>
              <Circle cx={48} cy={30} r={4} fill="#E24B4A"/>
              <Path d="M24 50 C28 44 44 44 48 50" stroke="#E24B4A" strokeWidth={3} strokeLinecap="round" fill="none"/>
            </Svg>

            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1A1A1A', textAlign: 'center', lineHeight: 24, marginBottom: 8 }}>
              Algo deu errado por aqui...
            </Text>
            <Text style={{ fontSize: 14, color: '#8A8A8E', textAlign: 'center', marginBottom: 32 }}>
              Tire uma nova foto para tentar novamente
            </Text>

            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                width: '100%',
                backgroundColor: '#FB7B6B',
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
                Tentar novamente
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
