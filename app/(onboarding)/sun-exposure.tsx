import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObOptionCard, ObPillButton,
  useObFrame, useObName, withName, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 10 do onboarding novo — escolha única (modelo 3i do design).
//
// `value` é o texto que continua indo para `onboarding.sun_exposure` (e dali para
// a `analyze-skin` e para `users.sun_exposure`): são os rótulos ANTIGOS da tela,
// mantidos de propósito para a IA e o banco não verem nada mudar. O design só
// trocou o que aparece para a usuária.
// Só "Entre 1 e 3 horas" tem frase revelada no design — as outras não têm.
const OPTIONS: { label: string; value: string; reveal?: string }[] = [
  { label: 'Quase nenhum', value: 'Quase nenhum' },
  { label: 'Menos de 1 hora', value: 'Menos de 1 hora por dia' },
  { label: 'Entre 1 e 3 horas', value: 'Entre 1 a 3 horas por dia', reveal: 'Vamos incluir a reaplicação do protetor no meio do dia.' },
  { label: 'Mais de 3 horas', value: 'Mais de 3 horas por dia' },
];

const STEP = OB_STEPS.sol;
const STEP_NAME = 'Exposição Solar';

export default function SunExposure() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { setOnboardingField } = useAppStore();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();
  const [selected, setSelected] = useState<string | null>(null);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleSelect = (opt: typeof OPTIONS[number]) => {
    haptics.select();
    setSelected(opt.value);
    setOnboardingField('sun_exposure', opt.value);
  };

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/hydration-sleep');
  };

  return (
    <ObScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: y(112), paddingBottom: buttonBottom + 48 + 24 }}
      >
        <ObTitle>{withName(name, 'quanto tempo você passa exposta ao sol por dia?')}</ObTitle>
        <ObSubtitle style={{ marginTop: 11 }}>Isso define a proteção solar da sua rotina.</ObSubtitle>
        <View style={{ marginTop: 23, marginHorizontal: 17, gap: 8 }}>
          {OPTIONS.map((opt) => (
            <ObOptionCard
              key={opt.value}
              label={opt.label}
              reveal={opt.reveal}
              selected={selected === opt.value}
              onPress={() => handleSelect(opt)}
            />
          ))}
        </View>
      </ScrollView>

      <ObHeader step={STEP} onBack={() => router.back()} backdrop={OB.bg} />
      <ObPillButton onPress={handleContinue} disabled={!selected} bottom={buttonBottom} />
    </ObScreen>
  );
}
