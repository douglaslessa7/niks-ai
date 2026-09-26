import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObOptionCard, ObPillButton,
  useObFrame, useObName, withName, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { CONCERN_OPTIONS } from '../../components/onboarding/answers';

// Tela 5 do onboarding novo — múltipla escolha com frase revelada (modelo 3j).
// Opções e frases vivem em `components/onboarding/answers.ts` (o loading e o
// compromisso também as leem).

const MAX_SELECT = 3;
const STEP = OB_STEPS.incomoda;
const STEP_NAME = 'Preocupações de Pele';

export default function Concerns() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { setOnboardingField } = useAppStore();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();
  const [selected, setSelected] = useState<string[]>([]);

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
    router.push('/(onboarding)/goal-validation');
  };

  const full = selected.length >= MAX_SELECT;

  return (
    <ObScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: y(112), paddingBottom: 150 }}
      >
        <ObTitle>{withName(name, 'o que mais te incomoda na sua pele hoje?')}</ObTitle>
        <ObSubtitle style={{ marginTop: 11 }}>Escolha até 3.</ObSubtitle>
        <View style={{ marginTop: 17, marginHorizontal: 17, gap: 8 }}>
          {CONCERN_OPTIONS.map((opt) => {
            const isSel = selected.includes(opt.label);
            return (
              <ObOptionCard
                key={opt.label}
                label={opt.label}
                reveal={opt.reveal}
                selected={isSel}
                disabled={!isSel && full}
                onPress={() => toggle(opt.label)}
              />
            );
          })}
        </View>
      </ScrollView>

      {/* Véu branco na base (150 pt, branco cheio a partir de 45%) — a lista some
          por baixo do botão em vez de ser cortada seco. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', '#FFFFFF']}
        locations={[0, 0.45]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 }}
      />

      <ObHeader step={STEP} onBack={() => router.back()} backdrop={OB.bg} />
      <ObPillButton onPress={handleContinue} disabled={selected.length === 0} bottom={buttonBottom} />
    </ObScreen>
  );
}
