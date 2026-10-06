import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount, useObName, withName,
} from '../../components/onboarding/kit';

// Tela 13 do fluxo completo — hidratação (escolha única, padrão do sol). Era a
// metade de cima da antiga `hydration-sleep`, que foi dividida em duas; o sono é a
// tela 11b (`sleep.tsx`). Grava `onboarding.hydration` com os mesmos valores de antes.
const OPTIONS: ObChoice<string>[] = ['Menos de 1L', '1–2L', '2–3L', '3L+'].map((v) => ({ label: v, value: v }));

const STEP = OB_STEPS.hidratacao;
const STEP_NAME = 'Hidratação';

export default function Hydration() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);
  const name = useObName();

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<string>
      title={withName(name, 'quanta água você bebe por dia?')}
      subtitle="Sua pele se hidrata por dentro, e isso pesa mais do que qualquer produto."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('hydration', v)}
      onContinue={() => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        router.push('/(onboarding)/sleep');
      }}
    />
  );
}
