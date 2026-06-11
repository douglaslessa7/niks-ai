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
const DEEP_WHISPER = 'rgba(29,58,68,0.32)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM = '#FFFFFF';

const STEP = 3;
const TOTAL = 14;
const MAX_SELECT = 3;

const GOALS = [
  'Glow natural e saudável',
  'Acabar com as espinhas',
  'Controlar acne',
  'Diminuir a oleosidade',
  'Rotina simples que funcione',
  'Encontrar os melhores produtos',
  'Entender o que prejudica a pele',
  'Pele mais firme e jovem',
];

export default function Goal() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 18, step_name: 'Objetivo Principal', step_total: 23 });
  }, []);

  const toggle = (goal: string) => {
    setSelected((prev) => {
      if (prev.includes(goal)) {
        const next = prev.filter((g) => g !== goal);
        setOnboardingField('objetivo', next.join(', '));
        return next;
      }
      if (prev.length >= MAX_SELECT) return prev;
      const next = [...prev, goal];
      setOnboardingField('objetivo', next.join(', '));
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleContinue = () => {
    track('onboarding_step_completed', { step_number: 18, step_name: 'Objetivo Principal', step_total: 23 });
    router.push('/(onboarding)/goal-validation');
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
          <View style={{ marginBottom: 10 }}>
            <Text style={{
              fontSize: 10, fontWeight: '600', color: CORAL_DEEP,
              letterSpacing: 2.4, textTransform: 'uppercase',
            }}>
              seus objetivos
            </Text>
          </View>
          <Text style={{
            fontSize: 25, fontWeight: '700', color: DEEP,
            letterSpacing: -0.7, lineHeight: 28.75,
          }}>
            {'O que você mais quer\npara a sua '}
            <Text style={{
              fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
              fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -0.9,
            }}>
              pele
            </Text>
            {'?'}
          </Text>
          <Text style={{
            marginTop: 8, fontSize: 13.5, lineHeight: 19.6,
            color: DEEP_SOFT, letterSpacing: -0.05,
          }}>
            Seus objetivos guiam toda a criação do seu protocolo. Escolha até três.
          </Text>
        </View>

        {/* Options */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 14, paddingBottom: 8, gap: 9 }}
          showsVerticalScrollIndicator={false}
        >
          {GOALS.map((goal) => {
            const isSelected = selected.includes(goal);
            const isDisabled = !isSelected && selected.length >= MAX_SELECT;
            return (
              <TouchableOpacity
                key={goal}
                activeOpacity={0.8}
                onPress={() => toggle(goal)}
                style={{
                  minHeight: 54, borderRadius: 100, backgroundColor: '#FFFFFF',
                  borderWidth: isSelected ? 1.5 : 0.5,
                  borderColor: isSelected ? CORAL : DEEP_HAIR,
                  paddingLeft: 26, paddingRight: 22,
                  flexDirection: 'row', alignItems: 'center',
                  opacity: isDisabled ? 0.45 : 1,
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
                  {goal}
                </Text>
                <View style={{
                  width: 24, height: 24, borderRadius: 100,
                  backgroundColor: isSelected ? CORAL : 'transparent',
                  borderWidth: isSelected ? 0 : 0.5,
                  borderColor: DEEP_HAIR,
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {isSelected && <Check size={13} color="#fff" strokeWidth={2.8} />}
                </View>
              </TouchableOpacity>
            );
          })}
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
