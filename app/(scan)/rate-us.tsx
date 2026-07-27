import { useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Svg, { Path, Ellipse } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
// Tela desativada: fora do fluxo de onboarding (política da Apple).
// import { requestAppReview } from '../../lib/storeReview';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CREAM = '#FFFFFF';
const STEP = 13;
const TOTAL = 14;
const STAR_GOLD = '#F2B33A';

const REVIEWS = [
  {
    name: 'Mariana Silva',
    photo: require('../../assets/review-mariana.png'),
    quote: 'Minha pele já melhorou muito em 2 meses! Eu estava cética no início, mas decidi dar uma chance e funcionou :)',
  },
  {
    name: 'Beatriz Costa',
    photo: require('../../assets/review-beatriz.png'),
    quote: 'Em 6 semanas minha pele já tava outra. Acho que a melhor coisa é quando acordo com uma espinha e a NIKS me diz como desinflamar antes de eu sair de casa.',
  },
  {
    name: 'Larissa Mendes',
    photo: require('../../assets/review-larissa.png'),
    quote: 'Poder mandar foto e perguntar qualquer coisa pra NIKS mudou tudo pra mim. É como ter uma derma no bolso. Minha pele nunca esteve tão bem.',
  },
];

const CARD_W = 260;
const CARD_GAP = 12;
const SINGLE_W = (CARD_W + CARD_GAP) * REVIEWS.length;

function StarIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5l2.95 6.5 7.05.7-5.3 4.85L18.2 21.5 12 17.85 5.8 21.5l1.5-6.95L2 9.7l7.05-.7L12 2.5z"
        fill={STAR_GOLD}
      />
    </Svg>
  );
}

function LaurelLeft() {
  const yPositions = [6, 14, 22, 30, 38];
  return (
    <Svg width={34} height={50} viewBox="0 0 34 50" fill="none">
      <Path
        d="M28 4C20 8 14 14 11 22c-3 8-2 16 3 22"
        stroke={STAR_GOLD} strokeWidth="1.6" strokeLinecap="round"
      />
      {yPositions.map((y, i) => {
        const cx = 26 - i * 3.2;
        return (
          <Ellipse
            key={i}
            cx={cx} cy={y}
            rx={5} ry={2.6}
            fill={STAR_GOLD} opacity={0.85}
            transform={`rotate(${-50 + i * 8}, ${cx}, ${y})`}
          />
        );
      })}
    </Svg>
  );
}

function LaurelRight() {
  const yPositions = [6, 14, 22, 30, 38];
  return (
    <Svg width={34} height={50} viewBox="0 0 34 50" fill="none" style={{ transform: [{ scaleX: -1 }] }}>
      <Path
        d="M28 4C20 8 14 14 11 22c-3 8-2 16 3 22"
        stroke={STAR_GOLD} strokeWidth="1.6" strokeLinecap="round"
      />
      {yPositions.map((y, i) => {
        const cx = 26 - i * 3.2;
        return (
          <Ellipse
            key={i}
            cx={cx} cy={y}
            rx={5} ry={2.6}
            fill={STAR_GOLD} opacity={0.85}
            transform={`rotate(${-50 + i * 8}, ${cx}, ${y})`}
          />
        );
      })}
    </Svg>
  );
}

