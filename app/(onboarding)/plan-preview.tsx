import { useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Animated, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM = '#FFFFFF';

const CONCERN_PCT: Record<string, number> = {
  'Acne/espinhas': 78,
  'Manchas': 64,
  'Cravos': 72,
  'Oleosidade': 68,
  'Rugas': 71,
  'Poros dilatados': 65,
  'Olheiras': 62,
  'Ressecamento': 74,
  'Textura irregular': 69,
  'Outro': 63,
};

const DESIRE_TITLE_MAP: Record<string, { prefix: string; italic: string; suffix: string }> = {
  'Me sentir mais bonita e confiante':   { prefix: 'Como se sentir mais ',         italic: 'bonita e confiante',   suffix: ':' },
  'Ter um glow up que as pessoas notem': { prefix: 'Como ter um ',                  italic: 'glow up',              suffix: ' que as pessoas notem:' },
  'Aumentar minha autoestima de vez':    { prefix: 'Como aumentar a sua ',          italic: 'autoestima',           suffix: ' de vez:' },
  'Me sentir bem comigo mesma de novo':  { prefix: 'Como você vai se sentir ',      italic: 'bem',                  suffix: ' consigo mesma de novo:' },
  'Conquistar alguém especial':          { prefix: 'Como conquistar ',              italic: 'alguém especial',      suffix: ':' },
  'Outro':                               { prefix: 'Como transformar a sua ',       italic: 'pele',                 suffix: ':' },
};
const DEFAULT_DESIRE_TITLE = { prefix: 'Como se sentir mais ', italic: 'bonita e confiante', suffix: ':' };

const TIPS = [
  'Siga a rotina de skincare que definimos para você — ela foi feita para resolver o que mais te incomoda na sua pele hoje, e te fazer alcançar seu objetivo.',
  'Converse com a NIKS (especialista na sua pele) sempre que precisar de ajuda ou tiver algo te incomodando — ela vai saber resolver.',
  'Fotografe o que você come para descobrir como cada alimento está afetando sua pele, e o que comer para aumentar seus resultados.',
  'Use a NIKS para acompanhar a sua evolução ao longo do tempo.',
];

function SparkleIcon({ size = 14, color = CORAL }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3l1.8 5L19 10l-5.2 2L12 17l-1.8-5L5 10l5.2-2L12 3z" fill={color} />
    </Svg>
  );
}

