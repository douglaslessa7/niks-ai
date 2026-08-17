import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
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

const DEEP = '#121212';
const DEEP_SOFT = '#515151';
const DEEP_WHISPER = '#818181';
const DEEP_HAIR = 'rgba(18,18,18,0.10)';
const CORAL = '#FF9D9D';
const CORAL_DEEP = '#F2808E';
const CREAM = '#FFFFFF';

const STEP = 10;
const TOTAL = 13;

export default function AllergiesDetail() {
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

  const { onboarding, setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  const [description, setDescription] = useState(onboarding.allergy_description ?? '');
  const [focused, setFocused] = useState(false);

  const isActive = description.length >= 4;

  useEffect(() => {
    track('onboarding_step_viewed', { step_name: 'allergies_detail' });
  }, []);

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', { step_name: 'allergies_detail' });
    router.push('/(onboarding)/goal-desire');
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
            sua saúde
          </Text>
          <Text style={{
            fontFamily: fXBold, fontSize: 26, fontWeight: '800', color: DEEP,
            letterSpacing: -0.85, lineHeight: 28.6,
          }}>
            {'Qual '}
            <Text style={{
              fontFamily: fXBold, fontWeight: '800', color: CORAL, letterSpacing: -1,
            }}>
              ativo
            </Text>
            {' ou produto causou reação?'}
          </Text>
          <Text style={{
            fontFamily: fReg, marginTop: 14, fontSize: 14.5, lineHeight: 21.75,
            color: DEEP_SOFT, letterSpacing: -0.1,
          }}>
            Pode ser um ingrediente, marca ou produto específico.
          </Text>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              multiline
              numberOfLines={5}
              placeholder="Ex: retinol, ácido glicólico, protetor solar X..."
              placeholderTextColor={DEEP_WHISPER}
              value={description}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChangeText={(text) => {
                setDescription(text);
                setOnboardingField('allergy_description', text || null);
              }}
              textAlignVertical="top"
              style={{
                backgroundColor: '#FFFFFF',
                fontFamily: fReg,
                borderRadius: 22,
                paddingHorizontal: 18,
                paddingVertical: 16,
                fontSize: 15.5,
                lineHeight: 22.5,
                color: DEEP,
                letterSpacing: -0.1,
                minHeight: 132,
                borderWidth: focused || isActive ? 1.5 : 1,
                borderColor: focused || isActive ? CORAL : DEEP_HAIR,
                shadowColor: focused || isActive ? CORAL : '#2B2724',
                shadowOffset: { width: 0, height: focused || isActive ? 6 : 2 },
                shadowOpacity: focused || isActive ? 0.22 : 0.04,
                shadowRadius: focused || isActive ? 22 : 14,
              }}
            />
          </ScrollView>

          {/* PrimaryButton */}
          <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 18 }}>
            <TouchableOpacity
              onPress={handleContinue}
              disabled={!isActive}
              activeOpacity={0.85}
              style={{
                height: 60, borderRadius: 100,
                backgroundColor: isActive ? CORAL : 'rgba(18,18,18,0.12)',
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                shadowColor: isActive ? CORAL : 'transparent',
                shadowOffset: { width: 0, height: 14 },
                shadowOpacity: isActive ? 0.55 : 0,
                shadowRadius: 15, elevation: isActive ? 8 : 0,
              }}
            >
              <Text style={{
                fontFamily: fSemi, fontSize: 17, fontWeight: '600', letterSpacing: -0.2,
                color: isActive ? '#FFFFFF' : 'rgba(18,18,18,0.42)',
              }}>
                Continuar
              </Text>
              {isActive && (
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

      </View>
    </SafeAreaView>
  );
}
