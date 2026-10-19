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
import { ringTicks, ringBack } from '../../components/onboarding/scanRing';

// TUTORIAL do scan do onboarding (antes da câmera). Título: "Agora vamos analisar a /
// sua pele:" — quebra fixa, tudo em preto, sem eyebrow (18/out/2026 — a versão só com "Como funciona o seu scan"
// não avisava que a pele ia ser analisada). Logo abaixo, a demonstração, que mostra EXATAMENTE o que ela vai fazer na câmera: encaixar o rosto no círculo e GIRAR A CABEÇA EM CÍRCULO (360°),
// devagar, até acender o anel inteiro (17/out/2026, pedido do produto — antes eram 3
// etapas paradas: frente → esquerda → direita). ⚠️ Não mencionar a foto de frente: ela
// sai no começo sem a usuária saber.
// No topo, uma miniatura do MESMO anel da câmera (`components/onboarding/scanRing.ts`),
// com a MESMA regra da câmera (cadastro do Face ID): só acende o traço para onde a
// cabeça aponta — olhou para cima, acendem os de cima; para a esquerda, os da esquerda —
// e o traço aceso fica aceso. Os traços da direção atual crescem (o "salto" da câmera).
// O avatar dá uma volta completa; com o anel cheio, volta para a frente e recomeça.
// Os 3 passos acendem JUNTO com a carinha (como na 1ª versão do design novo): o da vez
// fica rosa, os próximos apagados e os feitos ganham ✓ — passo 1 na fase de frente
// (`FRONT_MS`), passo 2 na 1ª metade da volta, passo 3 até o anel encher, ✓✓✓ na pausa.
// Embaixo, "Para uma análise mais precisa, se certifique:" + os cuidados em 4 colunas.
//
// Consentimento de IA: no fluxo completo ele já foi dado na tela 0.2 ("Seus dados").
// A folha "Antes de continuar" continua aqui como rede de segurança e a câmera mantém
// o `useScanConsentGate` (trava única do README, seção 14) — quem já aceitou não vê nada.
const STEP = OB_STEPS.prepScan;
const STEP_NAME = 'Tutorial do Scan';

// ── Linha do tempo da demonstração ───────────────────────────────────────────
const FRONT_MS = 1300;  // de frente, parada (passo 1: encaixar o rosto)
const TILT_MS = 550;     // sai da frente e inclina a cabeça (e, no fim, volta)
const ROT_MS = 5200;     // uma volta completa (360°)
const HOLD_MS = 1100;    // anel cheio, de frente, antes de recomeçar
const LOOP_MS = FRONT_MS + TILT_MS + ROT_MS + TILT_MS + HOLD_MS;
// Começa olhando para CIMA — é a 1ª instrução da câmera — e gira no sentido
// cima → direita da tela (= esquerda do avatar) → baixo → esquerda da tela → cima.
const START_DEG = 270;

// Miniatura do anel: oval 100 × 134 (mesma proporção do oval da câmera, 236 × 316).
const RW = 100;
const RH = 134;
const BOX_W = 180;
const BOX_H = 186;
const RING_SCALE = 0.9; // desenhada menor para a tela inteira caber sem rolar
// Traço: ângulo na tela (0 = direita, 90 = baixo, 180 = esquerda, 270 = cima) e o
// instante em que a cabeça passa por ele (= quando acende).
const TICKS = ringTicks(48).map((tk) => {
  const deg = ((Math.atan2(tk.s, tk.c) * 180) / Math.PI + 360) % 360;
  const along = ((deg - START_DEG + 360) % 360) / 360;
  return { ...tk, deg, litAt: FRONT_MS + TILT_MS + along * ROT_MS };
});
const POP_CONE = 40;     // graus em volta da direção da cabeça que crescem

const STEPS_INFO: { title: string; text: string }[] = [
  { title: 'Encaixe o rosto no círculo', text: 'Olhe para a câmera, com o rosto inteiro dentro do círculo.' },
  { title: 'Gire a cabeça devagar', text: 'Faça um círculo com a cabeça: para cima, para os lados e para baixo.' },
  { title: 'Continue até acender o anel', text: 'Cada parte acende quando você olha para ela. Anel cheio, pronto!' },
];

