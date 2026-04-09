import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { IOSWheelPicker } from '../../components/ui/IOSWheelPicker';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const months = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
const years = Array.from({ length: 51 }, (_, i) => String(2010 - i));

export default function Birthday() {
  const [selectedDay, setSelectedDay] = useState('18');
  const [selectedMonth, setSelectedMonth] = useState('Junho');
  const [selectedYear, setSelectedYear] = useState('2007');
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 4, step_name: 'Data de Nascimento', step_total: 23 });
  }, []);

  const saveBirthday = (day: string, month: string, year: string) => {
    const monthIndex = String(months.indexOf(month) + 1).padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    setOnboardingField('birthday', `${paddedDay}/${monthIndex}/${year}`);
  };

  return (
    <QuizLayout progress={24}>
      <View className="pt-8 flex-1">
        <View className="mb-8">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Quando você nasceu?
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">
            Sua idade será usada para calibrar seu plano.
          </Text>
        </View>

        <View className="flex-1" />

        {/* iOS Wheel Picker */}
        <View className="flex-row justify-center gap-2 mb-8">
          <IOSWheelPicker
            values={days}
            selectedValue={selectedDay}
            onChange={(v) => { setSelectedDay(v); saveBirthday(v, selectedMonth, selectedYear); }}
            width={80}
          />
          <IOSWheelPicker
            values={months}
            selectedValue={selectedMonth}
            onChange={(v) => { setSelectedMonth(v); saveBirthday(selectedDay, v, selectedYear); }}
            width={140}
          />
          <IOSWheelPicker
            values={years}
            selectedValue={selectedYear}
            onChange={(v) => { setSelectedYear(v); saveBirthday(selectedDay, selectedMonth, v); }}
            width={100}
          />
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton
              text="Continuar"
              to="/(onboarding)/skin-type"
              onPress={() => track('onboarding_step_completed', { step_number: 4, step_name: 'Data de Nascimento', step_total: 23 })}
            />
        </View>
      </View>
    </QuizLayout>
  );
}
