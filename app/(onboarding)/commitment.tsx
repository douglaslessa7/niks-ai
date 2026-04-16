import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

export default function Commitment() {
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 12, step_name: 'Compromisso', step_total: 23 });
  }, []);

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.3, 0.6, 1]}
      style={{ flex: 1 }}
    >
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
                to="/(onboarding)/goal"
                onPress={() => track('onboarding_step_completed', { step_number: 12, step_name: 'Compromisso', step_total: 23 })}
              />
            </View>
          </View>
      </QuizLayout>
    </LinearGradient>
  );
}
