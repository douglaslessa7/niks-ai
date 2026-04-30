import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const BG_COLOR = '#F2F0EE';
const BACK_COLOR = '#404040';

const TRUST_BADGES: string[] = [
  '🔬 Baseado em ciência',
  '✦ 100% personalizado',
  '🔒 Seus dados são seus',
];

export default function Promise() {
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 3, step_name: 'Promise', step_total: 28 });
  }, []);

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('onboarding_step_completed', { step_number: 3, step_name: 'Promise', step_total: 28 });
    router.push('/(onboarding)/gender');
  };

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{
        flex: 1,
        maxWidth: 393,
        width: '100%',
        alignSelf: 'center',
        flexDirection: 'column',
        paddingBottom: 34,
      }}>

        {/* Back button */}
        <View style={{ paddingTop: 24, paddingHorizontal: 18 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={22} color="#404040" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* Hero — emoji circle + trust badges */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {/* Emoji circle */}
          <View style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: 'rgba(251,123,107,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 56 }}>✨</Text>
          </View>

          {/* Trust badges */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 24,
            paddingHorizontal: 8,
          }}>
            {TRUST_BADGES.map((badge) => (
              <View key={badge} style={{
                backgroundColor: Colors.white,
                borderRadius: 100,
                paddingHorizontal: 12,
                paddingVertical: 6,
                shadowColor: Colors.black,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.tabActive }}>
                  {badge}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Copy block */}
        <View style={{ flexShrink: 0, paddingHorizontal: 28 }}>
          <Text style={{
            fontSize: 26,
            fontWeight: '700',
            color: Colors.tabActive,
            lineHeight: 32,
            letterSpacing: -0.4,
            textAlign: 'center',
          }}>
            Em poucas semanas você vai se olhar no espelho de um jeito diferente
          </Text>
          <Text style={{
            fontSize: 14,
            color: Colors.gray,
            lineHeight: 20,
            marginTop: 14,
            textAlign: 'center',
            maxWidth: 320,
            alignSelf: 'center',
          }}>
            {'Vamos criar um protocolo baseado na '}
            <Text style={{ fontWeight: '700', color: Colors.tabActive }}>SUA</Text>
            {' pele, nos '}
            <Text style={{ fontWeight: '700', color: Colors.tabActive }}>SEUS</Text>
            {' hábitos e nos '}
            <Text style={{ fontWeight: '700', color: Colors.tabActive }}>SEUS</Text>
            {' objetivos. Para isso, preciso te conhecer.'}
          </Text>
        </View>

        {/* CTA */}
        <View style={{ flexShrink: 0, paddingHorizontal: 18, paddingTop: 28 }}>
          <TouchableOpacity
            onPress={handleContinue}
            activeOpacity={0.85}
            style={{
              backgroundColor: Colors.scanBtn,
              borderRadius: 100,
              height: 58,
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              shadowColor: Colors.scanBtn,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 24,
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>
              Vamos lá
            </Text>
            <ChevronRight size={18} color={Colors.white} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
    </LinearGradient>
  );
}
