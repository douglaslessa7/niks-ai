import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { t } from '../../lib/i18n';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { startOnboardingAttempt } from '../../lib/onboardingAttempt';
import { useAppStore } from '../../store/onboarding';
import { ObScreen, ObTitle, ObSubtitle, ObPillButton, ObLogoHalo, OB, useObFrame, useOnMount } from '../../components/onboarding/kit';

// 1.64 (decisão do produto, 22/nov/2026): conta logada pelo "Entrar" SEM as respostas do
// onboarding e sem assinatura (`lib/onboardingObrigatorio.ts`). Mesmo esqueleto das telas de
// transição do onboarding (`transicao-rotina.tsx`): halo com selo, título, subtítulo e botão.
// Conta nova (criada há ≤ 10 min) → "Conta criada!"; antiga → "Que bom te ver!". O botão
// começa o onboarding pela tela do nome (que, logada, não mostra o "Entrar"). Sem voltar.
const TEXTOS = {
  nova: {
    titulo: 'Conta criada!',
    texto: 'Não encontramos uma conta com esse login. Vamos começar: em 2 minutos sua rotina fica pronta.',
    botao: 'Começar',
  },
  antiga: {
    titulo: 'Que bom te ver!',
    texto: 'Falta terminar sua avaliação para montar sua rotina. Vamos lá?',
    botao: 'Continuar',
  },
} as const;

export default function ContaSemOnboarding() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y, buttonBottom } = useObFrame();
  const { conta } = useLocalSearchParams<{ conta?: string }>();
  const txt = conta === 'nova' ? TEXTOS.nova : TEXTOS.antiga;

  useOnMount(() => {
    // Aberta direto pelo guard do app (reabertura): a splash não pode cobrir esta tela.
    useAppStore.getState().markSplashDestinationReady();
    track('conta_sem_onboarding_vista', { conta: conta === 'nova' ? 'nova' : 'antiga' });
  });

  const comecar = async () => {
    haptics.action();
    track('conta_sem_onboarding_comecou', { conta: conta === 'nova' ? 'nova' : 'antiga' });
    // Nova tentativa de onboarding (numeração do funil), como quem abre o app sem conta.
    await startOnboardingAttempt().catch(() => 0);
    router.replace('/(onboarding)/nome');
  };

  return (
    <ObScreen>
      <Stack.Screen options={{ gestureEnabled: false }} />
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
        <ObTitle>{t(txt.titulo)}</ObTitle>
      </View>
      <ObSubtitle style={{ position: 'absolute', left: 13, right: 13, top: y(520) }}>
        {t(txt.texto)}
      </ObSubtitle>

      <ObPillButton label={t(txt.botao)} onPress={() => { void comecar(); }} bottom={buttonBottom} />
    </ObScreen>
  );
}
