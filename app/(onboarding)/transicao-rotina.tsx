import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObTitle, ObSubtitle, ObPillButton, ObLogoHalo,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 10 do fluxo completo — "Sua análise está pronta. Agora vamos montar sua
// rotina." Fecha a parte do scan e abre as perguntas da rotina (sol em diante). Logo
// com halo (o mesmo da tela 5) + selo rosa de check no canto do disco. Sem voltar:
// atrás dela estão o resultado e a idade da pele, que não devem ser revistos por gesto.
const STEP = OB_STEPS.transicaoRotina;
const STEP_NAME = 'Transição Rotina';

export default function TransicaoRotina() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y, buttonBottom } = useObFrame();

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    // A 2ª "o que te incomoda" (tela 11 do design) saiu a pedido do produto — era a
    // mesma pergunta da tela 4. Daqui vai direto para as perguntas da rotina.
    router.push('/(onboarding)/sun-exposure');
  };

  return (
    <ObScreen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {/* Halo com topo a 96 pt; selo Ø40 em (226, 284) no frame = (190, 188) no halo. */}
      <ObLogoHalo top={96}>
        <View style={{
          position: 'absolute', left: 190, top: 188, width: 40, height: 40, borderRadius: 20,
          backgroundColor: OB.pink, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
          shadowColor: OB.pink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 7,
        }}>
          <Svg width={20} height={20} viewBox="0 0 22 22">
            <Path d="M6.5 11.2 L9.6 14.2 L15.5 8" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </ObLogoHalo>

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(436) }}>
        <ObTitle>Sua análise está pronta. Agora vamos montar sua rotina.</ObTitle>
      </View>
      <ObSubtitle style={{ position: 'absolute', left: 13, right: 13, top: y(560) }}>
        Perguntas rápidas para montarmos a melhor rotina para a sua pele.
      </ObSubtitle>

      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
