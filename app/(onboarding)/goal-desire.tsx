import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';
import { OBJETIVOS_PELE, valorObjetivo } from '../../components/onboarding/answers';

// Onboarding — objetivo: "Qual a pele dos seus sonhos?" (era "Qual pele você quer ter?" até
// 06/nov/2026, trocado a pedido do Douglas) (escolha única, só texto; 03/nov/2026,
// pedido do produto — substituiu as 6 opções da versão B, "Outro" incluído). Vem logo
// depois do nome e leva ao antes e depois ("Transformação real", `transformacao.tsx`, desde
// 04/nov/2026) e dali ao gráfico "Sua evolução"; a pele escolhida volta no título do
// gráfico e no da rotina pronta (`objetivoPele` em `answers.ts`).
// Grava `onboarding.goal_desire` (texto livre para a `generate-protocol`). Com ele
// respondido, a rotina começa a ser gerada em segundo plano assim que o relatório do scan
// fica pronto (`lib/onboardingPrefetch.ts`).
const OPTIONS: ObChoice<string>[] = OBJETIVOS_PELE.map((o) => ({
  label: o.nome, sub: o.desc, strong: true, value: valorObjetivo(o),
}));

const STEP = OB_STEPS.objetivo;
const STEP_NAME = 'Desejo Real';

export default function GoalDesire() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<string>
      title="Qual a pele dos seus sonhos?"
      options={OPTIONS}
      centerOptions
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('goal_desire', v)}
      onContinue={(v) => {
        track('onboarding_step_completed', { ...obStep(STEP, STEP_NAME), desire: v });
        // → "Transformação real" (antes e depois, 04/nov/2026) → "Sua evolução".
        router.push('/(onboarding)/transformacao');
      }}
    />
  );
}
