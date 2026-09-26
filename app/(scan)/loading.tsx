import { useEffect, useState, useRef } from 'react';
import { View, Text, Animated, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import {
  OB, OB_STEPS, ObScreen, ObCheck, useObFrame, useObName, obStep,
} from '../../components/onboarding/kit';
import { answerChips } from '../../components/onboarding/answers';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Tela de carregamento da ANÁLISE DE PELE do ONBOARDING (scan de 1 foto) —
// tela 18 do onboarding novo (modelo 1g do design): no topo, as respostas dela
// acendem uma a uma enquanto a porcentagem sobe; título "Criando uma rotina só
// sua, <nome>"; anel de 112 pt; frase embaixo que troca a cada etapa. Sem voltar,
// sem barra.
//
// ⚠️ Só a CAMADA VISUAL mudou. A lógica é a de sempre: chama `analyze-skin` (é
// aqui, e não na câmera, porque ela usa tipo de pele / sol / sono), dispara a
// preview antes/depois, salva o scan, retries, aviso de alta demanda, estado de
// erro, e navega para o resultado do onboarding (`/(scan)/results`).

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Frase de baixo: troca a cada 25% (texto do design).
const PHASES = ['Analisando sua pele…', 'Cruzando com suas respostas…', 'Escolhendo os ativos certos…', 'Montando sua rotina…'];

const RING = 112;
const RING_STROKE = 8;
const RING_R = 52;
const RING_C = 326.7; // 2π·52

const STEP = OB_STEPS.loading;
const STEP_NAME = 'Analisando Pele';

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
  const ringProgressAnim = useRef(new Animated.Value(0)).current;
  const name = useObName();
  const { y } = useObFrame();
  // Congeladas no mount: são as respostas que ela deu, não mudam durante o loading.
  const chips = useRef(answerChips(onboarding)).current;
  // Cada chip acende com fade de 400 ms quando a % passa do seu limiar (i × 15%).
  const chipAnims = useRef(chips.map(() => new Animated.Value(0.25))).current;

  const phraseIdx = Math.min(PHASES.length - 1, Math.floor(percentage / 25));
  const currentPhrase = PHASES[phraseIdx];
  const ringOffsetAnim = ringProgressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [RING_C, 0],
  });

  useEffect(() => {
    chips.forEach((_, i) => {
      if (percentage >= i * 15) {
        Animated.timing(chipAnims[i], { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }
    });
  }, [percentage]);

  // Anima o arco de progresso a cada mudança de porcentagem.
  useEffect(() => {
    Animated.timing(ringProgressAnim, {
      toValue: percentage,
      duration: 450,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  useEffect(() => {
    track('onboarding_step_viewed', obStep(STEP, STEP_NAME));
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
          track('onboarding_step_completed', obStep(STEP, STEP_NAME));
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
    <ObScreen>
      {!showError ? (
        <>
          {/* Respostas dela, acendendo uma a uma */}
          <View style={{
            position: 'absolute', left: 30, right: 30, top: y(140),
            flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10,
          }}>
            {chips.map((label, i) => (
              <Animated.View key={label} style={{
                height: 38, paddingLeft: 10, paddingRight: 16, borderRadius: 19, backgroundColor: OB.option,
                flexDirection: 'row', alignItems: 'center', gap: 8, opacity: chipAnims[i],
              }}>
                <ObCheck size={18} />
                <Text style={{ fontSize: 15, fontWeight: '500', color: OB.ink }}>{label}</Text>
              </Animated.View>
            ))}
          </View>

          <Text style={{
            position: 'absolute', left: 17, right: 17, top: y(420), textAlign: 'center',
            fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: OB.ink,
          }}>
            {name ? `Criando uma rotina só sua, ${name}` : 'Criando uma rotina só sua'}
          </Text>

          {/* Anel de 112 pt */}
          <View style={{ position: 'absolute', top: y(590), alignSelf: 'center', width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={RING} height={RING} viewBox="0 0 112 112" style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={56} cy={56} r={RING_R} fill="none" stroke={OB.track} strokeWidth={RING_STROKE} />
              <AnimatedCircle
                cx={56} cy={56} r={RING_R} fill="none" stroke={OB.pink} strokeWidth={RING_STROKE}
                strokeLinecap="round" strokeDasharray={RING_C} strokeDashoffset={ringOffsetAnim}
              />
            </Svg>
            <Text style={{ fontSize: 28, color: OB.ink, fontVariant: ['tabular-nums'] }}>
              {percentage}<Text style={{ fontWeight: '700' }}>%</Text>
            </Text>
          </View>

          <Text style={{
            position: 'absolute', left: 17, right: 17, top: y(728), textAlign: 'center',
            fontSize: 17, lineHeight: 23, color: OB.ink,
          }}>
            {currentPhrase}
          </Text>

          {/* Aviso de alta demanda (sem modelo no design: mantido, nos tokens novos) */}
          {showDemandNotice && (
            <SafeAreaView edges={['top']} style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
              <View style={{
                marginHorizontal: 17, marginTop: 8,
                backgroundColor: OB.pink,
                borderRadius: 12, padding: 13,
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
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#FFFFFF', lineHeight: 18 }}>
                      Por favor, aguarde só mais um pouco.
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#FFFFFF', lineHeight: 18 }}>
                      A rotina de skincare perfeita para sua pele está sendo finalizada. Por favor, aguarde só mais{' '}
                      <Text style={{ fontWeight: '700' }}>{countdown}s</Text>.
                    </Text>
                  )}
                </View>
              </View>
            </SafeAreaView>
          )}
        </>
      ) : (
        /* Estado de erro (sem modelo no design: mantido, nos tokens novos) */
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17 }}>
            <View style={{
              width: '100%',
              backgroundColor: OB.pink,
              borderRadius: 12, padding: 13,
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
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#FFFFFF', lineHeight: 18 }}>
                  Estamos com alta demanda no momento. Tente novamente em instantes.
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: OB.ink, textAlign: 'center', marginBottom: 11 }}>
              Algo deu errado por aqui...
            </Text>
            <Text style={{ fontSize: 17, lineHeight: 23, color: OB.sub, textAlign: 'center', marginBottom: 32 }}>
              Tire uma nova foto para tentar novamente
            </Text>

            <TouchableOpacity
              // Tirar outra foto: no fluxo novo a câmera não fica logo atrás do loading
              // (entre elas há as telas 8–17), então abrimos a câmera em modo retake,
              // que devolve direto para cá.
              onPress={() => { haptics.tap(); router.replace('/(scan)/camera?retake=1' as any); }}
              activeOpacity={0.85}
              style={{
                width: 172, height: 48, borderRadius: 24, backgroundColor: OB.pink,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 8,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
    </ObScreen>
  );
}
