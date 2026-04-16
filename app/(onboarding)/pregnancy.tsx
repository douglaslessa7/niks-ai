// SQL to run in Supabase Dashboard:
// ALTER TABLE users ADD COLUMN IF NOT EXISTS pregnancy_status text;

import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { OptionCard } from '../../components/ui/OptionCard';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

type PregnancyStatus = 'none' | 'pregnant' | 'breastfeeding' | 'trying';

const options: { label: string; value: PregnancyStatus }[] = [
  { label: 'Nenhuma das anteriores', value: 'none' },
  { label: 'Estou grávida', value: 'pregnant' },
  { label: 'Estou amamentando', value: 'breastfeeding' },
  { label: 'Estou tentando engravidar', value: 'trying' },
];

export default function Pregnancy() {
  const [selected, setSelected] = useState<PregnancyStatus | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_name: 'pregnancy' });
  }, []);

  const handleSelect = (value: PregnancyStatus) => {
    setSelected(value);
    setOnboardingField('pregnancy_status', value);
  };

  return (
    <QuizLayout progress={20}>
      <View className="pt-8 flex-1">
        <View className="mb-12">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            IMPORTANTE
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">
            {'Alguns ativos do protocolo precisam ser evitados em certas situações, '}
            <Text style={{ color: '#FB7B6B' }}>por favor, selecione a que se aplica a você:</Text>
          </Text>
        </View>

        <View className="gap-3 mb-8">
          {options.map(({ label, value }, index) => (
            <OptionCard
              key={value}
              index={index}
              selected={selected === value}
              onPress={() => handleSelect(value)}
            >
              {label}
            </OptionCard>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton
            text="Continuar"
            to="/(onboarding)/birthday"
            disabled={!selected}
            onPress={() => track('onboarding_step_completed', { step_name: 'pregnancy' })}
          />
        </View>
      </View>
    </QuizLayout>
  );
}
