import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useFonts } from 'expo-font';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_WHISPER = 'rgba(29,58,68,0.32)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM = '#FFFFFF';

const STEP = 12;
const TOTAL = 14;
const CHART_H = 220;
const WITHOUT_H = Math.round(CHART_H * 0.22); // 48

export default function SocialProof() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 10, step_name: 'Social Proof', step_total: 23 });
  }, []);

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
            seu potencial
          </Text>
          <Text style={{
            fontSize: 26, fontWeight: '700', color: DEEP,
            letterSpacing: -0.85, lineHeight: 28.6,
          }}>
            {'Com o NIKS, você vai conseguir 3x '}
            <Text style={{
              fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
              fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -1,
            }}>
              mais rápido
            </Text>
            {'.'}
          </Text>
        </View>

        {/* Comparison card */}
        <View style={{ paddingHorizontal: 24, paddingTop: 26, flex: 1 }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 28,
            borderWidth: 0.5, borderColor: DEEP_HAIR,
            padding: 22,
            shadowColor: '#2B2724',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.10,
            shadowRadius: 36,
            elevation: 4,
          }}>
            {/* Column headers */}
            <View style={{ flexDirection: 'row', gap: 14, marginBottom: 16 }}>
              <Text style={{
                flex: 1, fontSize: 10.5, fontWeight: '700', color: DEEP_WHISPER,
                letterSpacing: 2.4, textTransform: 'uppercase', textAlign: 'center',
              }}>
                sem o NIKS
              </Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {/* Orb spark — radial gradient peach, igual ao design de referência */}
                <View style={{
                  shadowColor: CORAL,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 6,
                }}>
                  <Svg width={10} height={10} viewBox="0 0 10 10">
                    <Defs>
                      <RadialGradient id="spOrb" cx="35%" cy="30%" r="70%">
                        <Stop offset="0%" stopColor="#FFEFE4" />
                        <Stop offset="35%" stopColor="#F9C9B6" />
                        <Stop offset="75%" stopColor="#E89178" />
                        <Stop offset="100%" stopColor="#C86651" />
                      </RadialGradient>
                    </Defs>
                    <Circle cx="5" cy="5" r="5" fill="url(#spOrb)" />
                  </Svg>
                </View>
                <Text style={{
                  fontSize: 10.5, fontWeight: '700', color: DEEP,
                  letterSpacing: 2.4, textTransform: 'uppercase',
                }}>
                  com o NIKS
                </Text>
              </View>
            </View>

            {/* Bars */}
            <View style={{ flexDirection: 'row', gap: 14, height: CHART_H, alignItems: 'flex-end' }}>
              {/* Without bar — short stump */}
              <View style={{
                flex: 1, height: WITHOUT_H, borderRadius: 18,
                backgroundColor: 'rgba(29,58,68,0.06)',
                borderWidth: 0.5, borderColor: DEEP_HAIR,
                alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 8, paddingVertical: 6,
              }}>
                <Text style={{
                  fontSize: 22, fontWeight: '700', color: DEEP,
                  letterSpacing: -0.6, lineHeight: 22,
                }}>
                  22%
                </Text>
                <Text style={{
                  marginTop: 4, fontSize: 11, color: DEEP_SOFT, letterSpacing: -0.05,
                }}>
                  Eficácia
                </Text>
              </View>

              {/* With NIKS bar — full height coral */}
              <View style={{
                flex: 1, height: CHART_H, borderRadius: 18,
                backgroundColor: CORAL,
                shadowColor: CORAL,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.45,
                shadowRadius: 26,
                elevation: 6,
                alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 8,
              }}>
                <Text style={{
                  fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
                  fontStyle: 'italic', fontWeight: '600',
                  fontSize: 64, color: '#FFFFFF',
                  letterSpacing: -1.5, lineHeight: 64,
                }}>
                  3x
                </Text>
                <Text style={{
                  marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.78)',
                  letterSpacing: -0.05, fontWeight: '500',
                }}>
                  Mais resultado
                </Text>
              </View>
            </View>

            {/* Caption */}
            <Text style={{
              marginTop: 20, fontSize: 13, lineHeight: 19.5,
              color: DEEP_SOFT, letterSpacing: -0.05, textAlign: 'center',
              paddingHorizontal: 6,
            }}>
              O NIKS conhece a sua pele melhor que ninguém e monta o skincare exato que você precisa para atingir seu objetivo, sem erros.
            </Text>
          </View>
        </View>

        {/* PrimaryButton */}
        <View style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 18 }}>
          <TouchableOpacity
            onPress={() => {
              track('onboarding_step_completed', { step_number: 10, step_name: 'Social Proof', step_total: 23 });
              router.push('/(scan)/rate-us' as any);
            }}
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
              fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: '#FFFFFF',
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
