import { useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton, ObWheel, ObWheelBand,
  useObFrame, useObName, withName, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 13 do onboarding novo — horário da rotina (NOVA). O design não tem modelo
// próprio para ela: usa o seletor da tela 3 (1c) em duas rodas lado a lado, sobre
// UMA faixa, como o seletor de hora do iOS.
//
// Grava em `onboarding.rotina_manha_horario` / `rotina_noite_horario` ('HH:MM') e o
// fuso do aparelho em `rotina_fuso` (IANA). Vão para `users.rotina_*` no
// `saveToSupabase` (signup). ⚠️ O agendamento das notificações do servidor AINDA
// NÃO lê estes campos — o pg_cron segue em 7h/21h fixos.
// O horário da noite alimenta o título da tela 13a ("…hoje às 21h").
function halfHours(fromH: number, toH: number) {
  const out: string[] = [];
  for (let h = fromH; h <= toH; h++) {
    for (const m of ['00', '30']) out.push(`${String(h).padStart(2, '0')}:${m}`);
  }
  return out;
}
const MORNING = halfHours(5, 11);   // 05:00 – 11:30
const NIGHT = halfHours(17, 23);    // 17:00 – 23:30
// Padrões = horários em que o pg_cron já dispara hoje (7h e 21h de Brasília).
const MORNING_DEFAULT = '07:00';
const NIGHT_DEFAULT = '21:00';

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

const STEP = OB_STEPS.horarioRotina;
const STEP_NAME = 'Horário da Rotina';

export default function HorarioRotina() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { onboarding, setOnboardingField } = useAppStore();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();
  const morning = useRef(onboarding.rotina_manha_horario ?? MORNING_DEFAULT);
  const night = useRef(onboarding.rotina_noite_horario ?? NIGHT_DEFAULT);
  const [, force] = useState(0);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleContinue = () => {
    haptics.action();
    setOnboardingField('rotina_manha_horario', morning.current);
    setOnboardingField('rotina_noite_horario', night.current);
    setOnboardingField('rotina_fuso', deviceTimeZone());
    track('onboarding_step_completed', { ...obStep(STEP, STEP_NAME), manha: morning.current, noite: night.current });
    router.push('/(onboarding)/aviso-lembretes');
  };

  const column = (label: string, items: string[], ref: { current: string }) => (
    <View style={{ flex: 1 }}>
      <Text style={{ textAlign: 'center', fontSize: 15, lineHeight: 18, fontWeight: '600', color: OB.sub, marginBottom: 12 }}>{label}</Text>
      <ObWheel
        labels={items}
        initialIndex={items.indexOf(ref.current)}
        showBand={false}
        onChange={(i) => { ref.current = items[i]; force((n) => n + 1); }}
      />
    </View>
  );

  return (
    <ObScreen>
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(112) }}>
        <ObTitle>{withName(name, 'que horas você quer fazer sua rotina?')}</ObTitle>
        <ObSubtitle style={{ marginTop: 11 }}>A gente te lembra na hora certa.</ObSubtitle>
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(250) }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 30 }}>
          <ObWheelBand />
        </View>
        <View style={{ flexDirection: 'row', paddingHorizontal: 17 }}>
          {column('Manhã', MORNING, morning)}
          {column('Noite', NIGHT, night)}
        </View>
      </View>

      <ObHeader step={STEP} onBack={() => router.back()} />
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
