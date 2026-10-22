import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Onboarding — rotina atual (padrão 3i), textos da versão B. Todas as opções seguem
// para o horário da rotina; o detalhe ("Quais produtos você já usa?" / "…foram
// prescritos?", `skincare-routine-detail`) saiu do fluxo em 20/out/2026.
type RoutineType = 'zero' | 'complement' | 'prescribed' | 'unsure';

// Resposta CURTA no card e a definição inteira só aparece ao marcar (`reveal`), no
// modelo do Flo (20/out/2026, pedido do produto: os cards estavam poluídos).
const OPTIONS: ObChoice<RoutineType>[] = [
  { label: 'Não tenho rotina', value: 'zero', reveal: 'Quero começar do zero.' },
  { label: 'Tenho uma rotina que funciona', value: 'complement', reveal: 'Quero completar o que falta.' },
  { label: 'Uso produtos prescritos', value: 'prescribed', reveal: 'Um dermatologista me prescreveu produtos.' },
  { label: 'Não sei se minha rotina funciona', value: 'unsure', reveal: 'Tenho uma rotina, mas não sei se está funcionando.' },
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
        // Todas as opções seguem direto para o horário (20/out/2026, pedido do produto):
        // a tela de digitar os produtos que usa/foram prescritos saiu do fluxo. A
        // descrição vai sempre vazia — a `generate-protocol` trata isso como "nenhum
        // ativo declarado" e monta do zero (ver o README).
        setOnboardingField('skincare_routine_description', null);
        router.push('/(onboarding)/horario' as any);
      }}
    />
  );
}
