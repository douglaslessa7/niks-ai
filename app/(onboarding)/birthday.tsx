import { useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton, ObWheel,
  useObFrame, useObName, withName, obStep, useOnMount, ageFromYear,
} from '../../components/onboarding/kit';

// Tela 3 do fluxo completo — seletor de ANO de nascimento. A idade gravada aqui é a
// que a tela 9 ("Sua pele tem N anos. Você tem M.") compara com a idade da pele.
//
// ⚠️ O que é gravado continua sendo a IDADE em `onboarding.birthday` (string,
// ex.: "27"), exatamente como a roda de idades antiga fazia: `saveToSupabase` e a
// `loading` leem esse campo como número < 120 → `idade`. Só a pergunta mudou.
//
// Abre JÁ em 2002, com o botão visível (sem a linha "N anos" embaixo da roda —
// removida a pedido do produto; a idade continua sendo CALCULADA e gravada) (decisão do produto — sem o
// estado "Selecione" da nota do design): a usuária só rola até o ano dela. Quem não
// rolar e tocar em Continuar grava a idade de 2002, como a roda antiga gravava 24.
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 51 }, (_, i) => THIS_YEAR - 60 + i); // 10–60 anos, como antes
const YEAR_LABELS = YEARS.map(String);
const INITIAL_YEAR = 2002;                                               // ano em que o seletor abre

const STEP = OB_STEPS.idade;
const STEP_NAME = 'Idade';

export default function Birthday() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { setOnboardingField } = useAppStore();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();
  const yearRef = useRef(INITIAL_YEAR);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleChange = (yr: number) => {
    yearRef.current = yr;
    setOnboardingField('birthday', String(ageFromYear(yr)));
  };

  const handleContinue = () => {
    haptics.action();
    setOnboardingField('birthday', String(ageFromYear(yearRef.current)));
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/concerns');
  };

  return (
    <ObScreen>
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(118) }}>
        <ObTitle>{withName(name, 'em que ano você nasceu?')}</ObTitle>
        <ObSubtitle style={{ marginTop: 9, marginHorizontal: 30 }}>
          Vamos comparar a idade da sua pele com a sua idade.
        </ObSubtitle>
      </View>

      {/* Roda: faixa central a 397 pt no design (topo da roda = 397 − 122) */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(275) }}>
        <ObWheel
          labels={YEAR_LABELS}
          initialIndex={YEARS.indexOf(INITIAL_YEAR)}
          onChange={(i) => handleChange(YEARS[i])}
        />
      </View>

      <ObHeader onBack={() => router.back()} />
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
