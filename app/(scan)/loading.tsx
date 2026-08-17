import { useEffect, useState, useRef } from 'react';
import { View, Text, Animated, TouchableOpacity } from 'react-native';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, {
  Path, Line, Circle, Defs,
  LinearGradient as SvgLinearGradient, Stop,
} from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Tela de carregamento da ANÁLISE DE PELE do ONBOARDING (scan de 1 foto).
// Usa o MESMO design da tela de carregamento de dentro do app (`loading-dentro-app.tsx`):
// círculo grande + porcentagem no centro, anel rosa, halo pulsante e frase rotativa.
// A LÓGICA e a COPY continuam as do onboarding: chama `analyze-skin`, salva o scan,
// e navega para o resultado do onboarding (`/(scan)/results`).

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const PINK = '#FF9D9D';           // rosa padrão do app
const PINK_SOFT = '#FFC9C9';      // parada clara do gradiente do arco
const CREAM = '#FFFFFF';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Frases que rodam abaixo do círculo conforme a análise da pele avança (copy do onboarding).
const PHASES = [
  'Mapeando os pontos do seu rosto',
  'Identificando seu tipo de pele',
  'Avaliando oleosidade da pele',
  'Identificando manchas e pigmentação',
  'Avaliando textura e poros da pele',
  'Detectando necessidades da pele',
  'Montando seu protocolo personalizado',
];

