import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Tela 4 do onboarding novo — gravidez/amamentação, agora para TODAS: a tela de
// gênero saiu do fluxo e `genero` vai vazio (null). Escolha única no padrão 3i;
// sem modelo próprio no design, o texto e as opções são os de antes.
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
      step={STEP}
      title="Alguns ativos do skincare precisam ser evitados em certas situações."
      subtitle="Selecione a que se aplica a você."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('pregnancy_status', v)}
      onContinue={() => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        router.push('/(onboarding)/concerns');
      }}
    />
  );
}
