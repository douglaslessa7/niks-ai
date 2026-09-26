import { useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton, ObYearWheel,
  useObFrame, useObName, withName, obStep, useOnMount, ageFromYear,
} from '../../components/onboarding/kit';

// Tela 3 do onboarding novo — seletor de ANO de nascimento (modelo 1c).
//
// ⚠️ O que é gravado continua sendo a IDADE em `onboarding.birthday` (string,
// ex.: "27"), exatamente como a roda de idades antiga fazia: `saveToSupabase` e a
// `loading` leem esse campo como número < 120 → `idade`. Só a pergunta mudou.
//
// Estado inicial (nota do design): faixa com "Selecione" e SEM botão; depois do
// primeiro giro aparecem o ano, a idade calculada e o botão.
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 51 }, (_, i) => THIS_YEAR - 60 + i); // 10–60 anos, como antes
const INITIAL_YEAR = THIS_YEAR - 24;                                     // mesma idade padrão de antes

const STEP = OB_STEPS.idade;
const STEP_NAME = 'Idade';

export default function Birthday() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { setOnboardingField } = useAppStore();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();
  const [touched, setTouched] = useState(false);
  const [year, setYear] = useState(INITIAL_YEAR);
  const yearRef = useRef(INITIAL_YEAR);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleChange = (yr: number) => {
    yearRef.current = yr;
    setYear(yr);
    setOnboardingField('birthday', String(ageFromYear(yr)));
  };

  const handleContinue = () => {
    haptics.action();
    setOnboardingField('birthday', String(ageFromYear(yearRef.current)));
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/gender');
  };

  return (
    <ObScreen>
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(112) }}>
        <ObTitle>{withName(name, 'em que ano você nasceu?')}</ObTitle>
        <ObSubtitle style={{ marginTop: 11, marginHorizontal: 30 }}>
          Sua pele muda com a idade, e sua rotina muda junto.
        </ObSubtitle>
      </View>

      {/* Roda: topo a 274 pt no design (faixa central a 396 pt) */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(274) }}>
        <ObYearWheel
          years={YEARS}
          initialYear={INITIAL_YEAR}
          touched={touched}
          onFirstInteraction={() => setTouched(true)}
          onChange={handleChange}
        />
      </View>

      {touched && (
        <Text style={{ position: 'absolute', left: 0, right: 0, top: y(612), textAlign: 'center', fontSize: 15, color: OB.sub }}>
          {ageFromYear(year)} anos
        </Text>
      )}

      <ObHeader step={STEP} onBack={() => router.back()} />
      {touched && <ObPillButton onPress={handleContinue} bottom={buttonBottom} />}
    </ObScreen>
  );
}
