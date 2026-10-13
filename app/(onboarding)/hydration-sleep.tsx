import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObPillButton,
  useObFrame, useObName, withName, obStep, useOnMount, ObPress, ObFill, useObFillText
} from '../../components/onboarding/kit';

// Tela 9 do onboarding — água E sono numa tela só, como na versão B (título de B com o
// nome dela antes, do kit; sem subtítulo, a pedido do produto). Dois grupos de chips; "Continuar" só com
// os dois escolhidos. Grava `onboarding.hydration` e `onboarding.sleep` com os mesmos
// valores de sempre (a `analyze-skin` e a rotina leem esses textos).
// `hydration.tsx` e `sleep.tsx` (a versão em 2 telas do fluxo completo) ficaram no
// repo, sem ligação.
// "Menos de 1L" saiu a pedido do produto (out/2026).
const WATER = ['1–2L', '2–3L', '3L+'];
const SLEEP = ['4–5', '6', '7', '8', '9+'];

const STEP = OB_STEPS.aguaSono;
const STEP_NAME = 'Hidratação e Sono';

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const [pressing, setPressing] = useState(false);   // o rosa abre do dedo já no toque (ver ObOptionCard)
  const [touch, setTouch] = useState<{ x: number; y: number } | null>(null);
  const fillOn = selected || pressing;
  const on = useObFillText(fillOn);   // texto branco junto com o rosa (ver ObOptionCard)
  return (
    // Toque das opções do kit: vibra, afunda e o rosa enche da direita para a esquerda.
    <View style={{ flex: 1 }}>
    <ObPress
      onPress={onPress}
      onPressIn={(t) => { setTouch(t); setPressing(true); }}
      onPressOut={() => setPressing(false)}
      style={{
        height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: OB.option, overflow: 'hidden',
      }}
    >
      <ObFill on={fillOn} touch={touch} />
      <Text
        pointerEvents="none"   // o toque cai no botão: o círculo sai do ponto certo
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={{ paddingHorizontal: 6, fontSize: 17, fontWeight: on ? '600' : '400', color: on ? '#FFFFFF' : OB.ink }}
      >
        {label}
      </Text>
    </ObPress>
    </View>
  );
}

function Group({ title, options, value, onPick }: {
  title: string; options: string[]; value: string | null; onPick: (v: string) => void;
}) {
  return (
    <View style={{ marginHorizontal: 17 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: OB.ink, marginBottom: 10 }}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((o) => (
          <Chip key={o} label={o} selected={value === o} onPress={() => onPick(o)} />
        ))}
      </View>
    </View>
  );
}

export default function HydrationSleep() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { onboarding, setOnboardingField } = useAppStore();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();
  const [water, setWater] = useState<string | null>(onboarding.hydration ?? null);
  const [sleep, setSleep] = useState<string | null>(onboarding.sleep ?? null);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const ready = !!water && !!sleep;

  const handleContinue = () => {
    if (!ready) return;
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/skincare-routine');
  };

  return (
    <ObScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: y(118), paddingBottom: buttonBottom + 48 + 24 }}
      >
        <ObTitle>{withName(name, 'como está sua hidratação e sono?')}</ObTitle>
        <View style={{ marginTop: 30, gap: 28 }}>
          <Group
            title="Litros de água por dia"
            options={WATER}
            value={water}
            onPick={(v) => { setWater(v); setOnboardingField('hydration', v); }}
          />
          <Group
            title="Horas de sono por noite"
            options={SLEEP}
            value={sleep}
            onPick={(v) => { setSleep(v); setOnboardingField('sleep', v); }}
          />
        </View>
      </ScrollView>
      <ObHeader onBack={() => router.back()} backdrop={OB.bg} />
      <ObPillButton disabled={!ready} bottom={buttonBottom} onPress={handleContinue} />
    </ObScreen>
  );
}
