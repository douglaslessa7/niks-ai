import { useEffect } from 'react';
import { View, Text, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { Lock } from 'lucide-react-native';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

export default function Trust() {
  const { track } = useMixpanel();

  const imageY = useSharedValue(60);
  const imageOpacity = useSharedValue(0);
  const imageScale = useSharedValue(0.92);
  const titleY = useSharedValue(24);
  const titleOpacity = useSharedValue(0);
  const subtitleY = useSharedValue(20);
  const subtitleOpacity = useSharedValue(0);
  const cardY = useSharedValue(20);
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.96);
  const btnY = useSharedValue(12);
  const btnOpacity = useSharedValue(0);

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 20, step_name: 'Obrigado por Confiar', step_total: 23 });

    // Stage 1 — image lands
    imageY.value = withSpring(0, { damping: 14, stiffness: 110 });
    imageOpacity.value = withTiming(1, { duration: 400 });
    imageScale.value = withSpring(1, { damping: 14, stiffness: 110 });

    // Stage 2 — pulse on image
    const t2 = setTimeout(() => {
      imageScale.value = withSequence(
        withSpring(1.06, { damping: 6, stiffness: 300 }),
        withSpring(1.0, { damping: 10, stiffness: 200 })
      );
    }, 500);

    // Stage 3 — title
    const t3 = setTimeout(() => {
      titleY.value = withSpring(0, { damping: 18, stiffness: 100 });
      titleOpacity.value = withTiming(1, { duration: 350 });
    }, 300);

    // Stage 4 — subtitle
    const t4 = setTimeout(() => {
      subtitleY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });
      subtitleOpacity.value = withTiming(1, { duration: 400 });
    }, 480);

    // Stage 5 — card
    const t5 = setTimeout(() => {
      cardY.value = withSpring(0, { damping: 16, stiffness: 110 });
      cardOpacity.value = withTiming(1, { duration: 350 });
      cardScale.value = withSpring(1, { damping: 16, stiffness: 110 });
    }, 680);

    // Stage 6 — button
    const t6 = setTimeout(() => {
      btnY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.quad) });
      btnOpacity.value = withTiming(1, { duration: 350 });
    }, 900);

    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(t6);
    };
  }, []);

  const imageStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
    transform: [{ translateY: imageY.value }, { scale: imageScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleY.value }],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }, { scale: cardScale.value }],
  }));

  const btnStyle = useAnimatedStyle(() => ({
    opacity: btnOpacity.value,
    transform: [{ translateY: btnY.value }],
  }));

  return (
    <QuizLayout progress={88}>
      <View className="flex-1 items-center px-6 pt-10">
        {/* Illustration */}
        <Animated.View className="mb-10 relative items-center justify-center" style={imageStyle}>
          {/* Subtle circle behind */}
          <View
            style={{
              position: 'absolute',
              width: 192,
              height: 192,
              borderRadius: 96,
              backgroundColor: 'rgba(204,251,241,0.4)',
            }}
          />
          {/* Hands image */}
          <Image
            source={require('../../assets/trust-hands.png')}
            style={{ width: 200, height: 200, borderRadius: 100 }}
            resizeMode="cover"
          />
        </Animated.View>

        {/* Main Text */}
        <View className="items-center mb-10">
          <Animated.Text
            className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight text-center mb-4"
            style={titleStyle}
          >
            Obrigado por confiar em nós
          </Animated.Text>
          <Animated.Text
            className="text-[17px] text-[#9CA3AF] text-center"
            style={subtitleStyle}
          >
            Agora vamos personalizar NIKS AI para você...
          </Animated.Text>
        </View>

        {/* Privacy Card */}
        <Animated.View
          className="bg-[#F5F5F7] rounded-[16px] p-4 mb-12 flex-row items-start gap-3"
          style={cardStyle}
        >
          <View className="w-6 h-6 items-center justify-center mt-0.5">
            <Lock size={20} color="#1A1A1A" />
          </View>
          <Text className="flex-1 text-[15px] text-[#1A1A1A] leading-relaxed">
            Sua privacidade e segurança são nossa prioridade. Suas fotos nunca serão compartilhadas.
          </Text>
        </Animated.View>

        <View className="flex-1" />

        <Animated.View className="pb-8 w-full" style={btnStyle}>
          <CTAButton
            text="Continuar"
            to="/(onboarding)/plan-preview"
            onPress={() => track('onboarding_step_completed', { step_number: 20, step_name: 'Obrigado por Confiar', step_total: 23 })}
          />
        </Animated.View>
      </View>
    </QuizLayout>
  );
}
