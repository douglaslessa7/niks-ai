import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObOptionCard, ObPillButton,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 4 do onboarding — gravidez/amamentação, para TODAS (a tela de gênero saiu do
// fluxo e `genero` vai vazio). Textos e o "IMPORTANTE" da versão B, no visual do
// kit. Escolha única; o "IMPORTANTE:" rosa dentro do título é o motivo de não usar o
// `ObChoiceScreen` (que só aceita título em texto puro).
type PregnancyStatus = 'none' | 'pregnant' | 'breastfeeding' | 'trying';

const OPTIONS: { label: string; value: PregnancyStatus }[] = [
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
  const stored = useAppStore((s) => s.onboarding.pregnancy_status);
  const { y, buttonBottom } = useObFrame();
  const [selected, setSelected] = useState<PregnancyStatus | null>((stored as PregnancyStatus | null) ?? null);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleContinue = () => {
    if (!selected) return;
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/concerns');
  };

  return (
    <ObScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: y(118), paddingBottom: buttonBottom + 48 + 24 }}
      >
        {/* "IMPORTANTE:" no mesmo estilo do título (mesma fonte e tamanho), em rosa e
            numa linha só dele, com um respiro de 14 pt antes da pergunta (pedido do produto). */}
        <ObTitle style={{ color: OB.pink }}>IMPORTANTE:</ObTitle>
        <ObTitle style={{ marginTop: 14 }}>Alguns ativos do skincare precisam ser evitados em certas situações.</ObTitle>
        <ObSubtitle style={{ marginTop: 9, marginHorizontal: 30 }}>Selecione a que se aplica a você.</ObSubtitle>
        <View style={{ marginTop: 22, marginHorizontal: 17, gap: 8 }}>
          {OPTIONS.map((opt) => (
            <ObOptionCard
              key={opt.value}
              label={opt.label}
              selected={selected === opt.value}
              onPress={() => {
                setSelected(opt.value);
                setOnboardingField('pregnancy_status', opt.value);
              }}
            />
          ))}
        </View>
      </ScrollView>
      <ObHeader onBack={() => router.back()} backdrop={OB.bg} />
      <ObPillButton disabled={!selected} bottom={buttonBottom} onPress={handleContinue} />
    </ObScreen>
  );
}
