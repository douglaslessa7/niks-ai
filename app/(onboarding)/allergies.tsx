import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Onboarding — alergias (escolha única), textos da versão B. Vem logo depois da
// gravidez ("IMPORTANTE: alguns ativos…"), a pedido do produto. Como na versão B,
// só "Já tive reação" leva ao detalhe; as outras seguem direto para "o que te
// incomoda".
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
      title="Você tem alguma alergia ou sensibilidade a produtos de skincare?"
      // Sem subtítulo e com mais respiro até as opções (pedido do produto).
      optionsTop={54}
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('allergy_type', v)}
      onContinue={(v) => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        if (v === 'reaction') {
          router.push('/(onboarding)/allergies-detail');
          return;
        }
        // Sem detalhe: a descrição de uma passagem anterior pelo detalhe não vale mais.
        setOnboardingField('allergy_description', null);
        router.push('/(onboarding)/concerns');
      }}
    />
  );
}
