import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Tela 18 do fluxo completo — objetivo (escolha única). Grava `onboarding.goal_desire`
// (texto livre para a `generate-protocol`, as opções novas do design entram como estão).
// É a última resposta que a rotina recebe: com ela, a rotina começa a ser gerada em
// segundo plano (`lib/onboardingPrefetch.ts`).
const OPTIONS: ObChoice<string>[] = [
  'Me sentir bonita sem maquiagem',
  'Tirar foto de perto sem medo',
  'Parar de esconder manchas',
  'Ter uma pele que as pessoas notem',
  'Outro',
].map((d) => ({ label: d, value: d }));

const STEP = OB_STEPS.objetivo;
const STEP_NAME = 'Desejo Real';

export default function GoalDesire() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<string>
      title="E o que você quer sentir quando se olhar no espelho?"
      subtitle="Sua rotina vai ser montada pensando nisso."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('goal_desire', v)}
      onContinue={(v) => {
        track('onboarding_step_completed', { ...obStep(STEP, STEP_NAME), desire: v });
        router.push('/(onboarding)/empatia');
      }}
    />
  );
}
