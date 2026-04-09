import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const waterOptions = ['Menos de 1L', '1-2L', '2-3L', '3L+'];
const sleepOptions = ['4-5', '6', '7', '8', '9+'];

function Chip({ selected, onPress, children }: { selected: boolean; onPress: () => void; children: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{ backgroundColor: selected ? Colors.scanBtn : Colors.lightGray }}
      className="px-5 py-2.5 rounded-full mr-2"
    >
      <Text style={{ color: selected ? Colors.white : Colors.black }} className="text-[15px] font-medium">
        {children}
      </Text>
    </TouchableOpacity>
  );
}

export default function HydrationSleep() {
  const [water, setWater] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 8, step_name: 'Hidratação e Sono', step_total: 23 });
  }, []);

  return (
    <QuizLayout progress={44}>
      <View className="pt-8 flex-1">
        <View className="mb-12">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Como estão sua hidratação e sono?
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">Dois pilares da saúde da pele.</Text>
        </View>

        {/* Water Section */}
        <View className="mb-6">
          <Text className="text-[17px] font-semibold text-[#1A1A1A] mb-3">
            Litros de água por dia
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row">
              {waterOptions.map((option) => (
                <Chip key={option} selected={water === option} onPress={() => { setWater(option); setOnboardingField('hydration', option); }}>
                  {option}
                </Chip>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Sleep Section */}
        <View className="mb-8">
          <Text className="text-[17px] font-semibold text-[#1A1A1A] mb-3">
            Horas de sono por noite
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row">
              {sleepOptions.map((option) => (
                <Chip key={option} selected={sleep === option} onPress={() => { setSleep(option); setOnboardingField('sleep', option); }}>
                  {option}
                </Chip>
              ))}
            </View>
          </ScrollView>
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton
              text="Continuar"
              to="/(onboarding)/sunscreen"
              disabled={!water || !sleep}
              onPress={() => track('onboarding_step_completed', { step_number: 8, step_name: 'Hidratação e Sono', step_total: 23 })}
            />
        </View>
      </View>
    </QuizLayout>
  );
}
