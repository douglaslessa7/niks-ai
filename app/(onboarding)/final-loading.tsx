import { useEffect, useState, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';

const steps = [
  'Protocolo matinal',
  'Protocolo noturno',
  'Análise alimentar personalizada',
  'Recomendações de ingredientes',
  'Plano de acompanhamento',
];

export default function FinalLoading() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [checkedSteps, setCheckedSteps] = useState<number[]>([]);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 1;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => router.push('/(onboarding)/trust'), 500);
        }
        const stepIndex = Math.floor((next / 100) * steps.length) - 1;
        if (stepIndex >= 0) {
          setCheckedSteps((s) => (s.includes(stepIndex) ? s : [...s, stepIndex]));
        }
        return next;
      });
    }, 40);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const widthInterp = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 max-w-[393px] mx-auto w-full px-6 justify-center">
        {/* Percentage */}
        <Text className="text-[64px] font-bold text-[#1A1A1A] text-center mb-4">
          {progress}%
        </Text>

        {/* Progress bar */}
        <View className="w-full h-2 bg-[#E5E7EB] rounded-full mb-12 overflow-hidden">
          <Animated.View
            style={{ width: widthInterp }}
            className="h-full bg-[#1A1A1A] rounded-full"
          />
        </View>

        {/* Steps checklist */}
        <View className="gap-4">
          {steps.map((step, i) => {
            const isChecked = checkedSteps.includes(i);
            return (
              <View key={step} className="flex-row items-center gap-3">
                <View
                  className={`w-6 h-6 rounded-full items-center justify-center ${
                    isChecked ? 'bg-[#1A1A1A]' : 'bg-[#E5E7EB]'
                  }`}
                >
                  {isChecked && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                </View>
                <Text
                  className={`text-[15px] ${isChecked ? 'text-[#1A1A1A] font-medium' : 'text-[#9CA3AF]'}`}
                >
                  {step}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}
