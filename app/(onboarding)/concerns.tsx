import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useFonts } from 'expo-font';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_WHISPER = 'rgba(29,58,68,0.32)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM = '#FFFFFF';

const STEP = 5;
const TOTAL = 14;
const MAX_SELECT = 3;

const CONCERNS = [
  'Acne/espinhas', 'Manchas', 'Cravos', 'Oleosidade',
  'Rugas', 'Poros dilatados', 'Olheiras', 'Ressecamento',
  'Textura irregular', 'Outro',
];

export default function Concerns() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 2, step_name: 'Preocupações de Pele', step_total: 23 });
  }, []);

  const toggle = (item: string) => {
    setSelected((prev) => {
      if (prev.includes(item)) {
        const next = prev.filter((i) => i !== item);
        setOnboardingField('concerns', next);
        return next;
      }
      if (prev.length >= MAX_SELECT) return prev;
      const next = [...prev, item];
      setOnboardingField('concerns', next);
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleContinue = () => {
    track('onboarding_step_completed', { step_number: 2, step_name: 'Preocupações de Pele', step_total: 23 });
    router.push('/(onboarding)/skin-type');
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

        {/* Title block with counter */}
        <View style={{ paddingHorizontal: 28, paddingTop: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <Text style={{
              fontSize: 10, fontWeight: '600', color: CORAL_DEEP,
              letterSpacing: 2.4, textTransform: 'uppercase',
            }}>
              sua pele
            </Text>
            {selected.length > 0 && (
              <Text style={{
                fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
                fontStyle: 'italic', fontWeight: '500',
                fontSize: 15, color: CORAL_DEEP, letterSpacing: -0.3,
              }}>
                <Text style={{ color: CORAL_DEEP }}>{selected.length}</Text>
                <Text style={{ color: DEEP_WHISPER, fontStyle: 'normal', fontFamily: undefined }}>
                  {` selecionada${selected.length === 1 ? '' : 's'}`}
                </Text>
              </Text>
            )}
          </View>
          <Text style={{
            fontSize: 27, fontWeight: '700', color: DEEP,
            letterSpacing: -0.75, lineHeight: 30.24,
          }}>
            {'O que mais te '}
            <Text style={{
              fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
              fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -0.9,
            }}>
              incomoda
            </Text>
            {' na sua pele hoje?'}
          </Text>
          <Text style={{
            marginTop: 10, fontSize: 13.5, lineHeight: 19.6,
            color: DEEP_SOFT, letterSpacing: -0.05,
          }}>
            Selecione até 3. Vamos priorizar isso no seu protocolo.
          </Text>
        </View>

        {/* 2-column pill grid */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {CONCERNS.map((concern) => {
              const isSelected = selected.includes(concern);
              const isDisabled = !isSelected && selected.length >= MAX_SELECT;
              return (
                <TouchableOpacity
                  key={concern}
                  activeOpacity={0.8}
                  onPress={() => toggle(concern)}
                  style={{
                    width: '48%',
                    height: 56,
                    borderRadius: 100,
                    backgroundColor: '#FFFFFF',
                    borderWidth: isSelected ? 1.5 : 0.5,
                    borderColor: isSelected ? CORAL : DEEP_HAIR,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 14,
                    opacity: isDisabled ? 0.45 : 1,
                    shadowColor: isSelected ? CORAL : '#2B2724',
                    shadowOffset: { width: 0, height: isSelected ? 6 : 2 },
                    shadowOpacity: isSelected ? 0.22 : 0.04,
                    shadowRadius: isSelected ? 22 : 14,
                    elevation: isSelected ? 4 : 1,
                  }}
                >
                  <Text style={{
                    fontSize: 15, fontWeight: '500', color: DEEP,
                    letterSpacing: -0.2, lineHeight: 16.5, textAlign: 'center',
                  }}>
                    {concern}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* PrimaryButton */}
        <View style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 18 }}>
          <TouchableOpacity
            onPress={handleContinue}
            disabled={selected.length === 0}
            activeOpacity={0.85}
            style={{
              height: 60, borderRadius: 100,
              backgroundColor: selected.length > 0 ? CORAL : 'rgba(29,58,68,0.12)',
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: selected.length > 0 ? CORAL : 'transparent',
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: selected.length > 0 ? 0.55 : 0,
              shadowRadius: 15, elevation: selected.length > 0 ? 8 : 0,
            }}
          >
            <Text style={{
              fontSize: 17, fontWeight: '600', letterSpacing: -0.2,
              color: selected.length > 0 ? '#FFFFFF' : 'rgba(29,58,68,0.42)',
            }}>
              Continuar
            </Text>
            {selected.length > 0 && (
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
