import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Tela 16 do onboarding novo — objetivo (padrão 3i). Grava `onboarding.goal_desire`.
const OPTIONS: ObChoice<string>[] = [
  'Me sentir mais bonita e confiante',
  'Ter um glow up que as pessoas notem',
  'Aumentar minha autoestima de vez',
  'Me sentir bem comigo mesma de novo',
  'Conquistar alguém especial',
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
      step={STEP}
      title="Qual é o seu verdadeiro objetivo?"
      subtitle="Pode ser honesta — é só pra gente entender você melhor."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('goal_desire', v)}
      onContinue={(v) => {
        track('onboarding_step_completed', { ...obStep(STEP, STEP_NAME), desire: v });
        router.push('/(onboarding)/social-proof');
      }}
    />
  );
}
