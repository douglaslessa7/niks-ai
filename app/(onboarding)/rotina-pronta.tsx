import { useEffect, useState } from 'react';
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

// Tela 24 do fluxo completo — "Sua rotina está pronta". Rola: fotos HOJE / EM 8
// SEMANAS, o score de hoje com a estimativa, e "Resultados garantidos". Substitui a
// antiga `plan-preview` no fluxo.
//
// • HOJE = a foto de frente do scan; EM 8 SEMANAS = o antes/depois da IA
//   (`generate-skin-preview`, disparado na câmera). Se ele não chegar em 45 s, cai na
//   própria foto (mesma rede de segurança da plan-preview) — a tela nunca fica presa.
//   As duas são o quadro INTEIRO da câmera: os cards enquadram o rosto pelo oval da
//   câmera (`lib/faceFrame.ts`), senão ele apareceria pequeno no meio do card.
// • "Hoje: N → estimativa de M até <data>": N = `skin_score` do scan; a data é hoje +
//   8 semanas (nota do design). O design não diz como estimar M: usamos 90% do que
//   falta para 100, com teto de 97 e no mínimo +5 (o exemplo do design, 72 → 97, sai
//   exatamente assim).
// • O depoimento do design ("[Depoimento real…]", "[Nome], [idade] anos") ficou de
//   fora até existir um depoimento real — é um espaço reservado, não conteúdo.
const STEP = OB_STEPS.rotinaPronta;
const STEP_NAME = 'Rotina Pronta';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const GOALS = ['Glow natural e saudável', 'Acabar com espinhas', 'Pele mais firme e jovem', 'Encontrar os melhores produtos'];
const PREVIEW_TIMEOUT_MS = 45_000;

function estimateOf(score: number) {
  return Math.min(97, Math.max(score + 5, Math.round(score + (100 - score) * 0.9)));
}

function inEightWeeks() {
  const d = new Date(Date.now() + 56 * 24 * 60 * 60 * 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const CARD_IN_W = 155;   // 163 − 2 × 4 de borda
const CARD_IN_H = 209;
const CARD_FACE_H = 0.82 * CARD_IN_H;

function PhotoCard({ uri, oval, label, highlight }: { uri: string | null; oval: FaceOval | null; label: string; highlight?: boolean }) {
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
        <ActivityIndicator color={OB.pink} />
      )}
      <View style={{
        position: 'absolute', bottom: 12, height: 26, paddingHorizontal: 12, borderRadius: 13, justifyContent: 'center',
        backgroundColor: highlight ? OB.pink : '#FFFFFF',
      }}>
        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.8, color: highlight ? '#FFFFFF' : OB.ink }}>{label}</Text>
      </View>
    </View>
  );
}

export default function RotinaPronta() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { insets, buttonBottom } = useObFrame();
  const photoUri = useAppStore((s) => s.skinImageUri);
  const previewUrl = useAppStore((s) => s.skinPreviewUrl);
  const score = useAppStore((s) => s.scanResult?.skin_score ?? null);
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
        <Text style={{ textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 2.4, color: OB.pink }}>
          ANÁLISE CONCLUÍDA
        </Text>
        <Text style={{ marginTop: 6, textAlign: 'center', fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: OB.ink }}>
          Sua rotina está <Text style={{ color: OB.pink }}>pronta</Text>
        </Text>

        <View style={{ marginTop: 22, flexDirection: 'row', justifyContent: 'center', gap: 13 }}>
          <PhotoCard uri={photoUri} oval={oval} label="HOJE" />
          <PhotoCard uri={afterUri} oval={oval} label="EM 8 SEMANAS" highlight />
          <View style={{
            position: 'absolute', top: 90.5, left: '50%', marginLeft: -18, width: 36, height: 36, borderRadius: 18,
            backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: OB.pink, alignItems: 'center', justifyContent: 'center',
          }}>
            <Svg width={15} height={15} viewBox="0 0 24 24">
              <Path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={OB.pink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        </View>

        {score != null && (
          <Text style={{ marginTop: 14, textAlign: 'center', fontSize: 15, lineHeight: 20, color: OB.body }}>
            Hoje: <Text style={{ fontWeight: '700', color: OB.ink }}>{score}</Text> → estimativa de{' '}
            <Text style={{ fontWeight: '700', color: OB.pink }}>{estimateOf(score)}</Text> até {inEightWeeks()}
          </Text>
        )}

        <Text style={{ marginTop: 30, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.4, color: OB.ink }}>
          Resultados <Text style={{ color: OB.pink }}>garantidos</Text>:
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
