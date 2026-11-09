import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, BackHandler, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObPillButton, ObScreen, useObFrame, useObName, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { routineLoadingLines } from '../../components/onboarding/answers';
import {
  ESPERA_SEGUNDO_PLANO_MS, FALHAS_PARA_ENTRAR, adiarCompraPendente, concluirCompraPendente, tentarEmSegundoPlano,
} from '../../lib/concluirCompra';

// TELA DE ESPERA depois da compra (06/nov/2026) — "Criando uma rotina só sua, <nome>". O
// visual é o da antiga tela 23 do fluxo completo (fora do fluxo desde out/2026): anel R 122
// (trilho branco 13 pt + progresso em degradê #FF5EA8 → #FF8CC0, 11 pt) em volta de um disco
// branco Ø214 com a porcentagem; embaixo do título, uma frase que troca a cada terço
// (`routineLoadingLines`) e 4 tracinhos pulsando.
//
// Chega aqui: o cadastro (conta nova), o paywall (já logada, refazendo o onboarding) ou a
// retomada ao abrir o app (`app/index.tsx`, com sessão e compra pendente). Faz, em ordem:
//   1. aguarda a análise completa (`analyze-skin`, disparada na compra — `lib/onboardingPrefetch.ts`);
//   2. grava na conta: perfil (`users`), foto no bucket `scans` e `skin_scans` (`saveToSupabase`);
//   3. aguarda/gera a rotina e grava em `protocolos` + `recomendar-produtos` (`saveOnboardingProtocol`);
//   4. apaga a foto e o registro do aparelho (`lib/compraPendente.ts`) e abre a home.
// A % anda no ritmo do design (0 → 100 em ~6,5 s) mas SEGURA em 95% até terminar. Falhou a
// análise (depois das tentativas) → "Não conseguimos terminar sua rotina agora." + "Tentar de
// novo"; o registro continua no aparelho, então reabrir o app também retoma. A rotina que
// falhar de vez não segura a tela (a aba Rotina gera de novo, como sempre). Sem voltar.
// Depois de 3 falhas aparece "Entrar no app" e o resto continua em segundo plano
// (`lib/concluirCompra.ts`, 09/nov/2026).
//
// ⚠️ A linha "43.754 mulheres com pele oleosa já seguem uma rotina NIKS" do design
// ficou de fora: prova social não vai ao ar com número de exemplo.
const R = 122;
const C = 2 * Math.PI * R;
const RUN_MS = 6500;
const HOLD_AT = 0.95;
const SIZE = 2 * R + 14;

