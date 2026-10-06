import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Tela 15 do fluxo completo — gravidez/amamentação, para TODAS (a tela de gênero
// saiu e `genero` vai vazio). Escolha única; mudou de lugar (vinha logo depois da
// idade) e de título, os valores gravados são os de antes.
type PregnancyStatus = 'none' | 'pregnant' | 'breastfeeding' | 'trying';

const OPTIONS: ObChoice<PregnancyStatus>[] = [
  { label: 'Nenhuma das anteriores', value: 'none' },
  { label: 'Estou grávida', value: 'pregnant' },
  { label: 'Estou amamentando', value: 'breastfeeding' },
  { label: 'Estou tentando engravidar', value: 'trying' },
];

const STEP = OB_STEPS.gravidez;
const STEP_NAME = 'Gravidez';

export default function Pregnancy() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<PregnancyStatus>
      title="Para sua rotina ser segura."
      subtitle="Selecione a que se aplica a você."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('pregnancy_status', v)}
      onContinue={() => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        router.push('/(onboarding)/allergies');
      }}
    />
  );
}
