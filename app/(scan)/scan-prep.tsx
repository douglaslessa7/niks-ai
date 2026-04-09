import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { AIConsentModal } from '../../components/ui/AIConsentModal';
import { useAIConsent } from '../../hooks/useAIConsent';
import { Sun, Sparkles, User } from 'lucide-react-native';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const instructions = [
  { Icon: Sun, text: 'Boa iluminação natural' },
  { Icon: Sparkles, text: 'Rosto limpo, sem maquiagem' },
  { Icon: User, text: 'Cabelo preso para trás' },
];

export default function ScanPrep() {
  const router = useRouter();
  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 13, step_name: 'Análise com IA', step_total: 23 });
  }, []);

  return (
    <>
      <QuizLayout progress={68} showBack>
        <View className="pt-8 flex-1">
          {/* Heading */}
          <View className="mb-10">
            <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
              Agora vamos analisar sua pele com IA
            </Text>
            <Text className="text-[#9CA3AF] text-[17px]">Para melhores resultados:</Text>
          </View>

          {/* Instructions */}
          <View className="gap-6 mb-8">
            {instructions.map(({ Icon, text }, index) => (
              <View key={index} className="flex-row items-center gap-4">
                <View className="w-12 h-12 rounded-full bg-[#F5F5F7] items-center justify-center flex-shrink-0">
                  <Icon size={20} color="#1A1A1A" />
                </View>
                <Text className="text-[17px] text-[#1A1A1A]">{text}</Text>
              </View>
            ))}
          </View>

          <View className="flex-1" />

          <View className="pb-8">
            <CTAButton
              text="Abrir câmera"
              onPress={() => {
                track('onboarding_step_completed', { step_number: 13, step_name: 'Análise com IA', step_total: 23 });
                requestConsent(() => router.push('/(scan)/camera' as any));
              }}
            />
          </View>
        </View>
      </QuizLayout>

      <AIConsentModal
        visible={consentModalVisible}
        onAccept={handleAccept}
        onDecline={handleDecline}
      />
    </>
  );
}
