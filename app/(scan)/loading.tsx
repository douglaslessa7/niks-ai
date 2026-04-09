import { useEffect, useState, useRef } from 'react';
import { View, Text, Animated, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  const { skinImageBase64, skinImageUri, onboarding, setScanResult } = useAppStore();
  const { track } = useMixpanel();

  const [percentage, setPercentage] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const retryCount = useRef(0);

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 15, step_name: 'Analisando Pele', step_total: 23 });
    retryCount.current = 0;

    // Progresso visual — dura ~7s
    const percentInterval = setInterval(() => {
      setPercentage((prev) => {
        if (prev >= 95) { clearInterval(percentInterval); return 95; }
        return prev + 1;
      });
    }, 70);

    steps.forEach((step, index) => {
      setTimeout(() => setCurrentStep(index + 1), step.delay);
    });

    // Chama a Edge Function
    const runAnalysis = async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token ?? SUPABASE_ANON_KEY;
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/analyze-skin`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              imageBase64: skinImageBase64,
              skinProfile: {
                skin_type: onboarding.skin_type,
                concerns: onboarding.concerns,
              },
            }),
          }
        );
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(JSON.stringify(errBody));
        }
        const data = await response.json();

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
          router.push('/(scan)/rate-us');
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
          clearInterval(percentInterval);
          Alert.alert(
            'Erro na análise',
            'Não foi possível analisar sua pele. Tente novamente.',
            [{ text: 'OK', onPress: () => router.back() }]
          );
        }
      }
    };

    runAnalysis();

    return () => clearInterval(percentInterval);
  }, []);

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
      </View>
    </SafeAreaView>
  );
}
