import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Tela 16 do fluxo completo — alergias (escolha única). "Tenho pele muito
// sensível/reativa" e "Já tive reação" levam ao detalhe (17, nota do design); as
// outras seguem direto para o objetivo (18).
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
      title="Você já teve alergia a algum produto de skincare?"
      subtitle="Isso garante que nenhum ativo problemático entre no seu protocolo."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('allergy_type', v)}
      onContinue={(v) => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        if (v === 'reaction' || v === 'sensitive') {
          router.push('/(onboarding)/allergies-detail');
          return;
        }
        // Sem detalhe: a descrição de uma passagem anterior pela tela 17 não vale mais.
        setOnboardingField('allergy_description', null);
        router.push('/(onboarding)/goal-desire');
      }}
    />
  );
}
