import { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const IMAGE_H = 192;
const FOOD_IMAGE_URI =
  'https://images.unsplash.com/photo-1630659879694-b1750389d796?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080';

function PulseDot({ color, glow, style }: { color: string; glow: string; style: object }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: 'white',
          shadowColor: glow,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 6,
          opacity,
        },
        style,
      ]}
    />
  );
}

function FoodScanCard() {
  const scanY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, {
          toValue: IMAGE_H - 2,
          duration: 1250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanY, {
          toValue: 0,
          duration: 1250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={{ height: IMAGE_H, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
      {/* Food image */}
      <Image
        source={{ uri: FOOD_IMAGE_URI }}
        style={{ width: '100%', height: IMAGE_H, opacity: 0.8 }}
        resizeMode="cover"
      />

      {/* Scanning line */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: '#4ade80',
          shadowColor: '#4ade80',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: 8,
          transform: [{ translateY: scanY }],
        }}
      />

      {/* Viewfinder brackets */}
      <View
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          marginTop: -64,
          marginLeft: -64,
          width: 128,
          height: 128,
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.3)',
          borderRadius: 8,
        }}
      >
        <View style={{ position: 'absolute', top: -1, left: -1, width: 16, height: 16, borderTopWidth: 2, borderLeftWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderTopLeftRadius: 4 }} />
        <View style={{ position: 'absolute', top: -1, right: -1, width: 16, height: 16, borderTopWidth: 2, borderRightWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderTopRightRadius: 4 }} />
        <View style={{ position: 'absolute', bottom: -1, left: -1, width: 16, height: 16, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderBottomLeftRadius: 4 }} />
        <View style={{ position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderBottomWidth: 2, borderRightWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderBottomRightRadius: 4 }} />
      </View>

      {/* Analysis dots */}
      <PulseDot color="#22c55e" glow="#22c55e" style={{ top: '30%', left: '25%' }} />
      <PulseDot color="#f59e0b" glow="#f59e0b" style={{ top: '45%', right: '30%' }} />
      <PulseDot color="#ef4444" glow="#ef4444" style={{ bottom: '20%', left: '45%' }} />
    </View>
  );
}

export default function FoodAnalysis() {
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 11, step_name: 'Alimentação e Pele', step_total: 23 });
  }, []);

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.3, 0.6, 1]}
      style={{ flex: 1 }}
    >
      <QuizLayout progress={60}>
        <View className="pt-8 flex-1">
          <View className="mb-10">
            <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight">
              Sua alimentação afeta sua pele mais do que você imagina
            </Text>
          </View>

          {/* Food Analysis Card */}
          <View className="bg-[#F5F5F7] rounded-[16px] p-6 mb-3">
            <View className="mb-4">
              <FoodScanCard />
            </View>
            <Text className="text-[15px] text-[#1A1A1A] leading-relaxed">
              Escaneie qualquer refeição e descubra na hora o que está ajudando — ou sabotando — sua pele.
            </Text>
          </View>

          <Text className="text-[13px] text-[#9CA3AF] text-center px-6 mb-8">
            Baseado em estudos do Journal of Dermatology e Nutrition Research
          </Text>

          <View className="flex-1" />

          <View className="pb-8">
            <CTAButton
              text="Continuar"
              to="/(onboarding)/commitment"
              onPress={() => track('onboarding_step_completed', { step_number: 11, step_name: 'Alimentação e Pele', step_total: 23 })}
            />
          </View>
        </View>
      </QuizLayout>
    </LinearGradient>
  );
}
