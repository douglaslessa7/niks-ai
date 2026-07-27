import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useFonts } from 'expo-font';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM = '#FFFFFF';

const STEP = 8;
const TOTAL = 13;

const waterOptions = ['Menos de 1L', '1–2L', '2–3L', '3L+'];
const sleepOptions = ['4–5', '6', '7', '8', '9+'];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexShrink: 0,
        height: 44,
        paddingHorizontal: 18,
        borderRadius: 100,
        backgroundColor: '#FFFFFF',
        borderWidth: selected ? 1.5 : 0.5,
        borderColor: selected ? CORAL : DEEP_HAIR,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: selected ? CORAL : '#2B2724',
        shadowOffset: { width: 0, height: selected ? 6 : 1 },
        shadowOpacity: selected ? 0.22 : 0.04,
        shadowRadius: selected ? 22 : 14,
        elevation: selected ? 4 : 1,
      }}
    >
      <Text style={{
        fontSize: 15, fontWeight: '500', color: DEEP, letterSpacing: -0.2,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function HydrationSleep() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const [water, setWater] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 8, step_name: 'Hidratação e Sono', step_total: 23 });
  }, []);

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', { step_number: 8, step_name: 'Hidratação e Sono', step_total: 23 });
    router.push('/(onboarding)/skincare-routine');
  };

  const isReady = !!water && !!sleep;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

        {/* QHeader */}
        <View style={{
          paddingVertical: 6, paddingHorizontal: 24,
          flexDirection: 'row', alignItems: 'center', gap: 14,
        }}>
          <TouchableOpacity
            onPress={() => {
              haptics.tap();
              router.back();
            }}
            activeOpacity={0.7}
            style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: 100,
              backgroundColor: 'rgba(255,255,255,0.6)',
              borderWidth: 0.5, borderColor: DEEP_HAIR,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={18} color={DEEP} />
          </TouchableOpacity>
          <View style={{
            flex: 1, height: 4, borderRadius: 100,
            backgroundColor: 'rgba(29,58,68,0.08)', overflow: 'hidden',
          }}>
            <View style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${(STEP / TOTAL) * 100}%`,
              backgroundColor: CORAL, borderRadius: 100,
            }} />
          </View>
        </View>

        {/* QTitleBlock */}
        <View style={{ paddingHorizontal: 28, paddingTop: 28 }}>
          <Text style={{
            fontSize: 10, fontWeight: '600', color: CORAL_DEEP,
            letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 14,
          }}>
            seu estilo de vida
          </Text>
          <Text style={{
            fontSize: 26, fontWeight: '700', color: DEEP,
            letterSpacing: -0.85, lineHeight: 28.6,
          }}>
            {'Como está sua hidratação\ne '}
            <Text style={{
              fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
              fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -1,
            }}>
              sono
            </Text>
            {'?'}
          </Text>
          <Text style={{
            marginTop: 14, fontSize: 14.5, lineHeight: 21.75,
            color: DEEP_SOFT, letterSpacing: -0.1,
          }}>
            Sua pele se regenera enquanto você dorme e se hidrata por dentro. Esses dois fatores afetam mais a pele do que qualquer produto.
          </Text>
        </View>

        {/* Chip groups */}
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 28, gap: 24 }}>

          {/* Water group */}
          <View>
            <Text style={{
              fontSize: 14, fontWeight: '600', color: DEEP,
              letterSpacing: -0.2, marginBottom: 12,
            }}>
              Litros de água por dia
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -24 }}
              contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 4, gap: 8, flexDirection: 'row' }}
            >
              {waterOptions.map((opt) => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={water === opt}
                  onPress={() => {
                    setWater(opt);
                    setOnboardingField('hydration', opt);
                    haptics.select();
                  }}
                />
              ))}
            </ScrollView>
          </View>

          {/* Sleep group */}
          <View>
            <Text style={{
              fontSize: 14, fontWeight: '600', color: DEEP,
              letterSpacing: -0.2, marginBottom: 12,
            }}>
              Horas de sono por noite
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -24 }}
              contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 4, gap: 8, flexDirection: 'row' }}
            >
              {sleepOptions.map((opt) => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={sleep === opt}
                  onPress={() => {
                    setSleep(opt);
                    setOnboardingField('sleep', opt);
                    haptics.select();
                  }}
                />
              ))}
            </ScrollView>
          </View>

        </View>

        {/* PrimaryButton */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 18 }}>
          <TouchableOpacity
            onPress={handleContinue}
            disabled={!isReady}
            activeOpacity={0.85}
            style={{
              height: 60, borderRadius: 100,
              backgroundColor: isReady ? CORAL : 'rgba(29,58,68,0.12)',
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: isReady ? CORAL : 'transparent',
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: isReady ? 0.55 : 0,
              shadowRadius: 15, elevation: isReady ? 8 : 0,
            }}
          >
            <Text style={{
              fontSize: 17, fontWeight: '600', letterSpacing: -0.2,
              color: isReady ? '#FFFFFF' : 'rgba(29,58,68,0.42)',
            }}>
              Continuar
            </Text>
            {isReady && (
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            )}
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}
