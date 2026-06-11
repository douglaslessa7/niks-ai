import { useState, useEffect } from 'react';
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

const STEP = 2;
const TOTAL = 14;

type PregnancyStatus = 'none' | 'pregnant' | 'breastfeeding' | 'trying';

const OPTIONS: { label: string; value: PregnancyStatus }[] = [
  { label: 'Nenhuma das anteriores', value: 'none' },
  { label: 'Estou grávida', value: 'pregnant' },
  { label: 'Estou amamentando', value: 'breastfeeding' },
  { label: 'Estou tentando engravidar', value: 'trying' },
];

export default function Pregnancy() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const [selected, setSelected] = useState<PregnancyStatus | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_name: 'pregnancy' });
  }, []);

  const handleSelect = (value: PregnancyStatus) => {
    setSelected(value);
    setOnboardingField('pregnancy_status', value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleContinue = () => {
    track('onboarding_step_completed', { step_name: 'pregnancy' });
    router.push('/(onboarding)/goal');
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

        {/* Custom title block with IMPORTANTE badge */}
        <View style={{ paddingHorizontal: 28, paddingTop: 28 }}>
          {/* IMPORTANTE pill */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 7, paddingLeft: 10, paddingRight: 12,
            borderRadius: 100,
            backgroundColor: 'rgba(251,123,107,0.10)',
            borderWidth: 0.5, borderColor: 'rgba(251,123,107,0.30)',
            alignSelf: 'flex-start',
            marginBottom: 18,
          }}>
            <View style={{
              width: 6, height: 6, borderRadius: 100, backgroundColor: CORAL,
              shadowColor: CORAL,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 4,
            }} />
            <Text style={{
              fontSize: 10, fontWeight: '700', color: CORAL_DEEP,
              letterSpacing: 2.8, textTransform: 'uppercase',
            }}>
              importante
            </Text>
          </View>

          {/* Title */}
          <Text style={{
            fontSize: 26, fontWeight: '700', color: DEEP,
            letterSpacing: -0.65, lineHeight: 31.2,
          }}>
            {'Alguns ativos do skincare precisam ser '}
            <Text style={{
              fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
              fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -0.7,
            }}>
              evitados
            </Text>
            {' em certas situações.'}
          </Text>

          {/* Subtitle */}
          <Text style={{
            marginTop: 12, fontSize: 14.5, lineHeight: 21.75,
            color: DEEP_SOFT, letterSpacing: -0.1,
          }}>
            Selecione a que se aplica a você.
          </Text>
        </View>

        {/* Options */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 24, paddingBottom: 8, gap: 12 }}
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
                  minHeight: 60, borderRadius: 100, backgroundColor: '#FFFFFF',
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
                  flex: 1, fontSize: 16, fontWeight: '500', color: DEEP,
                  letterSpacing: -0.2, lineHeight: 19.5,
                }}>
                  {label}
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
        <View style={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: 22 }}>
          <TouchableOpacity
            onPress={selected ? handleContinue : undefined}
            activeOpacity={selected ? 0.85 : 1}
            style={{
              height: 60, borderRadius: 100,
              backgroundColor: selected ? CORAL : 'rgba(29,58,68,0.13)',
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: CORAL,
              shadowOffset: { width: 0, height: selected ? 14 : 0 },
              shadowOpacity: selected ? 0.55 : 0,
              shadowRadius: 15, elevation: selected ? 8 : 0,
            }}
          >
            <Text style={{
              fontSize: 17, fontWeight: '600', letterSpacing: -0.2,
              color: selected ? '#FFFFFF' : 'rgba(29,58,68,0.35)',
            }}>
              Continuar
            </Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M5 12h14M13 6l6 6-6 6" stroke={selected ? '#fff' : 'rgba(29,58,68,0.35)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}
