import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObPillButton, useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { useImageSize, useFaceOval, fitFace, FaceOval } from '../../lib/faceFrame';

// Tela 20 do onboarding — "Sua rotina de skincare está pronta." CONTEÚDO da versão B
// (a antiga `plan-preview`, que ficou no repo sem ligação) no VISUAL do kit (cards de
// foto da "Rotina pronta" do fluxo completo). Vem do resultado do scan e leva ao
// compromisso, que leva ao paywall (o horário da rotina passou para depois da rotina
// atual, out/2026).
//
// • Hoje = a foto de frente do scan; Em 8 semanas = o antes/depois da IA
//   (`generate-skin-preview`, disparado na câmera). Se ele não chegar em 45 s, cai na
//   própria foto — a tela nunca fica presa. Os cards enquadram o rosto pelo oval da
//   câmera (`lib/faceFrame.ts`), senão ele apareceria pequeno no meio do card.
// • "Qualidade da pele" (era "Seu Skin Score" na B, trocado pelo produto): hoje =
//   `skin_score` do scan; em 8 semanas = 97 (fixo, como na B). "pronta" e "garantidos"
//   em preto, sem o destaque rosa; o título pelo objetivo também sem palavra rosa
//   (pedido do produto).
// • "Onde você mais verá resultados" (% por preocupação, faixa 60–78; borda rosa do app
//   e número preto — na B eram verdes, pedido do produto), "Resultados
//   garantidos", o título pelo objetivo (`goal_desire`) e as 4 dicas: textos da B.
const STEP = OB_STEPS.rotinaPronta;
const STEP_NAME = 'Protocolo Pronto';
const PREVIEW_TIMEOUT_MS = 45_000;

const CONCERN_PCT: Record<string, number> = {
  'Acne/espinhas': 78,
  'Manchas': 64,
  'Cravos': 72,
  'Oleosidade': 68,
  'Rugas': 71,
  'Poros dilatados': 65,
  'Olheiras': 62,
  'Ressecamento': 74,
  'Textura irregular': 69,
  'Outro': 63,
};

const DESIRE_TITLE_MAP: Record<string, { prefix: string; accent: string; suffix: string }> = {
  'Me sentir mais bonita e confiante':   { prefix: 'Como se sentir mais ',    accent: 'bonita e confiante', suffix: ':' },
  'Ter um glow up que as pessoas notem': { prefix: 'Como ter um ',            accent: 'glow up',            suffix: ' que as pessoas notem:' },
  'Aumentar minha autoestima de vez':    { prefix: 'Como aumentar a sua ',    accent: 'autoestima',         suffix: ' de vez:' },
  'Me sentir bem comigo mesma de novo':  { prefix: 'Como você vai se sentir ', accent: 'bem',               suffix: ' consigo mesma de novo:' },
  'Conquistar alguém especial':          { prefix: 'Como conquistar ',        accent: 'alguém especial',    suffix: ':' },
  'Outro':                               { prefix: 'Como transformar a sua ', accent: 'pele',               suffix: ':' },
};
const DEFAULT_DESIRE_TITLE = { prefix: 'Como se sentir mais ', accent: 'bonita e confiante', suffix: ':' };

const GOALS = ['Glow natural e saudável', 'Acabar com espinhas', 'Pele mais firme e jovem', 'Encontrar os melhores produtos'];

const TIPS = [
  'Siga a rotina de skincare que definimos para você — ela foi feita para resolver o que mais te incomoda na sua pele hoje, e te fazer alcançar seu objetivo.',
  'Converse com a NIKS (especialista na sua pele) sempre que precisar de ajuda ou tiver algo te incomodando — ela vai saber resolver.',
  'Fotografe o que você come para descobrir como cada alimento está afetando sua pele, e o que comer para aumentar seus resultados.',
  'Use a NIKS para acompanhar a sua evolução ao longo do tempo.',
];

const CARD_IN_W = 155;   // 163 − 2 × 4 de borda
const CARD_IN_H = 209;
const CARD_FACE_H = 0.82 * CARD_IN_H;

function ArrowIcon({ size = 15, color = OB.pink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PhotoCard({ uri, oval, label, highlight, waitingText }: {
  uri: string | null; oval: FaceOval | null; label: string; highlight?: boolean; waitingText?: string;
}) {
  const size = useImageSize(uri);
  const fit = size && oval ? fitFace(size, oval, CARD_FACE_H, CARD_IN_W / 2, CARD_IN_H / 2) : null;
  return (
    <View style={{
      width: 163, height: 217, borderRadius: 24, borderWidth: 4, borderColor: highlight ? OB.pink : '#E6E2E3',
      backgroundColor: '#F4EFE9', overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    }}>
      {uri && fit ? (
        <Image source={{ uri }} style={{ position: 'absolute', left: fit.left, top: fit.top, width: fit.width, height: fit.height }} />
      ) : uri ? (
        <Image source={{ uri }} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : (
        <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 12 }}>
          <ActivityIndicator color={OB.pink} />
          {!!waitingText && (
            <Text style={{ textAlign: 'center', fontSize: 12, lineHeight: 15, color: OB.body }}>{waitingText}</Text>
          )}
        </View>
      )}
      <View style={{
        position: 'absolute', bottom: 12, height: 26, paddingHorizontal: 12, borderRadius: 13, justifyContent: 'center',
        backgroundColor: highlight ? OB.pink : '#FFFFFF',
      }}>
        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase', color: highlight ? '#FFFFFF' : OB.ink }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function ScoreLine({ value }: { value: string | number }) {
  return (
    <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 13, fontWeight: '600', color: OB.body }}>
      {'Qualidade da pele: '}
      <Text style={{ fontWeight: '700', color: OB.pink }}>{value}</Text>
    </Text>
  );
}

