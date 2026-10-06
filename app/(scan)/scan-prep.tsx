import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Ellipse, Line, Path, G } from 'react-native-svg';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';
import { useAIConsent } from '../../hooks/useAIConsent';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObPillButton, ObCheck,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { ConsentSheet } from '../../components/onboarding/ConsentSheet';
import { ringTicks, ringBack, ScanStepId } from '../../components/onboarding/scanRing';

// Tela 6 do fluxo completo — TUTORIAL do scan "girando o rosto" (a câmera da tela 7).
// Substituiu a lista de cuidados do scan antigo de 1 foto: agora explica COMO o scan
// funciona — 3 fotos que a câmera tira sozinha (frente → esquerda → direita), guiadas
// pelo anel em volta do rosto. No topo, uma miniatura do MESMO anel da câmera
// (`components/onboarding/scanRing.ts`) roda as 3 etapas em loop, com o rosto virando
// para o lado da vez, e o passo correspondente da lista acende junto. Embaixo, os
// cuidados de antes da foto em formato compacto.
//
// Consentimento de IA: no fluxo completo ele já foi dado na tela 0.2 ("Seus dados").
// A folha "Antes de continuar" continua aqui como rede de segurança e a câmera mantém
// o `useScanConsentGate` (trava única do README, seção 14) — quem já aceitou não vê nada.
const STEP = OB_STEPS.prepScan;
const STEP_NAME = 'Tutorial do Scan';

// ── Linha do tempo da demonstração ───────────────────────────────────────────
const TURN_MS = 450;     // o rosto vira
const FILL_MS = 1150;    // o arco acende
const STEP_MS = TURN_MS + FILL_MS;
const HOLD_MS = 1300;    // anel completo, antes de recomeçar
const LOOP_MS = 3 * STEP_MS + HOLD_MS;
const ORDER: ScanStepId[] = ['frente', 'esquerda', 'direita'];

// Miniatura do anel: oval 100 × 134 (mesma proporção do oval da câmera, 236 × 316).
const RW = 100;
const RH = 134;
const BOX_W = 180;
const BOX_H = 186;
const TICKS = ringTicks(48);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

const STEPS_INFO: { title: string; text: string }[] = [
  { title: 'De frente', text: 'Olhe para a câmera, com o rosto dentro do círculo.' },
  { title: 'Vire para a esquerda', text: 'Quando o lado esquerdo do círculo acender, vire o rosto devagar.' },
  { title: 'Vire para a direita', text: 'Faça o mesmo para o lado direito. Cada foto sai sozinha.' },
];

