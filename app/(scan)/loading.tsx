import { useEffect, useState, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const steps = [
  { label: 'Textura e poros', delay: 500 },
  { label: 'Hidratação', delay: 1000 },
  { label: 'Oleosidade', delay: 1500 },
  { label: 'Manchas e pigmentação', delay: 2000 },
  { label: 'Sinais de envelhecimento', delay: 2500 },
  { label: 'Score geral da pele', delay: 3000 },
];

export default function Loading() {
  const router = useRouter();
  const [percentage, setPercentage] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const percentInterval = setInterval(() => {
      setPercentage((prev) => {
        if (prev >= 100) {
          clearInterval(percentInterval);
          return 100;
        }
        return prev + 1;
      });
    }, 35);

    steps.forEach((step, index) => {
      setTimeout(() => {
        setCurrentStep(index + 1);
      }, step.delay);
    });

    setTimeout(() => {
      router.push('/(scan)/results');
    }, 3800);

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
      <View className="flex-1 px-6 justify-center">
        {/* Percentage */}
        <Text className="text-[64px] font-bold text-[#1A1A1A] text-center tracking-tight mb-4">
          {percentage}%
        </Text>

        {/* Status text */}
        <Text className="text-[20px] font-semibold text-[#1A1A1A] text-center mb-8">
          Analisando sua pele...
        </Text>

        {/* Gradient progress bar */}
        <View className="mb-12 h-1 bg-[#E5E7EB] rounded-full overflow-hidden">
          <Animated.View style={{ width: widthInterp, height: '100%' }}>
            <LinearGradient
              colors={['#EF4444', '#3B82F6', '#9CA3AF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1, borderRadius: 99 }}
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
                className="flex-row items-center gap-3"
                style={{ opacity: isPending ? 0.4 : 1 }}
              >
                <View className="w-6 h-6 items-center justify-center flex-shrink-0">
                  {isCompleted ? (
                    <Check size={20} color="#1A1A1A" />
                  ) : isInProgress ? (
                    <Text style={{ fontSize: 18, color: '#1A1A1A' }}>→</Text>
                  ) : null}
                </View>
                <Text
                  className={`text-[17px] ${
                    isCompleted || isInProgress
                      ? 'text-[#1A1A1A] font-medium'
                      : 'text-[#9CA3AF]'
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
