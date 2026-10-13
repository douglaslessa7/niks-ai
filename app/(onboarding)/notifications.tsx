import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, Path, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import { requestPushPermission, savePushToken } from '../../lib/notifications';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObPillButton, NIKS_LOGO,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 26 (última) do onboarding — notificações, DEPOIS do cadastro. VISUAL = a tela
// "Aviso de lembretes" do Felipe (fluxo completo, tela 21; `aviso-lembretes.tsx`, que
// ficou no repo sem ligação). LÓGICA = a da versão B (pedido do produto, out/2026):
// "Continuar" abre o pedido nativo de permissão (o pop-up do iOS, com teto de 10 s) e
// grava o token direto na conta (`savePushToken` — aqui já existe sessão). O
// "Continuar" fica na tela; depois do pop-up surge EMBAIXO dele o botão "Já ativei!",
// e SÓ ele entra no app.
//
// ÚNICO ponto em que uma usuária NOVA entra no app (as outras rotas para a home —
// login, paywall de reengajamento, `index` com sessão — são de conta já existente).
// É por isso que o tutorial de primeiro acesso da home é armado AQUI. Conta existente
// que refaz o onboarding também passa, e quem barra é o servidor
// (`users.home_tutorial_seen_at`). Ver "Feature: Tutorial de primeiro acesso" no README.
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
  const armHomeTutorial = useAppStore((s) => s.armHomeTutorial);
  const [loading, setLoading] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  // "Continuar" → pop-up nativo de permissão; o token vai direto para a conta.
  const handleContinue = async () => {
    haptics.action();
    setLoading(true);
    try {
      const token = await Promise.race([
        requestPushPermission(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);
      if (token) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await savePushToken(user.id, token);
      }
    } catch (error) {
      console.error('[Notifications] Erro:', error);
    } finally {
      setLoading(false);
      setHasRequested(true);
    }
  };

  // "Já ativei!" → entra no app (arma o tutorial da home).
  const enterApp = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    armHomeTutorial();
    router.replace('/(app)/home');
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

      {/* Sem voltar (a conta já foi criada) */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      {/* "Continuar" fica SEMPRE na tela (abre o pedido nativo). Depois que o pop-up da
          Apple aparece, surge EMBAIXO dele o "Já ativei!" — só ele avança. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: buttonBottom, alignItems: 'center', gap: 12 }}>
        {loading ? (
          <View style={{ height: 48, justifyContent: 'center' }}>
            <ActivityIndicator color={OB.pink} />
          </View>
        ) : (
          <ObPillButton onPress={handleContinue} />
        )}
        {hasRequested && (
          <TouchableOpacity
            onPress={enterApp}
            activeOpacity={0.7}
            style={{
              width: 172, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: OB.pink,
              backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600', color: OB.pink }}>Já ativei!</Text>
          </TouchableOpacity>
        )}
      </View>
    </ObScreen>
  );
}
