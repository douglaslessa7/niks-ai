import { useEffect } from 'react';
import { View, Text, Image } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { Lock } from 'lucide-react-native';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

export default function Trust() {
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 20, step_name: 'Obrigado por Confiar', step_total: 23 });
  }, []);

  return (
    <QuizLayout progress={88}>
      <View className="flex-1 items-center px-6 pt-10">
        {/* Illustration */}
        <View className="mb-10 relative items-center justify-center">
          {/* Subtle circle behind */}
          <View
            style={{
              position: 'absolute',
              width: 192,
              height: 192,
              borderRadius: 96,
              backgroundColor: 'rgba(204,251,241,0.4)',
            }}
          />
          {/* Hands image */}
          <Image
            source={require('../../assets/trust-hands.png')}
            style={{ width: 200, height: 200, borderRadius: 100 }}
            resizeMode="cover"
          />
        </View>

        {/* Main Text */}
        <View className="items-center mb-10">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight text-center mb-4">
            Obrigado por confiar em nós
          </Text>
          <Text className="text-[17px] text-[#9CA3AF] text-center">
            Agora vamos personalizar NIKS AI para você...
          </Text>
        </View>

        {/* Privacy Card */}
        <View className="bg-[#F5F5F7] rounded-[16px] p-4 mb-12 flex-row items-start gap-3">
          <View className="w-6 h-6 items-center justify-center mt-0.5">
            <Lock size={20} color="#1A1A1A" />
          </View>
          <Text className="flex-1 text-[15px] text-[#1A1A1A] leading-relaxed">
            Sua privacidade e segurança são nossa prioridade. Suas fotos nunca serão compartilhadas.
          </Text>
        </View>

        <View className="flex-1" />

        <View className="pb-8 w-full">
          <CTAButton
              text="Continuar"
              to="/(onboarding)/plan-preview"
              onPress={() => track('onboarding_step_completed', { step_number: 20, step_name: 'Obrigado por Confiar', step_total: 23 })}
            />
        </View>
      </View>
    </QuizLayout>
  );
}