const sectionTitle = { fontSize: 22, lineHeight: 27, fontWeight: '700' as const, letterSpacing: -0.4, color: OB.ink };

export default function RotinaPronta() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { insets, buttonBottom } = useObFrame();
  const photoUri = useAppStore((s) => s.skinImageUri);
  const previewUrl = useAppStore((s) => s.skinPreviewUrl);
  const onboarding = useAppStore((s) => s.onboarding);
  const score = useAppStore((s) => s.scanResult?.skin_score ?? 0);
  const [previewTimedOut, setPreviewTimedOut] = useState(false);
  // O oval sai da foto de FRENTE e vale para o antes/depois (gerado a partir dela).
  const oval = useFaceOval(useImageSize(photoUri));

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  useEffect(() => {
    if (previewUrl) return;
    const t = setTimeout(() => setPreviewTimedOut(true), PREVIEW_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [previewUrl]);
  const afterUri = previewUrl ?? (previewTimedOut ? photoUri : null);

  const metricConcerns = useMemo(() => onboarding.concerns.slice(0, 3).map((name) => ({
    name,
    pct: Math.min(78, Math.max(60, CONCERN_PCT[name] ?? 65)),
  })), [onboarding.concerns]);
  const desireTitle = DESIRE_TITLE_MAP[onboarding.goal_desire ?? ''] ?? DEFAULT_DESIRE_TITLE;

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/compromisso');
  };

  return (
    <ObScreen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView
        style={{ marginTop: insets.top }}
        contentContainerStyle={{ paddingTop: 30, paddingHorizontal: 17, paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ textAlign: 'center', fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: OB.ink }}>
          {'Sua rotina de skincare\nestá pronta.'}
        </Text>
        <Text style={{ marginTop: 9, marginHorizontal: 13, textAlign: 'center', fontSize: 17, lineHeight: 23, color: OB.sub }}>
          Veja a projeção que nossa equipe fez da sua transformação usando o NIKS:
        </Text>

        <View style={{ marginTop: 22, flexDirection: 'row', justifyContent: 'center', gap: 13 }}>
          <View>
            <PhotoCard uri={photoUri} oval={oval} label="Hoje" />
            <ScoreLine value={score > 0 ? score : '—'} />
          </View>
          <View>
            <PhotoCard uri={afterUri} oval={oval} label="Em 8 semanas" highlight waitingText={'Preparando sua\ntransformação...'} />
            <ScoreLine value={97} />
          </View>
          <View style={{
            position: 'absolute', top: 90.5, left: '50%', marginLeft: -18, width: 36, height: 36, borderRadius: 18,
            backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: OB.pink, alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowIcon />
          </View>
        </View>

        {metricConcerns.length > 0 && (
          <View style={{ marginTop: 30 }}>
            <Text style={[sectionTitle, { fontSize: 17, lineHeight: 22 }]}>Onde você mais verá resultados:</Text>
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              {metricConcerns.map(({ name, pct }) => (
                <View key={name} style={{
                  flex: 1, borderRadius: 16, borderWidth: 1, borderColor: OB.pink, backgroundColor: '#FFFFFF',
                  paddingTop: 16, paddingBottom: 14, paddingHorizontal: 8, alignItems: 'center',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <Text style={{ fontSize: 36, lineHeight: 40, fontWeight: '700', letterSpacing: -1.2, color: OB.ink, fontVariant: ['tabular-nums'] }}>{pct}</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: OB.ink }}>%</Text>
                  </View>
                  <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 16, fontWeight: '600', color: OB.ink, textAlign: 'center' }}>
                    {`Menos ${name.toLowerCase()}`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Respiro maior entre as seções (era 30; pedido do produto) */}
        <Text style={[sectionTitle, { marginTop: 40 }]}>
          Resultados garantidos:
        </Text>
        <Text style={{ marginTop: 8, fontSize: 15, lineHeight: 21, color: OB.sub }}>
          Estes objetivos serão o foco do seu skincare.
        </Text>
        <View style={{ marginTop: 16, gap: 8 }}>
          {GOALS.map((g) => (
            <View key={g} style={{
              height: 54, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEBEC',
              paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
            }}>
              <View style={{
                width: 26, height: 26, borderRadius: 13, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center',
                shadowColor: OB.pink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 5,
              }}>
                <Svg width={14} height={14} viewBox="0 0 22 22">
                  <Path d="M5.5 11.2 L9.2 14.8 L16.5 7.5" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
              <Text style={{ fontSize: 17, lineHeight: 22, color: OB.ink }}>{g}</Text>
            </View>
          ))}
        </View>

        <Text style={[sectionTitle, { marginTop: 40 }]}>
          {desireTitle.prefix}{desireTitle.accent}{desireTitle.suffix}
        </Text>
        <View style={{ marginTop: 16, gap: 14 }}>
          {TIPS.map((text, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{
                width: 26, height: 26, borderRadius: 13, backgroundColor: OB.wash, alignItems: 'center', justifyContent: 'center', marginTop: 1,
              }}>
                <ArrowIcon size={14} />
              </View>
              <Text style={{ flex: 1, fontSize: 16, lineHeight: 22, color: OB.ink }}>{text}</Text>
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
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
