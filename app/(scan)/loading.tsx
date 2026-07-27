import { useEffect, useState, useRef } from 'react';
import { View, Text, Animated, TouchableOpacity } from 'react-native';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import Svg, {
  Path, Line, Circle, Defs,
  LinearGradient as SvgLinearGradient, Stop,
} from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import {
  Canvas, Circle as SkiaCircle, RadialGradient, vec, BlurMask,
} from '@shopify/react-native-skia';
import { supabase } from '../../lib/supabase';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM = '#FFFFFF';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const STEPS = [
  { at: 14, label: 'Mapeando os pontos do seu rosto' },
  { at: 28, label: 'Identificando seu tipo de pele' },
  { at: 43, label: 'Avaliando oleosidade da pele' },
  { at: 57, label: 'Identificando manchas e pigmentação' },
  { at: 71, label: 'Avaliando textura e poros da pele' },
  { at: 86, label: 'Detectando necessidades da pele' },
  { at: 100, label: 'Montando seu protocolo personalizado' },
];

const HEADLINES = [
  { prefix: 'Analisando sua', highlight: 'pele' },
  { prefix: 'Identificando seus', highlight: 'padrões' },
  { prefix: 'Calculando seu Skin', highlight: 'Score' },
  { prefix: 'Finalizando sua', highlight: 'análise' },
];

const RING_SIZE = 220;
const RING_STROKE = 6;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

