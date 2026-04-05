import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

export default function Commitment() {
  const { track } = useMixpanel();

  return (
    <QuizLayout progress={64}>
      <View className="pt-8 flex-1 px-6">
        <View className="items-center mb-16">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight text-center mb-6">
            Ter a pele que você merece é um objetivo{' '}
            <Text style={{ color: '#FF9B8A' }}>realista</Text>.
          </Text>
          <Text className="text-[17px] text-[#9CA3AF] leading-relaxed text-center">
            92% dos nossos usuários com perfil similar atingem seus objetivos.
          </Text>
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton
              text="Continuar"
              to="/(scan)/scan-prep"
              onPress={() => track('onboarding_step_completed', { step_number: 12, step_name: 'Compromisso', step_total: 23 })}
            />
        </View>
      </View>
    </QuizLayout>
  );
}
