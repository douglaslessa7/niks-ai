import { useState } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { OptionCard } from '../../components/ui/OptionCard';

const sunscreenOptions = ['Sim, sempre', 'Na maioria dos dias', 'Raramente', 'Nunca'];

export default function Sunscreen() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <QuizLayout progress={52}>
      <View className="pt-8 flex-1">
        <View className="mb-12">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Você usa protetor solar diariamente?
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">
            Proteção solar previne 90% do envelhecimento visível.
          </Text>
        </View>

        <View className="gap-3 mb-8">
          {sunscreenOptions.map((option) => (
            <OptionCard
              key={option}
              selected={selected === option}
              onPress={() => setSelected(option)}
            >
              {option}
            </OptionCard>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton text="Continuar" to="/(onboarding)/social-proof" disabled={!selected} />
        </View>
      </View>
    </QuizLayout>
  );
}
