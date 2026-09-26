import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Tela 12 do onboarding novo — rotina atual (padrão 3i). ⚠️ A tela "Quais produtos
// você já usa?" (skincare-routine-detail) SAIU do fluxo: `skincare_routine_description`
// vai vazio para o `generate-protocol`, que foi ajustado para não exigir ativo
// declarado nesse caso (prompt + checagem 1).
type RoutineType = 'zero' | 'complement' | 'prescribed' | 'unsure';

const OPTIONS: ObChoice<RoutineType>[] = [
  { label: 'Não tenho rotina — quero começar do zero', value: 'zero' },
  { label: 'Tenho uma rotina que funciona — quero completar o que falta', value: 'complement' },
  { label: 'Um dermatologista me prescreveu produtos', value: 'prescribed' },
  { label: 'Tenho uma rotina, mas não sei se está funcionando', value: 'unsure' },
];

const STEP = OB_STEPS.rotinaAtual;
const STEP_NAME = 'Rotina Atual';

export default function SkincareRoutine() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<RoutineType>
      step={STEP}
      title="Como está sua rotina de skincare hoje?"
      subtitle="Isso nos ajuda a criar o melhor protocolo para você."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => {
        setOnboardingField('skincare_routine_type', v);
        setOnboardingField('skincare_routine_description', null);
      }}
      onContinue={(v) => {
        track('onboarding_step_completed', { ...obStep(STEP, STEP_NAME), routine_type: v });
        router.push('/(onboarding)/horario-rotina');
      }}
    />
  );
}
