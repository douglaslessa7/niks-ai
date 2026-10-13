import { useRef } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObTitle, ObPillButton, ObWheel, WHEEL_H,
  useObFrame, useObName, withName, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 3 do onboarding — seletor de IDADE (anos de 10 a 60, abre em 24), como na
// versão B. Título da versão B com o nome dela antes (kit) e quebra antes de "você";
// sem subtítulo (pedido do produto).
//
// Grava a IDADE em `onboarding.birthday` (string, ex.: "27"): `saveToSupabase` e o
// pré-carregamento da análise leem esse campo como número < 120 → `idade`. Quem não
// rolar e tocar em Continuar grava 24, como na versão B.
const AGES = Array.from({ length: 51 }, (_, i) => i + 10); // 10–60
const AGE_LABELS = AGES.map(String);
const DEFAULT_AGE = 24;

const STEP = OB_STEPS.idade;
const STEP_NAME = 'Idade';

export default function Birthday() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { setOnboardingField } = useAppStore();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();
  const ageRef = useRef(DEFAULT_AGE);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleChange = (age: number) => {
    ageRef.current = age;
    setOnboardingField('birthday', String(age));
  };

  const handleContinue = () => {
    haptics.action();
    setOnboardingField('birthday', String(ageRef.current));
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/pregnancy');
  };

  return (
    <ObScreen>
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(118) }}>
        {/* Sem subtítulo; "você tem?" sempre na 2ª linha (pedido do produto). */}
        <ObTitle>{withName(name, 'quantos anos\nvocê tem?')}</ObTitle>
      </View>

      {/* Roda: faixa central a 397 pt no design (topo da roda = 397 − 122) */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(275) }}>
        <ObWheel
          labels={AGE_LABELS}
          initialIndex={AGES.indexOf(DEFAULT_AGE)}
          onChange={(i) => handleChange(AGES[i])}
        />
        <Text style={{
          marginTop: 10, textAlign: 'center', fontSize: 13, fontWeight: '600',
          letterSpacing: 2, color: OB.sub, textTransform: 'uppercase',
        }}>
          anos
        </Text>
      </View>

      {/* Sem seta de voltar (pedido do produto, 13/out/2026). */}
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
