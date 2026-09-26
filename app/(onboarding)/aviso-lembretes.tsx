import { View, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, Path, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObPillButton, NIKS_LOGO,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 13a do onboarding novo — aviso de lembretes (modelo 7a do design). Tela de
// valor: só o voltar, sem barra, fundo rosado. Prepara a usuária para o pedido
// nativo de permissão, que vem na tela seguinte (13b).
// Medidas do Flo: "iPhone" de 268 pt que some para baixo, sino Ø88 sobreposto ao
// topo, notificação de 335 pt (mais larga que o iPhone) em y 205. O "21h" vem do
// horário da noite escolhido na tela 13.
const STEP = OB_STEPS.avisoLembretes;
const STEP_NAME = 'Aviso de Lembretes';

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

export default function AvisoLembretes() {
  const router = useRouter();
  const { track } = useMixpanel();
  const night = useAppStore((s) => s.onboarding.rotina_noite_horario) ?? '21:00';
  const { y, buttonBottom } = useObFrame();

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/permitir-notificacoes');
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
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={NIKS_LOGO} style={{ width: 15, height: 15, tintColor: '#FFFFFF' }} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '500', letterSpacing: 0.3, color: OB.sub }}>NIKS</Text>
          <Text style={{ marginLeft: 'auto', fontSize: 13, color: '#B3ADAF' }}>agora</Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: OB.ink }}>Hora da sua rotina da noite 🌙</Text>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '400', color: OB.ink }}>Seus 5 passos te esperam. Leva só 10 minutos ✨</Text>
        </View>
      </View>

      <Text style={{
        position: 'absolute', left: 17, right: 17, top: y(428), textAlign: 'center',
        fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4, color: OB.ink,
      }}>
        {`Sua próxima rotina é hoje às ${hourLabel(night)}`}
      </Text>
      <Text style={{
        position: 'absolute', left: 28, right: 28, top: y(514), textAlign: 'center',
        fontSize: 17, lineHeight: 25, fontWeight: '400', color: OB.sub,
      }}>
        Quer um lembrete na hora certa? Toque em "Permitir" na próxima tela para receber seus lembretes de skincare.
      </Text>

      <ObHeader onBack={() => router.back()} />
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
