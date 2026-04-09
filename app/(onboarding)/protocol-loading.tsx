import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePlacement } from 'expo-superwall';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAppStore, ProtocolResult, ScanResult } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';


const steps = [
  { label: 'Salvando seus dados de análise', delay: 600 },
  { label: 'Identificando padrões da sua pele', delay: 1400 },
  { label: 'Gerando recomendações personalizadas', delay: 2400 },
  { label: 'Organizando seu protocolo de cuidados', delay: 3400 },
];

const TOTAL_DURATION = 5500;

export default function ProtocolLoading() {
  const router = useRouter();
  const { registerPlacement } = usePlacement();
  const { scanResult, onboarding, skinScanId, setProtocolResult, setScanResult } = useAppStore();
  const { track } = useMixpanel();

  const [percentage, setPercentage] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [statusText, setStatusText] = useState('Salvando e organizando o seu protocolo...');
  const [apiDone, setApiDone] = useState(false);
  const apiDoneRef = useRef(false);

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

  // Fase 3: quando API terminar, ir a 100% e navegar
  useEffect(() => {
    if (!apiDone) return;
    setPercentage(100);
    const t = setTimeout(async () => {
      await registerPlacement({ placement: 'paywall_onboarding' });
      router.replace('/(onboarding)/notifications');
    }, 400);
    return () => clearTimeout(t);
  }, [apiDone]);

  useEffect(() => {
    // Fase 1 (0→90%): animação rápida em TOTAL_DURATION ms
    // Fase 2 (90→98%): crawl muito lento enquanto API não terminou
    const increment = 90 / (TOTAL_DURATION / 50);
    const percentInterval = setInterval(() => {
      if (apiDoneRef.current) {
        clearInterval(percentInterval);
        return;
      }
      setPercentage((prev) => {
        if (prev >= 98) return 98;
        if (prev >= 90) return prev + 0.03;
        return Math.min(prev + increment, 90);
      });
    }, 50);

    // Progressão dos steps
    steps.forEach((step, index) => {
      setTimeout(() => setCurrentStep(index + 1), step.delay);
    });

    // Mudar status text no meio
    setTimeout(() => {
      setStatusText('Gerando seu protocolo personalizado com IA...');
    }, 2500);

    // Iniciar chamada à Edge Function
    generateAndSaveProtocol();

    return () => clearInterval(percentInterval);
  }, []);

  const generateAndSaveProtocol = async () => {
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

          data = await response.json();
          lastError = null;
          break;
        } catch (fetchErr: any) {
          lastError = fetchErr;
          break;
        }
      }

      if (lastError) {
        console.error('generate-protocol error:', lastError.message);
        track('protocol_failed', { error: lastError.message ?? 'unknown' });
        return;
      }

      // Salvar no store para a aba Protocolo usar sem regenerar
      setProtocolResult(data);
      track('protocol_generated');

      // Montar dicas
      const dicas: string[] = [];
      if (data.introduction_warnings) dicas.push(data.introduction_warnings);
      if (data.expected_timeline?.two_weeks) dicas.push(data.expected_timeline.two_weeks);
      if (data.expected_timeline?.one_month) dicas.push(data.expected_timeline.one_month);
      if (data.expected_timeline?.three_months) dicas.push(data.expected_timeline.three_months);

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
        {/* Ícone com gradiente */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <LinearGradient
            colors={['#FB7B6B', '#2A7C6F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
          />
        </View>

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
      </View>
    </SafeAreaView>
  );
}
