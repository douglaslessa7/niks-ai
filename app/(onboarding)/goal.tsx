import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { OptionCard } from '../../components/ui/OptionCard';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const goals = [
  'Pele mais jovem',
  'Pele mais limpa',
  'Glow natural',
  'Controlar acne',
  'Rotina simplificada',
];

export default function Goal() {
  const [selected, setSelected] = useState<string | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 18, step_name: 'Objetivo Principal', step_total: 23 });
  }, []);

  return (
    <QuizLayout progress={80}>
      <View className="pt-8 flex-1">
        <View className="mb-10">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Qual seu objetivo principal?
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">
            Perfeito. Seu protocolo está quase pronto.
          </Text>
        </View>

        <View className="gap-3 mb-8">
          {goals.map((goal) => (
            <OptionCard
              key={goal}
              selected={selected === goal}
              onPress={() => { setSelected(goal); setOnboardingField('objetivo', goal); }}
            >
              {goal}
            </OptionCard>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton
              text="Continuar"
              to="/(onboarding)/final-loading"
              disabled={!selected}
              onPress={() => track('onboarding_step_completed', { step_number: 18, step_name: 'Objetivo Principal', step_total: 23 })}
            />
        </View>
      </View>
    </QuizLayout>
  );
}
