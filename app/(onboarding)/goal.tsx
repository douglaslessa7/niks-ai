import { useState } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { OptionCard } from '../../components/ui/OptionCard';

const goals = [
  'Pele mais jovem',
  'Pele mais limpa',
  'Glow natural',
  'Controlar acne',
  'Rotina simplificada',
];

export default function Goal() {
  const [selected, setSelected] = useState<string | null>(null);

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
              onPress={() => setSelected(goal)}
            >
              {goal}
            </OptionCard>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton text="Continuar" to="/(onboarding)/final-loading" disabled={!selected} />
        </View>
      </View>
    </QuizLayout>
  );
}
