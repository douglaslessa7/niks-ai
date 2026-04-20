import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ChevronLeft, Shield, Droplets, Sparkles, Leaf, Sun } from 'lucide-react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore, ScanResult } from '../../store/onboarding';

// ── Constants ──────────────────────────────────────────────────────────────────

const HERO_HEIGHT = 380;

const skinStrengthIcons: Record<string, React.ReactNode> = {
  shield: <Shield size={18} color="#FFFFFF" strokeWidth={2} />,
  drop: <Droplets size={18} color="#FFFFFF" strokeWidth={2} />,
  sparkle: <Sparkles size={18} color="#FFFFFF" strokeWidth={2} />,
  leaf: <Leaf size={18} color="#FFFFFF" strokeWidth={2} />,
  sun: <Sun size={18} color="#FFFFFF" strokeWidth={2} />,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatDate = (date: Date): string => {
  const months = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${day} de ${month} às ${h}:${m}`;
};

const formatPriority = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const formatContraindication = (value: string): string => {
  const map: Record<string, string> = {
    acido_glicolico_alta_concentracao: 'Ácido glicólico em alta concentração',
    retinoides_sem_preparo_de_barreira: 'Retinoides sem preparo de barreira',
    esfoliantes_fisicos: 'Esfoliantes físicos',
    esfoliantes_fisicos_agressivos: 'Esfoliantes físicos agressivos',
    'vitamina_c_pH_baixo_sem_adaptacao': 'Vitamina C em pH baixo sem adaptação',
    acidos_esfoliantes_alta_concentracao: 'Ácidos esfoliantes em alta concentração',
    acidos_esfoliantes_alta_concentracao_sem_preparo: 'Ácidos esfoliantes em alta concentração',
    produtos_com_alcool_alto: 'Produtos com álcool',
    produtos_com_alta_fragrancia: 'Produtos com fragrância',
    sabonetes_com_sulfatos_fortes: 'Sabonetes com sulfatos fortes',
  };
  return map[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const barrierLabel = (status?: string): string => {
  switch (status) {
    case 'integra': return 'Íntegra';
    case 'levemente_comprometida': return 'Atenção';
    case 'comprometida': return 'Comprometida';
    case 'severamente_comprometida': return 'Crítica';
    default: return status ?? '—';
  }
};

const hydrationLabel = (h?: string): string => {
  switch (h) {
    case 'desidratada': return 'Desidratada';
    case 'normal': return 'Normal';
    case 'hidratada': return 'Boa';
    default: return h ?? '—';
  }
};

const sebaceoLabel = (i?: string): string => {
  switch (i) {
    case 'nenhum': return 'Nenhuma';
    case 'leve': return 'Leve';
    case 'moderado': return 'Moderada';
    case 'intenso': return 'Intensa';
    default: return i ?? '—';
  }
};

const qualidadeLabel = (n?: string): string => {
  switch (n) {
    case 'alta': return 'Alta';
    case 'media': return 'Média';
    case 'baixa': return 'Baixa';
    default: return '—';
  }
};

const qualidadeColor = (n?: string): string => {
  switch (n) {
    case 'alta': return '#4CAF50';
    case 'media': return '#F59E0B';
    case 'baixa': return '#EF4444';
    default: return '#8A8A8E';
  }
};

const pigmentacaoTypeLabel = (type?: string | null): string => {
  switch (type) {
    case 'melasma': return 'Melasma';
    case 'HPI': return 'Hiperpigmentação pós-inflamatória';
    case 'PIE': return 'PIE vascular';
    case 'lentigos_solares': return 'Manchas solares';
    case 'efelides': return 'Efélides';
    case 'misto': return 'Misto';
    default: return type ?? '—';
  }
};

const fototipoText = (ph?: string): string => {
  switch (ph) {
    case 'I':
    case 'II': return 'Pele muito clara, alta sensibilidade ao sol';
    case 'III': return 'Pele oliva, bronzeia com facilidade';
    case 'IV': return 'Pele morena, risco moderado de manchas';
    case 'V': return 'Pele escura, alto risco de hiperpigmentação pós-inflamatória';
    case 'VI': return 'Pele muito escura, máxima atenção a manchas e retinoides';
    default: return '';
  }
};

// ── Regional analysis builder ──────────────────────────────────────────────────

type RegionalEntry = { zone: string; issues: string[]; detail: string | null | undefined; regionKey: string };

const buildRegionalAnalysis = (result: ScanResult | null | undefined): RegionalEntry[] => {
  if (!result) return [];
  const regions: RegionalEntry[] = [];

  // TESTA
  const foreheadIssues: string[] = [];
  if (result?.acne?.distribution?.includes('testa') && result?.acne?.present) {
    foreheadIssues.push(result.acne.lesion_type === 'comedonal' ? 'cravos e comedões' : 'lesões de acne');
  }
  if (result?.brilho_sebaceo?.location?.includes('testa')) foreheadIssues.push('oleosidade');
  if (result?.envelhecimento?.location?.includes('testa')) foreheadIssues.push('linhas finas');
  if (foreheadIssues.length > 0) regions.push({ zone: 'Testa', issues: foreheadIssues, detail: result?.acne?.insight, regionKey: 'testa' });

  // NARIZ / ZONA T
  const noseIssues: string[] = [];
  if (result?.brilho_sebaceo?.location?.includes('nariz')) noseIssues.push('oleosidade');
  if (result?.textura_poros?.pore_visibility !== 'normal') noseIssues.push('poros dilatados');
  if (noseIssues.length > 0) regions.push({ zone: 'Nariz e Zona T', issues: noseIssues, detail: result?.textura_poros?.insight, regionKey: 'nariz_zona_t' });

  // BOCHECHAS
  const cheekIssues: string[] = [];
  if (result?.acne?.distribution?.includes('bochechas') && result?.acne?.present) cheekIssues.push('acne');
  if (result?.pigmentacao?.location?.includes('bochechas') && result?.pigmentacao?.present) cheekIssues.push('manchas');
  if (result?.rosacea?.present) cheekIssues.push('eritema');
  if (cheekIssues.length > 0) regions.push({ zone: 'Bochechas', issues: cheekIssues, detail: result?.pigmentacao?.insight, regionKey: 'bochechas' });

  // QUEIXO / MANDÍBULA
  const chinIssues: string[] = [];
  if (result?.acne?.distribution?.includes('queixo') && result?.acne?.present) chinIssues.push('acne');
  if (result?.acne?.distribution?.includes('mandibula') && result?.acne?.present) chinIssues.push('acne hormonal');
  if (result?.acne?.pattern === 'hormonal') chinIssues.push('padrão hormonal');
  if (chinIssues.length > 0) regions.push({ zone: 'Queixo e Mandíbula', issues: chinIssues, detail: result?.acne?.insight, regionKey: 'queixo_mandibula' });

  // ÁREA DOS OLHOS
  if (result?.area_periocular && result?.area_periocular !== 'normal') {
    const periocularLabel: Record<string, string> = {
      olheiras: 'olheiras visíveis',
      inchaco: 'inchaço palpebral',
      linhas_finas: 'linhas finas',
      misto: 'olheiras e linhas finas',
    };
    regions.push({
      zone: 'Área dos Olhos',
      issues: [periocularLabel[result.area_periocular] ?? result.area_periocular],
      detail: null,
      regionKey: 'area_periocular',
    });
  }

  return regions;
};

// Crop offset por região (desloca a imagem verticalmente para simular a área do rosto)
const regionCropOffset: Record<string, number> = {
  'Testa': 0,
  'Área dos Olhos': 48,
  'Nariz e Zona T': 96,
  'Bochechas': 112,
  'Queixo e Mandíbula': 136,
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function SkinResult() {
  const router = useRouter();
  const { scanResult, scanImageUri, selectedScan } = useAppStore();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const result = selectedScan?.result ?? scanResult;
  const imageUri = selectedScan?.imageUri ?? scanImageUri;

  useEffect(() => {
    return () => { useAppStore.getState().setSelectedScan(null); };
  }, []);

  if (!result) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAF8', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#FB7B6B" />
      </SafeAreaView>
    );
  }

  const score = result.skin_score ?? 0;

  const overlayTranslateY = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT],
    outputRange: [0, -HERO_HEIGHT],
    extrapolate: 'clamp',
  });
  const regions = buildRegionalAnalysis(result);
  const pontosFortesArr: string[] = result.pontos_fortes ?? result.positive_highlights ?? [];
  const pontosFracosArr: string[] = result.pontos_fracos ?? result.top_concerns ?? [];
  const contraindicacoesArr: string[] = result.contraindicacoes ?? [];
  const pig = result.pigmentacao;
  const today = new Date();

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>

      {/* ── Foto fixa atrás do conteúdo ───────────────────────────── */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HERO_HEIGHT, zIndex: 0 }}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: '#C8C0B8' }} />
          )}

          {/* Overlay escuro */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)']}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 }}
          />

          {/* Ring + Badges — animados com o scroll */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: HERO_HEIGHT,
              transform: [{ translateY: overlayTranslateY }],
            }}
          >
            {/* Ring — canto inferior esquerdo */}
            <View style={{ position: 'absolute', bottom: 18, left: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginBottom: 5, textAlign: 'center' }}>
                SKIN SCORE
              </Text>
              <View style={{ width: 86, height: 86 }}>
                <Svg width={86} height={86}>
                  <Defs>
                    <SvgLinearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0%" stopColor="#34D399" />
                      <Stop offset="100%" stopColor="#059669" />
                    </SvgLinearGradient>
                  </Defs>
                  <Circle cx={43} cy={43} r={38} fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                  <Circle cx={43} cy={43} r={33} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3.5} />
                  <Circle
                    cx={43}
                    cy={43}
                    r={33}
                    fill="none"
                    stroke="url(#scoreGrad)"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeDasharray={207.3}
                    strokeDashoffset={207.3 * (1 - score / 100)}
                    transform="rotate(-90 43 43)"
                  />
                  <Circle cx={43} cy={43} r={29} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                </Svg>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -1, lineHeight: 28 }}>
                    {score}
                  </Text>
                  <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', fontWeight: '500', letterSpacing: 0.5 }}>
                    /100
                  </Text>
                </View>
              </View>
            </View>

            {/* Badges — canto inferior direito */}
            <View style={{ position: 'absolute', bottom: 18, right: 16, alignItems: 'flex-end', gap: 7 }}>
              {result.skin_type_sebaceous ? (
                <View style={{ backgroundColor: '#fb7b6b', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '600', letterSpacing: 0.5 }}>
                    {result.skin_type_sebaceous.charAt(0).toUpperCase() + result.skin_type_sebaceous.slice(1)}
                  </Text>
                </View>
              ) : null}
              {result.skin_phototype ? (
                <View style={{ backgroundColor: '#fb7b6b', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '600', letterSpacing: 0.5 }}>
                    Fitzpatrick {result.skin_phototype}
                  </Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
        </View>

      {/* ── Header flutuante ─────────────────────────────────────── */}
      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }} edges={['top']}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ padding: 4 }}>
            <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>Relatório de Pele</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{formatDate(today)}</Text>
          </View>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>

      {/* ── Conteúdo com scroll ───────────────────────────────────── */}
      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: HERO_HEIGHT, paddingBottom: insets.bottom + 80 }}
        style={{ flex: 1, zIndex: 1 }}
      >
        <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>

        {/* ── 3. Headline + Qualidade/Precisão ─────────────────────── */}
        <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#EFEFED' }}>
          {result.headline ? (
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1D3A44', lineHeight: 22, marginBottom: 12, textAlign: 'center' }}>
              {result.headline}
            </Text>
          ) : null}
          {(result.qualidade_foto || result.confianca_analise) ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
              {result.qualidade_foto ? (
                <Text style={{ fontSize: 12, color: '#999' }}>
                  Qualidade{' '}
                  <Text style={{ color: qualidadeColor(result.qualidade_foto.nivel), fontWeight: '600' }}>
                    · {qualidadeLabel(result.qualidade_foto.nivel)}
                  </Text>
                </Text>
              ) : null}
              {result.confianca_analise ? (
                <Text style={{ fontSize: 12, color: '#999' }}>
                  Precisão{' '}
                  <Text style={{ fontWeight: '600', color: '#1D3A44' }}>
                    · {result.confianca_analise.score}%
                  </Text>
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* ── 3b. Objetivo Validado ────────────────────────────────── */}
        {result.goal_alignment ? (() => {
          const ga = result.goal_alignment!;
          const borderColor = ga.alinhamento === 'confirmado' ? '#10B981' : ga.alinhamento === 'parcial' ? '#F59E0B' : '#E8754A';
          const badgeStyle = ga.alinhamento === 'confirmado'
            ? { bg: '#ECFDF5', color: '#065F46', text: '✓ Alinha com a análise' }
            : ga.alinhamento === 'parcial'
            ? { bg: '#FFFBEB', color: '#92400E', text: '~ Parcialmente alinhado' }
            : { bg: '#FFF5F4', color: '#991B1B', text: '⚠ A análise sugere outra prioridade' };
          return (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, marginHorizontal: 20, marginBottom: 12, marginTop: 24, padding: 20 }}>
              <View style={{ width: 3, position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: borderColor, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }} />
              <View style={{ paddingLeft: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#999', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
                  Seu Objetivo
                </Text>
                <View style={{ backgroundColor: badgeStyle.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: badgeStyle.color }}>
                    {badgeStyle.text}
                  </Text>
                </View>
                <View style={{ height: 1, backgroundColor: '#F0EDE8', marginBottom: 12 }} />
                <Text style={{ fontSize: 14, color: '#444', lineHeight: 20 }}>
                  {ga.mensagem}
                </Text>
              </View>
            </View>
          );
        })() : null}

        {/* ── 4. Análise por Região ─────────────────────────────────── */}
        <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 28, marginBottom: 32 }}>
          <Text style={{ fontSize: 24, fontWeight: '400', fontStyle: 'italic', fontFamily: 'Georgia', color: '#fb7b6b', marginBottom: 16 }}>
            Análise por Região
          </Text>

          {regions.length === 0 ? (
            <Text style={{ fontSize: 15, color: '#8A8A8E', lineHeight: 22 }}>
              Nenhuma área de atenção identificada — pele com aparência uniforme.
            </Text>
          ) : (
            regions.map((region, i) => {
              const displayIssues = region.issues.map((iss, idx) =>
                idx === 0 ? iss.charAt(0).toUpperCase() + iss.slice(1) : iss
              ).join(', ');
              const cropOffset = regionCropOffset[region.zone] ?? 80;

              return (
                <View key={i}>
                  {i > 0 ? (
                    <View style={{ height: 1, backgroundColor: '#EFEFED', marginVertical: 4 }} />
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 16, paddingVertical: 20 }}>
                    {/* Crop da foto */}
                    {imageUri ? (
                      <View style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
                        <Image
                          source={{ uri: imageUri }}
                          style={{ width: 80, height: 240, position: 'absolute', top: -cropOffset }}
                          resizeMode="cover"
                        />
                      </View>
                    ) : (
                      <View style={{ width: 80, height: 80, borderRadius: 12, backgroundColor: '#E8E4DF', flexShrink: 0 }} />
                    )}

                    {/* Conteúdo da região */}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text
                          style={{
                            fontWeight: '700',
                            fontSize: 13,
                            color: '#1A1A1A',
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                            flex: 1,
                            marginRight: 8,
                          }}
                        >
                          {region.zone}
                        </Text>
                        {region.issues.length > 0 ? (
                          <View
                            style={{
                              backgroundColor: '#FB7B6B',
                              borderRadius: 20,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Text style={{ fontSize: 11, color: 'white', fontWeight: '600' }}>
                              {region.issues[0]}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {displayIssues ? (
                        <Text style={{ fontSize: 14, color: '#8A8A8E', lineHeight: 20, marginBottom: 4 }}>
                          {displayIssues}
                        </Text>
                      ) : null}

                      {region.detail ? (
                        <Text style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 19, marginTop: 2 }}>
                          {region.detail}
                        </Text>
                      ) : null}

                      {(() => {
                        const insight = result.region_insights?.find(r => r.region === region.regionKey);
                        return insight ? (
                          <>
                            <View style={{ height: 1, backgroundColor: '#F0EDE8', marginVertical: 10 }} />
                            <Text style={{ fontSize: 13, lineHeight: 18 }}>
                              <Text style={{ color: '#E8754A', fontWeight: '600' }}>{'→ '}</Text>
                              <Text style={{ color: '#1D3A44', fontStyle: 'italic' }}>{insight.benefit}</Text>
                            </Text>
                          </>
                        ) : null;
                      })()}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── 6. Pigmentação ───────────────────────────────────────── */}
        {pig?.present ? (
          <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 28, marginBottom: 12 }}>
            <Text
              style={{
                fontSize: 11,
                color: '#8A8A8E',
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                marginBottom: 12,
              }}
            >
              Pigmentação
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 10 }}>
              {pigmentacaoTypeLabel(pig.type)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 5, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <Text
                  key={n}
                  style={{
                    fontSize: 18,
                    color: n <= (pig.intensity_score ?? 0) ? '#fb7b6b' : '#D8D8D8',
                  }}
                >
                  {n <= (pig.intensity_score ?? 0) ? '●' : '○'}
                </Text>
              ))}
            </View>
            {pig.insight ? (
              <Text style={{ fontSize: 14, color: '#8A8A8E', lineHeight: 21 }}>
                {pig.insight}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ── 3c. O que fazer pela sua pele ───────────────────────── */}
        {result.action_recommendations?.length ? (
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, marginHorizontal: 20, marginBottom: 12, padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: '400', fontStyle: 'italic', fontFamily: 'Georgia', color: '#fb7b6b', marginBottom: 16, marginTop: 0 }}>
              O que fazer pela sua pele
            </Text>
            {result.action_recommendations.map((rec, i) => (
              <View key={i}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 42, fontWeight: '800', color: '#fb7b6b', lineHeight: 42, width: 48, marginRight: 8 }}>
                    {i + 1}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#999', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 }}>
                      {rec.category}
                    </Text>
                    <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{rec.text}</Text>
                  </View>
                </View>
                {i < result.action_recommendations!.length - 1 ? (
                  <View style={{ height: 1, backgroundColor: '#F0EDE8', marginVertical: 14 }} />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* ── 5. Condição Geral — grid 2x2 ─────────────────────────── */}
        <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 28, marginTop: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '400', fontStyle: 'italic', fontFamily: 'Georgia', color: '#fb7b6b', marginBottom: 16 }}>
            Condição Geral
          </Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: '#E8E6E0',
              backgroundColor: 'white',
              overflow: 'hidden',
            }}
          >
            {/* Row 1 */}
            <View style={{ flexDirection: 'row' }}>
              <View
                style={{
                  flex: 1,
                  padding: 16,
                  borderRightWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: '#E8E6E0',
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: '#8A8A8E',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    marginBottom: 6,
                  }}
                >
                  Barreira
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>
                  {barrierLabel(result.barrier_status)}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  padding: 16,
                  borderBottomWidth: 1,
                  borderColor: '#E8E6E0',
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: '#8A8A8E',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    marginBottom: 6,
                  }}
                >
                  Hidratação
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>
                  {hydrationLabel(result.skin_hydration)}
                </Text>
              </View>
            </View>
            {/* Row 2 */}
            <View style={{ flexDirection: 'row' }}>
              <View
                style={{
                  flex: 1,
                  padding: 16,
                  borderRightWidth: 1,
                  borderColor: '#E8E6E0',
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: '#8A8A8E',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    marginBottom: 6,
                  }}
                >
                  Oleosidade
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>
                  {sebaceoLabel(result.brilho_sebaceo?.intensity)}
                </Text>
              </View>
              <View style={{ flex: 1, padding: 16 }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: '#8A8A8E',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    marginBottom: 6,
                  }}
                >
                  Fotótipo
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>
                  {result.skin_phototype ? `Fitzpatrick ${result.skin_phototype}` : '—'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 7. Por onde começar ───────────────────────────────────── */}
        {result.prioridade_clinica ? (
          <View
            style={{
              backgroundColor: '#fb7b6b',
              borderRadius: 16,
              marginHorizontal: 20,
              marginBottom: 32,
              padding: 24,
              marginTop: 32,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '800', color: 'white' }}>
              Por onde começar
            </Text>

            <Text
              style={{
                fontSize: 48,
                fontWeight: '800',
                color: '#FFFFFF',
                lineHeight: 58,
                marginTop: 16,
                opacity: 0.9,
              }}
            >
              01
            </Text>
            <Text style={{ fontSize: 17, fontWeight: '600', color: 'white' }}>
              {formatPriority(result.prioridade_clinica.primaria)}
            </Text>

            {result.prioridade_clinica.secundaria ? (
              <>
                <Text
                  style={{
                    fontSize: 48,
                    fontWeight: '800',
                    color: '#FFFFFF',
                    lineHeight: 58,
                    marginTop: 20,
                    opacity: 0.9,
                  }}
                >
                  02
                </Text>
                <Text style={{ fontSize: 17, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>
                  {formatPriority(result.prioridade_clinica.secundaria)}
                </Text>
              </>
            ) : null}

            {result.prioridade_clinica.justificativa ? (
              <Text
                style={{
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.85)',
                  lineHeight: 21,
                  marginTop: 12,
                }}
              >
                {result.prioridade_clinica.justificativa}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ── 8+9. Pontos de atenção + Pontos positivos ────────────── */}
        {(pontosFracosArr.length > 0 || pontosFortesArr.length > 0 || result.skin_strengths?.length) ? (
          <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 28, marginTop: 32, marginBottom: 4 }}>
            {pontosFracosArr.length > 0 ? (
              <>
                <Text
                  style={{
                    fontSize: 11,
                    color: '#8A8A8E',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    marginBottom: 12,
                  }}
                >
                  Pontos de Atenção
                </Text>
                {pontosFracosArr.map((item, i) => (
                  <View key={i}>
                    {i > 0 ? <View style={{ height: 1, backgroundColor: '#F0F0F0' }} /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 }}>
                      <Text style={{ fontSize: 16, color: '#FB7B6B', fontWeight: '700', lineHeight: 22 }}>
                        —
                      </Text>
                      <Text style={{ flex: 1, fontSize: 15, color: '#1A1A1A', lineHeight: 22 }}>
                        {item}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            {pontosFracosArr.length > 0 && (result.skin_strengths?.length || pontosFortesArr.length > 0) ? (
              <View style={{ height: 24 }} />
            ) : null}

            {result.skin_strengths?.length ? (
              <>
                <Text
                  style={{
                    fontSize: 11,
                    color: '#8A8A8E',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    marginBottom: 12,
                  }}
                >
                  Pontos Fortes da Pele
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -20 }}
                  contentContainerStyle={{ paddingHorizontal: 20 }}
                >
                  {result.skin_strengths.map((item, i) => (
                    <View
                      key={i}
                      style={{
                        width: 260,
                        backgroundColor: '#FFFFFF',
                        borderRadius: 12,
                        padding: 16,
                        marginRight: 12,
                        borderWidth: 1,
                        borderColor: '#F0EDE8',
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 20,
                          backgroundColor: '#fb7b6b',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {skinStrengthIcons[item.icon]}
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44', marginTop: 10, marginBottom: 6 }}>
                        {item.title}
                      </Text>
                      <Text style={{ fontSize: 13, color: '#666', lineHeight: 18 }}>{item.body}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : pontosFortesArr.length > 0 ? (
              <>
                <Text
                  style={{
                    fontSize: 11,
                    color: '#8A8A8E',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    marginBottom: 12,
                  }}
                >
                  Pontos Positivos
                </Text>
                {pontosFortesArr.map((item, i) => (
                  <View key={i}>
                    {i > 0 ? <View style={{ height: 1, backgroundColor: '#F0F0F0' }} /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 }}>
                      <Text style={{ fontSize: 16, color: '#4CAF50', fontWeight: '700', lineHeight: 22 }}>
                        ✓
                      </Text>
                      <Text style={{ flex: 1, fontSize: 15, color: '#1A1A1A', lineHeight: 22 }}>
                        {item}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}

        {/* ── 10. Ativos a evitar ───────────────────────────────────── */}
        {contraindicacoesArr.length > 0 ? (
          <View
            style={{
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 20,
              paddingVertical: 28,
              marginTop: 4,
              marginBottom: 4,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: '#8A8A8E',
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                marginBottom: 12,
              }}
            >
              Evitar para sua pele
            </Text>
            {contraindicacoesArr.map((item, i) => (
              <View key={`contra-${i}`}>
                {i > 0 ? (
                  <View style={{ height: 1, backgroundColor: 'rgba(239,68,68,0.12)' }} />
                ) : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 12,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ fontSize: 16, color: '#EF4444', fontWeight: '700', lineHeight: 22 }}>
                    ×
                  </Text>
                  <Text style={{ flex: 1, fontSize: 15, color: '#1A1A1A', lineHeight: 22 }}>
                    {formatContraindication(item)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── 11. Fotótipo ─────────────────────────────────────────── */}
        {result.skin_phototype ? (
          <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 28, marginTop: 4 }}>
            <Text
              style={{
                fontSize: 11,
                color: '#8A8A8E',
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                marginBottom: 8,
              }}
            >
              Fotótipo Detectado
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A1A1A', lineHeight: 23 }}>
              Fitzpatrick {result.skin_phototype}
            </Text>
            {fototipoText(result.skin_phototype) ? (
              <Text style={{ fontSize: 15, color: '#1A1A1A', lineHeight: 23, flexShrink: 1 }}>
                {fototipoText(result.skin_phototype)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ── 12. Disclaimer ───────────────────────────────────────── */}
        {result.disclaimer ? (
          <View style={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40, alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 11,
                color: '#8A8A8E',
                textAlign: 'center',
                lineHeight: 16,
              }}
            >
              {result.disclaimer}
            </Text>
          </View>
        ) : null}

        </View>
      </Animated.ScrollView>
    </View>
  );
}
