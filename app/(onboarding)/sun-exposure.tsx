import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount, useObName, withName,
} from '../../components/onboarding/kit';

// Tela 8 do onboarding — escolha única. Textos e opções da versão B (rótulo =
// valor gravado em `onboarding.sun_exposure`, como sempre foi); "Quase nenhum" tem
// a frase curta de B embaixo. Sem frase revelada ao marcar (decisão do produto).
const OPTIONS: ObChoice<string>[] = [
  { label: 'Quase nenhum', value: 'Quase nenhum', sub: 'Fico a maior parte do tempo em ambiente fechado' },
  { label: 'Menos de 1 hora por dia', value: 'Menos de 1 hora por dia' },
  { label: 'Entre 1 a 3 horas por dia', value: 'Entre 1 a 3 horas por dia' },
  { label: 'Mais de 3 horas por dia', value: 'Mais de 3 horas por dia' },
];

const STEP = OB_STEPS.sol;
const STEP_NAME = 'Exposição Solar';

export default function SunExposure() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);
  const name = useObName();

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<string>
      title={withName(name, 'quanto tempo você passa exposta ao sol\npor dia?')}
      // Sem subtítulo; "por dia?" sempre na última linha (pedido do produto).
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('sun_exposure', v)}
      onContinue={() => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        router.push('/(onboarding)/hydration-sleep');
      }}
    />
  );
}