export default function RateUs() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const router = useRouter();
  const { track } = useMixpanel();
  const { scanSource, setScanSource } = useAppStore();

  const scrollX = useRef(new Animated.Value(0)).current;

  // Pop-up de avaliação desativado (política da Apple: só depois de uso real do app).
  // useEffect(() => {
  //   requestAppReview();
  // }, []);

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 16, step_name: 'Avalie Nos', step_total: 23 });
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.timing(scrollX, {
        toValue: -SINGLE_W,
        duration: 24000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', { step_number: 16, step_name: 'Avalie Nos', step_total: 23 });
    if (scanSource === 'app') {
      setScanSource('onboarding');
      router.replace('/(app)/skin-result' as any);
    } else {
      router.push('/(scan)/scan-prep' as any);
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
            backgroundColor: 'rgba(29,58,68,0.08)', overflow: 'hidden',
          }}>
            <View style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${(STEP / TOTAL) * 100}%`,
              backgroundColor: CORAL, borderRadius: 100,
            }} />
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 110 }}
        >
          {/* Title */}
          <View style={{ paddingHorizontal: 28, paddingTop: 14 }}>
            <Text style={{
              fontSize: 32, fontWeight: '700', color: DEEP,
              letterSpacing: -0.9, lineHeight: 33.6,
            }}>
              Avalie-nos
            </Text>
          </View>

          {/* Laurel + prompt + stars */}
          <View style={{ marginTop: 28, paddingHorizontal: 28, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <LaurelLeft />
              <Text style={{
                fontSize: 19, fontWeight: '700', color: DEEP,
                letterSpacing: -0.4, lineHeight: 23.75, textAlign: 'center', maxWidth: 220,
              }}>
                {'Deixe a sua avaliação\ndo nosso app!'}
              </Text>
              <LaurelRight />
            </View>
            <View style={{ marginTop: 14, flexDirection: 'row', gap: 6 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <StarIcon key={i} size={22} />
              ))}
            </View>
          </View>

          {/* "O NIKS foi feito para pessoas como você." */}
          <View style={{ marginTop: 38, paddingHorizontal: 28, alignItems: 'center' }}>
            <Text style={{
              fontSize: 22, fontWeight: '700', color: DEEP,
              letterSpacing: -0.6, lineHeight: 26.4, textAlign: 'center', maxWidth: 320,
            }}>
              {'O NIKS foi feito para\npessoas como '}
              <Text style={{
                fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
                fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -0.7,
              }}>
                você
              </Text>
              {'.'}
            </Text>

            {/* Avatar trio — Beatriz (left) | Mariana (center) | Larissa (right) */}
            <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                zIndex: 1, transform: [{ translateX: 14 }],
                shadowColor: '#2B2724', shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.22, shadowRadius: 11, elevation: 5,
              }}>
                <Image
                  source={REVIEWS[1].photo}
                  style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 3, borderColor: '#FFFFFF' }}
                />
              </View>
              <View style={{
                zIndex: 2,
                shadowColor: '#2B2724', shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.22, shadowRadius: 11, elevation: 5,
              }}>
                <Image
                  source={REVIEWS[0].photo}
                  style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#FFFFFF' }}
                />
              </View>
              <View style={{
                zIndex: 1, transform: [{ translateX: -14 }],
                shadowColor: '#2B2724', shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.22, shadowRadius: 11, elevation: 5,
              }}>
                <Image
                  source={REVIEWS[2].photo}
                  style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 3, borderColor: '#FFFFFF' }}
                />
              </View>
            </View>
          </View>

          {/* Review cards marquee with edge fade */}
          <View style={{ marginTop: 28, overflow: 'hidden' }}>
            <Animated.View style={{
              flexDirection: 'row',
              paddingLeft: 24,
              paddingVertical: 6,
              transform: [{ translateX: scrollX }],
            }}>
              {[...REVIEWS, ...REVIEWS, ...REVIEWS].map((r, i) => (
                <View key={i} style={{
                  width: CARD_W, marginRight: CARD_GAP,
                  paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16,
                  borderRadius: 22,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 0.5, borderColor: DEEP_HAIR,
                  shadowColor: '#2B2724',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.07, shadowRadius: 6,
                  elevation: 1,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Image
                      source={r.photo}
                      style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0 }}
                    />
                    <Text style={{
                      flex: 1, fontSize: 13.5, fontWeight: '700', color: DEEP,
                      letterSpacing: -0.2,
                    }} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {[0, 1, 2, 3, 4].map((j) => (
                        <StarIcon key={j} size={11} />
                      ))}
                    </View>
                  </View>
                  <Text style={{
                    fontSize: 12.5, lineHeight: 18.75, color: DEEP_SOFT, letterSpacing: -0.05,
                  }}>
                    {r.quote}
                  </Text>
                </View>
              ))}
            </Animated.View>

            {/* Edge fade — left */}
            <LinearGradient
              colors={['#FFFFFF', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 24 }}
              pointerEvents="none"
            />
            {/* Edge fade — right */}
            <LinearGradient
              colors={['rgba(255,255,255,0)', '#FFFFFF']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 24 }}
              pointerEvents="none"
            />
          </View>
        </ScrollView>

        {/* Floating CTA */}
        <View style={{
          position: 'absolute', left: 24, right: 24, bottom: 24, zIndex: 5,
        }}>
          <TouchableOpacity
            onPress={handleContinue}
            activeOpacity={0.85}
            style={{
              height: 60, borderRadius: 100, backgroundColor: CORAL,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: CORAL,
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: 0.55, shadowRadius: 15, elevation: 8,
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
