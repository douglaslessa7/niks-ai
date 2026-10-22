import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount, useObName, withName,
} from '../../components/onboarding/kit';

// Onboarding — sono (escolha única, opções no centro da tela como a rotina atual).
// Vem logo depois da hidratação (`hydration.tsx`); as duas eram a antiga
// `hydration-sleep`, dividida de novo a pedido do produto (20/out/2026). Sem
// subtítulo. Grava `onboarding.sleep` com os MESMOS valores de sempre
// ('4–5', '6', '7', '8', '9+'); " horas" é só do rótulo.
const OPTIONS: ObChoice<string>[] = ['4–5', '6', '7', '8', '9+'].map((v) => ({ label: `${v} horas`, value: v }));

const STEP = OB_STEPS.sono;
const STEP_NAME = 'Sono';

export default function Sleep() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { onboarding, setOnboardingField } = useAppStore();
  const name = useObName();

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<string>
      title={withName(name, 'quantas horas você dorme por noite?')}
      centerOptions
      options={OPTIONS}
      initial={onboarding.sleep ?? null}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('sleep', v)}
      onContinue={() => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        router.push('/(onboarding)/skincare-routine');
      }}
    />
  );
}
