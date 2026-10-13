import { useState } from 'react';
import { View, Text, Image, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObPillButton, useObFrame, obStep, useOnMount, ObPress
} from '../../components/onboarding/kit';

// Tela 7 do onboarding — tipo de pele. Réplica da tela "Como você descreveria sua
// pele · zoom na pele" do Claude Design ("NIKS Onboarding - fluxo completo"): título a
// 114 pt, sem subtítulo; grade a 200 pt com 4 cards brancos (2 colunas, 176 pt, raio
// 14, sombra leve) — círculo de pele de perto de 76 pt, rótulo 16/21 e a frase curta
// 14/18 #818181 — e o "Não sei" na largura inteira (108 pt, círculo à esquerda).
// Marcado = borda #FF5EA8 de 2 pt (sem marcar, transparente), como na grade de
// preocupações. Escolha única; os valores gravados em `skin_type` são os de sempre.
//
// Os círculos são PNGs @3x (`assets/onboarding/tipo-pele/`) rasterizados do SVG do
// design no Chrome (ruído + desfoque, que o react-native-svg não desenha).
// O "Não sei" usa o círculo de brilhos de "Outro" (preocupações) — escolha do Douglas,
// não o desenho do design (que não chegou inteiro na leitura).
const STEP = OB_STEPS.tipoPele;
const STEP_NAME = 'Tipo de Pele';
const GAP = 9;
const SIDE = 17;

const GRID = [
  { value: 'Oleosa', sub: 'Brilha durante o dia', img: require('../../assets/onboarding/tipo-pele/oleosa.png') },
  { value: 'Seca', sub: 'Repuxa e descama', img: require('../../assets/onboarding/tipo-pele/seca.png') },
  { value: 'Mista', sub: 'Oleosa na zona T', img: require('../../assets/onboarding/tipo-pele/mista.png') },
  { value: 'Normal', sub: 'Equilibrada', img: require('../../assets/onboarding/tipo-pele/normal.png') },
];
const UNSURE = { value: 'Não sei', sub: 'Vamos descobrir juntos', img: require('../../assets/onboarding/pele-zoom/outro.png') };

const cardBase = {
  borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 2,
  shadowColor: OB.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6,
} as const;

function Circle({ img }: { img: number }) {
  return (
    <View style={{
      width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFFFFF',
      shadowColor: 'rgb(120,70,50)', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 5,
    }}>
      <Image source={img} style={{ width: 76, height: 76, borderRadius: 38 }} />
    </View>
  );
}

export default function SkinType() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);
  const stored = useAppStore((s) => s.onboarding.skin_type);
  const { width } = useWindowDimensions();
  const { y, buttonBottom } = useObFrame();
  const [selected, setSelected] = useState<string | null>(stored ?? null);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  // Vibração no `ObPress` (toque das opções do kit).
  const pick = (v: string) => {
    setSelected(v);
    setOnboardingField('skin_type', v);
  };

  const handleContinue = () => {
    if (!selected) return;
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/sun-exposure');
  };

  const cardW = (width - SIDE * 2 - GAP) / 2;

  return (
    <ObScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: y(114), paddingBottom: buttonBottom + 48 + 24 }}
      >
        {/* Sem subtítulo; "sua pele?" sempre na 2ª linha (pedido do produto). */}
        <ObTitle>{'Como você descreveria\nsua pele?'}</ObTitle>

        {/* Respiro de 40 pt entre a pergunta e as opções (o design tinha 20; pedido do produto). */}
        <View style={{ marginTop: 40, marginHorizontal: SIDE, flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {GRID.map((o) => {
            const on = selected === o.value;
            return (
              <ObPress
                key={o.value}
                onPress={() => pick(o.value)}
                style={[cardBase, {
                  width: cardW, height: 176, borderColor: on ? OB.pink : 'transparent',
                  alignItems: 'center', paddingTop: 18 - 2, gap: 10,
                }]}
              >
                <Circle img={o.img} />
                <View style={{ gap: 2, paddingHorizontal: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, lineHeight: 21, color: OB.ink, textAlign: 'center' }}>{o.value}</Text>
                  <Text style={{ fontSize: 14, lineHeight: 18, color: OB.sub, textAlign: 'center' }}>{o.sub}</Text>
                </View>
              </ObPress>
            );
          })}

          {/* "Não sei" — largura inteira, círculo à esquerda */}
          <ObPress
            onPress={() => pick(UNSURE.value)}
            outerStyle={{ width: '100%' }}
            style={[cardBase, {
              width: '100%', height: 108, borderColor: selected === UNSURE.value ? OB.pink : 'transparent',
              flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20 - 2,
            }]}
          >
            <Circle img={UNSURE.img} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, lineHeight: 21, color: OB.ink }}>{UNSURE.value}</Text>
              <Text style={{ fontSize: 14, lineHeight: 18, color: OB.sub }}>{UNSURE.sub}</Text>
            </View>
          </ObPress>
        </View>
      </ScrollView>

      <ObHeader onBack={() => router.back()} backdrop={OB.bg} />
      <ObPillButton disabled={!selected} bottom={buttonBottom} onPress={handleContinue} />
    </ObScreen>
  );
}
