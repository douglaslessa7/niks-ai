import { useMemo, useRef, useState } from 'react';
import {
  View, Text, Animated, Easing, Pressable,
  type NativeSyntheticEvent, type NativeScrollEvent, type GestureResponderEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton,
  useObFrame, useObName, withName, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Onboarding — horário da rotina, UMA tela com duas etapas (20/out/2026, pedido do
// produto). Réplica das telas "Novo 20 Horário · manhã (novo)" e "· noite (novo)" de
// "NIKS Onboarding - fluxo completo.dc.html" (Claude Design): título, "A gente te lembra
// na hora certa.", pílula Manhã | Noite, roda de 5 linhas (44/26/20 pt sobre a faixa
// #F0F0F0 de 72 pt), "Lembrete todos os dias às HH:MM" e "Continuar".
//
// A pílula NÃO é clicável — só mostra a etapa. "Continuar" na manhã troca a tela para a
// noite (a pílula desliza, título/roda/lembrete trocam com fade); na noite, segue para
// as notificações. O voltar da noite volta para a manhã.
//
// Horários do design: manhã 05:00–10:00 (abre em 07:00); noite 19:00–23:30 (abre em
// 21:00). ⚠️ O design vai até 00:00 na noite, mas 00:00 vira 0 minuto na home
// (`pmTime`) e a rotina da noite ficaria "aberta" o dia todo — por isso a roda para em 23:30.
//
// Grava `onboarding.rotina_manha_horario` / `rotina_noite_horario` ('HH:MM') e o fuso do
// aparelho em `rotina_fuso` (IANA) — vão para `users.rotina_*` no `saveToSupabase`
// (signup) e são lidos pelos lembretes locais (`lib/routineReminders.ts`). A rotina
// pré-gerada não é refeita por isso (a chave dela ignora os horários).

function halfHours(fromMin: number, toMin: number) {
  const out: string[] = [];
  for (let m = fromMin; m <= toMin; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

const ETAPAS = {
  manha: {
    titulo: 'que horas você vai fazer seu skincare matinal?',
    horarios: halfHours(5 * 60, 10 * 60),        // 05:00 – 10:00
    padrao: '07:00',
    campo: 'rotina_manha_horario' as const,
    step: OB_STEPS.horarioManha,
    stepName: 'Horário da Rotina (manhã)',
  },
  noite: {
    titulo: 'que horas você vai fazer seu skincare noturno?',
    horarios: halfHours(19 * 60, 23 * 60 + 30),  // 19:00 – 23:30
    padrao: '21:00',
    campo: 'rotina_noite_horario' as const,
    step: OB_STEPS.horarioNoite,
    stepName: 'Horário da Rotina (noite)',
  },
};
type Etapa = keyof typeof ETAPAS;

// Valor gravado antes (ou o padrão) — só se existir na roda desta etapa.
function inicial(e: Etapa, gravado: string | null | undefined) {
  const { horarios, padrao } = ETAPAS[e];
  return gravado && horarios.includes(gravado) ? gravado : padrao;
}

// Ícones da pílula e do lembrete — traçados do design.
const SOL_D = 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4';
const LUA_D = 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z';

export default function Horario() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { onboarding, setOnboardingField } = useAppStore();
  const name = useObName();
  const { y, buttonBottom } = useObFrame();

  const [etapa, setEtapa] = useState<Etapa>('manha');
  const valores = useRef<Record<Etapa, string>>({
    manha: inicial('manha', onboarding.rotina_manha_horario),
    noite: inicial('noite', onboarding.rotina_noite_horario),
  });
  const [selecionado, setSelecionado] = useState(valores.current.manha); // linha do lembrete
  const trocando = useRef(false);

  const pilula = useRef(new Animated.Value(0)).current;   // 0 = manhã, 1 = noite
  const conteudo = useRef(new Animated.Value(1)).current; // fade de título/roda/lembrete

  useOnMount(() => track('onboarding_step_viewed', obStep(ETAPAS.manha.step, ETAPAS.manha.stepName)));

  // Troca de etapa: some o conteúdo, troca, volta — e a pílula desliza junto.
  const irPara = (proxima: Etapa) => {
    trocando.current = true;
    Animated.timing(pilula, {
      toValue: proxima === 'noite' ? 1 : 0, duration: 280, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true,
    }).start();
    Animated.timing(conteudo, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setEtapa(proxima);
      setSelecionado(valores.current[proxima]);
      Animated.timing(conteudo, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => { trocando.current = false; });
    });
  };

  const handleContinue = () => {
    if (trocando.current) return;
    haptics.action();
    const e = ETAPAS[etapa];
    const valor = valores.current[etapa];
    setOnboardingField(e.campo, valor);
    setOnboardingField('rotina_fuso', deviceTimeZone());
    track('onboarding_step_completed', { ...obStep(e.step, e.stepName), horario: valor });
    if (etapa === 'manha') {
      track('onboarding_step_viewed', obStep(ETAPAS.noite.step, ETAPAS.noite.stepName));
      irPara('noite');
    } else {
      router.push('/(onboarding)/notifications');
    }
  };

  const handleBack = () => {
    if (trocando.current) return;
    if (etapa === 'noite') irPara('manha');
    else router.back();
  };

  const e = ETAPAS[etapa];

  return (
    <ObScreen>
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(118), alignItems: 'center' }}>
        <Animated.View style={{ alignSelf: 'stretch', opacity: conteudo }}>
          <ObTitle>{withName(name, e.titulo)}</ObTitle>
        </Animated.View>
        <ObSubtitle style={{ marginTop: 9, marginHorizontal: 30, alignSelf: 'stretch' }}>A gente te lembra na hora certa.</ObSubtitle>

        <Pilula progresso={pilula} etapa={etapa} />

        <Animated.View style={{ alignSelf: 'stretch', marginTop: 38, opacity: conteudo }}>
          <RodaHorario
            key={etapa}
            labels={e.horarios}
            initialIndex={e.horarios.indexOf(valores.current[etapa])}
            onChange={(i) => { valores.current[etapa] = e.horarios[i]; setSelecionado(e.horarios[i]); }}
          />
          <View style={{ marginTop: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={OB.pink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
              <Path d="M10 20.5a2 2 0 0 0 4 0" />
            </Svg>
            <Text style={{ fontSize: 15, lineHeight: 20, color: OB.sub }}>
              {'Lembrete todos os dias às '}
              <Text style={{ color: OB.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{selecionado}</Text>
            </Text>
          </View>
        </Animated.View>
      </View>

      <ObHeader onBack={handleBack} />
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}

// ── Pílula Manhã | Noite (só indicador, sem toque) ──────────────────────────
// 200 × 40, #F0F0F0, padding 4, gap 4; o lado ativo é branco com sombra, ícone e texto
// rosa (600); o outro, cinza #818181 (500).
const PILULA_W = 200;
const SEG_W = (PILULA_W - 8 - 4) / 2;

function Pilula({ progresso, etapa }: { progresso: Animated.Value; etapa: Etapa }) {
  const lado = (qual: Etapa) => {
    const on = qual === etapa;
    const cor = on ? OB.pink : OB.sub;
    return (
      <View style={{ width: SEG_W, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          {qual === 'manha'
            ? <><Circle cx={12} cy={12} r={4} /><Path d={SOL_D} /></>
            : <Path d={LUA_D} />}
        </Svg>
        <Text style={{ fontSize: 15, fontWeight: on ? '600' : '500', color: cor }}>{qual === 'manha' ? 'Manhã' : 'Noite'}</Text>
      </View>
    );
  };
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityLabel={etapa === 'manha' ? 'Etapa: manhã' : 'Etapa: noite'}
      style={{ marginTop: 36, width: PILULA_W, height: 40, borderRadius: 20, backgroundColor: OB.option, padding: 4, flexDirection: 'row', gap: 4 }}
    >
      <Animated.View style={{
        position: 'absolute', top: 4, left: 4, width: SEG_W, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF',
        shadowColor: OB.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
        transform: [{ translateX: progresso.interpolate({ inputRange: [0, 1], outputRange: [0, SEG_W + 4] }) }],
      }} />
      {lado('manha')}
      {lado('noite')}
    </View>
  );
}

// ── Roda de horário do design (5 linhas) ────────────────────────────────────
// Linhas de 48/56/72/56/48 pt (280 no total); texto 20/26/44/26/20, cores
// #C7C7CC / #818181 / #121212; faixa #F0F0F0 de 72 pt (raio 18, 40 pt de recuo dos
// lados) atrás da linha do meio. Mesmo mecanismo do `ObWheel` do kit: ScrollView
// transparente com snap por linha e cada texto INTERPOLADO do scroll (native driver).
// Tocar numa linha a traz para o meio (como no design).
const RODA_H = 280;
const PASSO = 64;                                   // centro do meio → centro da vizinha
const OFFSETS = [150, 116, 64, 0, -64, -116, -150]; // d = +3 … −3 (centro a centro)
const ESCALAS = [0.4, 20 / 44, 26 / 44, 1, 26 / 44, 20 / 44, 0.4];
const OP_CLARO = [0, 1, 0, 0, 0, 1, 0];            // #C7C7CC nas pontas
const OP_MEDIO = [0, 0, 1, 0, 1, 0, 0];            // #818181 nas vizinhas
const OP_TINTA = [0, 0, 0, 1, 0, 0, 0];            // #121212 no meio

function RodaHorario({ labels, initialIndex, onChange }: {
  labels: string[]; initialIndex: number; onChange: (i: number) => void;
}) {
  const start = Math.max(0, Math.min(labels.length - 1, initialIndex));
  const scrollY = useRef(new Animated.Value(start * PASSO)).current;
  const offsetAtual = useRef(start * PASSO);
  const ultimo = useRef(start);
  const scrollRef = useRef<any>(null);

  const indiceEm = (yy: number) => Math.max(0, Math.min(labels.length - 1, Math.round(yy / PASSO)));

  const onScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
        offsetAtual.current = ev.nativeEvent.contentOffset.y;
        const i = indiceEm(ev.nativeEvent.contentOffset.y);
        if (i !== ultimo.current) {
          ultimo.current = i;
          haptics.select();
          onChange(i);
        }
      },
    },
  ), [labels]);

  const assentar = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetAtual.current = ev.nativeEvent.contentOffset.y;
    const i = indiceEm(ev.nativeEvent.contentOffset.y);
    ultimo.current = i;
    onChange(i);
  };

  // Toque numa linha: qual faixa da roda foi tocada (pontas 48, vizinhas 56, meio 72).
  const tocar = (ev: GestureResponderEvent) => {
    const yy = ev.nativeEvent.locationY - offsetAtual.current;
    const d = yy < 48 ? -2 : yy < 104 ? -1 : yy < 176 ? 0 : yy < 232 ? 1 : 2;
    if (d === 0) return;
    const i = Math.max(0, Math.min(labels.length - 1, ultimo.current + d));
    scrollRef.current?.scrollTo({ y: i * PASSO, animated: true });
  };

  return (
    <View style={{ height: RODA_H, marginHorizontal: 17 }}>
      <View pointerEvents="none" style={{
        position: 'absolute', left: 40, right: 40, top: 104, height: 72, borderRadius: 18, backgroundColor: OB.option,
      }} />

      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {labels.map((label, k) => {
          const inputRange = OFFSETS.map((_, j) => (k - 3 + j) * PASSO);
          const interp = (outputRange: number[]) => scrollY.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
          const num = { fontSize: 44, lineHeight: 48, letterSpacing: -0.8, fontVariant: ['tabular-nums' as const] };
          return (
            <Animated.View key={label} style={{
              position: 'absolute', left: 0, right: 0, top: RODA_H / 2 - 36, height: 72,
              alignItems: 'center', justifyContent: 'center',
              transform: [{ translateY: interp(OFFSETS) }, { scale: interp(ESCALAS) }],
            }}>
              <Animated.Text style={[num, { fontWeight: '500', color: '#C7C7CC', opacity: interp(OP_CLARO) }]}>{label}</Animated.Text>
              <Animated.Text style={[num, { position: 'absolute', fontWeight: '600', color: OB.sub, opacity: interp(OP_MEDIO) }]}>{label}</Animated.Text>
              <Animated.Text style={[num, { position: 'absolute', fontWeight: '700', color: OB.ink, opacity: interp(OP_TINTA) }]}>{label}</Animated.Text>
            </Animated.View>
          );
        })}
      </View>

      {/* Gesto. ⚠️ Sem `overflow: 'hidden'` no pai (decisão 24 do README: no Fabric
          isso bloqueia o toque do ScrollView). */}
      <Animated.ScrollView
        ref={scrollRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentOffset={{ x: 0, y: start * PASSO }}
        showsVerticalScrollIndicator={false}
        snapToInterval={PASSO}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={assentar}
        onScrollEndDrag={assentar}
      >
        <Pressable onPress={tocar} style={{ height: (labels.length - 1) * PASSO + RODA_H }} />
      </Animated.ScrollView>
    </View>
  );
}
