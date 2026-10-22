import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount, useObName, withName,
} from '../../components/onboarding/kit';

// Onboarding — hidratação (escolha única, opções no centro da tela como a rotina
// atual). A antiga `hydration-sleep` (água e sono em botõezinhos numa tela só) foi
// dividida de novo em duas a pedido do produto (20/out/2026); o sono vem logo depois
// (`sleep.tsx`). Sem subtítulo (decisão de out/2026 mantida).
// Grava `onboarding.hydration` com os MESMOS valores de sempre (a `analyze-skin` e a
// rotina leem esses textos).
// O título fala de hidratação (20/out/2026, pedido do produto: "quanta água você bebe"
// não ficou bom), então os RÓTULOS dizem que é água; os valores gravados não mudam.
// "Menos de 1 litro" voltou (20/out/2026, pedido do produto) com o valor que sempre teve.
const OPTIONS: ObChoice<string>[] = [
  { label: 'Menos de 1 litro de água por dia', value: 'Menos de 1L' },
  { label: '1 a 2 litros de água por dia', value: '1–2L' },
  { label: '2 a 3 litros de água por dia', value: '2–3L' },
  { label: 'Mais de 3 litros de água por dia', value: '3L+' },
];

const STEP = OB_STEPS.hidratacao;
const STEP_NAME = 'Hidratação';

export default function Hydration() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { onboarding, setOnboardingField } = useAppStore();
  const name = useObName();

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<string>
      title={withName(name, 'como está a sua hidratação?')}
      centerOptions
      options={OPTIONS}
      initial={onboarding.hydration ?? null}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('hydration', v)}
      onContinue={() => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        router.push('/(onboarding)/sleep');
      }}
    />
  );
}