const ICON = { fill: 'none', stroke: '#FFFFFF', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const TIPS: { label: string; icon: React.ReactNode }[] = [
  { label: 'Boa\niluminação', icon: (<><Circle cx={12} cy={12} r={4} {...ICON} /><Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" {...ICON} /></>) },
  { label: 'Sem\nmaquiagem', icon: (<><Path d="M11 3l1.8 4.9L17.7 9.7l-4.9 1.8L11 16.4l-1.8-4.9L4.3 9.7l4.9-1.8z" {...ICON} /></>) },
  { label: 'Cabelo\npreso', icon: (<><Circle cx={12} cy={8} r={4} {...ICON} /><Path d="M4.5 20.5c0-3.9 3.4-6.3 7.5-6.3s7.5 2.4 7.5 6.3" {...ICON} /></>) },
  { label: 'Sem\nóculos', icon: (<><Circle cx={6.5} cy={14.5} r={3.5} {...ICON} /><Circle cx={17.5} cy={14.5} r={3.5} {...ICON} /><Path d="M10 14.5c1.3-1 2.7-1 4 0" {...ICON} /></>) },
];

/** Relógio da demonstração (ms dentro do loop), um quadro por frame. */
function useLoopClock() {
  const [t, setT] = useState(0);
  const start = useRef(Date.now());
  useEffect(() => {
    let id: number;
    const loop = () => { setT((Date.now() - start.current) % LOOP_MS); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  return t;
}

// Para onde o rosto está virado em `t` (−1 = esquerda da tela, 0 = frente, 1 = direita).
function headTurn(t: number) {
  const k = (x: number) => easeInOut(Math.max(0, Math.min(1, x)));
  if (t < STEP_MS) return 0;
  if (t < 2 * STEP_MS) return -k((t - STEP_MS) / TURN_MS);
  if (t < 3 * STEP_MS) return -1 + 2 * k((t - 2 * STEP_MS) / TURN_MS);
  return 1 - k((t - 3 * STEP_MS) / 500);   // volta para a frente no fim
}

function RingDemo({ t }: { t: number }) {
  const cx = BOX_W / 2;
  const cy = BOX_H / 2;
  const rx = RW / 2;
  const ry = RH / 2;
  const stepIdx = Math.min(3, Math.floor(t / STEP_MS));
  const active = stepIdx < 3 ? ORDER[stepIdx] : null;
  const pulse = (Math.sin(t / 160) + 1) / 2;
  const turn = headTurn(t);

  return (
    <Svg width={BOX_W} height={BOX_H}>
      {/* Rosto: oval rosado; olhos, nariz e boca deslizam para o lado da vez. */}
      <Ellipse cx={cx} cy={cy} rx={rx - 10} ry={ry - 10} fill={OB.wash} />
      <G transform={`translate(${turn * 13} 0)`}>
        <Ellipse cx={cx - 15} cy={cy - 12} rx={4} ry={5} fill={OB.pink} />
        <Ellipse cx={cx + 15} cy={cy - 12} rx={4} ry={5} fill={OB.pink} />
        <Path d={`M${cx} ${cy - 4} L${cx + turn * 5 - 3} ${cy + 11} L${cx + 2} ${cy + 12}`} fill="none" stroke={OB.pink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={`M${cx - 11} ${cy + 25} Q${cx} ${cy + 32} ${cx + 11} ${cy + 25}`} fill="none" stroke={OB.pink} strokeWidth={2.4} strokeLinecap="round" />
      </G>
      {TICKS.map((tk, i) => {
        const arcIdx = ORDER.indexOf(tk.arc);
        // Instante em que este traço acende: início da etapa dele + virada + varredura.
        const litAt = arcIdx * STEP_MS + TURN_MS + tk.order * FILL_MS;
        const lit = t >= litAt;
        const g = lit ? ringBack(Math.min(1, (t - litAt) / 380)) : 0;
        const focus = !lit && tk.arc === active;
        const r0 = 6 + g * 2;
        const r1 = 13 + g * 6 + (focus ? 3 + pulse * 3 : 0);
        return (
          <Line
            key={i}
            x1={cx + (rx + r0) * tk.c} y1={cy + (ry + r0) * tk.s}
            x2={cx + (rx + r1) * tk.c} y2={cy + (ry + r1) * tk.s}
            stroke={lit ? OB.pink : focus ? '#FFB3D6' : OB.track}
            strokeWidth={lit ? 2 + Math.min(1, g) * 0.8 : 2}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}

export default function ScanPrep() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y, buttonBottom } = useObFrame();
  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();
  const t = useLoopClock();
  const stepIdx = Math.min(3, Math.floor(t / STEP_MS)); // 3 = as três feitas

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const openCamera = () => {
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(scan)/camera' as any);
  };

  return (
    <ObScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: y(118), paddingBottom: buttonBottom + 48 + 32 }}
      >
        <ObTitle>Como funciona o seu scan</ObTitle>

        <View style={{ alignItems: 'center', marginTop: 16 }}>
          <RingDemo t={t} />
        </View>

        {/* Passos — o da vez acende junto com a demonstração */}
        <View style={{
          marginTop: 2, marginHorizontal: 17, borderRadius: 20, backgroundColor: '#FFFFFF', paddingVertical: 6,
          shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12,
        }}>
          {STEPS_INFO.map((s, i) => {
            const done = i < stepIdx;
            const current = i === stepIdx;
            return (
              <View key={s.title} style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 16, paddingVertical: 10,
                marginHorizontal: 6, borderRadius: 14, backgroundColor: current ? '#FFF2F8' : 'transparent',
              }}>
                <View style={{ marginTop: 1 }}>
                  {done ? (
                    <ObCheck size={28} stroke={2.2} />
                  ) : (
                    <View style={{
                      width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: current ? OB.pink : OB.option,
                    }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: current ? '#FFFFFF' : OB.sub }}>{i + 1}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: OB.ink }}>{s.title}</Text>
                  <Text style={{ fontSize: 14, lineHeight: 19, color: OB.sub }}>{s.text}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Cuidados antes da foto: 4 colunas, ícone + legenda (cabe sem rolar). */}
        <View style={{ marginTop: 18, marginHorizontal: 17, flexDirection: 'row' }}>
          {TIPS.map((tip) => (
            <View key={tip.label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={19} height={19} viewBox="0 0 24 24">{tip.icon}</Svg>
              </View>
              <Text style={{ fontSize: 13, lineHeight: 16, color: OB.body, textAlign: 'center' }}>{tip.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', '#FFFFFF']}
        locations={[0, 0.45]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 }}
      />
      <ObHeader onBack={() => router.back()} backdrop={OB.bg} />
      <ObPillButton
        label="Abrir câmera"
        bottom={buttonBottom}
        onPress={() => { haptics.action(); requestConsent(openCamera); }}
      />

      <ConsentSheet visible={consentModalVisible} onAccept={handleAccept} onDecline={handleDecline} />
    </ObScreen>
  );
}
