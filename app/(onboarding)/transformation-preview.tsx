import { useEffect } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const BG_COLOR = '#F2F0EE';
const FRAME_BG = '#0c0d0f';
const BACK_COLOR = '#404040';


export default function TransformationPreview() {
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 2, step_name: 'Transformation Preview', step_total: 28 });
  }, []);

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('onboarding_step_completed', { step_number: 2, step_name: 'Transformation Preview', step_total: 28 });
    router.push('/(onboarding)/promise');
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

        {/* Hero — phone frame */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: 232,
            aspectRatio: 0.49,
            backgroundColor: FRAME_BG,
            borderRadius: 36,
            padding: 8,
            shadowColor: Colors.black,
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.18,
            shadowRadius: 20,
            elevation: 12,
          }}>
            {/* Notch */}
            <View style={{
              position: 'absolute',
              top: 14,
              alignSelf: 'center',
              width: 76,
              height: 22,
              borderRadius: 12,
              backgroundColor: Colors.black,
              zIndex: 5,
            }} />

            {/* Inner screen */}
            <View style={{ flex: 1, borderRadius: 28, overflow: 'hidden', backgroundColor: Colors.white }}>
              <View style={{ flex: 1, backgroundColor: '#F2F0EE' }} />
            </View>
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
            Veja sua pele se transformar semana a semana
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
            Acompanhe seu Skin Score subir, compare scans lado a lado e celebre cada conquista
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
              Continuar
            </Text>
            <ChevronRight size={18} color={Colors.white} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
    </LinearGradient>
  );
}