function ArrowIcon({ size = 20, color = CORAL }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function PlanPreview() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
    'PlayfairDisplay-Regular': require('../../assets/fonts/PlayfairDisplay-Regular.ttf'),
    'CormorantGaramond-Italic': require('../../assets/fonts/CormorantGaramond-Italic.ttf'),
    'DMSans-MediumItalic': require('../../assets/fonts/DMSans-MediumItalic.ttf'),
  });
  const { width: screenW } = useWindowDimensions();
  const { track } = useMixpanel();
  const router = useRouter();

  const skinPreviewUrl = useAppStore((s) => s.skinPreviewUrl);
  const scanImageUri = useAppStore((s) => s.scanImageUri);
  const onboarding = useAppStore((s) => s.onboarding);
  const scanResult = useAppStore((s) => s.scanResult);

  const desireTitle = DESIRE_TITLE_MAP[onboarding.goal_desire ?? ''] ?? DEFAULT_DESIRE_TITLE;

  const spinAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
    ).start();
  }, []);
  const spinRotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const goals = useMemo(() => {
    if (!onboarding.objetivo) return [];
    return onboarding.objetivo.split(', ').filter(Boolean).slice(0, 3);
  }, [onboarding.objetivo]);

  const metricConcerns = useMemo(() => {
    return onboarding.concerns.slice(0, 3).map((name) => ({
      name,
      pct: Math.min(78, Math.max(60, CONCERN_PCT[name] ?? 65)),
    }));
  }, [onboarding.concerns]);

  const currentScore = scanResult?.skin_score ?? 0;

  const maxW = Math.min(screenW, 393);
  const innerW = maxW - 48;
  const cardW = (innerW - 12) / 2;
  const cardPhotoH = cardW * (4 / 3);
  const arrowTop = cardPhotoH / 2 - 18;

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 21, step_name: 'Protocolo Pronto', step_total: 23 });
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 36, paddingBottom: 110 }}
        >
          {/* Title block — centered */}
          <View style={{ paddingHorizontal: 28, alignItems: 'center' }}>
            <Text style={{
              fontSize: 10.5, fontWeight: '700', color: CORAL_DEEP,
              letterSpacing: 2.6, textTransform: 'uppercase', marginBottom: 12,
            }}>
              análise concluída
            </Text>
            <Text style={{
              fontSize: 28, fontWeight: '700', color: DEEP,
              letterSpacing: -0.85, lineHeight: 30.8, textAlign: 'center',
            }}>
              {'Sua rotina de skincare\nestá '}
              <Text style={{
                fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
                fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -1,
              }}>
                pronta
              </Text>
              {'.'}
            </Text>
            <Text style={{
              marginTop: 12, fontSize: 14, lineHeight: 21, color: DEEP_SOFT,
              letterSpacing: -0.05, textAlign: 'center', maxWidth: 320,
            }}>
              Veja a projeção que nossa equipe fez da sua transformação usando o NIKS:
            </Text>
          </View>

          {/* Before / After photo cards */}
          <View style={{ paddingHorizontal: 24, marginTop: 26, position: 'relative' }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>

              {/* "Hoje" card — desaturated */}
              <View style={{ flex: 1, alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: '100%', aspectRatio: 3 / 4,
                  borderRadius: 20, padding: 4,
                  backgroundColor: 'rgba(29,58,68,0.10)',
                  shadowColor: '#2B2724',
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.16, shadowRadius: 24, elevation: 3,
                }}>
                  {scanImageUri ? (
                    <Image
                      source={{ uri: scanImageUri }}
                      style={{ flex: 1, borderRadius: 16 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ flex: 1, borderRadius: 16, backgroundColor: 'rgba(29,58,68,0.08)' }} />
                  )}
                  <View style={{
                    position: 'absolute', bottom: 10, left: 0, right: 0,
                    alignItems: 'center',
                  }}>
                    <View style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
                      backgroundColor: 'rgba(255,255,255,0.92)',
                      shadowColor: '#2B2724', shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.12, shadowRadius: 8,
                    }}>
                      <Text style={{
                        fontSize: 10.5, fontWeight: '700', color: DEEP,
                        letterSpacing: 1.8, textTransform: 'uppercase',
                      }}>
                        Hoje
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DEEP_SOFT, letterSpacing: -0.05, textAlign: 'center' }}>
                  {'Seu Skin Score: '}
                  <Text style={{ color: CORAL, fontWeight: '700' }}>
                    {currentScore > 0 ? currentScore : '—'}
                  </Text>
                </Text>
              </View>

              {/* "Em 8 semanas" card — glow */}
              <View style={{ flex: 1, alignItems: 'center', gap: 10 }}>
                <LinearGradient
                  colors={[CORAL, '#F9C9B6']}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: '100%', aspectRatio: 3 / 4,
                    borderRadius: 20, padding: 4,
                    shadowColor: CORAL,
                    shadowOffset: { width: 0, height: 18 },
                    shadowOpacity: 0.45, shadowRadius: 40, elevation: 8,
                  }}
                >
                  {skinPreviewUrl ? (
                    <Image
                      source={{ uri: skinPreviewUrl }}
                      style={{ flex: 1, borderRadius: 16 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{
                      flex: 1, borderRadius: 16,
                      backgroundColor: 'rgba(251,123,107,0.10)',
                      alignItems: 'center', justifyContent: 'center', gap: 12,
                    }}>
                      <Animated.View style={{ transform: [{ rotate: spinRotate }] }}>
                        <Svg width={44} height={44} viewBox="0 0 48 48">
                          <SvgCircle cx={24} cy={24} r={20} stroke="rgba(255,255,255,0.35)" strokeWidth={3.5} fill="none" />
                          <SvgCircle
                            cx={24} cy={24} r={20}
                            stroke="#FFFFFF"
                            strokeWidth={3.5}
                            fill="none"
                            strokeDasharray={[82, 44]}
                            strokeLinecap="round"
                          />
                        </Svg>
                      </Animated.View>
                      <Text style={{
                        fontSize: 11, fontWeight: '700', color: '#FFFFFF',
                        letterSpacing: 0.4, textAlign: 'center', lineHeight: 15, opacity: 0.9,
                      }}>
                        {'Preparando sua\ntransformação...'}
                      </Text>
                    </View>
                  )}
                  <View style={{
                    position: 'absolute', bottom: 10, left: 0, right: 0,
                    alignItems: 'center',
                  }}>
                    <View style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
                      backgroundColor: CORAL,
                      shadowColor: CORAL, shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.4, shadowRadius: 14,
                    }}>
                      <Text style={{
                        fontSize: 10.5, fontWeight: '700', color: '#FFFFFF',
                        letterSpacing: 1.8, textTransform: 'uppercase',
                      }}>
                        Em 8 semanas
                      </Text>
                    </View>
                  </View>
                  <View style={{ position: 'absolute', top: 10, right: 10 }}>
                    <SparkleIcon size={18} color="#FFFFFF" />
                  </View>
                </LinearGradient>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DEEP_SOFT, letterSpacing: -0.05, textAlign: 'center' }}>
                  {'Seu Skin Score: '}
                  <Text style={{ color: CORAL, fontWeight: '700' }}>97</Text>
                </Text>
              </View>
            </View>

            {/* Arrow between cards */}
            <View style={{
              position: 'absolute',
              top: arrowTop,
              left: 0, right: 0,
              alignItems: 'center',
              zIndex: 2,
            }}>
              <View style={{
                width: 36, height: 36, borderRadius: 100,
                backgroundColor: '#FFFFFF',
                borderWidth: 1.5, borderColor: CORAL,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: CORAL,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.35, shadowRadius: 18, elevation: 4,
              }}>
                <ArrowIcon size={18} color={CORAL} />
              </View>
            </View>
          </View>

          {/* Metric improvement cards */}
          {metricConcerns.length > 0 && (
            <View style={{ paddingHorizontal: 24, marginTop: 28 }}>
              <Text style={{
                fontSize: 10.5, fontWeight: '700', color: CORAL,
                letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 12,
              }}>
                Onde você mais verá resultados:
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {metricConcerns.map(({ name, pct }) => (
                  <View key={name} style={{
                    flex: 1,
                    paddingTop: 18, paddingHorizontal: 10, paddingBottom: 16,
                    borderRadius: 20, backgroundColor: '#FFFFFF',
                    borderWidth: 1, borderColor: CORAL,
                    shadowColor: '#2B2724', shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05, shadowRadius: 14,
                    alignItems: 'center',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
                      <Text style={{
                        fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
                        fontSize: 40, color: CORAL,
                        letterSpacing: -1.6, lineHeight: 40,
                        fontVariant: ['tabular-nums'],
                      }}>{pct}</Text>
                      <Text style={{
                        fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
                        fontSize: 20, color: CORAL,
                        letterSpacing: -0.4,
                        fontVariant: ['tabular-nums'],
                      }}>%</Text>
                    </View>
                    <Text style={{
                      marginTop: 8,
                      fontSize: 9, fontWeight: '700', color: CORAL_DEEP,
                      letterSpacing: 1.8, textTransform: 'uppercase', opacity: 0.85,
                    }}>
                      DE MELHORA
                    </Text>
                    <Text style={{
                      marginTop: 4,
                      fontSize: 12.5, fontWeight: '600', color: DEEP,
                      letterSpacing: -0.1, lineHeight: 15.6, textAlign: 'center',
                    }}>
                      {name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* "Resultados garantidos" section */}
          {goals.length > 0 && (
            <View style={{ paddingHorizontal: 28, marginTop: 32 }}>
              <Text style={{
                fontSize: 22, fontWeight: '700', color: DEEP,
                letterSpacing: -0.6, lineHeight: 26,
              }}>
                {'Resultados '}
                <Text style={{
                  fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
                  fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -0.7,
                }}>
                  garantidos
                </Text>
                {':'}
              </Text>
              <Text style={{
                marginTop: 8, fontSize: 13.5, lineHeight: 20.25,
                color: DEEP_SOFT, letterSpacing: -0.05,
              }}>
                Os objetivos que você escolheu serão o foco do seu skincare.
              </Text>
              <View style={{ marginTop: 16, gap: 10 }}>
                {goals.map((goal, i) => (
                  <View key={i} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: 14, paddingHorizontal: 16,
                    backgroundColor: '#FFFFFF', borderRadius: 16,
                    borderWidth: 1, borderColor: 'rgba(29,58,68,0.08)',
                    shadowColor: '#2B2724', shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.03, shadowRadius: 14,
                  }}>
                    <View style={{
                      width: 28, height: 28, borderRadius: 100,
                      backgroundColor: CORAL,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      shadowColor: CORAL, shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.45, shadowRadius: 10,
                    }}>
                      <CheckIcon />
                    </View>
                    <Text style={{
                      flex: 1, fontSize: 15, fontWeight: '600', color: DEEP, letterSpacing: -0.15,
                    }}>
                      {goal}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Título dinâmico baseado no desejo selecionado em goal-desire */}
          <View style={{ paddingHorizontal: 28, marginTop: 32 }}>
            <Text style={{
              fontSize: 22, fontWeight: '700', color: DEEP,
              letterSpacing: -0.6, lineHeight: 26,
            }}>
              {desireTitle.prefix}
              <Text style={{
                fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
                fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -0.7,
              }}>
                {desireTitle.italic}
              </Text>
              {desireTitle.suffix}
            </Text>
            <View style={{ marginTop: 18, gap: 16 }}>
              {TIPS.map((text, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                  <View style={{
                    flexShrink: 0, width: 22, height: 22,
                    alignItems: 'center', justifyContent: 'center', marginTop: 1,
                  }}>
                    <ArrowIcon size={20} color={CORAL} />
                  </View>
                  <Text style={{
                    flex: 1, fontSize: 14, lineHeight: 21,
                    color: '#000000', letterSpacing: -0.05,
                  }}>
                    {text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Floating CTA */}
        <View style={{
          position: 'absolute', left: 24, right: 24, bottom: 24, zIndex: 5,
        }}>
          <TouchableOpacity
            onPress={() => {
              haptics.action();
              track('onboarding_step_completed', { step_number: 21, step_name: 'Protocolo Pronto', step_total: 23 });
              router.push('/(onboarding)/paywall-soft' as any);
            }}
            activeOpacity={0.85}
            style={{
              height: 60, borderRadius: 100, backgroundColor: CORAL,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: CORAL,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.45, shadowRadius: 16, elevation: 8,
            }}
          >
            <Text style={{
              fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: '#FFFFFF',
            }}>
              Continuar
            </Text>
            <ArrowIcon size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}
