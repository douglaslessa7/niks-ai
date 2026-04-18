import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePlacement } from 'expo-superwall';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useAppStore, ProtocolResult, ScanResult } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';


const steps = [
  { label: 'Salvando seus dados de análise', delay: 600 },
  { label: 'Identificando padrões da sua pele', delay: 1400 },
  { label: 'Gerando recomendações personalizadas', delay: 2400 },
  { label: 'Organizando seu protocolo de cuidados', delay: 3400 },
];

export default function ProtocolLoading() {
  const router = useRouter();
  const { registerPlacement } = usePlacement();
  const { scanResult, onboarding, skinScanId, setProtocolResult, setScanResult } = useAppStore();
  const { track } = useMixpanel();

  const [percentage, setPercentage] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [statusText, setStatusText] = useState('Salvando e organizando o seu protocolo...');
  const [apiDone, setApiDone] = useState(false);
  const [showDemandNotice, setShowDemandNotice] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const [showError, setShowError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiDoneRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPercentageRef = useRef(0);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Spinner sempre rodando
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Animação da barra de progresso
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: percentage,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  const widthInterp = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const demandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (percentage >= 99 && !apiDone) {
      demandTimerRef.current = setTimeout(() => {
        setShowDemandNotice(true);
      }, 3000);
    } else {
      if (demandTimerRef.current) clearTimeout(demandTimerRef.current);
      setShowDemandNotice(false);
    }
    return () => { if (demandTimerRef.current) clearTimeout(demandTimerRef.current); };
  }, [percentage, apiDone]);

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

  // Fase 3: quando API terminar, ir a 100% e navegar
  useEffect(() => {
    if (!apiDone) return;
    setPercentage(100);
    const t = setTimeout(async () => {
      if (__DEV__) {
        router.replace('/(onboarding)/notifications');
        return;
      }
      await registerPlacement({ placement: 'paywall_onboarding' });
      router.replace('/(onboarding)/notifications');
    }, 400);
    return () => clearTimeout(t);
  }, [apiDone]);

  useEffect(() => {
    // Progresso realista — velocidade decresce conforme se aproxima de 100%
    const tickProgress = () => {
      const current = currentPercentageRef.current;
      if (current >= 99) return; // pausa em 99 até a API responder

      let delay: number;
      if (current < 60) delay = 50;
      else if (current < 75) delay = 150;
      else if (current < 85) delay = 400;
      else if (current < 92) delay = 1000;
      else if (current < 96) delay = 3000;
      else delay = 7000;

      progressTimerRef.current = setTimeout(() => {
        const next = current + 1;
        currentPercentageRef.current = next;
        setPercentage(next);
        tickProgress();
      }, delay);
    };
    tickProgress();

    // Progressão dos steps
    steps.forEach((step, index) => {
      setTimeout(() => setCurrentStep(index + 1), step.delay);
    });

    // Mudar status text no meio
    setTimeout(() => {
      setStatusText('Gerando seu protocolo personalizado...');
    }, 2500);

    // Iniciar chamada à Edge Function
    generateAndSaveProtocol();

    return () => { if (progressTimerRef.current) clearTimeout(progressTimerRef.current); };
  }, [retryCount]);

  const generateAndSaveProtocol = async () => {
    setShowError(false);
    try {
      let effectiveScanResult = scanResult;

      if (!effectiveScanResult) {
        console.warn('[protocol-loading] scanResult null no store — buscando do Supabase');
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const { data: latestScan } = await supabase
            .from('skin_scans')
            .select('full_result')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (latestScan?.full_result) {
            effectiveScanResult = latestScan.full_result as ScanResult;
            setScanResult(latestScan.full_result as ScanResult, null);
            console.log('[protocol-loading] scanResult recuperado do Supabase');
          }
        }
        if (!effectiveScanResult) {
          console.error('[protocol-loading] scanResult indisponível — abortando');
          return;
        }
      }

      let data: any = null;
      let lastError: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(
            'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/generate-protocol',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI`,
              },
              body: JSON.stringify({ scanResult: effectiveScanResult, onboardingData: onboarding }),
            }
          );

          if (!response.ok) {
            const errorBody = await response.text();
            const is503 = response.status === 503 || errorBody.includes('UNAVAILABLE') || errorBody.includes('high demand');
            if (is503 && attempt < 3) {
              console.warn(`generate-protocol 503 (tentativa ${attempt}/3), aguardando 3s...`);
              setStatusText('Estamos finalizando sua análise, aguarde um momento...');
              await new Promise(resolve => setTimeout(resolve, 3000));
              continue;
            }
            lastError = new Error(`generate-protocol error: ${response.status} ${errorBody}`);
            break;
          }

          const responseText = await response.text();
          data = JSON.parse(responseText);
          lastError = null;
          break;
        } catch (fetchErr: any) {
          lastError = fetchErr;
          break;
        }
      }

      if (lastError) {
        console.error('generate-protocol error:', lastError.message);
        setShowError(true);
        track('protocol_failed', { error: lastError.message ?? 'unknown' });
        return;
      }

      // Salvar no store para a aba Protocolo usar sem regenerar
      setProtocolResult(data);
      track('protocol_generated');

      // Montar dicas (índices fixos: 0=warnings, 1=2weeks, 2=1month, 3=3months, 4=schedule)
      const dicas = [
        data.introduction_warnings ?? null,
        data.expected_timeline?.two_weeks ?? null,
        data.expected_timeline?.one_month ?? null,
        data.expected_timeline?.three_months ?? null,
        data.introduction_schedule ?? null,
      ];

      // Salvar no Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      const { error: insertError } = await supabase.from('protocolos').insert({
        user_id: user.id,
        skin_scan_id: skinScanId ?? null,
        rotina_am: data.morning,
        rotina_pm: data.night,
        dicas,
      });

      if (insertError) console.error('Erro ao salvar protocolo:', insertError);
    } catch (err) {
      console.error('Erro em generateAndSaveProtocol:', err);
      track('protocol_failed', { error: (err as any)?.message ?? 'unknown' });
    } finally {
      // Sinalizar conclusão independente de sucesso ou erro
      apiDoneRef.current = true;
      setApiDone(true);
    }
  };

  const handleRetry = () => {
    setShowError(false);
    setPercentage(0);
    currentPercentageRef.current = 0;
    setCurrentStep(0);
    setApiDone(false);
    apiDoneRef.current = false;
    setStatusText('Salvando e organizando o seu protocolo...');
    setRetryCount(prev => prev + 1);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View
        style={{
          flex: 1,
          maxWidth: 393,
          width: '100%',
          alignSelf: 'center',
          paddingHorizontal: 24,
          justifyContent: 'center',
        }}
      >
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

        {/* Percentagem */}
        <Text
          style={{
            fontSize: 64,
            fontWeight: '700',
            color: '#1A1A1A',
            textAlign: 'center',
            letterSpacing: -1,
            marginBottom: 12,
          }}
        >
          {Math.floor(percentage)}%
        </Text>

        {/* Status text */}
        <View style={{ alignItems: 'center', marginBottom: 32, paddingHorizontal: 16 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '600',
              color: '#1A1A1A',
              textAlign: 'center',
              lineHeight: 24,
              marginBottom: 8,
            }}
          >
            {statusText}
          </Text>
          <Text style={{ fontSize: 14, color: '#8A8A8E', textAlign: 'center' }}>
            Isso pode levar alguns segundos
          </Text>
        </View>

        {/* Progress bar com gradiente */}
        <View
          style={{
            width: '100%',
            height: 5,
            backgroundColor: '#E5E7EB',
            borderRadius: 999,
            overflow: 'hidden',
            marginBottom: 40,
          }}
        >
          <Animated.View style={{ width: widthInterp, height: '100%' }}>
            <LinearGradient
              colors={['#FB7B6B', '#2A7C6F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: '100%', height: '100%' }}
            />
          </Animated.View>
        </View>

        {/* Checklist */}
        <View style={{ gap: 18 }}>
          {steps.map((step, index) => {
            const isCompleted = currentStep > index;
            const isInProgress = currentStep === index;
            const isPending = currentStep < index;

            return (
              <View
                key={index}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  opacity: isPending ? 0.35 : 1,
                }}
              >
                {/* Ícone do step */}
                <View
                  style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  {isCompleted ? (
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: '#2A7C6F',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Check size={12} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  ) : isInProgress ? (
                    <Animated.View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: '#FB7B6B',
                        borderTopColor: 'transparent',
                        transform: [{ rotate: spin }],
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: '#D1D5DB',
                      }}
                    />
                  )}
                </View>

                {/* Label */}
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: isCompleted || isInProgress ? '500' : '400',
                    color: isCompleted ? '#2A7C6F' : isInProgress ? '#1A1A1A' : '#9CA3AF',
                  }}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
        </>)}

        {showError && (
          <View style={{ width: '100%', alignItems: 'center' }}>

            {/* Banner topo */}
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
                  Não conseguimos gerar seu protocolo
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '400', color: '#FFFFFF', lineHeight: 18 }}>
                  Estamos com alta demanda no momento. Tente novamente em instantes.
                </Text>
              </View>
            </View>

            {/* Rosto triste grande */}
            <Svg width={72} height={72} viewBox="0 0 72 72" style={{ marginBottom: 12 }}>
              <Circle cx={36} cy={36} r={33} stroke="#E24B4A" strokeWidth={3} fill="none"/>
              <Circle cx={24} cy={30} r={4} fill="#E24B4A"/>
              <Circle cx={48} cy={30} r={4} fill="#E24B4A"/>
              <Path d="M24 50 C28 44 44 44 48 50" stroke="#E24B4A" strokeWidth={3} strokeLinecap="round" fill="none"/>
            </Svg>

            {/* Texto */}
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1A1A1A', textAlign: 'center', lineHeight: 24, marginBottom: 8 }}>
              Algo deu errado por aqui...
            </Text>
            <Text style={{ fontSize: 14, color: '#8A8A8E', textAlign: 'center', marginBottom: 32 }}>
              Não se preocupe, seus dados estão salvos
            </Text>

            {/* Botão */}
            <TouchableOpacity
              onPress={handleRetry}
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
