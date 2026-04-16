// SQL to run in Supabase Dashboard:
// ALTER TABLE users ADD COLUMN IF NOT EXISTS skincare_routine_type text;
// ALTER TABLE users ADD COLUMN IF NOT EXISTS skincare_routine_description text;

import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { OptionCard } from '../../components/ui/OptionCard';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

type RoutineType = 'zero' | 'complement' | 'prescribed' | 'unsure';

const options: { label: string; value: RoutineType }[] = [
  { label: 'Não tenho rotina — quero começar do zero', value: 'zero' },
  { label: 'Tenho uma rotina que funciona — quero completar o que falta', value: 'complement' },
  { label: 'Um dermatologista me prescreveu produtos', value: 'prescribed' },
  { label: 'Tenho uma rotina, mas não sei se está funcionando', value: 'unsure' },
];

export default function SkincareRoutine() {
  const [selected, setSelected] = useState<RoutineType | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_name: 'skincare_routine' });
  }, []);

  const handleContinue = () => {
    if (!selected) return;
    setOnboardingField('skincare_routine_type', selected);
    track('onboarding_step_completed', { step_name: 'skincare_routine', routine_type: selected });
    if (selected === 'complement' || selected === 'prescribed') {
      router.push('/(onboarding)/skincare-routine-detail');
    } else {
      router.push('/(onboarding)/allergies');
    }
  };

  return (
    <QuizLayout progress={88}>
      <View className="pt-8 flex-1">
        <View className="mb-8">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Como está sua rotina de skincare hoje?
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">
            Isso nos ajuda a criar o melhor protocolo para você.
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
