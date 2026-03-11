import { useState } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { OptionCard } from '../../components/ui/OptionCard';
import { useAppStore } from '../../store/onboarding';

const exposureOptions = [
  'Quase nenhuma',
  'Leve — menos de 1h',
  'Moderada — 1 a 3h',
  'Alta — mais de 3h',
];

export default function SunExposure() {
  const [selected, setSelected] = useState<string | null>(null);
  const { setOnboardingField } = useAppStore();

  return (
    <QuizLayout progress={40}>
      <View className="pt-8 flex-1">
        <View className="mb-12">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Qual seu nível de exposição solar diária?
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">Sol é o fator #1 de envelhecimento precoce.</Text>
        </View>

        <View className="gap-3 mb-8">
          {exposureOptions.map((option) => (
            <OptionCard
              key={option}
              selected={selected === option}
              onPress={() => { setSelected(option); setOnboardingField('sun_exposure', option); }}
            >
              {option}
            </OptionCard>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton text="Continuar" to="/(onboarding)/hydration-sleep" disabled={!selected} />
        </View>
      </View>
    </QuizLayout>
  );
}
