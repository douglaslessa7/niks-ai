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
import { useAppStore } from '../../store/onboarding';
import { invalidateCache } from '../../lib/cache';
import { haptics } from '../../lib/haptics';
import { regenerateProtocolInApp } from '../../lib/regenerateProtocolInApp';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Tela de carregamento da ANÁLISE DE PELE feita DENTRO do app (scan de 6 fotos).
// Agora usa o mesmo design da tela de carregamento do scan de PRODUTO (círculo
// grande + porcentagem no centro), com a copy adaptada para parecer que estamos
// analisando a pele da pessoa. A LÓGICA é a mesma de antes: gera o skin-preview
// (não bloqueante), chama a Edge Function `analyze-skin` com as colagens do scan
// multi-foto, salva o scan no banco, invalida o cache da home e navega para o
// resultado.

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const PINK = '#FF9D9D';           // rosa padrão do app
const PINK_SOFT = '#FFC9C9';      // parada clara do gradiente do arco
const CREAM = '#FFFFFF';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Frases que rodam abaixo do círculo conforme a análise da pele avança.
const PHASES = [
  'Mapeando os pontos do seu rosto',
  'Identificando o seu tipo de pele',
  'Avaliando oleosidade e textura',
  'Detectando manchas e pigmentação',
  'Cruzando com o seu perfil de pele',
  'Montando o seu protocolo personalizado',
];

const RING_SIZE = 250;
const RING_STROKE = 8;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const WHITE_D = RING_SIZE - 30;   // disco branco central (dentro do anel)

export default function LoadingDentroApp() {
  const router = useRouter();
  const { skinImageBase64, skinImageUri, skinCollagesBase64, onboarding, setScanResult, setSelectedScan } = useAppStore();
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
    retryCount.current = 0;

    // NOTA: a geração da preview "antes/depois" (generate-skin-preview) é EXCLUSIVA do
    // loading do ONBOARDING (app/(scan)/loading.tsx). Esta tela — o loading de scans
    // feitos DENTRO do app — nunca deve disparar essa geração.

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
          // Função SEPARADA da do onboarding (`analyze-skin`): esta é a multi-foto,
          // que pode aprofundar a análise sem tocar no funil do onboarding.
          `${SUPABASE_URL}/functions/v1/analyze-skin-app`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              // Sempre preenchido com a foto NEUTRA. É o campo que a Edge Function
              // usava antes de existir o scan multi-foto — mantê-lo faz um deploy
              // fora de ordem (app novo + função velha) degradar para a análise de
              // 1 foto em vez de quebrar.
              imageBase64: skinImageBase64,
              // Scan multi-foto: [neutra_alta, layoutA, layoutB]. Ausente no fluxo
              // de 1 foto — é o que a função usa para escolher o prompt.
              imagesBase64: skinCollagesBase64.length ? skinCollagesBase64 : undefined,
              scanLayout: skinCollagesBase64.length ? 'expressions_v1' : 'single',
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
            const { data: scanRow } = await supabase.from('skin_scans').insert({
              user_id: user.id,
              foto_url: fotoUrl,
              skin_score: data.skin_score,
              tipo_pele: data.skin_type_detected,
              metricas: { acne: data.acne, skin_age: data.skin_age },
              areas_atencao: data.pontos_fracos,
              resumo: data.headline,
              full_result: data,
            }).select('id').single();
            // Novo scan = novo score, novas métricas, nova foto. A home lê de
            // cache, então precisa ser invalidada aqui ou mostraria o scan antigo.
            invalidateCache(`home:${user.id}`);
            // Regeneração do protocolo no 1º scan in-app — BACKGROUND, não bloqueia a
            // navegação. A função de módulo sobrevive à desmontagem desta tela; os guards
            // internos (marcador + regenInFlight) garantem "uma única vez".
            void regenerateProtocolInApp(user.id, data, scanRow?.id ?? null);
          }
        } catch (e) {
          console.warn('Failed to save scan to DB:', e);
        }

        setTimeout(() => {
          router.replace('/(app)/skin-result' as any);
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
                        A análise da sua pele está sendo finalizada. Por favor, aguarde só mais{' '}
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
                    Não conseguimos analisar a sua pele
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
