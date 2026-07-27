import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Sun, Sparkles, User, Glasses, Smile } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useFonts } from 'expo-font';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM = '#FFFFFF';

const STEP = 13;
const TOTAL = 13;

const TIPS = [
  { Icon: Sun, label: 'Local com boa iluminação' },
  { Icon: Sparkles, label: 'Rosto limpo, sem maquiagem' },
  { Icon: User, label: 'Cabelo preso' },
  { Icon: Glasses, label: 'Sem óculos' },
  { Icon: Smile, label: 'Expressão neutra na foto' },
];

export default function ScanPrep() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const router = useRouter();
  const { track } = useMixpanel();
  const { scanSource } = useAppStore();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 13, step_name: 'Análise com IA', step_total: 23 });
  }, []);

  const handleOpenCamera = () => {
    haptics.action();
    track('onboarding_step_completed', { step_number: 13, step_name: 'Análise com IA', step_total: 23 });
    router.push('/(scan)/camera' as any);
  };

  return (
    <>
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
            {scanSource !== 'app' && (
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
            )}
          </View>

          {/* Title block */}
          <View style={{ paddingHorizontal: 28, paddingTop: 28 }}>
            <Text style={{
              fontSize: 10.5, fontWeight: '700', color: CORAL_DEEP,
              letterSpacing: 2.6, textTransform: 'uppercase', marginBottom: 14,
            }}>
              análise da pele
            </Text>
            <Text style={{
              fontSize: 28, fontWeight: '700', color: DEEP,
              letterSpacing: -0.85, lineHeight: 31.36,
            }}>
              {'Agora vamos analisar a sua '}
              <Text style={{
                fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
                fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -1,
              }}>
                pele
              </Text>
              {' por foto.'}
            </Text>
            <Text style={{
              marginTop: 14, fontSize: 14.5, lineHeight: 21.75,
              color: DEEP_SOFT, letterSpacing: -0.1,
            }}>
              Para uma análise mais precisa, se certifique:
            </Text>
          </View>

          {/* Tips list */}
          <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24, gap: 18 }}>
            {TIPS.map(({ Icon, label }, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={{
                  flexShrink: 0,
                  width: 46, height: 46, borderRadius: 100,
                  backgroundColor: CORAL,
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: CORAL,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.55,
                  shadowRadius: 18,
                  elevation: 4,
                }}>
                  <Icon size={22} color="#FFFFFF" strokeWidth={2} />
                </View>
                <Text style={{
                  fontSize: 16.5, fontWeight: '600', color: DEEP,
                  letterSpacing: -0.2, lineHeight: 21.45,
                  flex: 1,
                }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {/* PrimaryButton */}
          <View style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 18 }}>
            <TouchableOpacity
              onPress={handleOpenCamera}
              activeOpacity={0.85}
              style={{
                height: 60, borderRadius: 100, backgroundColor: CORAL,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                shadowColor: CORAL,
                shadowOffset: { width: 0, height: 14 },
                shadowOpacity: 0.55,
                shadowRadius: 22, elevation: 8,
              }}
            >
              <Text style={{
                fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: '#FFFFFF',
              }}>
                Abrir câmera
              </Text>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          </View>

        </View>
      </SafeAreaView>
    </>
  );
}
