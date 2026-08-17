import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import { haptics } from '../../lib/haptics';
import { useFonts } from 'expo-font';
import {
  Nunito_800ExtraBold,
  Nunito_700Bold,
  Nunito_600SemiBold,
  Nunito_400Regular,
} from '@expo-google-fonts/nunito';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const DEEP = '#121212';
const DEEP_SOFT = '#515151';
const DEEP_WHISPER = '#818181';
const DEEP_HAIR = 'rgba(18,18,18,0.10)';
const CORAL = '#FF9D9D';
const CORAL_DEEP = '#F2808E';
const CREAM = '#FFFFFF';

const GENDERS = ['Feminino', 'Masculino', 'Outro'];
const STEP = 2;
const TOTAL = 13;

export default function Gender() {
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
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 3, step_name: 'Gênero', step_total: 23 });
  }, []);

  const handleSelect = useCallback((gender: string) => {
    setSelected(gender);
    setOnboardingField('genero', gender);
    haptics.select();
    setTimeout(() => {
      track('onboarding_step_completed', { step_number: 3, step_name: 'Gênero', step_total: 23 });
      if (gender === 'Feminino') {
        router.push('/(onboarding)/pregnancy');
      } else {
        router.push('/(onboarding)/concerns');
      }
    }, 300);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

        {/* QHeader: back button + progress bar na mesma linha */}
        <View style={{
          paddingVertical: 6,
          paddingHorizontal: 24,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        }}>
          <TouchableOpacity
            onPress={() => {
              haptics.tap();
              router.back();
            }}
            activeOpacity={0.7}
            style={{
              flexShrink: 0,
              width: 40, height: 40, borderRadius: 100,
              backgroundColor: 'rgba(255,255,255,0.6)',
              borderWidth: 0.5,
              borderColor: DEEP_HAIR,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={18} color={DEEP} />
          </TouchableOpacity>
          <View style={{
            flex: 1, height: 4, borderRadius: 100,
            backgroundColor: 'rgba(18,18,18,0.06)',
            overflow: 'hidden',
          }}>
            <View style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${(STEP / TOTAL) * 100}%`,
              backgroundColor: CORAL,
              borderRadius: 100,
            }} />
          </View>
        </View>

        {/* QTitleBlock */}
        <View style={{ paddingHorizontal: 28, paddingTop: 28 }}>
          <Text style={{
            fontFamily: fSemi, fontSize: 10, fontWeight: '600', color: CORAL_DEEP,
            letterSpacing: 2.4, textTransform: 'uppercase',
            marginBottom: 14,
          }}>
            sobre você
          </Text>
          <Text style={{
            fontFamily: fXBold, fontSize: 30, fontWeight: '800', color: DEEP,
            letterSpacing: -0.85, lineHeight: 33,
          }}>
            {'Qual é o '}
            <Text style={{
              fontFamily: fXBold, fontWeight: '800',
              color: CORAL, letterSpacing: -1,
            }}>
              seu
            </Text>
            {' gênero?'}
          </Text>
          <Text style={{
            fontFamily: fReg, marginTop: 14,
            fontSize: 14.5, lineHeight: 21.75, color: DEEP_SOFT,
            letterSpacing: -0.1,
          }}>
            Seu gênero influencia como a pele se comporta, especialmente nos hormônios.
          </Text>
        </View>

        {/* Options */}
        <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 28, gap: 14 }}>
          {GENDERS.map((gender) => {
            const isSelected = selected === gender;
            return (
              <TouchableOpacity
                key={gender}
                activeOpacity={0.8}
                onPress={() => handleSelect(gender)}
                style={{
                  minHeight: 66,
                  borderRadius: 100,
                  backgroundColor: '#FFFFFF',
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
                  flex: 1,
                  fontFamily: fReg, fontSize: 18, fontWeight: '500', color: DEEP,
                  letterSpacing: -0.2,
                }}>
                  {gender}
                </Text>
                {isSelected && (
                  <View style={{
                    width: 24, height: 24, borderRadius: 100,
                    backgroundColor: CORAL,
                    alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Check size={13} color="#fff" strokeWidth={2.8} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          <Text style={{
            fontFamily: fReg, marginTop: 6,
            textAlign: 'center',
            fontSize: 12.5, color: DEEP_WHISPER,
            letterSpacing: -0.05,
          }}>
            toque para selecionar e avançar
          </Text>
        </View>

      </View>
    </SafeAreaView>
  );
}
