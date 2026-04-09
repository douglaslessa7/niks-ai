import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { OptionCard } from '../../components/ui/OptionCard';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const skinTypes = [
  { label: 'Oleosa', subtitle: 'Brilho excessivo, poros dilatados' },
  { label: 'Seca', subtitle: 'Descamação, sensação de tensão' },
  { label: 'Mista', subtitle: 'Oleosa na zona T, seca nas bochechas' },
  { label: 'Normal', subtitle: 'Equilibrada, poucos problemas' },
  { label: 'Não sei', subtitle: 'Vamos descobrir juntos' },
];

export default function SkinType() {
  const [selected, setSelected] = useState<string | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 5, step_name: 'Tipo de Pele', step_total: 23 });
  }, []);

  return (
    <QuizLayout progress={32}>
      <View className="pt-8 flex-1">
        <View className="mb-10">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Como você descreveria sua pele?
          </Text>
        </View>

        <View className="gap-3 mb-8">
          {skinTypes.map(({ label, subtitle }) => (
            <OptionCard
              key={label}
              selected={selected === label}
              onPress={() => { setSelected(label); setOnboardingField('skin_type', label); }}
              subtitle={subtitle}
            >
              {label}
            </OptionCard>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton
              text="Continuar"
              to="/(onboarding)/frequency"
              disabled={!selected}
              onPress={() => track('onboarding_step_completed', { step_number: 5, step_name: 'Tipo de Pele', step_total: 23 })}
            />
        </View>
      </View>
    </QuizLayout>
  );
}
