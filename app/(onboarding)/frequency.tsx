import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { OptionCard } from '../../components/ui/OptionCard';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const frequencies = [
  { range: '0–1', label: 'De vez em quando', dots: 1 },
  { range: '2–4', label: 'Algumas vezes por semana', dots: 2 },
  { range: '5–7', label: 'Todos os dias', dots: 3 },
];

function DotsIcon({ count, selected }: { count: number; selected: boolean }) {
  return (
    <View className="flex-row gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: selected ? '#FFFFFF' : '#1A1A1A',
          }}
        />
      ))}
    </View>
  );
}

export default function Frequency() {
  const [selected, setSelected] = useState<string | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 6, step_name: 'Frequência de Skincare', step_total: 23 });
  }, []);

  return (
    <QuizLayout progress={36}>
      <View className="pt-8 flex-1">
        <View className="mb-12">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Quantas vezes por semana você cuida da pele?
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">Não existe resposta errada.</Text>
        </View>

        <View className="gap-3 mb-8">
          {frequencies.map((option, index) => (
            <OptionCard
              key={option.range}
              index={index}
              selected={selected === option.range}
              onPress={() => { setSelected(option.range); setOnboardingField('frequency', option.range); }}
              icon={<DotsIcon count={option.dots} selected={selected === option.range} />}
              subtitle={option.label}
            >
              {option.range}
            </OptionCard>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton
              text="Continuar"
              to="/(onboarding)/sun-exposure"
              disabled={!selected}
              onPress={() => track('onboarding_step_completed', { step_number: 6, step_name: 'Frequência de Skincare', step_total: 23 })}
            />
        </View>
      </View>
    </QuizLayout>
  );
}
