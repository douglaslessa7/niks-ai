import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { IOSWheelPicker } from '../../components/ui/IOSWheelPicker';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

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
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 4, step_name: 'Data de Nascimento', step_total: 23 });
  }, []);

  const saveBirthday = (day: string, month: string, year: string) => {
    const monthIndex = String(months.indexOf(month) + 1).padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    setOnboardingField('birthday', `${paddedDay}/${monthIndex}/${year}`);
  };

  const handleContinue = () => {
    track('onboarding_step_completed', { step_number: 4, step_name: 'Data de Nascimento', step_total: 23 });
    router.push('/(onboarding)/concerns');
  };

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Header */}
          <View style={{ paddingTop: 24, paddingHorizontal: 18 }}>
            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              activeOpacity={0.7}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.85)',
                borderWidth: 0.5,
                borderColor: 'rgba(0,0,0,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>

            <View style={{ marginTop: 16 }}>
              <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 1 }}>
                <View style={{ height: 2, width: '22%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          {/* Content */}
          <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 40 }}>
            {/* Label */}
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: Colors.scanBtn,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              Sobre você
            </Text>

            {/* Title */}
            <Text style={{
              fontSize: 26,
              fontWeight: '800',
              color: Colors.tabActive,
              lineHeight: 31,
              marginBottom: 8,
            }}>
              Quando você nasceu?
            </Text>

            {/* Subtitle */}
            <Text style={{
              fontSize: 13,
              color: Colors.gray,
              lineHeight: 20,
            }}>
              A idade muda tudo: sua pele aos 20 não precisa do mesmo que aos 35
            </Text>

            <View style={{ flex: 1 }} />

            {/* iOS Wheel Picker */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
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

            <View style={{ flex: 1 }} />

            {/* CTA Button */}
            <View style={{ paddingBottom: 32 }}>
              <TouchableOpacity
                onPress={handleContinue}
                activeOpacity={0.8}
                style={{
                  backgroundColor: Colors.scanBtn,
                  borderRadius: 100,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>
                  Continuar
                </Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
