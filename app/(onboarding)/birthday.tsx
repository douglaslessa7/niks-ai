import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
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

// Tokens "Novo design app NIKS" (mesma identidade da home/chat/welcome)
const DEEP = '#121212';                 // títulos (ink)
const DEEP_SOFT = '#515151';            // subtítulos/corpo
const DEEP_HAIR = 'rgba(18,18,18,0.10)'; // hairlines/bordas
const CORAL = '#FF9D9D';                // acento primário (rosa da Rotina)
const CORAL_DEEP = '#F2808E';           // rosa mais fundo (eyebrow/estados)
const CREAM = '#FFFFFF';

const STEP = 1;
const TOTAL = 13;
const ITEM_HEIGHT = 60;
const AGES = Array.from({ length: 51 }, (_, i) => i + 10); // 10–60
const DEFAULT_AGE = 24;
const DEFAULT_INDEX = AGES.indexOf(DEFAULT_AGE); // 14

export default function Birthday() {
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

  const [selectedAge, setSelectedAge] = useState(DEFAULT_AGE);
  const selectedAgeRef = useRef(DEFAULT_AGE);
  const scrollRef = useRef<ScrollView>(null);
  // Guard so onLayout never resets scroll after the first mount
  const initialized = useRef(false);

  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 4, step_name: 'Idade', step_total: 23 });
  }, []);

  const handleLayout = useCallback(() => {
    if (initialized.current) return;
    initialized.current = true;
    scrollRef.current?.scrollTo({ y: DEFAULT_INDEX * ITEM_HEIGHT, animated: false });
  }, []);

  // Real-time visual update while scrolling
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(Math.round(y / ITEM_HEIGHT), AGES.length - 1));
    const age = AGES[index];
    if (age !== selectedAgeRef.current) {
      selectedAgeRef.current = age;
      setSelectedAge(age);
    }
  }, []);

  // Fires when drag ends (covers slow drags where momentum never starts)
  const handleScrollEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(Math.round(y / ITEM_HEIGHT), AGES.length - 1));
    const age = AGES[index];
    selectedAgeRef.current = age;
    setSelectedAge(age);
    setOnboardingField('birthday', String(age));
    haptics.select();
  }, [setOnboardingField]);

  // Fires after a flick with momentum
  const handleMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(Math.round(y / ITEM_HEIGHT), AGES.length - 1));
    const age = AGES[index];
    selectedAgeRef.current = age;
    setSelectedAge(age);
    setOnboardingField('birthday', String(age));
    haptics.select();
  }, [setOnboardingField]);

  const handleContinue = () => {
    haptics.action();
    setOnboardingField('birthday', String(selectedAgeRef.current));
    track('onboarding_step_completed', { step_number: 4, step_name: 'Idade', step_total: 23 });
    router.push('/(onboarding)/gender');
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
            backgroundColor: 'rgba(18,18,18,0.06)', overflow: 'hidden',
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
            sobre você
          </Text>
          <Text style={{
            fontFamily: fXBold, fontSize: 30, fontWeight: '800', color: DEEP,
            letterSpacing: -0.85, lineHeight: 33,
          }}>
            {'Quantos '}
            <Text style={{
              fontFamily: fXBold, fontWeight: '800', color: CORAL, letterSpacing: -1,
            }}>
              anos
            </Text>
            {' você tem?'}
          </Text>
          <Text style={{
            fontFamily: fReg, marginTop: 14, fontSize: 14.5, lineHeight: 21.75,
            color: DEEP_SOFT, letterSpacing: -0.1,
          }}>
            Sua pele muda completamente com a idade. Seu skincare também precisa mudar.
          </Text>
        </View>

        {/* Age Wheel */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {/* Height constrains the visible window; no overflow:hidden so touches aren't clipped */}
          <View style={{ height: ITEM_HEIGHT * 5 }}>
            <ScrollView
              ref={scrollRef}
              onLayout={handleLayout}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={handleScroll}
              onScrollEndDrag={handleScrollEndDrag}
              onMomentumScrollEnd={handleMomentumScrollEnd}
              contentContainerStyle={{
                paddingTop: ITEM_HEIGHT * 2,
                paddingBottom: ITEM_HEIGHT * 2,
              }}
            >
              {AGES.map((age) => {
                const dist = Math.abs(age - selectedAge);
                let fontSize = 17;
                let opacity = 0.18;
                let fontWeight: '400' | '700' = '400';
                let letterSpacing = -0.2;
                let color = DEEP;
                if (dist === 0) {
                  fontSize = 56;
                  fontWeight = '700';
                  opacity = 1;
                  letterSpacing = -1.8;
                  color = CORAL;
                } else if (dist === 1) {
                  fontSize = 22;
                  opacity = 0.35;
                  letterSpacing = -0.3;
                } else if (dist === 2) {
                  fontSize = 17;
                  opacity = 0.18;
                }
                return (
                  <View
                    key={age}
                    style={{ height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{
                      fontFamily: fontWeight === '700' ? fXBold : fReg,
                      fontSize, fontWeight, color, letterSpacing,
                      lineHeight: ITEM_HEIGHT, opacity,
                    }}>
                      {age}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* ANOS label */}
          <Text style={{
            fontFamily: fSemi, marginTop: 14,
            fontSize: 10, fontWeight: '600', color: DEEP_SOFT,
            letterSpacing: 2.4, textTransform: 'uppercase',
          }}>
            anos
          </Text>
        </View>

        {/* PrimaryButton */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 22 }}>
          <TouchableOpacity
            onPress={handleContinue}
            activeOpacity={0.85}
            style={{
              height: 60, borderRadius: 100, backgroundColor: CORAL,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: CORAL,
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: 0.55,
              shadowRadius: 15, elevation: 8,
            }}
          >
            <Text style={{
              fontFamily: fSemi, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: '#FFFFFF',
            }}>
              Continuar
            </Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}
