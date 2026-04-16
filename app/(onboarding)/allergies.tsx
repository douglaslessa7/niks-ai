// SQL to run in Supabase Dashboard:
// ALTER TABLE users ADD COLUMN IF NOT EXISTS allergy_type text;
// ALTER TABLE users ADD COLUMN IF NOT EXISTS allergy_description text;

import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { OptionCard } from '../../components/ui/OptionCard';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

type AllergyType = 'none' | 'sensitive' | 'reaction';

const options: { label: string; value: AllergyType }[] = [
  { label: 'Não tenho alergias/sensibilidade', value: 'none' },
  { label: 'Tenho pele muito sensível/reativa em geral', value: 'sensitive' },
  { label: 'Já tive reação a algum ativo/produto', value: 'reaction' },
];

export default function Allergies() {
  const [selected, setSelected] = useState<AllergyType | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_name: 'allergies' });
  }, []);

  const handleContinue = () => {
    if (!selected) return;
    setOnboardingField('allergy_type', selected);
    track('onboarding_step_completed', { step_name: 'allergies' });
    if (selected === 'reaction') {
      router.push('/(onboarding)/allergies-detail');
    } else {
      router.push('/(onboarding)/protocol-loading');
    }
  };

  return (
    <QuizLayout progress={92}>
      <View className="pt-8 flex-1">
        <View className="mb-8">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Você tem alguma alergia ou sensibilidade a produtos de skincare?
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">
            Isso garante que nenhum ativo problemático entre no seu protocolo.
          </Text>
        </View>

        <View className="gap-3 mb-6">
          {options.map(({ label, value }, index) => (
            <OptionCard
              key={value}
              index={index}
              selected={selected === value}
              onPress={() => setSelected(value)}
            >
              {label}
            </OptionCard>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton
            text="Continuar"
            disabled={!selected}
            onPress={handleContinue}
          />
        </View>
      </View>
    </QuizLayout>
  );
}
