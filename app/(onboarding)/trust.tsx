import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, Lock } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const DoubleHeart = ({ size, color }: { size: number; color: string }) => {
  const heart = "M50 86 C18 65 0 49 0 28 C0 11 13 0 27 0 C37 0 45 6 50 19 C55 6 63 0 73 0 C87 0 100 11 100 28 C100 49 82 65 50 86Z";
  return (
    <Svg width={size} height={size * 0.9} viewBox="-6 -6 152 128">
      <Path d={heart} fill="#FDF0ED" stroke={color} strokeWidth="5.5" strokeLinejoin="round" />
      <Path d={heart} fill="#FDF0ED" stroke={color} strokeWidth="5.5" strokeLinejoin="round" transform="translate(38, 30)" />
    </Svg>
  );
};

export default function Trust() {
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 20, step_name: 'Obrigado por Confiar', step_total: 23 });
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
                <View style={{ height: 2, width: '88%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          {/* Content — mesmas posições de antes */}
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 40 }}>

            {/* Illustration */}
            <View style={{ marginBottom: 40, alignItems: 'center', justifyContent: 'center' }}>
              <DoubleHeart size={200} color={Colors.scanBtn} />
            </View>

            {/* Main Text */}
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
              <Text style={{
                fontSize: 32,
                fontWeight: '800',
                color: Colors.tabActive,
                lineHeight: 38,
                textAlign: 'center',
                marginBottom: 8,
              }}>
                Obrigado por confiar em nós
              </Text>
              <Text style={{
                fontSize: 13,
                color: Colors.gray,
                lineHeight: 20,
                textAlign: 'center',
              }}>
                Agora vamos personalizar NIKS AI para você...
              </Text>
            </View>

            {/* Privacy Card */}
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.7)',
              borderRadius: 16,
              padding: 16,
              marginBottom: 48,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.07)',
              width: '100%',
            }}>
              <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                <Lock size={20} color={Colors.tabActive} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, color: Colors.tabActive, lineHeight: 22 }}>
                Sua privacidade e segurança são nossa prioridade. Suas fotos nunca serão compartilhadas.
              </Text>
            </View>

            <View style={{ flex: 1 }} />

            <View style={{ paddingBottom: 32, width: '100%' }}>
              <TouchableOpacity
                onPress={() => {
                  track('onboarding_step_completed', { step_number: 20, step_name: 'Obrigado por Confiar', step_total: 23 });
                  router.push('/(onboarding)/plan-preview' as any);
                }}
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