/** Passo da vez em `t` (0–2); 3 = os três feitos (anel cheio). */
function stepAt(t: number) {
  if (t < FRONT_MS) return 0;
  if (t < FRONT_MS + TILT_MS + ROT_MS / 2) return 1;
  if (t < FRONT_MS + TILT_MS + ROT_MS) return 2;
  return 3;
}

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

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** Para onde a cabeça aponta em `t`: ângulo na tela (graus) e quanto está inclinada (0–1). */
function headPose(t: number) {
  const k = (x: number) => easeInOut(Math.max(0, Math.min(1, x)));
  if (t < FRONT_MS) return { deg: START_DEG, tilt: 0 };
  t -= FRONT_MS;
  if (t < TILT_MS) return { deg: START_DEG, tilt: k(t / TILT_MS) };
  if (t < TILT_MS + ROT_MS) return { deg: START_DEG + ((t - TILT_MS) / ROT_MS) * 360, tilt: 1 };
  return { deg: START_DEG + 360, tilt: 1 - k((t - TILT_MS - ROT_MS) / TILT_MS) };
}

function RingDemo({ t }: { t: number }) {
  const cx = BOX_W / 2;
  const cy = BOX_H / 2;
  const rx = RW / 2;
  const ry = RH / 2;
  const { deg, tilt } = headPose(t);
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a) * tilt;   // −1 esquerda … 1 direita
  const dy = Math.sin(a) * tilt;   // −1 cima … 1 baixo
  const headDeg = deg % 360;

  return (
    <Svg width={BOX_W * RING_SCALE} height={BOX_H * RING_SCALE} viewBox={`0 0 ${BOX_W} ${BOX_H}`}>
      {/* Rosto: oval rosado; olhos, nariz e boca deslizam para onde a cabeça aponta. */}
      <Ellipse cx={cx + dx * 3} cy={cy + dy * 3} rx={rx - 10} ry={ry - 10} fill={OB.wash} />
      <G transform={`translate(${dx * 13} ${dy * 11})`}>
        <Ellipse cx={cx - 15} cy={cy - 12} rx={4} ry={5} fill={OB.pink} />
        <Ellipse cx={cx + 15} cy={cy - 12} rx={4} ry={5} fill={OB.pink} />
        <Path d={`M${cx} ${cy - 4} L${cx + dx * 5 - 3} ${cy + 11 + dy * 2} L${cx + 2} ${cy + 12}`} fill="none" stroke={OB.pink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={`M${cx - 11} ${cy + 25} Q${cx} ${cy + 32} ${cx + 11} ${cy + 25}`} fill="none" stroke={OB.pink} strokeWidth={2.4} strokeLinecap="round" />
      </G>
      {TICKS.map((tk, i) => {
        // Acende quando a cabeça passa por ele, e fica aceso até a volta recomeçar.
        const lit = t >= tk.litAt;
        const g = lit ? ringBack(Math.min(1, (t - tk.litAt) / 380)) : 0;
        // "Salto" dos traços para onde a cabeça aponta, mais forte quanto mais inclinada.
        const diff = Math.abs(((tk.deg - headDeg + 540) % 360) - 180);
        const pop = Math.max(0, 1 - diff / POP_CONE) * tilt;
        const r0 = 6 + g * 2;
        const r1 = 13 + g * 6 + pop * 7;
        return (
          <Line
            key={i}
            x1={cx + (rx + r0) * tk.c} y1={cy + (ry + r0) * tk.s}
            x2={cx + (rx + r1) * tk.c} y2={cy + (ry + r1) * tk.s}
            stroke={lit ? OB.pink : OB.track}
            strokeWidth={(lit ? 2 + Math.min(1, g) * 0.8 : 2) + pop * 0.8}
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
  const stepIdx = stepAt(t);

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
        <ObTitle>{'Agora vamos analisar a\nsua pele:'}</ObTitle>
        <View style={{ alignItems: 'center', marginTop: 14 }}>
          <RingDemo t={t} />
        </View>

        {/* Passos — o da vez acende junto com a demonstração */}
        <View style={{
          marginTop: 2, marginHorizontal: 17, borderRadius: 20, backgroundColor: '#FFFFFF', paddingVertical: 4,
          shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12,
        }}>
          {STEPS_INFO.map((s, i) => {
            const done = i < stepIdx;
            const current = i === stepIdx;
            return (
              <View key={s.title} style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 16, paddingVertical: 7,
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

        {/* Cuidados antes da foto: a frase que explica + 4 colunas, ícone + legenda. */}
        <Text style={{ marginTop: 14, marginHorizontal: 17, textAlign: 'center', fontSize: 15, lineHeight: 20, color: OB.body }}>
          Para uma análise mais precisa, se certifique:
        </Text>
        <View style={{ marginTop: 10, marginHorizontal: 17, flexDirection: 'row' }}>
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
