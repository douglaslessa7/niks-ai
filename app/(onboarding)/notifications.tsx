import { useState } from 'react';
import { View, Text, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, Path, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import * as ExpoNotifications from 'expo-notifications';
import { askPushPermission, requestPushPermission, savePushToken } from '../../lib/notifications';
import { getUserId } from '../../lib/currentUser';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObPillButton, NIKS_LOGO,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Onboarding — notificações, logo depois do horário da rotina e ANTES do cadastro
// (16/out/2026, pedido do produto; antes era a última tela, depois da conta). Substitui
// o "Aviso de lembretes" + o pedido nativo em tela cinza (`aviso-lembretes.tsx` e
// `permitir-notificacoes.tsx`, que ficaram no repo sem ligação). VISUAL = o "Aviso de
// lembretes" do fluxo completo. LÓGICA (16/out/2026, pedido do produto) — um botão só,
// o "Continuar":
//   • 1º toque, permissão ainda não respondida → abre o pop-up nativo.
//       "Permitir" → avança SOZINHA para o objetivo, sem outro toque.
//       "Não permitir" → fica na tela, sem botão novo.
//   • Toques seguintes → só avançam, sem pedir de novo.
//   • Permissão já decidida antes (o iOS não mostraria o pop-up) → o 1º toque já avança.
// A espera é só da PERMISSÃO (`askPushPermission`, resolve no toque do pop-up); o token
// sai depois, em segundo plano — ele depende de rede e não pode segurar a tela.
//
// Ainda não há conta: o token vai para o store PERSISTIDO (`pendingPushToken`) e o
// `saveToSupabase` do signup o grava em `users.push_token`. Se já houver sessão (caso
// raro), grava direto também. O tutorial de primeiro acesso da home é armado no fim do
// signup (`finishOnboarding`), não aqui.
// Medidas do Flo: "iPhone" de 268 pt que some para baixo, sino Ø88 sobreposto ao
// topo, notificação de 335 pt (mais larga que o iPhone) em y 205. O "21h" vem do
// horário da noite escolhido na tela do horário.
const STEP = OB_STEPS.notificacoes;
const STEP_NAME = 'Notificações';

/** '21:00' → '21h' · '21:30' → '21h30'. */
function hourLabel(hhmm: string) {
  const [h, m] = hhmm.split(':');
  return `${Number(h)}h${m === '00' ? '' : m}`;
}

// Silhueta do iPhone (268 × 280, cantos de cima com raio 34). O `mask-image` do
// design (opaco até 50%, some até 100%) vira o próprio degradê de opacidade do
// preenchimento — sem precisar de masked-view (dependência nativa).
const PHONE_PATH = 'M0 34 A34 34 0 0 1 34 0 H234 A34 34 0 0 1 268 34 V280 H0 Z';

function BellIcon() {
  return (
    <Svg width={36} height={38} viewBox="0 0 24 25">
      <Path d="M12 2.2 C8.4 2.2 6.2 4.9 6.2 8.6 L6.2 12.6 C6.2 14.4 5.4 15.8 4.2 17 C3.7 17.5 4 18.4 4.8 18.4 L19.2 18.4 C20 18.4 20.3 17.5 19.8 17 C18.6 15.8 17.8 14.4 17.8 12.6 L17.8 8.6 C17.8 4.9 15.6 2.2 12 2.2 Z" fill="#FFFFFF" />
      <Path d="M9.6 20.2 C10 21.6 10.9 22.4 12 22.4 C13.1 22.4 14 21.6 14.4 20.2 Z" fill="#FFFFFF" />
      <Circle cx={12} cy={1.8} r={1.3} fill="#FFFFFF" />
    </Svg>
  );
}

export default function Notifications() {
  const router = useRouter();
  const { track } = useMixpanel();
  const night = useAppStore((s) => s.onboarding.rotina_noite_horario) ?? '21:00';
  const { y, buttonBottom } = useObFrame();
  const setPendingPushToken = useAppStore((s) => s.setPendingPushToken);
  const [loading, setLoading] = useState(false);
  // Já mostrou o pop-up nesta tela: o próximo "Continuar" só avança.
  const [asked, setAsked] = useState(false);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  // Token em segundo plano (a permissão já foi dada): fica guardado até o cadastro, que
  // o grava em `users.push_token`; com sessão (caso raro), grava direto também.
  const saveTokenInBackground = () => {
    requestPushPermission()
      .then(async (token) => {
        if (!token) return;
        setPendingPushToken(token);
        const uid = await getUserId();
        if (uid) await savePushToken(uid, token);
      })
      .catch((error) => console.error('[Notifications] Erro ao obter o token:', error));
  };

  const goNext = (granted: boolean) => {
    track('onboarding_step_completed', { ...obStep(STEP, STEP_NAME), granted });
    router.push('/(onboarding)/goal-desire');
  };

  // "Continuar": pede a permissão uma vez (se o sistema ainda mostra o pop-up);
  // permitiu → avança; não permitiu → fica. Fora isso, avança.
  const handleContinue = async () => {
    if (loading) return;
    haptics.action();
    setLoading(true);
    let granted = false;
    let prompted = false;
    try {
      // `canAskAgain` = o sistema ainda mostraria o pop-up (no iOS, só enquanto ela
      // nunca respondeu). Já decidida antes → não pede, só avança.
      const { status, canAskAgain } = await ExpoNotifications.getPermissionsAsync();
      granted = status === 'granted';
      if (!asked && !granted && canAskAgain) {
        prompted = true;
        granted = await askPushPermission();
      }
    } catch (error) {
      console.error('[Notifications] Erro ao pedir permissão:', error);
    }
    setLoading(false);
    if (granted) saveTokenInBackground();
    if (prompted && !granted) {
      setAsked(true); // "Não permitir": fica na tela; o próximo toque avança.
      return;
    }
    goNext(granted);
  };

  return (
    <ObScreen variant="blush">
      {/* iPhone que some para baixo */}
      <View style={{ position: 'absolute', top: y(137), alignSelf: 'center', width: 268, height: 280 }}>
        <Svg width={268} height={280}>
          <Defs>
            <LinearGradient id="phoneFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={1} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={PHONE_PATH} fill="url(#phoneFade)" />
        </Svg>
      </View>

      {/* Sino Ø88 com degradê #FF5EA8 → #FFC4DA */}
      <View style={{ position: 'absolute', top: y(87), alignSelf: 'center', width: 88, height: 88, borderRadius: 44, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={88} height={88} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id="bell" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={OB.pink} />
              <Stop offset="1" stopColor="#FFC4DA" />
            </LinearGradient>
          </Defs>
          <Path d="M0 0 H88 V88 H0 Z" fill="url(#bell)" />
        </Svg>
        <BellIcon />
      </View>

      {/* Notificação */}
      <View style={{
        position: 'absolute', left: 29, right: 29, top: y(205), borderRadius: 20, backgroundColor: '#FFFFFF',
        paddingTop: 14, paddingHorizontal: 16, paddingBottom: 15, gap: 6,
        shadowColor: OB.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 14,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Ícone do app (fundo #FF7EB9 + flor branca) — o mesmo que aparece na notificação real */}
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#FF7EB9', alignItems: 'center', justifyContent: 'center' }}>
            <Image source={NIKS_LOGO} style={{ width: 15, height: 15, tintColor: '#FFFFFF' }} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '500', letterSpacing: 0.3, color: OB.sub }}>NIKS</Text>
          <Text style={{ marginLeft: 'auto', fontSize: 13, color: '#B3ADAF' }}>agora</Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: OB.ink }}>🌙 Boa noite!</Text>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '400', color: OB.ink }}>Não esqueça sua rotina de skincare noturna antes de dormir.</Text>
        </View>
      </View>

      <Text style={{
        position: 'absolute', left: 17, right: 17, top: y(428), textAlign: 'center',
        fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4, color: OB.ink,
      }}>
        {`Sua próxima rotina é\nhoje às ${hourLabel(night)}`}
      </Text>
      <Text style={{
        position: 'absolute', left: 28, right: 28, top: y(514), textAlign: 'center',
        fontSize: 17, lineHeight: 25, fontWeight: '400', color: OB.sub,
      }}>
        Quer que a NIKS te lembre quando for a hora de fazer seu skincare? Toque em "Continuar" e depois em "Permitir" que ela nunca vai deixar você esquecer.
      </Text>

      {/* Voltar para o horário da rotina (agora a tela vem antes da conta). */}
      <ObHeader onBack={() => router.back()} />
      {/* Um botão só: "Continuar" (pede a permissão uma vez; depois, só avança). */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: buttonBottom, alignItems: 'center' }}>
        {loading ? (
          <View style={{ height: 48, justifyContent: 'center' }}>
            <ActivityIndicator color={OB.pink} />
          </View>
        ) : (
          <ObPillButton onPress={handleContinue} />
        )}
      </View>
    </ObScreen>
  );
}
