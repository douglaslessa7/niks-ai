import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useFonts } from 'expo-font';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM = '#FFFFFF';

const STEP = 9;
const TOTAL = 14;

type RoutineType = 'zero' | 'complement' | 'prescribed' | 'unsure';

const OPTIONS: { label: string; value: RoutineType }[] = [
  { label: 'Não tenho rotina — quero começar do zero', value: 'zero' },
  { label: 'Tenho uma rotina que funciona — quero completar o que falta', value: 'complement' },
  { label: 'Um dermatologista me prescreveu produtos', value: 'prescribed' },
  { label: 'Tenho uma rotina, mas não sei se está funcionando', value: 'unsure' },
];

export default function SkincareRoutine() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const [selected, setSelected] = useState<RoutineType | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_name: 'skincare_routine' });
  }, []);

  const handleSelect = useCallback((value: RoutineType) => {
    setSelected(value);
    setOnboardingField('skincare_routine_type', value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleContinue = () => {
    if (!selected) return;
    track('onboarding_step_completed', { step_name: 'skincare_routine', routine_type: selected });
    if (selected === 'complement' || selected === 'prescribed') {
      router.push('/(onboarding)/skincare-routine-detail');
    } else {
      router.push('/(onboarding)/allergies');
    }
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
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
            sua rotina
          </Text>
          <Text style={{
            fontSize: 26, fontWeight: '700', color: DEEP,
            letterSpacing: -0.85, lineHeight: 28.6,
          }}>
            {'Como está sua '}
            <Text style={{
              fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
              fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -1,
            }}>
              rotina
            </Text>
            {' de skincare hoje?'}
          </Text>
          <Text style={{
            marginTop: 14, fontSize: 14.5, lineHeight: 21.75,
            color: DEEP_SOFT, letterSpacing: -0.1,
          }}>
            Isso nos ajuda a criar o melhor protocolo para você.
          </Text>
        </View>

        {/* Options */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 8, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {OPTIONS.map(({ label, value }) => {
            const isSelected = selected === value;
            return (
              <TouchableOpacity
                key={value}
                activeOpacity={0.8}
                onPress={() => handleSelect(value)}
                style={{
                  minHeight: 78, borderRadius: 100, backgroundColor: '#FFFFFF',
                  borderWidth: isSelected ? 1.5 : 0.5,
                  borderColor: isSelected ? CORAL : DEEP_HAIR,
                  paddingLeft: 26, paddingRight: 22, paddingVertical: 16,
                  flexDirection: 'row', alignItems: 'center',
                  shadowColor: isSelected ? CORAL : '#2B2724',
                  shadowOffset: { width: 0, height: isSelected ? 6 : 2 },
                  shadowOpacity: isSelected ? 0.18 : 0.04,
                  shadowRadius: isSelected ? 22 : 14,
                  elevation: isSelected ? 4 : 1,
                }}
              >
                <Text style={{
                  flex: 1, fontSize: 15, fontWeight: '500', color: DEEP,
                  letterSpacing: -0.2, lineHeight: 19.5,
                }}>
                  {label}
                </Text>
                {isSelected && (
                  <View style={{
                    width: 24, height: 24, borderRadius: 100,
                    backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    marginLeft: 12,
                  }}>
                    <Check size={13} color="#fff" strokeWidth={2.8} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* PrimaryButton */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 18 }}>
          <TouchableOpacity
            onPress={handleContinue}
            disabled={!selected}
            activeOpacity={0.85}
            style={{
              height: 60, borderRadius: 100,
              backgroundColor: selected ? CORAL : 'rgba(29,58,68,0.12)',
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: selected ? CORAL : 'transparent',
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: selected ? 0.55 : 0,
              shadowRadius: 15, elevation: selected ? 8 : 0,
            }}
          >
            <Text style={{
              fontSize: 17, fontWeight: '600', letterSpacing: -0.2,
              color: selected ? '#FFFFFF' : 'rgba(29,58,68,0.42)',
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
