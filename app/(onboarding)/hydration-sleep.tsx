import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObOptionCard, ObPillButton,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 11 do onboarding novo — hidratação e sono. São DUAS perguntas de escolha
// única na mesma tela (o design não tem modelo próprio para ela): cada grupo usa o
// card de opção do padrão 3i. Os valores gravados são os de antes ('1–2L', '7'…);
// o sono ganhou " horas" só no rótulo.
const WATER = ['Menos de 1L', '1–2L', '2–3L', '3L+'];
const SLEEP = ['4–5', '6', '7', '8', '9+'];

const STEP = OB_STEPS.hidratacaoSono;
const STEP_NAME = 'Hidratação e Sono';

function GroupLabel({ children }: { children: string }) {
  return (
    <Text style={{ marginTop: 23, marginBottom: 8, marginHorizontal: 17, fontSize: 15, fontWeight: '600', color: OB.sub }}>
      {children}
    </Text>
  );
}

export default function HydrationSleep() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);
  const { y, buttonBottom } = useObFrame();
  const [water, setWater] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/skincare-routine');
  };

  return (
    <ObScreen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: y(112), paddingBottom: 150 }}>
        <ObTitle>Como está sua hidratação e sono?</ObTitle>
        <ObSubtitle style={{ marginTop: 11 }}>
          Sua pele se regenera enquanto você dorme e se hidrata por dentro. Esses dois fatores afetam mais a pele do que qualquer produto.
        </ObSubtitle>

        <GroupLabel>Litros de água por dia</GroupLabel>
        <View style={{ marginHorizontal: 17, gap: 8 }}>
          {WATER.map((opt) => (
            <ObOptionCard
              key={opt} label={opt} selected={water === opt}
              onPress={() => { haptics.select(); setWater(opt); setOnboardingField('hydration', opt); }}
            />
          ))}
        </View>

        <GroupLabel>Horas de sono por noite</GroupLabel>
        <View style={{ marginHorizontal: 17, gap: 8 }}>
          {SLEEP.map((opt) => (
            <ObOptionCard
              key={opt} label={`${opt} horas`} selected={sleep === opt}
              onPress={() => { haptics.select(); setSleep(opt); setOnboardingField('sleep', opt); }}
            />
          ))}
        </View>
      </ScrollView>

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', '#FFFFFF']}
        locations={[0, 0.45]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 }}
      />
      <ObHeader step={STEP} onBack={() => router.back()} backdrop={OB.bg} />
      <ObPillButton onPress={handleContinue} disabled={!water || !sleep} bottom={buttonBottom} />
    </ObScreen>
  );
}