export default function LoadingRotina() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();
  const onboarding = useAppStore((s) => s.onboarding);
  const skinType = useAppStore((s) => s.scanResult?.skin_type_detected);
  const lines = useRef(routineLoadingLines(onboarding, skinType)).current;
  const [p, setP] = useState(0);
  const [falhou, setFalhou] = useState(false);
  const [falhas, setFalhas] = useState(0);
  const ready = useRef(false);
  const start = useRef(Date.now());
  const dots = useRef(new Animated.Value(0)).current;

  useOnMount(() => track('onboarding_step_viewed', obStep(OB_STEPS.loadingRotina, 'Loading Rotina')));

  const processar = async () => {
    setFalhou(false);
    const r = await concluirCompraPendente();
    if (r.status === 'ok') { ready.current = true; return; }
    if (r.status === 'sem_sessao') { router.replace('/'); return; }
    setFalhas(r.falhas);
    setFalhou(true);
  };

  useEffect(() => {
    void processar();
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);

    Animated.loop(Animated.timing(dots, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })).start();

    let id: number;
    let done = false;
    const loop = () => {
      const t = (Date.now() - start.current) / RUN_MS;
      const pe = 1 - Math.pow(1 - Math.min(1, t), 1.6);
      const next = ready.current ? pe : Math.min(HOLD_AT, pe);
      setP(next);
      if (next >= 1 && !done) {
        done = true;
        track('onboarding_step_completed', obStep(OB_STEPS.loadingRotina, 'Loading Rotina'));
        setTimeout(() => router.replace('/(app)/home'), 400);
        return;
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(id); back.remove(); };
  }, []);

  const tentarDeNovo = () => {
    haptics.action();
    void processar();
  };

  const entrarNoApp = async () => {
    haptics.action();
    await adiarCompraPendente(falhas);
    tentarEmSegundoPlano(ESPERA_SEGUNDO_PLANO_MS);
    router.replace('/(app)/home');
  };

  const pct = Math.round(p * 100);
  const n = lines.length;
  const idx = Math.min(n - 1, Math.floor(p * n));
  const local = p * n - idx;
  const lineOpacity = Math.max(0, Math.min(1, local * 6, idx === n - 1 ? 1 : (1 - local) * 8));
  const cy = y(370);

  return (
    <ObScreen variant="blush">
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Text style={{
        position: 'absolute', left: 0, right: 0, top: y(74), textAlign: 'center',
        fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.4, color: OB.sub,
      }}>
        SUA ROTINA
      </Text>

      {/* Disco translúcido Ø300 atrás do anel */}
      <View style={{
        position: 'absolute', top: cy - 150, alignSelf: 'center', width: 300, height: 300, borderRadius: 150,
        backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 1, borderColor: 'rgba(255,94,168,0.10)',
      }} />

      <View style={{ position: 'absolute', top: cy - SIZE / 2, alignSelf: 'center', width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Defs>
            <LinearGradient id="rotG" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={OB.pink} />
              <Stop offset="1" stopColor="#FF8CC0" />
            </LinearGradient>
          </Defs>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#FFFFFF" strokeWidth={13} />
          <Circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="url(#rotG)" strokeWidth={11} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0.005, p))}
          />
        </Svg>
      </View>

      {/* Disco branco Ø214 com a porcentagem */}
      <View style={{
        position: 'absolute', top: cy - 107, alignSelf: 'center', width: 214, height: 214, borderRadius: 107,
        backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingTop: 78,
        shadowColor: OB.pink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.10, shadowRadius: 12,
      }}>
        <Text style={{ fontSize: 54, lineHeight: 58, fontWeight: '700', letterSpacing: -1.2, color: OB.ink, fontVariant: ['tabular-nums'] }}>{pct}</Text>
        <Text style={{ fontSize: 18, lineHeight: 18, fontWeight: '500', color: OB.sub, marginLeft: 3 }}>%</Text>
      </View>

      <Text style={{
        position: 'absolute', left: 24, right: 24, top: y(562), textAlign: 'center',
        fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, color: OB.ink,
      }}>
        {falhou ? 'Não conseguimos terminar sua rotina agora.' : name ? `Criando uma rotina só sua, ${name}` : 'Criando uma rotina só sua'}
      </Text>
      {!falhou && (
        <Text style={{
          position: 'absolute', left: 24, right: 24, top: y(595), textAlign: 'center',
          fontSize: 15, lineHeight: 20, color: OB.sub, opacity: lineOpacity,
        }}>
          {lines[idx]}
        </Text>
      )}

      {!falhou && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: y(640), flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
          {[6, 14, 14, 6].map((w, k) => (
            <Animated.View key={k} style={{
              width: w, height: 5, borderRadius: 3, backgroundColor: OB.pink,
              opacity: dots.interpolate({
                inputRange: [0, 0.25, 0.5, 0.75, 1],
                outputRange: [0, 1, 2, 3, 4].map((j) => 0.35 + 0.65 * Math.max(0, Math.cos(((j / 4) - k / 4) * Math.PI * 2))),
              }),
            }} />
          ))}
        </View>
      )}

      {falhou && falhas < FALHAS_PARA_ENTRAR && <ObPillButton label="Tentar de novo" width={200} bottom={buttonBottom} onPress={tentarDeNovo} />}
      {falhou && falhas >= FALHAS_PARA_ENTRAR && (
        <>
          <TouchableOpacity
            onPress={tentarDeNovo}
            accessibilityRole="button"
            style={{ position: 'absolute', alignSelf: 'center', bottom: buttonBottom + 66, paddingVertical: 10, paddingHorizontal: 20 }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: OB.ink }}>Tentar de novo</Text>
          </TouchableOpacity>
          <ObPillButton label="Entrar no app" width={220} bottom={buttonBottom} onPress={() => { void entrarNoApp(); }} />
        </>
      )}
    </ObScreen>
  );
}
