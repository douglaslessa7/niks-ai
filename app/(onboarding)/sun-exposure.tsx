import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount, useObName, withName,
} from '../../components/onboarding/kit';

// Tela 10 do onboarding novo — escolha única (modelo 3i do design).
//
// `value` é o texto que continua indo para `onboarding.sun_exposure` (e dali para
// a `analyze-skin` e para `users.sun_exposure`): são os rótulos ANTIGOS da tela,
// mantidos de propósito para a IA e o banco não verem nada mudar. O design só
// trocou o que aparece para a usuária.
// Só "Entre 1 e 3 horas" tem frase revelada no design — as outras não têm.
const OPTIONS: ObChoice<string>[] = [
  { label: 'Quase nenhum', value: 'Quase nenhum' },
  { label: 'Menos de 1 hora', value: 'Menos de 1 hora por dia' },
  { label: 'Entre 1 e 3 horas', value: 'Entre 1 a 3 horas por dia', reveal: 'Vamos incluir a reaplicação do protetor no meio do dia.' },
  { label: 'Mais de 3 horas', value: 'Mais de 3 horas por dia' },
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
      step={STEP}
      title={withName(name, 'quanto tempo você passa exposta ao sol por dia?')}
      subtitle="Isso define a proteção solar da sua rotina."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('sun_exposure', v)}
      onContinue={() => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        router.push('/(onboarding)/hydration');
      }}
    />
  );
}