const RING_SIZE = 250;
const RING_STROKE = 8;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const WHITE_D = RING_SIZE - 30;   // disco branco central (dentro do anel)

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
  const haloAnim = useRef(new Animated.Value(1)).current;
  const ringProgressAnim = useRef(new Animated.Value(0)).current;
  const phraseFadeAnim = useRef(new Animated.Value(1)).current;

  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold,
    Nunito_700Bold,
    Nunito_600SemiBold,
  });
  const fExtra = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const fSemi = fontsLoaded ? 'Nunito_600SemiBold' : undefined;

  const phraseIdx = Math.min(PHASES.length - 1, Math.floor(percentage / (100 / PHASES.length)));
  const currentPhrase = PHASES[phraseIdx];
  const ringOffsetAnim = ringProgressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [RING_C, 0],
  });

  // Halo pulsante suave atrás do círculo (respiro).
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, { toValue: 1.1, duration: 1400, useNativeDriver: true }),
        Animated.timing(haloAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Anima o arco de progresso a cada mudança de porcentagem.
  useEffect(() => {
    Animated.timing(ringProgressAnim, {
      toValue: percentage,
      duration: 450,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  // Fade da frase quando muda de fase.
  useEffect(() => {
    phraseFadeAnim.setValue(0);
    Animated.timing(phraseFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [phraseIdx]);

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 15, step_name: 'Analisando Pele', step_total: 23 });
    retryCount.current = 0;

    // Gera a preview "antes/depois" — com timeout por tentativa e até 3 tentativas.
    // Sem isto, uma OpenAI lenta/congestionada deixava a tela final travada pra sempre.
    const runSkinPreview = async (attempt = 0): Promise<void> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 100_000);
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
            signal: controller.signal,
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.preview_url) {
            setSkinPreviewUrl(data.preview_url);
            return;
          }
        }
        throw new Error(`preview failed: ${response.status}`);
      } catch (e) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 2000));
          return runSkinPreview(attempt + 1);
        }
        console.warn('Skin preview generation failed (non-blocking):', e);
      } finally {
        clearTimeout(timeout);
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
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      {/* Véu de fundo — leve gradiente rosa no topo, dissolvendo no branco (identidade NIKS) */}
      <LinearGradient
        colors={['#FFF1F2', '#FFF8F8', '#FFFFFF']}
        locations={[0, 0.4, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {!showError ? (
            <>
              {/* Aviso de alta demanda */}
              {showDemandNotice && (
                <View style={{
                  marginHorizontal: 24, marginTop: 12,
                  backgroundColor: PINK,
                  borderRadius: 16, padding: 13,
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
                    <Text style={{ fontFamily: fBold, fontSize: 13, color: '#FFFFFF', marginBottom: 3 }}>
                      Estamos com alta demanda agora
                    </Text>
                    {countdownPaused ? (
                      <Text style={{ fontFamily: fSemi, fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                        Por favor, aguarde só mais um pouco.
                      </Text>
                    ) : (
                      <Text style={{ fontFamily: fSemi, fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                        A rotina de skincare perfeita para sua pele está sendo finalizada. Por favor, aguarde só mais{' '}
                        <Text style={{ fontFamily: fBold }}>{countdown}s</Text>.
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Círculo central com a porcentagem */}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: RING_SIZE + 44, height: RING_SIZE + 44,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* Anel decorativo externo (hairline rosa) */}
                  <View style={{
                    position: 'absolute',
                    width: RING_SIZE + 44, height: RING_SIZE + 44,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,157,157,0.18)',
                  }} />

                  {/* Halo pulsante suave */}
                  <Animated.View style={{
                    position: 'absolute',
                    width: RING_SIZE, height: RING_SIZE,
                    borderRadius: 999,
                    backgroundColor: 'rgba(255,157,157,0.10)',
                    transform: [{ scale: haloAnim }],
                  }} />

                  {/* Disco branco central (card flutuante) */}
                  <View style={{
                    position: 'absolute',
                    width: WHITE_D, height: WHITE_D,
                    borderRadius: 999,
                    backgroundColor: '#FFFFFF',
                    shadowColor: PINK,
                    shadowOffset: { width: 0, height: 12 },
                    shadowOpacity: 0.28,
                    shadowRadius: 28,
                    elevation: 10,
                  }} />

                  {/* Anel de progresso */}
                  <Svg
                    width={RING_SIZE}
                    height={RING_SIZE}
                    style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
                  >
                    <Defs>
                      <SvgLinearGradient id="ldRing" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0%" stopColor={PINK_SOFT} />
                        <Stop offset="100%" stopColor={PINK} />
                      </SvgLinearGradient>
                    </Defs>
                    {/* Trilho de fundo */}
                    <Circle
                      cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                      stroke="rgba(29,58,68,0.06)" strokeWidth={RING_STROKE} fill="none"
                    />
                    {/* Arco preenchido */}
                    <AnimatedCircle
                      cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                      stroke="url(#ldRing)" strokeWidth={RING_STROKE} fill="none"
                      strokeLinecap="round"
                      strokeDasharray={RING_C}
                      strokeDashoffset={ringOffsetAnim}
                    />
                  </Svg>

                  {/* Número da porcentagem — espaçador invisível à esquerda (mesma largura do "%")
                      centraliza o NÚMERO na horizontal; o translateY compensa a folga do
                      descender da Nunito (números não usam), centralizando na vertical */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', transform: [{ translateY: 12 }] }}>
                    <Text style={{
                      fontFamily: fBold, fontSize: 28, color: DEEP,
                      letterSpacing: -1, marginBottom: 16, marginRight: 2, opacity: 0,
                    }}>
                      %
                    </Text>
                    <Text style={{
                      fontFamily: fExtra, fontSize: 86, color: DEEP,
                      letterSpacing: -3, lineHeight: 92,
                    }}>
                      {percentage}
                    </Text>
                    <Text style={{
                      fontFamily: fBold, fontSize: 28, color: DEEP,
                      letterSpacing: -1, marginBottom: 16, marginLeft: 2,
                    }}>
                      %
                    </Text>
                  </View>
                </View>

                {/* Legenda rotativa (fase atual) */}
                <Animated.View style={{ opacity: phraseFadeAnim, marginTop: 44, paddingHorizontal: 24 }}>
                  <Text style={{
                    fontFamily: fSemi, fontSize: 17, color: DEEP_SOFT,
                    letterSpacing: -0.2, textAlign: 'center',
                  }}>
                    {currentPhrase}
                  </Text>
                </Animated.View>

                {/* Subtexto fixo tranquilizador */}
                <Text style={{
                  fontFamily: fSemi, fontSize: 13.5, color: 'rgba(29,58,68,0.38)',
                  letterSpacing: -0.1, textAlign: 'center', marginTop: 10, paddingHorizontal: 32,
                }}>
                  Isso leva só alguns segundos. Não feche o app.
                </Text>
              </View>
            </>
          ) : (
            /* Estado de erro */
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
              <View style={{
                width: '100%',
                backgroundColor: PINK,
                borderRadius: 16, padding: 13,
                flexDirection: 'row', alignItems: 'flex-start', gap: 9,
                marginBottom: 20,
              }}>
                <Svg width={16} height={16} viewBox="0 0 16 16" style={{ marginTop: 1, flexShrink: 0 }}>
                  <Path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="white" strokeWidth={1.4} strokeLinejoin="round" fill="none" />
                  <Line x1={8} y1={6.5} x2={8} y2={10} stroke="white" strokeWidth={1.4} strokeLinecap="round" />
                  <Circle cx={8} cy={11.8} r={0.75} fill="white" />
                </Svg>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fBold, fontSize: 13, color: '#FFFFFF', marginBottom: 3 }}>
                    Não conseguimos analisar sua pele
                  </Text>
                  <Text style={{ fontFamily: fSemi, fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                    Estamos com alta demanda no momento. Tente novamente em instantes.
                  </Text>
                </View>
              </View>

              <Svg width={72} height={72} viewBox="0 0 72 72" style={{ marginBottom: 12 }}>
                <Circle cx={36} cy={36} r={33} stroke={PINK} strokeWidth={3} fill="none" />
                <Circle cx={24} cy={30} r={4} fill={PINK} />
                <Circle cx={48} cy={30} r={4} fill={PINK} />
                <Path d="M24 50 C28 44 44 44 48 50" stroke={PINK} strokeWidth={3} strokeLinecap="round" fill="none" />
              </Svg>

              <Text style={{ fontFamily: fBold, fontSize: 18, color: DEEP, textAlign: 'center', lineHeight: 24, marginBottom: 8 }}>
                Algo deu errado por aqui...
              </Text>
              <Text style={{ fontFamily: fSemi, fontSize: 14, color: DEEP_SOFT, textAlign: 'center', marginBottom: 32 }}>
                Tire uma nova foto para tentar novamente
              </Text>

              <TouchableOpacity
                onPress={() => { haptics.tap(); router.back(); }}
                style={{
                  width: '100%',
                  backgroundColor: PINK,
                  borderRadius: 100,
                  height: 60,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: PINK,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.45,
                  shadowRadius: 16, elevation: 8,
                }}
              >
                <Text style={{ fontFamily: fBold, fontSize: 17, color: '#FFFFFF' }}>
                  Tentar novamente
                </Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </SafeAreaView>
    </View>
  );
}
