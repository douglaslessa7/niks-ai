import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePlacement } from 'expo-superwall';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAppStore, ProtocolResult } from '../../store/onboarding';
import { BASE_PROTOCOLS } from '../../constants/protocols';


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
  const { scanResult, onboarding, skinScanId, setProtocolResult } = useAppStore();

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
      if (!scanResult) return;

      const skinType = scanResult.skin_type_detected ?? 'normal'
      const baseProtocol = BASE_PROTOCOLS[skinType] ?? BASE_PROTOCOLS['normal']

      const { data, error } = await supabase.functions.invoke('generate-protocol', {
        body: { baseProtocol, scanResult, onboardingData: onboarding },
      });

      if (error) {
        const body = await (error as any).context?.json?.().catch(() => null);
        console.error('generate-protocol error:', error.message, body ? JSON.stringify(body) : '');
        return;
      }

      // Salvar no store para a aba Protocolo usar sem regenerar
      setProtocolResult(data);

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