export default function Loading() {
  const router = useRouter();
  const { skinImageBase64, skinImageUri, onboarding, setScanResult, scanSource, setSelectedScan, setSkinPreviewUrl } = useAppStore();
  const { track } = useMixpanel();

  const [percentage, setPercentage] = useState(0);
  const [showDemandNotice, setShowDemandNotice] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const [showError, setShowError] = useState(false);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPercentageRef = useRef(0);
  const retryCount = useRef(0);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const bobAnim = useRef(new Animated.Value(0)).current;
  const haloAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const ringProgressAnim = useRef(new Animated.Value(0)).current;
  const stepOpacities = useRef(STEPS.map(() => new Animated.Value(0.35))).current;
  const headlineFadeAnim = useRef(new Animated.Value(1)).current;
  const headlineSlideAnim = useRef(new Animated.Value(0)).current;

  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });

  const headlineIdx = Math.min(HEADLINES.length - 1, Math.floor(percentage / (100 / HEADLINES.length)));
  const currentHeadline = HEADLINES[headlineIdx];
  const ringOffsetAnim = ringProgressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [RING_C, 0],
  });
  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [200, -400],
  });

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, { toValue: -4, duration: 1800, useNativeDriver: true }),
        Animated.timing(bobAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(haloAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 1500, useNativeDriver: true })
    ).start();
  }, []);

  useEffect(() => {
    Animated.timing(ringProgressAnim, {
      toValue: percentage,
      duration: 450,
      useNativeDriver: false,
    }).start();
    STEPS.forEach((s, i) => {
      const active = percentage >= s.at - 18 && percentage < s.at;
      const done = percentage >= s.at;
      Animated.timing(stepOpacities[i], {
        toValue: done || active ? 1 : 0.35,
        duration: 350,
        useNativeDriver: true,
      }).start();
    });
  }, [percentage]);

  useEffect(() => {
    headlineFadeAnim.setValue(0);
    headlineSlideAnim.setValue(8);
    Animated.parallel([
      Animated.timing(headlineFadeAnim, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(headlineSlideAnim, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]).start();
  }, [headlineIdx]);

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 15, step_name: 'Analisando Pele', step_total: 23 });
    retryCount.current = 0;

    const runSkinPreview = async () => {
      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/generate-skin-preview`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ image: skinImageBase64 }),
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.preview_url) setSkinPreviewUrl(data.preview_url);
        }
      } catch (e) {
        console.warn('Skin preview generation failed (non-blocking):', e);
      }
    };
    runSkinPreview();

    const tickProgress = () => {
      const current = currentPercentageRef.current;
      if (current >= 99) return;
      let delay: number;
      if (current < 60) delay = 90;
      else if (current < 75) delay = 220;
      else if (current < 85) delay = 500;
      else if (current < 92) delay = 1200;
      else if (current < 96) delay = 3500;
      else delay = 8000;
      progressTimerRef.current = setTimeout(() => {
        const next = current + 1;
        currentPercentageRef.current = next;
        setPercentage(next);
        tickProgress();
      }, delay);
    };
    tickProgress();

    const runAnalysis = async () => {
      try {
        const birthdayVal = onboarding.birthday;
        let idadeNum: number | null = null;
        if (birthdayVal) {
          const asNum = Number(birthdayVal);
          if (!isNaN(asNum) && asNum > 0 && asNum < 120) {
            idadeNum = asNum;
          } else {
            const d = new Date(birthdayVal);
            if (!isNaN(d.getTime())) {
              idadeNum = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            }
          }
        }

        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/analyze-skin`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              imageBase64: skinImageBase64,
              skinProfile: {
                skin_type: onboarding.skin_type,
                concerns: onboarding.concerns,
                genero: onboarding.genero,
                idade: idadeNum,
                sun_exposure: onboarding.sun_exposure,
                hydration: onboarding.hydration,
                sleep: onboarding.sleep,
                objetivo: onboarding.objetivo,
              },
            }),
          }
        );
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(JSON.stringify(errBody));
        }
        const data = await response.json();

        setSelectedScan(null);
        setScanResult(data, skinImageUri ?? '');
        track('scan_completed', { skin_score: data.skin_score, skin_type: data.skin_type_detected });
        setPercentage(100);

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { skinImageBase64: b64 } = useAppStore.getState();
            let fotoUrl = '';
            if (b64) {
              const path = `${user.id}/${Date.now()}.jpg`;
              const binaryStr = atob(b64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const { error: upErr } = await supabase.storage
                .from('scans').upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: false });
              if (!upErr) {
                const { data: signed } = await supabase.storage.from('scans').createSignedUrl(path, 31536000);
                fotoUrl = signed?.signedUrl ?? supabase.storage.from('scans').getPublicUrl(path).data.publicUrl;
              }
            }
            await supabase.from('skin_scans').insert({
              user_id: user.id,
              foto_url: fotoUrl,
              skin_score: data.skin_score,
              tipo_pele: data.skin_type_detected,
              metricas: { acne: data.acne, skin_age: data.skin_age },
              areas_atencao: data.pontos_fracos,
              resumo: data.headline,
              full_result: data,
            });
          }
        } catch (e) {
          console.warn('Failed to save scan to DB:', e);
        }

        setTimeout(() => {
          track('onboarding_step_completed', { step_number: 15, step_name: 'Analisando Pele', step_total: 23 });
          if (scanSource === 'app') {
            router.replace('/(app)/skin-result' as any);
          } else {
            router.push('/(scan)/results');
          }
        }, 500);
      } catch (err) {
        if (retryCount.current < 2) {
          retryCount.current += 1;
          await new Promise(resolve => setTimeout(resolve, 2000));
          await runAnalysis();
        } else {
          track('scan_failed', { error: (err as any)?.message ?? 'unknown' });
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
          setShowError(true);
        }
      }
    };
    runAnalysis();

    return () => { if (progressTimerRef.current) clearTimeout(progressTimerRef.current); };
  }, []);

  useEffect(() => {
    if (percentage >= 99 && !showError) {
      demandTimerRef.current = setTimeout(() => setShowDemandNotice(true), 3000);
    } else {
      if (demandTimerRef.current) clearTimeout(demandTimerRef.current);
      setShowDemandNotice(false);
    }
    return () => { if (demandTimerRef.current) clearTimeout(demandTimerRef.current); };
  }, [percentage, showError]);

  useEffect(() => {
    if (!showDemandNotice) {
      if (countdownRef.current) clearTimeout(countdownRef.current);
      setCountdown(60);
      setCountdownPaused(false);
      return;
    }
    const tick = (current: number, paused: boolean) => {
      if (paused) return;
      if (current <= 1) {
        setCountdownPaused(true);
        setCountdown(0);
        countdownRef.current = setTimeout(() => {
          setCountdown(60);
          setCountdownPaused(false);
          countdownRef.current = setTimeout(() => tick(60, false), 1000);
        }, 3000);
        return;
      }
      const next = current - 1;
      setCountdown(next);
      countdownRef.current = setTimeout(() => tick(next, false), 1000);
    };
    countdownRef.current = setTimeout(() => tick(60, false), 1000);
    return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
  }, [showDemandNotice]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

        {!showError ? (
          <>
            {/* High demand notice */}
            {showDemandNotice && (
              <View style={{
                marginHorizontal: 24, marginTop: 12,
                backgroundColor: CORAL,
                borderRadius: 14, padding: 12,
                flexDirection: 'row', alignItems: 'flex-start', gap: 9,
              }}>
                <View style={{ marginTop: 1, flexShrink: 0 }}>
                  <Svg width={16} height={16} viewBox="0 0 16 16">
                    <Path d="M4 2h8v2.5C12 6.5 9.5 8 8 8C6.5 8 4 6.5 4 4.5V2z" stroke="white" strokeWidth={1.3} strokeLinejoin="round" fill="none" />
                    <Path d="M4 14h8v-2.5C12 9.5 9.5 8 8 8C6.5 8 4 9.5 4 11.5V14z" stroke="white" strokeWidth={1.3} strokeLinejoin="round" fill="none" />
                    <Line x1={3} y1={2} x2={13} y2={2} stroke="white" strokeWidth={1.3} strokeLinecap="round" />
                    <Line x1={3} y1={14} x2={13} y2={14} stroke="white" strokeWidth={1.3} strokeLinecap="round" />
                  </Svg>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 }}>
                    Estamos com alta demanda agora
                  </Text>
                  {countdownPaused ? (
                    <Text style={{ fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                      Por favor, aguarde só mais um pouco.
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                      A rotina de skincare perfeita para sua pele está sendo finalizada. Por favor, aguarde só mais{' '}
                      <Text style={{ fontWeight: '700' }}>{countdown}s</Text>.
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Eyebrow + headline */}
            <View style={{ paddingHorizontal: 28, paddingTop: 40, alignItems: 'center' }}>
              <Text style={{
                fontSize: 10.5, fontWeight: '700', color: CORAL_DEEP,
                letterSpacing: 2.6, textTransform: 'uppercase', marginBottom: 14,
              }}>
                análise da pele
              </Text>
              <Animated.View style={{
                width: '100%',
                alignItems: 'center',
                opacity: headlineFadeAnim,
                transform: [{ translateY: headlineSlideAnim }],
              }}>
                <View style={{ width: '100%', alignItems: 'center', overflow: 'hidden' }}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.7}
                    allowFontScaling={false}
                    style={{
                      fontSize: 28, fontWeight: '700', color: DEEP,
                      letterSpacing: -0.85, lineHeight: 32.2, textAlign: 'center',
                    }}
                  >
                    {currentHeadline.prefix}{' '}
                    <Text
                      style={{
                        fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
                        fontSize: 28, fontWeight: '500', color: CORAL,
                        letterSpacing: -0.8,
                      }}
                    >
                      {currentHeadline.highlight}
                    </Text>
                    {'…'}
                  </Text>
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0, bottom: 0, left: 0,
                      width: 400,
                      transform: [{ translateX: shimmerTranslateX }],
                    }}
                  >
                    <LinearGradient
                      colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.78)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)']}
                      locations={[0, 0.35, 0.5, 0.65, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1 }}
                    />
                  </Animated.View>
                </View>
              </Animated.View>
              <Text style={{
                marginTop: 12, fontSize: 14, lineHeight: 21, color: DEEP_SOFT,
                letterSpacing: -0.05, textAlign: 'center',
              }}>
                Isso leva só alguns segundos. Não feche o app.
              </Text>
            </View>

            {/* Orb + progress ring */}
            <View style={{ alignItems: 'center', paddingTop: 36 }}>
              <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
                {/* Halo glow — pulsing coral aura, same as reference */}
                <Animated.View style={{
                  position: 'absolute',
                  width: RING_SIZE + 56, height: RING_SIZE + 56,
                  left: -28, top: -28,
                  transform: [{ scale: haloAnim }],
                }}>
                  <Canvas style={{ width: RING_SIZE + 56, height: RING_SIZE + 56 }}>
                    <SkiaCircle cx={(RING_SIZE + 56) / 2} cy={(RING_SIZE + 56) / 2} r={(RING_SIZE + 56) / 2}>
                      <RadialGradient
                        c={vec((RING_SIZE + 56) / 2, (RING_SIZE + 56) / 2)}
                        r={(RING_SIZE + 56) * 0.5}
                        colors={['rgba(251,123,107,0.22)', 'rgba(251,123,107,0)']}
                      />
                    </SkiaCircle>
                  </Canvas>
                </Animated.View>

                {/* Progress ring SVG */}
                <Svg
                  width={RING_SIZE}
                  height={RING_SIZE}
                  style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
                >
                  <Defs>
                    <SvgLinearGradient id="ldRing" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0%" stopColor="#F9C9B6" />
                      <Stop offset="100%" stopColor={CORAL} />
                    </SvgLinearGradient>
                  </Defs>
                  <Circle
                    cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                    stroke="rgba(29,58,68,0.08)" strokeWidth={RING_STROKE} fill="none"
                  />
                  <AnimatedCircle
                    cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                    stroke="url(#ldRing)" strokeWidth={RING_STROKE} fill="none"
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    strokeDashoffset={ringOffsetAnim}
                  />
                </Svg>

                {/* NIKS orb — Skia RadialGradient, mesmo padrão do protocolo.tsx */}
                <Animated.View style={{ transform: [{ translateY: bobAnim }] }}>
                  <View style={{
                    shadowColor: '#C86651',
                    shadowOffset: { width: 0, height: 18 },
                    shadowOpacity: 0.45,
                    shadowRadius: 25,
                    elevation: 12,
                  }}>
                    <Canvas style={{ width: 140, height: 140 }}>
                      {/* Esfera principal com gradiente radial skin-tone */}
                      <SkiaCircle cx={70} cy={70} r={70}>
                        <RadialGradient
                          c={vec(49, 42)}
                          r={120}
                          colors={['#FFEFE4', '#F9C9B6', '#E89178', '#C86651']}
                          positions={[0, 0.28, 0.68, 1]}
                        />
                      </SkiaCircle>
                      {/* Simula inset shadow branco do topo — torna a orb mais clara como no design */}
                      <SkiaCircle cx={70} cy={18} r={72}>
                        <RadialGradient
                          c={vec(70, 18)}
                          r={72}
                          colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0)']}
                        />
                        <BlurMask blur={9} style="normal" />
                      </SkiaCircle>
                      {/* Specular preciso no topo-esquerdo, igual ao design (26x14px elipse) */}
                      <SkiaCircle cx={46} cy={29} r={13}>
                        <RadialGradient
                          c={vec(46, 29)}
                          r={13}
                          colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                        />
                        <BlurMask blur={2} style="normal" />
                      </SkiaCircle>
                    </Canvas>
                  </View>
                </Animated.View>
              </View>
            </View>

            {/* Steps checklist */}
            <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 24, gap: 14 }}>
              {STEPS.map((s, i) => {
                const active = percentage >= s.at - 18 && percentage < s.at;
                const done = percentage >= s.at;
                return (
                  <Animated.View key={i} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    opacity: stepOpacities[i],
                  }}>
                    <View style={{
                      flexShrink: 0,
                      width: 22, height: 22, borderRadius: 100,
                      backgroundColor: done ? CORAL : 'transparent',
                      borderWidth: 1.5,
                      borderColor: done ? CORAL : active ? CORAL : DEEP_HAIR,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {done ? (
                        <Check size={11} color="#fff" strokeWidth={3} />
                      ) : active ? (
                        <Animated.View style={{
                          width: 8, height: 8, borderRadius: 100,
                          backgroundColor: CORAL,
                          opacity: blinkAnim,
                        }} />
                      ) : null}
                    </View>
                    <Text style={{
                      fontSize: 14.5, fontWeight: '500', color: DEEP,
                      letterSpacing: -0.1, lineHeight: 18.85, flex: 1,
                    }}>
                      {s.label}
                    </Text>
                  </Animated.View>
                );
              })}
            </View>
          </>
        ) : (
          /* Error state */
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <View style={{
              width: '100%',
              backgroundColor: CORAL,
              borderRadius: 14, padding: 12,
              flexDirection: 'row', alignItems: 'flex-start', gap: 9,
              marginBottom: 20,
            }}>
              <Svg width={16} height={16} viewBox="0 0 16 16" style={{ marginTop: 1, flexShrink: 0 }}>
                <Path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="white" strokeWidth={1.4} strokeLinejoin="round" fill="none" />
                <Line x1={8} y1={6.5} x2={8} y2={10} stroke="white" strokeWidth={1.4} strokeLinecap="round" />
                <Circle cx={8} cy={11.8} r={0.75} fill="white" />
              </Svg>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 }}>
                  Não conseguimos analisar sua pele
                </Text>
                <Text style={{ fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                  Estamos com alta demanda no momento. Tente novamente em instantes.
                </Text>
              </View>
            </View>

            <Svg width={72} height={72} viewBox="0 0 72 72" style={{ marginBottom: 12 }}>
              <Circle cx={36} cy={36} r={33} stroke="#E24B4A" strokeWidth={3} fill="none" />
              <Circle cx={24} cy={30} r={4} fill="#E24B4A" />
              <Circle cx={48} cy={30} r={4} fill="#E24B4A" />
              <Path d="M24 50 C28 44 44 44 48 50" stroke="#E24B4A" strokeWidth={3} strokeLinecap="round" fill="none" />
            </Svg>

            <Text style={{ fontSize: 18, fontWeight: '600', color: DEEP, textAlign: 'center', lineHeight: 24, marginBottom: 8 }}>
              Algo deu errado por aqui...
            </Text>
            <Text style={{ fontSize: 14, color: DEEP_SOFT, textAlign: 'center', marginBottom: 32 }}>
              Tire uma nova foto para tentar novamente
            </Text>

            <TouchableOpacity
              onPress={() => { haptics.tap(); router.back(); }}
              style={{
                width: '100%',
                backgroundColor: CORAL,
                borderRadius: 100,
                height: 60,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: CORAL,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.45,
                shadowRadius: 16, elevation: 8,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>
                Tentar novamente
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </View>
    </SafeAreaView>
  );
}
