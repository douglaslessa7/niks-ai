import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useFonts } from 'expo-font';
import {
  Nunito_800ExtraBold,
  Nunito_700Bold,
  Nunito_600SemiBold,
  Nunito_400Regular,
} from '@expo-google-fonts/nunito';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';

const DEEP = '#121212';
const DEEP_SOFT = '#515151';
const DEEP_HAIR = 'rgba(18,18,18,0.10)';
const CORAL = '#FF9D9D';
const CORAL_DEEP = '#F2808E';
const CREAM = '#FFFFFF';

const STEP = 11;
const TOTAL = 13;

const DESIRES = [
  'Me sentir mais bonita e confiante',
  'Ter um glow up que as pessoas notem',
  'Aumentar minha autoestima de vez',
  'Me sentir bem comigo mesma de novo',
  'Conquistar alguém especial',
  'Outro',
];

export default function GoalDesire() {
  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold,
    Nunito_700Bold,
    Nunito_600SemiBold,
    Nunito_400Regular,
  });
  const fXBold = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold  = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const fSemi  = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const fReg   = fontsLoaded ? 'Nunito_400Regular' : undefined;

  const [selected, setSelected] = useState<string | null>(null);
  const { track } = useMixpanel();
  const router = useRouter();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 11, step_name: 'Desejo Real', step_total: 23 });
  }, []);

  const handleSelect = (desire: string) => {
    setSelected(desire);
    haptics.select();
  };

  const handleContinue = () => {
    haptics.action();
    setOnboardingField('goal_desire', selected);
    track('onboarding_step_completed', { step_number: 11, step_name: 'Desejo Real', step_total: 23, desire: selected });
    router.push('/(onboarding)/social-proof');
  };

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
            backgroundColor: 'rgba(18,18,18,0.08)', overflow: 'hidden',
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
            fontFamily: fSemi, fontSize: 10, fontWeight: '600', color: CORAL_DEEP,
            letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 14,
          }}>
            seu porquê
          </Text>
          <Text style={{
            fontFamily: fXBold, fontSize: 26, fontWeight: '800', color: DEEP,
            letterSpacing: -0.85, lineHeight: 28.6,
          }}>
            {'Qual é o seu verdadeiro '}
            <Text style={{
              fontFamily: fXBold, fontWeight: '800', color: CORAL, letterSpacing: -1,
            }}>
              objetivo
            </Text>
            {'?'}
          </Text>
          <Text style={{
            fontFamily: fReg, marginTop: 14, fontSize: 14.5, lineHeight: 21.75,
            color: DEEP_SOFT, letterSpacing: -0.1,
          }}>
            Pode ser honesta — é só pra gente entender você melhor.
          </Text>
        </View>

        {/* Options */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 8, gap: 9 }}
          showsVerticalScrollIndicator={false}
        >
          {DESIRES.map((desire) => {
            const isSelected = selected === desire;
            return (
              <TouchableOpacity
                key={desire}
                activeOpacity={0.8}
                onPress={() => handleSelect(desire)}
                style={{
                  minHeight: 56, borderRadius: 100, backgroundColor: '#FFFFFF',
                  borderWidth: isSelected ? 1.5 : 0.5,
                  borderColor: isSelected ? CORAL : DEEP_HAIR,
                  paddingLeft: 26, paddingRight: 22,
                  flexDirection: 'row', alignItems: 'center',
                  shadowColor: isSelected ? CORAL : '#2B2724',
                  shadowOffset: { width: 0, height: isSelected ? 6 : 2 },
                  shadowOpacity: isSelected ? 0.18 : 0.04,
                  shadowRadius: isSelected ? 22 : 14,
                  elevation: isSelected ? 4 : 1,
                }}
              >
                <Text style={{
                  flex: 1, fontFamily: fReg, fontSize: 15, fontWeight: '500', color: DEEP,
                  letterSpacing: -0.2, lineHeight: 19.5,
                }}>
                  {desire}
                </Text>
                {isSelected && (
                  <View style={{
                    width: 24, height: 24, borderRadius: 100,
                    backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Check size={13} color="#fff" strokeWidth={2.8} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* PrimaryButton */}
        <View style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 18 }}>
          <TouchableOpacity
            onPress={handleContinue}
            disabled={!selected}
            activeOpacity={0.85}
            style={{
              height: 60, borderRadius: 100,
              backgroundColor: selected ? CORAL : 'rgba(18,18,18,0.12)',
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: selected ? CORAL : 'transparent',
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: selected ? 0.55 : 0,
              shadowRadius: 15, elevation: selected ? 8 : 0,
            }}
          >
            <Text style={{
              fontFamily: fSemi, fontSize: 17, fontWeight: '600', letterSpacing: -0.2,
              color: selected ? '#FFFFFF' : 'rgba(18,18,18,0.42)',
            }}>
              Continuar
            </Text>
            {selected && (
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
