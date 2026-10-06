import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObCheck, ObPillButton, ObLogoHalo,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { concernBenefits, concernTags } from '../../components/onboarding/answers';

// Tela 5 do fluxo completo ("Eco") — "Entendi! Vamos te ajudar a:", logo depois do
// "o que te incomoda" (4) e antes da preparação do scan. As etiquetas em volta da
// logo e os benefícios mudam conforme o que ela marcou (`answers.ts`).
//
// Medidas do design (frame de 393): halo Ø320 em (36, 80), etiquetas em (87, 162) e
// (252, 295), título a 430, benefícios a 488 (gap 16) e a frase final em negrito.
// ⚠️ A linha "+[X] mulheres já analisaram a pele com a NIKS" do design ficou de fora:
// o número é um marcador do design, e prova social não pode ir ao ar inventada.
const STEP = OB_STEPS.entendi;
const STEP_NAME = 'Entendi';
const TAG_POS = [{ left: 51, top: 82 }, { left: 216, top: 215 }]; // relativas ao halo

export default function Entendi() {
  const router = useRouter();
  const { track } = useMixpanel();
  const concerns = useAppStore((s) => s.onboarding.concerns);
  const { y, buttonBottom } = useObFrame();

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const tags = concernTags(concerns);
  const benefits = concernBenefits(concerns);

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(scan)/scan-prep' as any);
  };

  return (
    <ObScreen>
      <ObLogoHalo top={80}>
        {tags.map((tag, i) => (
          <View key={tag} style={{
            position: 'absolute', left: TAG_POS[i].left, top: TAG_POS[i].top, height: 29, paddingHorizontal: 12,
            borderRadius: 15, backgroundColor: '#FFFFFF', justifyContent: 'center',
            shadowColor: OB.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 7,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: OB.ink }}>{tag}</Text>
          </View>
        ))}
      </ObLogoHalo>

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(430) }}>
        <ObTitle>Entendi! Vamos te ajudar a:</ObTitle>
      </View>

      <View style={{ position: 'absolute', left: 17, right: 17, top: y(488), gap: 16 }}>
        {benefits.map((b) => (
          <View key={b} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
            <View style={{ marginTop: 1 }}>
              <ObCheck size={22} stroke={2.2} />
            </View>
            <Text style={{ flex: 1, fontSize: 18, lineHeight: 25, color: OB.body }}>{b}</Text>
          </View>
        ))}
        <Text style={{ marginTop: 8, fontSize: 18, lineHeight: 25, fontWeight: '600', color: OB.ink, textAlign: 'center' }}>
          Vamos começar analisando seu rosto
        </Text>
      </View>

      <ObHeader onBack={() => router.back()} />
      <ObPillButton label="Fazer minha análise" width={220} onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
