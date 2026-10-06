import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, Alert, useWindowDimensions,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB, OB_STEPS, useObFrame, obStep, useOnMount } from '../../components/onboarding/kit';
import { buildFindings, findingChips, REGION_INFO, Region } from '../../components/onboarding/scanFindings';
import { useImageSize, useFaceOval, fitFace, affineFit, CAM_OVAL_W, CAM_OVAL_H, Pt2 } from '../../lib/faceFrame';
import { FaceScanMesh, MESH_FEATURES, faceMeshPoint } from '../../components/onboarding/FaceScanMesh';
import type { ScanResult } from '../../store/onboarding';

// Tela 8 do onboarding — RELATÓRIO do scan, réplica da tela 49d do Claude Design
// ("NIKS home redesign", componente `NiksSkinScanFlo.dc.html`, estágio `report`), com
// a MÁSCARA do scan (`FaceScanMesh`) encaixada no rosto por cima da foto.
//
// Estrutura do 49d (frame 393 × 852):
//   • foto do rosto no topo (0–470), com pontinhos brancos de aro/brilho rosa nas
//     regiões dos achados — só os do chip selecionado aparecem;
//   • data em pílula de vidro claro + X branco (y 62);
//   • folha rosada #F9F2F5 a partir de y 430 (raio 28), que ROLA:
//       1. bloco branco: alça, chips de filtro, "Análise da pele" + lista de achados;
//       2. "Pontos fortes da pele" — cards na horizontal (`skin_strengths`);
//       3. "Com base no seu perfil de pele" — as preocupações dela (tela 4);
//       4. "Validação do objetivo principal" — miniaturas, selo e barra
//          (`concerns_alignment`); some se a análise não trouxe o campo;
//       5. "Recomendações pra …" — numeradas (`action_recommendations`);
//   • véu rosado + botão "Próximo" de largura cheia (18 pt das bordas, 34 da base).
// "Próximo" → idade da pele (9, só se a pele parece mais velha que ela) ou a
// transição (10). X → refazer o scan.
//
// ENCAIXE (`buildFaceLayout`): com `face_landmarks` (a `analyze-skin` do onboarding
// devolve olhos, nariz, boca, queixo e testa) a foto é enquadrada pelo rosto real e a
// máscara é esticada para os 6 pontos; sem eles, enquadra pelo oval da câmera.
const BOX_W = 393;
const BOX_H = 470;                   // altura da foto no 49d
const BOX_TOP = 0;
const FACE_H = 390;                  // sem pontos: altura do OVAL da câmera no quadro
const FACE_CY = 200;
// Os pontos fixos de `REGION_INFO` foram marcados num rosto de oval ~350 pt com centro
// em y 262; sem `face_landmarks` eles são levados para o oval desta tela.
const REGION_OVAL_CY = 262;
const REGION_OVAL_H = 350;
const SHEET_TOP = 430;
// Com pontos do rosto: altura dos olhos e distância olhos→queixo (queixo logo acima da folha).
const EYE_Y = 205;
const EYE_TO_CHIN = 200;
const MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

// Tokens do 49d.
const R = {
  sheet: '#F9F2F5', handle: '#EADFE4', line: '#F3EDF0', border: '#EFE7EA',
  muted: '#8A8385', body: '#6E6468', text2: '#3D3639', zone: '#E8468F',
  pillBg: '#FFE3EE', pillInk: '#C0206A', chipOff: '#F7F1F4',
};

function scanDateLabel(d: Date) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

// Ícones dos "Pontos fortes" (`skin_strengths[].icon`); os 3 primeiros são os do design.
const STRENGTH_ICON: Record<string, string> = {
  sparkle: 'M12 3l1.8 4.6L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.4zM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  shield: 'M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6z',
  leaf: 'M5 19c8 0 14-6 14-14-8 0-14 6-14 14zM5 19l7-7',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
};

// Selo + barra da "Validação do objetivo principal" por `concerns_alignment.alinhamento`.
const ALIGN: Record<string, { label: string; pct: number }> = {
  confirmado: { label: 'Bom alinhamento com a análise', pct: 0.78 },
  parcial: { label: 'Alinhamento parcial com a análise', pct: 0.55 },
  divergente: { label: 'A análise sugere outra prioridade', pct: 0.3 },
};

/** ['a','b','c'] → "a, b e c" */
const joinPt = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const cap = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);

