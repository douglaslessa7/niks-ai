import { useEffect, useRef } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { requestPushPermission } from '../../lib/notifications';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB, OB_STEPS, useObFrame, obStep, useOnMount } from '../../components/onboarding/kit';

// Tela 22 do fluxo completo — pedido NATIVO de notificação.
//
// ⚠️ A permissão agora é pedida ANTES do cadastro (a antiga tela `notifications`
// pós-signup saiu do fluxo). Ainda não há sessão/usuária, então o Expo Push Token
// fica no store PERSISTIDO (`pendingPushToken`, mesmo ciclo do `pendingName`) e só
// é gravado em `users.push_token` no `saveToSupabase` do signup.
//
// O alerta é o do iOS (desenhado pelo sistema, sem customização). Nosso é só o
// fundo cinza #D1D1D1 (como no Flo) e a seta "Toque aqui!" centralizada sob o
// botão "Permitir" (metade direita do alerta de 270 pt). Recusar não trava nada:
// segue para o loading da rotina do mesmo jeito. Se a permissão já foi decidida antes, o
// iOS não mostra o alerta e a tela segue direto.
const STEP = OB_STEPS.pedidoNotificacao;
const STEP_NAME = 'Pedido de Notificação';
const TIMEOUT_MS = 10000;

export default function PermitirNotificacoes() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setPendingPushToken = useAppStore((s) => s.setPendingPushToken);
  const { y } = useObFrame();
  const { width } = useWindowDimensions();
  const started = useRef(false);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  useEffect(() => {
    if (started.current) return; // StrictMode / remount: pede uma vez só
    started.current = true;
    (async () => {
      let token: string | null = null;
      try {
        token = await Promise.race([
          requestPushPermission(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
        ]);
      } catch (e) {
        console.warn('[permitir-notificacoes] erro ao pedir permissão:', e);
      }
      if (token) setPendingPushToken(token);
      track('onboarding_step_completed', { ...obStep(STEP, STEP_NAME), granted: !!token });
      // `replace`: nada volta para um pedido que já foi feito.
      router.replace('/(onboarding)/loading-rotina');
    })();
  }, []);

  // Centro do botão "Permitir": alerta de 270 pt centrado → metade direita a +67,5 pt.
  const arrowCenterX = width / 2 + 67.5;

  return (
    <View style={{ flex: 1, backgroundColor: '#D1D1D1' }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={{ position: 'absolute', top: y(567), left: arrowCenterX - 60, width: 120, alignItems: 'center', gap: 8 }}>
        <Svg width={22} height={10} viewBox="0 0 22 10">
          <Path d="M2 8.5 L11 1.8 L20 8.5" fill="none" stroke={OB.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={{ fontSize: 15, lineHeight: 20, color: OB.ink }}>Toque aqui!</Text>
      </View>
    </View>
  );
}
