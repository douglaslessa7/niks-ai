import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { AIConsentModal } from '../../components/ui/AIConsentModal';
import { useAIConsent } from '../../hooks/useAIConsent';
import { Sun, Sparkles, User, Glasses, ChevronLeft } from 'lucide-react-native';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';

const instructions = [
  { Icon: Sun, text: 'Boa iluminação natural' },
  { Icon: Sparkles, text: 'Rosto limpo, sem maquiagem' },
  { Icon: User, text: 'Cabelo preso para trás' },
  { Icon: Glasses, text: 'Retire óculos e acessórios do rosto' },
];

const InstructionList = () => (
  <View className="gap-6 mb-8">
    {instructions.map(({ Icon, text }, index) => (
      <View key={index} className="flex-row items-center gap-4">
        <View className="w-12 h-12 rounded-full bg-[#fb7b6b] items-center justify-center flex-shrink-0">
          <Icon size={20} color="#FFFFFF" />
        </View>
        <Text className="text-[17px] text-[#1A1A1A]">{text}</Text>
      </View>
    ))}
  </View>
);

export default function ScanPrep() {
  const router = useRouter();
  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();
  const { track } = useMixpanel();
  const { scanSource } = useAppStore();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 13, step_name: 'Análise com IA', step_total: 23 });
  }, []);

  const handleOpenCamera = () => {
    track('onboarding_step_completed', { step_number: 13, step_name: 'Análise com IA', step_total: 23 });
    requestConsent(() => router.push('/(scan)/camera' as any));
  };

  if (scanSource === 'app') {
    return (
      <>
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-1 max-w-[393px] w-full mx-auto">
            <View className="pt-4 px-6 pb-2">
              <TouchableOpacity
                onPress={() => router.back()}
                className="w-10 h-10 rounded-full bg-[#F5F5F5] items-center justify-center"
                activeOpacity={0.7}
              >
                <ChevronLeft size={20} color="#1A1A1A" />
              </TouchableOpacity>
            </View>
            <View className="px-6 pt-4 flex-1">
              <View className="mb-10">
                <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
                  Agora vamos analisar sua pele por foto
                </Text>
                <Text className="text-[#9CA3AF] text-[17px]">Para melhores resultados:</Text>
              </View>
              <InstructionList />
              <View className="flex-1" />
              <View className="pb-8">
                <CTAButton text="Abrir câmera" onPress={handleOpenCamera} />
              </View>
            </View>
          </View>
        </SafeAreaView>
        <AIConsentModal visible={consentModalVisible} onAccept={handleAccept} onDecline={handleDecline} />
      </>
    );
  }

  return (
    <>
      <QuizLayout progress={68} showBack>
        <View className="pt-8 flex-1">
          <View className="mb-10">
            <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
              Agora vamos analisar sua pele por foto
            </Text>
            <Text className="text-[#9CA3AF] text-[17px]">Para melhores resultados:</Text>
          </View>
          <InstructionList />
          <View className="flex-1" />
          <View className="pb-8">
            <CTAButton text="Abrir câmera" onPress={handleOpenCamera} />
          </View>
        </View>
      </QuizLayout>
      <AIConsentModal visible={consentModalVisible} onAccept={handleAccept} onDecline={handleDecline} />
    </>
  );
}
