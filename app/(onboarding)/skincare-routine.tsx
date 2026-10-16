import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Onboarding — rotina atual (padrão 3i), textos da versão B. Como na versão B,
// "completar o que falta" e "dermatologista prescreveu" levam ao detalhe
// ("Quais produtos você já usa?" / "…foram prescritos?"); as outras seguem
// para o horário da rotina (que leva ao aviso de lembretes e ao pedido de
// notificação) e limpam a descrição de uma passagem anterior pelo detalhe.
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
      title="Como está sua rotina de skincare hoje?"
      // Sem subtítulo; opções centralizadas na tela, título no topo (pedido do produto).
      centerOptions
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('skincare_routine_type', v)}
      onContinue={(v) => {
        track('onboarding_step_completed', { ...obStep(STEP, STEP_NAME), routine_type: v });
        if (v === 'complement' || v === 'prescribed') {
          router.push('/(onboarding)/skincare-routine-detail');
          return;
        }
        setOnboardingField('skincare_routine_description', null);
        router.push('/(onboarding)/horario-rotina');
      }}
    />
  );
}
