import { useState } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { Pill } from '../../components/ui/Pill';
import { useAppStore } from '../../store/onboarding';

const concerns = [
  'Acne', 'Manchas', 'Oleosidade', 'Rugas',
  'Poros dilatados', 'Olheiras', 'Ressecamento', 'Textura irregular',
];

export default function Concerns() {
  const [selected, setSelected] = useState<string[]>([]);
  const { setOnboardingField } = useAppStore();

  const toggle = (item: string) => {
    setSelected((prev) => {
      const next = prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item];
      setOnboardingField('concerns', next);
      return next;
    });
  };

  return (
    <QuizLayout progress={8}>
      <View className="pt-8 flex-1">
        <View className="mb-10">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Qual é a sua principal preocupação de pele?
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">Selecione todas que se aplicam.</Text>
        </View>

        <View className="flex-row flex-wrap gap-2 mb-8">
          {concerns.map((item) => (
            <Pill
              key={item}
              selected={selected.includes(item)}
              onPress={() => toggle(item)}
            >
              {item}
            </Pill>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton text="Continuar" to="/(onboarding)/gender" disabled={selected.length === 0} />
        </View>
      </View>
    </QuizLayout>
  );
}
