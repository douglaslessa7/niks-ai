import { useState } from 'react';
import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { IOSWheelPicker } from '../../components/ui/IOSWheelPicker';

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
            onChange={setSelectedDay}
            width={80}
          />
          <IOSWheelPicker
            values={months}
            selectedValue={selectedMonth}
            onChange={setSelectedMonth}
            width={140}
          />
          <IOSWheelPicker
            values={years}
            selectedValue={selectedYear}
            onChange={setSelectedYear}
            width={100}
          />
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton text="Continuar" to="/(onboarding)/skin-type" />
        </View>
      </View>
    </QuizLayout>
  );
}
