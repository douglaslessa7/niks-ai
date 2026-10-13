import { useState } from 'react';
import { View, Text, Image, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton,
  useObFrame, useObName, withName, obStep, useOnMount, ObPress
} from '../../components/onboarding/kit';
import { CONCERN_LABELS } from '../../components/onboarding/answers';

// Tela 5 do onboarding — "O que mais te incomoda na sua pele hoje?" (múltipla
// escolha, até 3). Réplica da tela "05 O que te incomoda · zoom na pele" do Claude
// Design ("NIKS Onboarding - fluxo completo", seção "Alterações · cores do padrão
// novo"): grade de 2 colunas de cards brancos (155 pt, raio 14, sombra leve), cada um
// com um círculo de 76 pt mostrando a pele de perto e o rótulo embaixo. Marcado =
// borda rosa #FF5EA8 de 2 pt (sem marcar, a borda é transparente); com 3 marcados,
// os outros simplesmente não respondem, como no design.
//
// Os círculos são PNGs @3x (`assets/onboarding/pele-zoom/`) rasterizados do SVG do
// design no Chrome: o desenho usa ruído (`feTurbulence`) e desfoque, que o
// react-native-svg não desenha.
//
// Título com o nome dela (como no design); subtítulo definido pelo produto. Grava
// `onboarding.concerns`, que vai para a `analyze-skin` (disparada assim que a foto
// chega) e para a rotina.
const MAX_SELECT = 3;
const STEP = OB_STEPS.incomoda;
const STEP_NAME = 'Preocupações de Pele';

const ZOOM: Record<string, number> = {
  'Acne/espinhas': require('../../assets/onboarding/pele-zoom/acne.png'),
  'Manchas': require('../../assets/onboarding/pele-zoom/manchas.png'),
  'Cravos': require('../../assets/onboarding/pele-zoom/cravos.png'),
  'Oleosidade': require('../../assets/onboarding/pele-zoom/oleosidade.png'),
  'Rugas': require('../../assets/onboarding/pele-zoom/rugas.png'),
  'Poros dilatados': require('../../assets/onboarding/pele-zoom/poros.png'),
  'Olheiras': require('../../assets/onboarding/pele-zoom/olheiras.png'),
  'Ressecamento': require('../../assets/onboarding/pele-zoom/ressecamento.png'),
  'Textura irregular': require('../../assets/onboarding/pele-zoom/textura.png'),
  'Outro': require('../../assets/onboarding/pele-zoom/outro.png'),
};

const GAP = 9;
const SIDE = 17;

function ZoomCard({ label, selected, width, onPress, disabled }: {
  label: string; selected: boolean; width: number; onPress: () => void; disabled?: boolean;
}) {
  // Toque das opções do kit (vibra e afunda); aqui a marcada ganha BORDA rosa, sem enchimento.
  return (
    <ObPress
      onPress={onPress}
      disabled={disabled}
      style={{
        width, height: 155, borderRadius: 14, backgroundColor: '#FFFFFF',
        borderWidth: 2, borderColor: selected ? OB.pink : 'transparent',
        alignItems: 'center', paddingTop: 18 - 2, gap: 10,
        shadowColor: OB.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6,
      }}
    >
      <View style={{
        width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFFFFF',
        shadowColor: 'rgb(120,70,50)', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 5,
      }}>
        <Image source={ZOOM[label]} style={{ width: 76, height: 76, borderRadius: 38 }} />
      </View>
      <Text style={{ paddingHorizontal: 14, textAlign: 'center', fontSize: 16, lineHeight: 21, color: OB.ink }}>
        {label}
      </Text>
    </ObPress>
  );
}

export default function Concerns() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);
  const stored = useAppStore((s) => s.onboarding.concerns);
  const name = useObName();
  const { width } = useWindowDimensions();
  const { y, buttonBottom } = useObFrame();
  // Volta com o que já tinha marcado (ex.: voltou da tela seguinte).
  const [selected, setSelected] = useState<string[]>(stored);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const toggle = (label: string) => {
    if (!selected.includes(label) && selected.length >= MAX_SELECT) return;
    const next = selected.includes(label) ? selected.filter((c) => c !== label) : [...selected, label];
    setSelected(next);
    setOnboardingField('concerns', next);
  };

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/goal-validation');
  };

  const cardW = (width - SIDE * 2 - GAP) / 2;

  return (
    <ObScreen>
      {/* Cabeçalho fixo (título a 114 pt no design); a grade rola por baixo dele. */}
      <View style={{ paddingTop: y(114), paddingBottom: 16, backgroundColor: OB.bg, zIndex: 1 }}>
        <ObTitle>{withName(name, 'o que mais te incomoda na sua pele hoje?')}</ObTitle>
        <ObSubtitle style={{ marginTop: 9, marginHorizontal: 30 }}>
          Selecione até 3. Vamos priorizar isso na sua rotina de skincare.
        </ObSubtitle>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexDirection: 'row', flexWrap: 'wrap', gap: GAP,
          paddingTop: 12, paddingHorizontal: SIDE, paddingBottom: 170,
        }}
      >
        {CONCERN_LABELS.map((label) => (
          <ZoomCard
            key={label}
            label={label}
            width={cardW}
            selected={selected.includes(label)}
            // Com 3 marcadas, as outras não respondem (nem vibram).
            disabled={!selected.includes(label) && selected.length >= MAX_SELECT}
            onPress={() => toggle(label)}
          />
        ))}
      </ScrollView>

      {/* Véu branco na base (150 pt, branco cheio a partir de 45%) — a grade some por
          baixo do botão em vez de ser cortada seco. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', '#FFFFFF']}
        locations={[0, 0.45]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 }}
      />

      <ObHeader onBack={() => router.back()} />
      <ObPillButton onPress={handleContinue} disabled={selected.length === 0} bottom={buttonBottom} />
    </ObScreen>
  );
}
