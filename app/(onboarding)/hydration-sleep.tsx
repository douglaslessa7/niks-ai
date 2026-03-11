import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { useAppStore } from '../../store/onboarding';

const waterOptions = ['Menos de 1L', '1-2L', '2-3L', '3L+'];
const sleepOptions = ['4-5', '6', '7', '8', '9+'];

function Chip({ selected, onPress, children }: { selected: boolean; onPress: () => void; children: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`px-5 py-2.5 rounded-full mr-2 ${selected ? 'bg-[#1A1A1A]' : 'bg-[#F5F5F7]'}`}
    >
      <Text className={`text-[15px] font-medium whitespace-nowrap ${selected ? 'text-white' : 'text-[#1A1A1A]'}`}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

export default function HydrationSleep() {
  const [water, setWater] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);
  const { setOnboardingField } = useAppStore();

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
          <CTAButton text="Continuar" to="/(onboarding)/sunscreen" disabled={!water || !sleep} />
        </View>
      </View>
    </QuizLayout>
  );
}
