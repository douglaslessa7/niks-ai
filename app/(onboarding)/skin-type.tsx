// ⚠️ FORA DO FLUXO desde o "fluxo completo" (out/2026): nada navega para cá.
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, ObChoiceScreen, ObChoice, obStep, useOnMount } from '../../components/onboarding/kit';

// Tela 9 do onboarding novo — tipo de pele (padrão 3i). Os valores gravados são os
// de antes ('Oleosa', 'Mista'…). As descrições curtas que a tela já tinha viraram
// a frase revelada do card selecionado.
const OPTIONS: ObChoice<string>[] = [
  { label: 'Oleosa', value: 'Oleosa', reveal: 'Brilha durante o dia' },
  { label: 'Seca', value: 'Seca', reveal: 'Repuxa e descama' },
  { label: 'Mista', value: 'Mista', reveal: 'Oleosa na zona T' },
  { label: 'Normal', value: 'Normal', reveal: 'Equilibrada' },
  { label: 'Não sei', value: 'Não sei', reveal: 'Vamos descobrir juntos' },
];

const STEP = OB_STEPS.tipoPele;
const STEP_NAME = 'Tipo de Pele';

export default function SkinType() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  return (
    <ObChoiceScreen<string>
      title="Como você descreveria sua pele?"
      subtitle="Se não tiver certeza, tudo bem — o scan vai confirmar depois."
      options={OPTIONS}
      onBack={() => router.back()}
      onSelect={(v) => setOnboardingField('skin_type', v)}
      onContinue={() => {
        track('onboarding_step_completed', obStep(STEP, STEP_NAME));
        router.push('/(onboarding)/sun-exposure');
      }}
    />
  );
}
