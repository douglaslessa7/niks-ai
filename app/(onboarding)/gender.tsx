import { useState } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { OptionCard } from '../../components/ui/OptionCard';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const genders = ['Masculino', 'Feminino', 'Outro'];

export default function Gender() {
  const [selected, setSelected] = useState<string | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();

  const handleSelect = (gender: string) => {
    setSelected(gender);
    setOnboardingField('genero', gender); // 👈 adicionar
  };

  return (
    <QuizLayout progress={16}>
      <View className="pt-8 flex-1">
        <View className="mb-12">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Qual seu gênero?
          </Text>
        </View>

        <View className="gap-3 mb-8">
          {genders.map((gender) => (
            <OptionCard
              key={gender}
              selected={selected === gender}
              onPress={() => handleSelect(gender)} // 👈 trocar
            >
              {gender}
            </OptionCard>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton
              text="Continuar"
              to="/(onboarding)/birthday"
              disabled={!selected}
              onPress={() => track('onboarding_step_completed', { step_number: 3, step_name: 'Gênero', step_total: 23 })}
            />
        </View>
      </View>
    </QuizLayout>
  );
}
