import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObOptionCard, ObPillButton,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { CONCERN_LABELS, CONCERN_REVEAL } from '../../components/onboarding/answers';

// Tela 4 do fluxo completo — "O que mais te incomoda na sua pele hoje?" (múltipla
// escolha, até 3), ANTES da foto: "Vamos procurar isso na sua foto." Grava
// `onboarding.concerns`, que vai para a `analyze-skin` (disparada assim que a foto
// chega), para a rotina e para o compromisso.
// ⚠️ O design repete a pergunta depois do scan (tela 11); essa repetição foi tirada a
// pedido do produto — a pergunta existe uma vez só.
const MAX_SELECT = 3;
const STEP = OB_STEPS.incomoda;
const STEP_NAME = 'Preocupações de Pele';

export default function Concerns() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);
  const stored = useAppStore((s) => s.onboarding.concerns);
  const { y, buttonBottom } = useObFrame();
  // Volta com o que já tinha marcado (ex.: voltou do "Entendi").
  const [selected, setSelected] = useState<string[]>(stored);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const toggle = (label: string) => {
    if (!selected.includes(label) && selected.length >= MAX_SELECT) return;
    haptics.select();
    const next = selected.includes(label) ? selected.filter((c) => c !== label) : [...selected, label];
    setSelected(next);
    setOnboardingField('concerns', next);
  };

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/entendi');
  };

  const full = selected.length >= MAX_SELECT;

  return (
    <ObScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: y(118), paddingBottom: 150 }}
      >
        <ObTitle>O que mais te incomoda na sua pele hoje?</ObTitle>
        <ObSubtitle style={{ marginTop: 9, marginHorizontal: 30 }}>
          Escolha até 3. Vamos procurar isso na sua foto.
        </ObSubtitle>
        <View style={{ marginTop: 17, marginHorizontal: 17, gap: 9 }}>
          {CONCERN_LABELS.map((label) => {
            const isSel = selected.includes(label);
            return (
              <ObOptionCard
                key={label}
                label={label}
                reveal={CONCERN_REVEAL[label]}
                selected={isSel}
                disabled={!isSel && full}
                onPress={() => toggle(label)}
              />
            );
          })}
        </View>
      </ScrollView>

      {/* Véu branco na base (130 pt, branco cheio a partir de 40%) — a lista some
          por baixo do botão em vez de ser cortada seco. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', '#FFFFFF']}
        locations={[0, 0.4]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 130 }}
      />

      <ObHeader onBack={() => router.back()} backdrop={OB.bg} />
      <ObPillButton onPress={handleContinue} disabled={selected.length === 0} bottom={buttonBottom} />
    </ObScreen>
  );
}
