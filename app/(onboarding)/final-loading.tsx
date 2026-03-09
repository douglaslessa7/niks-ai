import { useEffect, useState, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const steps = [
  { label: 'Protocolo matinal', delay: 500 },
  { label: 'Protocolo noturno', delay: 1000 },
  { label: 'Análise alimentar personalizada', delay: 1500 },
  { label: 'Recomendações de ingredientes', delay: 2000 },
  { label: 'Plano de acompanhamento', delay: 2500 },
];

export default function FinalLoading() {
  const router = useRouter();
  const [percentage, setPercentage] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const percentInterval = setInterval(() => {
      setPercentage((prev) => {
        if (prev >= 100) { clearInterval(percentInterval); return 100; }
        return prev + 1;
      });
    }, 35);

    steps.forEach((step, index) => {
      setTimeout(() => setCurrentStep(index + 1), step.delay);
    });

    setTimeout(() => router.push('/(onboarding)/trust'), 3800);
    return () => clearInterval(percentInterval);
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: percentage,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  const widthInterp = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 max-w-[393px] mx-auto w-full px-6 justify-center">
        {/* Percentage */}
        <Text className="text-[64px] font-bold text-niks-black text-center mb-4 tracking-tight">
          {percentage}%
        </Text>

        {/* Status text */}
        <Text className="text-[20px] font-semibold text-niks-black text-center mb-8">
          Finalizando seu protocolo personalizado...
        </Text>

        {/* Gradient progress bar */}
        <View className="w-full h-1 bg-[#E5E7EB] rounded-full mb-12 overflow-hidden">
          <Animated.View style={{ width: widthInterp, height: '100%' }}>
            <LinearGradient
              colors={['#EF4444', '#3B82F6', '#9CA3AF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: '100%', height: '100%' }}
            />
          </Animated.View>
        </View>

        {/* Checklist */}
        <View className="gap-4">
          {steps.map((step, index) => {
            const isCompleted = currentStep > index;
            const isInProgress = currentStep === index;
            const isPending = currentStep < index;
            return (
              <View
                key={index}
                className={`flex-row items-center gap-3 ${isPending ? 'opacity-40' : 'opacity-100'}`}
              >
                <View className="w-6 h-6 items-center justify-center flex-shrink-0">
                  {isCompleted ? (
                    <Check size={20} color="#1A1A1A" strokeWidth={2.5} />
                  ) : isInProgress ? (
                    <Text className="text-[18px] text-niks-black">→</Text>
                  ) : null}
                </View>
                <Text
                  className={`text-[17px] ${
                    isCompleted || isInProgress ? 'text-niks-black font-medium' : 'text-niks-gray'
                  }`}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}