export default function ResultadoScan() {
  const router = useRouter();
  const { track } = useMixpanel();
  const scanResult = useAppStore((s) => s.scanResult);
  const photoUri = useAppStore((s) => s.skinImageUri);
  const birthday = useAppStore((s) => s.onboarding.birthday);
  const concerns = useAppStore((s) => s.onboarding.concerns);
  const { width } = useWindowDimensions();
  const { insets, y } = useObFrame();
  const photoSize = useImageSize(photoUri);
  const oval = useFaceOval(photoSize);
  const [filter, setFilter] = useState('Todos');
  const scannedAt = useRef(scanDateLabel(new Date())).current;

  useOnMount(() => track('onboarding_step_viewed', obStep(OB_STEPS.resultadoScan, 'Resultado do Scan')));

  const findings = useMemo(() => buildFindings(scanResult), [scanResult]);
  const chips = useMemo(() => findingChips(findings), [findings]);
  const shown = filter === 'Todos' ? findings : findings.filter((f) => f.category === filter);

  // ── Enquadramento ──────────────────────────────────────────────────────────
  const u = width / BOX_W;
  // A foto começa no topo da TELA (passa por trás da status bar) e vai até a folha.
  const boxTop = BOX_TOP;
  const boxH = y(BOX_H);
  const layout = useMemo(
    () => buildFaceLayout(photoSize, oval, scanResult?.face_landmarks ?? null, width, boxH, u),
    [photoSize, oval, scanResult, width, boxH, u],
  );
  const fit = layout?.photo ?? null;

  // Pontinhos: um aglomerado por âncora de cada região com achado; levam a categoria
  // do achado para o filtro dos chips.
  const dots = useMemo(() => {
    if (!layout) return [];
    const out: Dot[] = [];
    findings.forEach((f, fi) => {
      if (!f.region) return;
      layout.anchors[f.region].forEach((p, ai) => out.push(...clusterDots(p, layout.sparkR, fi * 7 + ai, f.category)));
    });
    return out;
  }, [findings, layout]);

  // ── Dados das seções de baixo ───────────────────────────────────────────────
  const strengths = scanResult?.skin_strengths ?? [];
  const recs = scanResult?.action_recommendations ?? [];
  const align = scanResult?.concerns_alignment;
  const goalLabels = concerns.filter((c) => c !== 'Outro');
  const mainGoal = joinPt(goalLabels.slice(0, 2).map((c, i) => (i ? c.toLowerCase() : c)));
  const vThumbs = layout ? [layout.anchors.nariz_zona_t[0], layout.anchors.bochechas[1] ?? layout.anchors.bochechas[0], layout.anchors.queixo_mandibula[0]] : [];

  const handleNext = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(OB_STEPS.resultadoScan, 'Resultado do Scan'));
    const age = Number(birthday);
    const skinAge = scanResult?.skin_age ?? scanResult?.envelhecimento?.skin_age;
    const older = skinAge != null && !isNaN(age) && age > 0 && Math.round(skinAge) > age;
    router.push(older ? '/(onboarding)/idade-pele' : '/(onboarding)/transicao-rotina');
  };

  // X = refazer o scan (no onboarding não há "fora" para onde ir).
  const handleClose = () => {
    haptics.tap();
    Alert.alert('Refazer o scan?', 'Você vai tirar as fotos de novo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Refazer', onPress: () => router.replace('/(scan)/camera?retake=1' as any) },
    ]);
  };

  /** Recorte da foto centrado em `p` (px do quadro), ampliado `zoom` vezes. */
  const crop = (p: Pt2 | undefined, size: number, zoom: number, radius: number) => (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: R.sheet }}>
      {photoUri && fit && p && (
        <Image
          source={{ uri: photoUri }}
          style={{
            position: 'absolute', width: fit.w * zoom, height: fit.h * zoom,
            left: size / 2 - (p.x - fit.left) * zoom, top: size / 2 - (p.y - fit.top) * zoom,
          }}
        />
      )}
    </View>
  );

  const sectionTitle = { fontSize: 20, fontWeight: '600' as const, lineHeight: 24, letterSpacing: -0.5, color: OB.ink };

  return (
    <View style={{ flex: 1, backgroundColor: R.sheet }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <StatusBar style="dark" />

      {/* Foto + máscara + pontinhos */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: boxTop, width, height: boxH, overflow: 'hidden' }}>
        {photoUri && fit && (
          <Image source={{ uri: photoUri }} style={{ position: 'absolute', left: fit.left, top: fit.top, width: fit.w, height: fit.h }} />
        )}
        {photoUri && !fit && (
          <Image source={{ uri: photoUri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        )}
        {layout && <FaceOverlay width={width} height={boxH} layout={layout} dots={dots} filter={filter} />}
      </View>

      {/* Topo: data (vidro claro) + X */}
      <View style={{ position: 'absolute', top: y(62), left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: 36 }} />
        <View style={{
          height: 34, paddingHorizontal: 16, borderRadius: 17, justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
        }}>
          <Text style={{ fontSize: 15, fontWeight: '500', letterSpacing: -0.2, color: OB.ink }}>{scannedAt}</Text>
        </View>
        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={0.85}
          style={{
            width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
            shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
          }}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={OB.ink} strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* Folha */}
      <View style={{
        position: 'absolute', left: 0, right: 0, top: y(SHEET_TOP), bottom: 0,
        borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: R.sheet, overflow: 'hidden',
        shadowColor: '#783C48', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.1, shadowRadius: 12,
      }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
          {/* 1. Achados */}
          <View style={{ backgroundColor: '#FFFFFF', borderBottomLeftRadius: 26, borderBottomRightRadius: 26, paddingBottom: 8 }}>
            <View style={{ alignSelf: 'center', marginTop: 8, width: 36, height: 5, borderRadius: 3, backgroundColor: R.handle }} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 16, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 18, gap: 6 }}
            >
              {chips.map((c) => {
                const on = c === filter;
                return (
                  <TouchableOpacity
                    key={c}
                    activeOpacity={0.8}
                    onPress={() => { haptics.select(); setFilter(c); }}
                    style={{ height: 34, paddingHorizontal: 15, borderRadius: 17, justifyContent: 'center', backgroundColor: on ? R.pillBg : R.chipOff }}
                  >
                    <Text style={{ fontSize: 15, letterSpacing: -0.2, fontWeight: on ? '600' : '500', color: on ? R.pillInk : R.body }}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ marginTop: 20, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={sectionTitle}>Análise da pele</Text>
              <Text style={{ fontSize: 15, letterSpacing: -0.2, color: R.muted }}>{shown.length === 1 ? '1 ponto' : `${shown.length} pontos`}</Text>
            </View>

            <View style={{ marginTop: 6, paddingHorizontal: 18 }}>
              {shown.map((f, i) => (
                <View key={f.key} style={{ flexDirection: 'row', gap: 14, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: R.line }}>
                  {crop(f.region && layout ? layout.anchors[f.region][0] : undefined, 64, 1.4, 14)}
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: OB.pink }} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: R.zone }}>{f.zone}</Text>
                      </View>
                      {f.level && (
                        <View style={{ height: 22, paddingHorizontal: 9, borderRadius: 11, backgroundColor: R.pillBg, justifyContent: 'center' }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: R.pillInk }}>{f.level}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 17, fontWeight: '600', lineHeight: 22, letterSpacing: -0.35, color: OB.ink }}>{f.title}</Text>
                    {!!f.text && <Text style={{ fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: R.body }}>{f.text}</Text>}
                  </View>
                </View>
              ))}
              {shown.length === 0 && (
                <Text style={{ paddingVertical: 14, fontSize: 15, lineHeight: 20, color: R.body }}>
                  Sua pele não mostrou nenhum ponto de atenção importante nesta foto.
                </Text>
              )}
            </View>
          </View>

          {/* 2. Pontos fortes */}
          {strengths.length > 0 && (
            <View style={{ marginTop: 10, backgroundColor: '#FFFFFF', borderRadius: 26, paddingVertical: 20 }}>
              <Text style={[sectionTitle, { paddingHorizontal: 18 }]}>Pontos fortes da pele</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 10 }}>
                {strengths.map((st, i) => (
                  <View key={i} style={{ width: 262, borderRadius: 20, borderWidth: 1, borderColor: R.border, padding: 14, gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' }}>
                        <Svg width={16} height={16} viewBox="0 0 24 24">
                          <Path d={STRENGTH_ICON[st.icon] ?? STRENGTH_ICON.sparkle} fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </Svg>
                      </View>
                      <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', letterSpacing: -0.35, color: OB.ink }}>{st.title}</Text>
                    </View>
                    <View style={{ flex: 1, borderRadius: 14, backgroundColor: R.sheet, paddingVertical: 12, paddingHorizontal: 13 }}>
                      <Text style={{ fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: R.body }}>{st.body}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 3. Com base no perfil de pele */}
          {goalLabels.length > 0 && (
            <>
              <Text style={[sectionTitle, { marginTop: 28, paddingHorizontal: 18 }]}>Com base no seu perfil de pele</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 4, gap: 26 }}>
                {goalLabels.map((g, i) => (
                  <View key={g} style={{ gap: 8 }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
                      shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 7,
                    }}>
                      <Svg width={22} height={22} viewBox="0 0 24 24">
                        <Circle cx={12} cy={12} r={9} fill="none" stroke={OB.pink} strokeWidth={1.9} />
                        <Circle cx={12} cy={12} r={5} fill="none" stroke={OB.pink} strokeWidth={1.9} />
                        <Circle cx={12} cy={12} r={1.6} fill={OB.pink} />
                      </Svg>
                    </View>
                    <View style={{ gap: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: OB.ink }}>{g}</Text>
                      <Text style={{ fontSize: 14, color: R.muted }}>{i === 0 ? 'Objetivo principal' : 'Preocupação adicional'}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          {/* 4. Validação do objetivo principal */}
          {align && ALIGN[align.alinhamento] && (
            <View style={{ marginTop: 26, backgroundColor: '#FFFFFF', borderRadius: 26, paddingVertical: 20, paddingHorizontal: 18 }}>
              <Text style={sectionTitle}>Validação do objetivo principal</Text>
              <View style={{ marginTop: 14, borderRadius: 20, borderWidth: 1, borderColor: R.border, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {vThumbs.map((p, i) => <View key={i}>{crop(p, 88, 1.16, 18)}</View>)}
                </View>
                {align.regioes_afetadas?.length > 0 && (
                  <Text style={{ marginTop: 14, fontSize: 13, fontWeight: '600', color: R.zone, textAlign: 'center' }}>
                    {cap(joinPt(align.regioes_afetadas))}
                  </Text>
                )}
                {!!mainGoal && (
                  <Text style={{ marginTop: 3, fontSize: 17, fontWeight: '600', letterSpacing: -0.35, color: OB.ink, textAlign: 'center' }}>{mainGoal}</Text>
                )}
                <View style={{
                  marginTop: 10, height: 30, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 9, paddingRight: 13,
                  borderRadius: 15, backgroundColor: OB.pink,
                }}>
                  <Svg width={15} height={15} viewBox="0 0 24 24">
                    <Circle cx={12} cy={12} r={9} fill="none" stroke="#FFFFFF" strokeWidth={2.4} />
                    <Path d="M8 12.5l2.8 2.8L16.5 9.5" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                  <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: '#FFFFFF' }}>{ALIGN[align.alinhamento].label}</Text>
                </View>
                <View style={{ marginTop: 16, alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: '#F3EDF0' }}>
                  <LinearGradient
                    colors={['#FFD3E5', OB.pink]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${ALIGN[align.alinhamento].pct * 100}%`, borderRadius: 3 }}
                  />
                  <View style={{ position: 'absolute', left: `${ALIGN[align.alinhamento].pct * 100}%`, top: -5, width: 4, height: 16, marginLeft: -2, borderRadius: 2, backgroundColor: R.pillInk }} />
                </View>
                <View style={{ marginTop: 6, alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: R.muted }}>Baixo</Text>
                  <Text style={{ fontSize: 12, color: R.muted }}>Alto</Text>
                </View>
              </View>
              {!!align.mensagem && (
                <Text style={{ marginTop: 16, fontSize: 16, lineHeight: 22, letterSpacing: -0.3, color: R.text2 }}>{align.mensagem}</Text>
              )}
            </View>
          )}

          {/* 5. Recomendações */}
          {recs.length > 0 && (
            <View style={{ marginTop: 10, backgroundColor: '#FFFFFF', borderRadius: 26, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 8 }}>
              <Text style={sectionTitle}>{mainGoal ? `Recomendações pra ${mainGoal.toLowerCase()}` : 'Recomendações pra sua pele'}</Text>
              <View style={{ marginTop: 8 }}>
                {recs.map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 14, paddingVertical: 14 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: R.pillBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: R.pillInk }}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: R.muted }}>{r.category}</Text>
                      <Text style={{ fontSize: 16, lineHeight: 21, letterSpacing: -0.3, color: OB.ink }}>{r.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <LinearGradient
          pointerEvents="none"
          colors={['rgba(249,242,245,0)', R.sheet]}
          locations={[0, 0.55]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 }}
        />
      </View>

      <TouchableOpacity
        onPress={handleNext}
        activeOpacity={0.85}
        style={{
          position: 'absolute', left: 18, right: 18, bottom: Math.max(34, insets.bottom), height: 50, borderRadius: 25,
          backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center',
          shadowColor: OB.pink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' }}>Próximo</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Encaixe do rosto ──────────────────────────────────────────────────────────
type FaceLayout = {
  photo: { left: number; top: number; w: number; h: number };
  /** Máscara: desenhada em (0,0) com `rx`/`ry`/`yaw` e levada ao rosto por `matrix`. */
  mesh: { cx: number; cy: number; rx: number; ry: number; yaw: number; matrix: number[] | null };
  anchors: Record<Region, Pt2[]>;   // centros dos brilhos (px do quadro)
  sparkR: number;                   // raio de cada aglomerado
  scanTop: number;                  // faixa que a linha de scan percorre (px do quadro)
  scanBottom: number;
};

type Landmarks = NonNullable<ScanResult['face_landmarks']>;
const LANDMARK_KEYS = ['eye_left', 'eye_right', 'nose_tip', 'mouth_center', 'chin', 'forehead'] as const;
const LANDMARK_W = [3, 3, 1.5, 2, 1, 1];          // olhos e boca mandam mais no encaixe
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function buildFaceLayout(
  size: { w: number; h: number } | null, oval: ReturnType<typeof useFaceOval>, lm: Landmarks | null,
  W: number, H: number, u: number,
): FaceLayout | null {
  if (!size) return null;

  if (lm) {
    const px = (p: Pt2) => ({ x: p.x * size.w, y: p.y * size.h });
    const eyeMid = { x: (lm.eye_left.x + lm.eye_right.x) / 2 * size.w, y: (lm.eye_left.y + lm.eye_right.y) / 2 * size.h };
    const chin = px(lm.chin);
    const d = Math.hypot(chin.x - eyeMid.x, chin.y - eyeMid.y);
    if (d > 1) {
      // Foto: olhos na altura do design, olhos→queixo com tamanho fixo; sempre cobrindo o quadro.
      const k = Math.max((EYE_TO_CHIN * u) / d, W / size.w, H / size.h);
      const left = clamp(W / 2 - eyeMid.x * k, W - size.w * k, 0);
      const top = clamp(EYE_Y * u - eyeMid.y * k, H - size.h * k, 0);
      const T = Object.fromEntries(LANDMARK_KEYS.map((key) => [key, {
        x: left + lm[key].x * size.w * k, y: top + lm[key].y * size.h * k,
      }])) as Record<(typeof LANDMARK_KEYS)[number], Pt2>;
      const E1 = T.eye_left, E2 = T.eye_right, N = T.nose_tip, M = T.mouth_center, C = T.chin, F = T.forehead;
      const ed = Math.hypot(E2.x - E1.x, E2.y - E1.y);
      const mid = { x: (E1.x + E2.x) / 2, y: (E1.y + E2.y) / 2 };
      // Lado do rosto: nariz deslocado do meio dos olhos → máscara girada para esse lado.
      const yaw = clamp(((N.x - mid.x) / Math.max(1, ed)) * 1.4, -0.5, 0.5);
      // Máscara num tamanho em que a distância entre os olhos já bate (escala ~1 no
      // encaixe → traço da malha com a espessura de sempre).
      const ratio = CAM_OVAL_H / CAM_OVAL_W;
      const canon = (rx: number, key: (typeof LANDMARK_KEYS)[number]) =>
        faceMeshPoint(0, 0, rx, rx * ratio, yaw, MESH_FEATURES[key].phi, MESH_FEATURES[key].theta);
      const ed100 = Math.abs(canon(100, 'eye_right').x - canon(100, 'eye_left').x) || 1;
      const rx = 100 * (ed / ed100);
      const src = LANDMARK_KEYS.map((key) => canon(rx, key));
      const matrix = affineFit(src, LANDMARK_KEYS.map((key) => T[key]), LANDMARK_W);
      const o = (p: Pt2, dx: number, dy: number) => ({ x: p.x + dx * ed, y: p.y + dy * ed });
      return {
        photo: { left, top, w: size.w * k, h: size.h * k },
        mesh: { cx: 0, cy: 0, rx, ry: rx * ratio, yaw, matrix },
        anchors: {
          testa: [F, o(F, -0.3, 0.05), o(F, 0.3, 0.05)],
          nariz_zona_t: [{ x: (mid.x + N.x) / 2, y: (mid.y + N.y) / 2 }, N],
          bochechas: [o(E1, -0.12, 0.62), o(E2, 0.12, 0.62)],
          queixo_mandibula: [{ x: M.x + (C.x - M.x) * 0.42, y: M.y + (C.y - M.y) * 0.42 }],
          area_periocular: [o(E1, 0, 0.24), o(E2, 0, 0.24)],
        },
        sparkR: ed * 0.17,
        scanTop: F.y - ed * 0.6,
        scanBottom: C.y + ed * 0.1,
      };
    }
  }

  // Sem pontos: enquadra pelo oval da câmera e usa as posições fixas do design.
  if (!oval) return null;
  const f = fitFace(size, oval, FACE_H * u, W / 2, FACE_CY * u);
  const ry = (FACE_H / 2) * u;
  const anchors = Object.fromEntries((Object.keys(REGION_INFO) as Region[]).map((r) => [
    r, REGION_INFO[r].dots.map(([x, yy]) => {
      const k = FACE_H / REGION_OVAL_H;
      return { x: (BOX_W / 2 + (x - BOX_W / 2) * k) * u, y: (FACE_CY + (yy - REGION_OVAL_CY) * k) * u };
    }),
  ])) as Record<Region, Pt2[]>;
  return {
    photo: { left: f.left, top: f.top, w: f.width, h: f.height },
    mesh: { cx: W / 2, cy: FACE_CY * u, rx: ry * (CAM_OVAL_W / CAM_OVAL_H), ry, yaw: 0, matrix: null },
    anchors,
    sparkR: 13 * u,
    scanTop: FACE_CY * u - ry * 0.85,
    scanBottom: FACE_CY * u + ry,
  };
}

// ── Máscara + pontinhos sobre a foto ─────────────────────────────────────────
// Ao abrir, a linha de scan passa UMA vez de cima a baixo pela máscara; cada pontinho
// aparece quando ela passa pela altura dele. Pontinhos no estilo do 49d: miolo branco,
// aro rosa e brilho rosa; com um chip selecionado, só os daquela categoria ficam.
// Componente próprio, com relógio próprio (para no fim da passada), para a animação
// não re-renderizar a lista de achados a cada quadro.
const SWEEP_MS = 2600;   // = a ida da linha de scan no FaceScanMesh
const FPS_MS = 33;

type Dot = { x: number; y: number; s: number; cat: string };

/** Aglomerado em volta de `p`: tamanhos 3,5–7 pt como no 49d (posições fixas, sem sorteio). */
function clusterDots(p: Pt2, R0: number, seed: number, cat: string): Dot[] {
  let s = (seed + 1) * 16807 % 2147483647;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  return Array.from({ length: 7 }, () => {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R0;
    return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.8, s: 3.5 + rnd() * 3.5, cat };
  });
}

function FaceOverlay({ width, height, layout, dots, filter }: { width: number; height: number; layout: FaceLayout; dots: Dot[]; filter: string }) {
  const [t, setT] = useState(0);
  const start = useRef(Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = Date.now() - start.current;
      setT(now);
      if (now < SWEEP_MS + 450) id = setTimeout(tick, FPS_MS);
    };
    tick();
    return () => clearTimeout(id);
  }, []);

  const sweep = Math.min(1, t / SWEEP_MS);
  const e = sweep < 0.5 ? 2 * sweep * sweep : 1 - Math.pow(-2 * sweep + 2, 2) / 2;
  const scanY = layout.scanTop + e * (layout.scanBottom - layout.scanTop);
  const { mesh } = layout;
  const meshEl = (
    <FaceScanMesh
      cx={mesh.cx} cy={mesh.cy} rx={mesh.rx} ry={mesh.ry} t={t} yaw={mesh.yaw}
      opacity={Math.min(1, t / 400)} scanLine={t < SWEEP_MS} sparks={false} meshStrength={1.15}
    />
  );

  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
      {mesh.matrix ? <G transform={`matrix(${mesh.matrix.join(' ')})`}>{meshEl}</G> : meshEl}
      {dots.map((d, i) => {
        if (d.y > scanY && t < SWEEP_MS) return null;           // a linha ainda não passou
        if (filter !== 'Todos' && d.cat !== filter) return null;
        const r = d.s / 2;
        return (
          <G key={i}>
            <Circle cx={d.x} cy={d.y} r={r + 5} fill={OB.pink} fillOpacity={0.28} />
            <Circle cx={d.x} cy={d.y} r={r + 2} fill={OB.pink} fillOpacity={0.55} />
            <Circle cx={d.x} cy={d.y} r={r} fill="#FFFFFF" />
          </G>
        );
      })}
    </Svg>
  );
}
