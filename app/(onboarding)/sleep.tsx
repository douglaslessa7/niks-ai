import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount, useObName, withName,
} from '../../components/onboarding/kit';

// Tela 14 do fluxo completo — sono (escolha única, padrão do sol). Era a metade de
// baixo da antiga `hydration-sleep`. Grava `onboarding.sleep` com os MESMOS valores de
// antes ('4–5', '6', '7', '8', '9+'); " horas" é só do rótulo. No fluxo completo a
// análise de pele já saiu (logo depois da foto): o sono alimenta só a rotina.
const OPTIONS: ObChoice<string>[] = ['4–5', '6', '7', '8', '9+'].map((v) => ({ label: `${v} horas`, value: v }));

const STEP = OB_STEPS.sono;
const STEP_NAME = 'Sono';

export default function Sleep() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);
  const name = useObName();

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<string>
      title={withName(name, 'quantas horas você dorme por noite?')}
      subtitle="É enquanto você dorme que a sua pele se regenera."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('sleep', v)}
      onContinue={() => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        router.push('/(onboarding)/pregnancy');
      }}
    />
  );
}
