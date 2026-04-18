import { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, Easing, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

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
      style={[{
        position: 'absolute', width: 10, height: 10, borderRadius: 5,
        backgroundColor: color, borderWidth: 2, borderColor: 'white',
        shadowColor: glow, shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8, shadowRadius: 6, opacity,
      }, style]}
    />
  );
}

function FoodScanCard() {
  const scanY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, { toValue: IMAGE_H - 2, duration: 1250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanY, { toValue: 0, duration: 1250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={{ height: IMAGE_H, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
      <Image source={{ uri: FOOD_IMAGE_URI }} style={{ width: '100%', height: IMAGE_H, opacity: 0.8 }} resizeMode="cover" />
      <Animated.View style={{
        position: 'absolute', left: 0, right: 0, height: 2,
        backgroundColor: '#4ade80', shadowColor: '#4ade80',
        shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 8,
        transform: [{ translateY: scanY }],
      }} />
      <View style={{
        position: 'absolute', top: '50%', left: '50%',
        marginTop: -64, marginLeft: -64, width: 128, height: 128,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 8,
      }}>
        <View style={{ position: 'absolute', top: -1, left: -1, width: 16, height: 16, borderTopWidth: 2, borderLeftWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderTopLeftRadius: 4 }} />
        <View style={{ position: 'absolute', top: -1, right: -1, width: 16, height: 16, borderTopWidth: 2, borderRightWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderTopRightRadius: 4 }} />
        <View style={{ position: 'absolute', bottom: -1, left: -1, width: 16, height: 16, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderBottomLeftRadius: 4 }} />
        <View style={{ position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderBottomWidth: 2, borderRightWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderBottomRightRadius: 4 }} />
      </View>
      <PulseDot color="#22c55e" glow="#22c55e" style={{ top: '30%', left: '25%' }} />
      <PulseDot color="#f59e0b" glow="#f59e0b" style={{ top: '45%', right: '30%' }} />
      <PulseDot color="#ef4444" glow="#ef4444" style={{ bottom: '20%', left: '45%' }} />
    </View>
  );
}

export default function FoodAnalysis() {
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 11, step_name: 'Alimentação e Pele', step_total: 23 });
  }, []);

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Header */}
          <View style={{ paddingTop: 16, paddingHorizontal: 18 }}>
            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              activeOpacity={0.7}
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.85)',
                borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>

            <View style={{ marginTop: 16 }}>
              <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 1 }}>
                <View style={{ height: 2, width: '60%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 32, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={{
              fontSize: 26, fontWeight: '800', color: Colors.tabActive,
              lineHeight: 31, marginBottom: 24,
            }}>
              Sua alimentação afeta sua pele mais do que você imagina
            </Text>

            <View style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 20, marginBottom: 12 }}>
              <View style={{ marginBottom: 16 }}>
                <FoodScanCard />
              </View>
              <Text style={{ fontSize: 15, color: Colors.tabActive, lineHeight: 22 }}>
                Escaneie qualquer refeição e descubra na hora o que está ajudando — ou sabotando — sua pele.
              </Text>
            </View>

            <Text style={{ fontSize: 13, color: Colors.gray, textAlign: 'center', marginBottom: 32 }}>
              Baseado em estudos do Journal of Dermatology e Nutrition Research
            </Text>

            <TouchableOpacity
              onPress={() => {
                track('onboarding_step_completed', { step_number: 11, step_name: 'Alimentação e Pele', step_total: 23 });
                router.push('/(onboarding)/goal');
              }}
              activeOpacity={0.8}
              style={{
                backgroundColor: Colors.scanBtn, borderRadius: 100,
                paddingVertical: 16, alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>
                Continuar
              </Text>
            </TouchableOpacity>
          </ScrollView>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
