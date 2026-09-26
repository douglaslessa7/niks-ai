import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Tela 14 do onboarding novo — alergias (padrão 3i). "Já tive reação" leva ao
// detalhe (tela 15); as outras seguem direto para o objetivo (16).
type AllergyType = 'none' | 'sensitive' | 'reaction' | 'no_history';

const OPTIONS: ObChoice<AllergyType>[] = [
  { label: 'Não tenho alergias/sensibilidade', value: 'none' },
  { label: 'Tenho pele muito sensível/reativa em geral', value: 'sensitive' },
  { label: 'Já tive reação a algum ativo/produto', value: 'reaction' },
  { label: 'Nunca tive nenhum problema', value: 'no_history' },
];

const STEP = OB_STEPS.alergias;
const STEP_NAME = 'Alergias';

export default function Allergies() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<AllergyType>
      step={STEP}
      title="Você tem alguma alergia ou sensibilidade a produtos de skincare?"
      subtitle="Isso garante que nenhum ativo problemático entre no seu protocolo."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('allergy_type', v)}
      onContinue={(v) => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        router.push(v === 'reaction' ? '/(onboarding)/allergies-detail' : '/(onboarding)/goal-desire');
      }}
    />
  );
}
