import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Ellipse, Line, Path, G } from 'react-native-svg';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';
import { useAIConsent } from '../../hooks/useAIConsent';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObPillButton,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { ConsentSheet } from '../../components/onboarding/ConsentSheet';
import { ringTicks, ringBack } from '../../components/onboarding/scanRing';

// TUTORIAL do scan do onboarding (antes da câmera). Explica o movimento do scan atual:
// encaixar o rosto no círculo e GIRAR A CABEÇA DEVAGAR, DE UM LADO PARA O OUTRO, SEM
// PARAR (17/out/2026, pedido do produto — antes eram 3 etapas paradas: frente →
// esquerda → direita). ⚠️ Não mencionar a foto de frente: ela sai no começo sem a
// usuária saber.
// No topo, uma miniatura do MESMO anel da câmera (`components/onboarding/scanRing.ts`):
// o rosto vai e volta sem pausa, os traços para onde ele aponta crescem (como o "salto"
// da câmera) e o anel enche aos poucos, de baixo para cima. Embaixo, a instrução e os
// cuidados de antes do scan em formato compacto.
//
// Consentimento de IA: no fluxo completo ele já foi dado na tela 0.2 ("Seus dados").
// A folha "Antes de continuar" continua aqui como rede de segurança e a câmera mantém
// o `useScanConsentGate` (trava única do README, seção 14) — quem já aceitou não vê nada.
const STEP = OB_STEPS.prepScan;
const STEP_NAME = 'Tutorial do Scan';

// ── Linha do tempo da demonstração ───────────────────────────────────────────
const SWING_MS = 2600;   // um vaivém completo da cabeça (esquerda → direita → esquerda)
const FILL_MS = 5200;    // o anel enche (= 2 vaivéns)
const HOLD_MS = 900;     // anel completo, antes de recomeçar (a cabeça não para)
const LOOP_MS = FILL_MS + HOLD_MS;

// Miniatura do anel: oval 100 × 134 (mesma proporção do oval da câmera, 236 × 316).
const RW = 100;
const RH = 134;
const BOX_W = 180;
const BOX_H = 186;
// Traço: ângulo na tela (0 = direita, 90 = baixo, 180 = esquerda) e quando acende —
// de baixo (90°) para cima (270°), pelos dois lados ao mesmo tempo.
const TICKS = ringTicks(48).map((tk) => {
  const deg = ((Math.atan2(tk.s, tk.c) * 180) / Math.PI + 360) % 360;
  const fromBottom = Math.abs(((deg - 90 + 540) % 360) - 180); // 0 embaixo … 180 em cima
  return { ...tk, deg, fillAt: (fromBottom / 180) * FILL_MS * 0.92 };
});
const POP_CONE = 55;     // graus em volta da direção do rosto que crescem

const INSTRUCTION = 'Encaixe o rosto no círculo e gire a cabeça devagar, de um lado para o outro, sem parar.';

const ICON = { fill: 'none', stroke: '#FFFFFF', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const TIPS: { label: string; icon: React.ReactNode }[] = [
  { label: 'Boa\niluminação', icon: (<><Circle cx={12} cy={12} r={4} {...ICON} /><Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" {...ICON} /></>) },
  { label: 'Sem\nmaquiagem', icon: (<><Path d="M11 3l1.8 4.9L17.7 9.7l-4.9 1.8L11 16.4l-1.8-4.9L4.3 9.7l4.9-1.8z" {...ICON} /></>) },
  { label: 'Cabelo\npreso', icon: (<><Circle cx={12} cy={8} r={4} {...ICON} /><Path d="M4.5 20.5c0-3.9 3.4-6.3 7.5-6.3s7.5 2.4 7.5 6.3" {...ICON} /></>) },
  { label: 'Sem\nóculos', icon: (<><Circle cx={6.5} cy={14.5} r={3.5} {...ICON} /><Circle cx={17.5} cy={14.5} r={3.5} {...ICON} /><Path d="M10 14.5c1.3-1 2.7-1 4 0" {...ICON} /></>) },
];

/** Relógio da demonstração (ms desde a montagem), um quadro por frame. */
function useClock() {
  const [t, setT] = useState(0);
  const start = useRef(Date.now());
  useEffect(() => {
    let id: number;
    const loop = () => { setT(Date.now() - start.current); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  return t;
}

// Para onde o rosto está virado em `t` (−1 = esquerda da tela, 0 = frente, 1 = direita):
// vaivém contínuo, sem pausa (seno — desacelera nas pontas e passa direto pelo meio).
const headTurn = (t: number) => Math.sin((2 * Math.PI * t) / SWING_MS);

function RingDemo({ t }: { t: number }) {
  const cx = BOX_W / 2;
  const cy = BOX_H / 2;
  const rx = RW / 2;
  const ry = RH / 2;
  const loopT = t % LOOP_MS;
  const turn = headTurn(t);
  const headDeg = turn >= 0 ? 0 : 180;

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
        const lit = loopT >= tk.fillAt;
        const g = lit ? ringBack(Math.min(1, (loopT - tk.fillAt) / 380)) : 0;
        // "Salto" dos traços para onde o rosto aponta, mais forte quanto mais virado.
        const diff = Math.abs(((tk.deg - headDeg + 540) % 360) - 180);
        const pop = Math.max(0, 1 - diff / POP_CONE) * Math.abs(turn);
        const r0 = 6 + g * 2;
        const r1 = 13 + g * 6 + pop * 7;
        return (
          <Line
            key={i}
            x1={cx + (rx + r0) * tk.c} y1={cy + (ry + r0) * tk.s}
            x2={cx + (rx + r1) * tk.c} y2={cy + (ry + r1) * tk.s}
            stroke={lit ? OB.pink : pop > 0.15 ? '#FFB3D6' : OB.track}
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
  const t = useClock();

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

        {/* A instrução — o mesmo card branco de antes, agora com um movimento só */}
        <View style={{
          marginTop: 2, marginHorizontal: 17, borderRadius: 20, backgroundColor: '#FFFFFF',
          flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 18,
          shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12,
        }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' }}>
            {/* Setas de um lado para o outro */}
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d="M7 8 L3 12 L7 16 M17 8 L21 12 L17 16 M3.5 12 H20.5" {...ICON} />
            </Svg>
          </View>
          <Text style={{ flex: 1, fontSize: 17, lineHeight: 23, fontWeight: '600', color: OB.ink }}>{INSTRUCTION}</Text>
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
