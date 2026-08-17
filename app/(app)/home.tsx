import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, StyleSheet,
  useWindowDimensions, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import { Exo2_700Bold } from '@expo-google-fonts/exo-2';
import { Lato_400Regular } from '@expo-google-fonts/lato';
import { Lightbulb, ScanFace, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useAppStore } from '../../store/onboarding';
import { useFaceScan } from '../../hooks/useFaceScan';
import { supabase } from '../../lib/supabase';
import { getScoreTheme } from '../../lib/scoreTheme';
import { haptics } from '../../lib/haptics';
import { metricColor } from '../../lib/metricColor';
import { METRIC_DEFS, Metricas } from '../../lib/metricDefs';
import { CATALOGO_DICAS, Dica } from '../../lib/dicas/catalogo';
import { getDicaDoDia } from '../../lib/dicas/dicaDoDia';
import { useCachedQuery } from '../../lib/cache';
import { getUserId, useUserId } from '../../lib/currentUser';
import { Skeleton } from '../../components/Skeleton';

// Habilita LayoutAnimation no Android (iOS já vem ligado)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Métricas da home (node 1:63) — alimentadas pelo último scan real ──────────
// `METRIC_DEFS` (chaves, rótulos, polaridade) vive em `lib/metricDefs` desde que a
// bandeja de adesivos do Story passou a precisar da MESMA lista. Não redefinir aqui.

// Semáforo por "bom/ruim pra pessoa" (não pelo valor cru) — vive em lib/metricColor
// para o adesivo do Story (NiksSticker) usar EXATAMENTE a mesma regra de cor.

// Formato do `full_result` (jsonb do skin_scans) no que a home consome. Tipado local
// para não tocar no store. `metricas` pode faltar em scans antigos (pré-deploy).
type FullResult = {
  skin_score?: number;
  metricas?: Metricas;
};

// Tema de cor por faixa do Niks score (0–25 vermelho, 26–50 laranja, 51–75 amarelo,
// 76–100 rosa) — vive em lib/scoreTheme para ser compartilhado com a navbar (logo central).

export default function Home() {
  const { startFaceScan } = useFaceScan();
  const setStoreSkinScore = useAppStore((s) => s.setSkinScore); // espelha o score p/ a navbar
  const setProductDetailTarget = useAppStore((s) => s.setProductDetailTarget);
  const setHomePhotoDraft = useAppStore((s) => s.setHomePhotoDraft);
  const router = useRouter();
  const userId = useUserId(); // chaveia o cache — os dados são por usuário
  const [tipOpen, setTipOpen] = useState(false);
  const toggleTip = () => {
    haptics.tap();
    LayoutAnimation.configureNext(LayoutAnimation.create(240, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setTipOpen((o) => !o);
  };
  const { width } = useWindowDimensions();
  const PHOTO = Math.round(width * 0.58);   // foto = 228/393 (Figma node 1:51)
  const LOGO = Math.round(width * (49 / 393)); // sparkle do topo = 49/393 (Figma node 1:385)
  const CARD_OVERLAP = Math.round(width * (40 / 393)); // card sobrepõe 40px do fundo da foto (Figma)
  const PHOTO_OFFSET = width * (2.5 / 393); // Figma: foto em left calc(50% + 2.5px), à direita do centro
  // Anel: asset REAL do elipse do Figma (node 1:319). O asset (600px) cobre o frame de 265
  // unidades; o círculo do anel dentro dele = 228. Renderizando a imagem em PHOTO·265/228, o
  // círculo do anel fica = PHOTO (bate exatamente com a borda da foto; o traço fica centrado,
  // extravasando um pouco pra fora, como no Figma).
  const RING_IMG = PHOTO * (265.005 / 228);

  // ── Último scan real do usuário logado (Niks score + 6 métricas + foto) ───────
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [skinScore, setSkinScore] = useState<number | null>(null);
  const [metricas, setMetricas] = useState<Metricas>(null);

  // Trocar a foto da home: galeria → tela de ajuste (enquadramento no círculo da home).
  // `allowsEditing: false` de propósito — com `true` o iOS abre o "Move and scale" nativo,
  // que recorta QUADRADO e não mostra o formato circular real. O enquadramento é nosso.
  // A foto crua viaja pelo store (regra do projeto: nunca por router params).
  const pickHomePhoto = useCallback(async () => {
    haptics.tap();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1, // sem perda aqui; a compressão acontece depois do recorte
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    setHomePhotoDraft({ uri: a.uri, width: a.width, height: a.height });
    router.push('/(foto)/ajustar-foto');
  }, [router, setHomePhotoDraft]);

  // ── Dica do dia — fila numerada, avança a cada DIA DE USO (lib/dicas/dicaDoDia) ─
  // Começa na dica 1 para nunca existir card vazio enquanto o AsyncStorage é lido.
  const [dica, setDica] = useState<Dica>(CATALOGO_DICAS[0]);

  // "Para você" — 2 primeiros produtos recomendados (reais), resolvidos por produto_id.
  const [featured, setFeatured] = useState<{ productId: string; imagemUrl: string }[]>([]);

  // A dica não depende de login nem de scan — efeito próprio, resolvido em cada foco
  // (getDicaDoDia só anda na fila quando o dia civil vira).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getDicaDoDia().then((d) => { if (active) setDica(d); });
      return () => { active = false; };
    }, [])
  );

  // ── Carga da home, cacheada ──────────────────────────────────────────────
  // Antes: 4–5 requisições SEQUENCIAIS a cada foco da aba, sem nenhuma guarda —
  // era a principal causa da home "recarregar" toda vez. Agora o resultado inteiro
  // é uma entrada de cache só: a tela abre com os dados da última visita e revalida
  // por trás. As 3 primeiras consultas viraram PARALELAS (não dependem entre si);
  // só `produtos` precisa esperar, porque depende dos ids da recomendação.
  const fetchHome = useCallback(async () => {
    const userId = await getUserId();
    if (!userId) throw new Error('sem sessão');

    const [scanRes, userRes, recRes] = await Promise.all([
      // Último scan (score + métricas + foto)
      supabase
        .from('skin_scans')
        .select('foto_url, full_result')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Foto escolhida pela usuária na galeria (se houver) — ver precedência abaixo.
      supabase
        .from('users')
        .select('foto_home_url')
        .eq('id', userId)
        .maybeSingle(),
      // "Para você": 2 primeiros produtos recomendados (principal de cada passo, na
      // ordem do JSON), resolvidos contra `produtos` num único select.
      supabase
        .from('recomendacoes_produtos')
        .select('recomendacao')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    const data = scanRes.data;
    const userRow = userRes.data;
    const passos: any[] = Array.isArray(recRes.data?.recomendacao) ? recRes.data!.recomendacao : [];
    const firstIds: string[] = [];
    for (const p of passos) {
      if (p?.sem_produto) continue;
      const prods = p?.produtos ?? [];
      const principal = prods.find((x: any) => x?.principal) ?? prods[0];
      if (principal?.produto_id) firstIds.push(principal.produto_id);
      if (firstIds.length >= 2) break;
    }
    let feat: { productId: string; imagemUrl: string }[] = [];
    if (firstIds.length) {
      const { data: prods } = await supabase
        .from('produtos')
        .select('id, imagem_url')
        .in('id', firstIds);
      const byId = new Map((prods ?? []).map((p: any) => [p.id, p]));
      feat = firstIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((p: any) => ({ productId: p.id, imagemUrl: p.imagem_url }));
    }

    const full = (data?.full_result ?? null) as FullResult | null;
    return {
      // ⚠️ Precedência ABSOLUTA da foto escolhida na galeria: uma vez que a usuária
      // escolhe uma, novos scans NUNCA mais trocam a foto da home. A única forma de
      // trocar é tocar na foto e escolher outra (→ `(foto)/ajustar-foto`). Intencional.
      fotoUrl: userRow?.foto_home_url ?? data?.foto_url ?? null,
      skinScore: typeof full?.skin_score === 'number' ? full.skin_score : null,
      metricas: full?.metricas ?? null,
      featured: feat,
    };
  }, []);

  const { data: homeData, state: homeState } = useCachedQuery(
    userId ? `home:${userId}` : null,
    fetchHome,
    { enabled: Boolean(userId) },
  );

  // Pré-carregamento: enquanto `homeData` não chegou (sessão + cache do disco + rede),
  // mostramos skeletons no lugar dos placeholders vazios. Assim que os dados carregam,
  // `homeData` vira um objeto (mesmo para quem nunca escaneou — aí some o skeleton e
  // aparece o estado real de "faça seu primeiro scan"). Ver components/Skeleton.tsx.
  // Em erro na 1ª carga (sem rede e sem cache), cai no placeholder em vez de pulsar
  // pra sempre — `homeState` só é 'error' quando não há nada para mostrar.
  const loading = homeData == null && homeState !== 'error';

  useEffect(() => {
    if (!homeData) return;
    setFotoUrl(homeData.fotoUrl);
    setSkinScore(homeData.skinScore);
    setStoreSkinScore(homeData.skinScore); // navbar (logo central) usa o mesmo tema de cor
    setMetricas(homeData.metricas);
    setFeatured(homeData.featured);
  }, [homeData, setStoreSkinScore]);

  // Card de métricas (Figma node 1:63 = 374×187). Escala proporcional pela largura
  // real do card (largura da tela − 2×margin de 12) para casar 1:1 com o Figma.
  const MS = (width - 24) / 374;
  const COLS = [21, 149, 277].map((x) => x * MS); // x das 3 colunas (esq. de cada métrica)

  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold,
    Nunito_700Bold,
    Nunito_600SemiBold,
    Exo2_700Bold,
    Lato_400Regular,
  });

  // Aliases — fallback undefined evita flash de layout enquanto carrega
  const fXBold = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold  = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const fSemi  = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const fExo   = fontsLoaded ? 'Exo2_700Bold' : undefined;
  const fLato  = fontsLoaded ? 'Lato_400Regular' : undefined;

  // Tema de cor pela faixa do Niks score (réplica das 4 variações do Figma)
  const theme = getScoreTheme(skinScore);

  // Usuária LEGADA: já escaneou (tem score), mas o scan é anterior ao deploy das 6
  // métricas — o `full_result` dela não tem o campo `metricas`. A própria ausência do
  // campo é a flag; não há coluna nem migration para isso. Distingue-se de quem nunca
  // escaneou (`skinScore == null`), que já tem o placeholder da foto.
  const legacyScan = skinScore != null && metricas == null;


  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Fundo gradiente branco → tom do tema atrás do score + foto (muda por faixa
            de score, como no Figma). Última parada = cor da página (#F9F9F9), que fica
            atrás do card de métricas, fundindo sem borda dura. */}
        <LinearGradient
          colors={['#FFFFFF', '#FFFFFF', theme.heroSoft, theme.heroMed, '#F9F9F9']}
          locations={[0, 0.5, 0.72, 0.82, 1]}
          style={styles.heroGradient}
          pointerEvents="none"
        />

        <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
          {/* ── Niks score ─────────────────────────────────────────────── */}
          <View style={styles.scoreBlock}>
            <Image source={theme.logo} style={[styles.scoreLogo, { width: LOGO, height: Math.round(LOGO * (199 / 196)) }]} />
            {loading ? (
              <Skeleton style={{ width: 92, height: 56, borderRadius: 16, marginTop: 8, marginBottom: 6 }} />
            ) : (
              <Text style={[styles.scoreNumber, { fontFamily: fXBold, color: theme.score }]}>{skinScore != null ? skinScore : '—'}</Text>
            )}
            <Text style={[styles.scoreLabel, { fontFamily: fXBold }]}>Niks score</Text>
            <Image
              source={theme.underline}
              style={styles.scoreUnderline}
              resizeMode="stretch"
            />
          </View>

          {/* ── Foto circular + anel colorido por tema (recriado em código) ──
              Com scan: rosto do último scan. Sem scan: placeholder neutro + ícone. */}
          <View style={styles.photoWrap}>
            {/* Tocar na foto → galeria → tela de ajuste. O TouchableOpacity envolve o View
                dimensionado POR FORA: o `photoCircle` tem `overflow: 'hidden'`, que já deu
                problema de toque no New Architecture neste projeto.
                ⚠️ O card de métricas cobre os 40px de baixo da foto (zIndex maior, como no
                Figma), então essa faixa não recebe toque — é esperado, não mexer no zIndex. */}
            <TouchableOpacity
              onPress={pickHomePhoto}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Trocar a foto do perfil"
              style={{ width: PHOTO, height: PHOTO, transform: [{ translateX: PHOTO_OFFSET }] }}
            >
              {/* Foto (círculo interno) */}
              <View style={[styles.photoCircle, { width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2 }]}>
                {loading ? (
                  <Skeleton style={{ width: '100%', height: '100%', borderRadius: PHOTO / 2 }} />
                ) : fotoUrl ? (
                  <Image source={{ uri: fotoUrl }} style={styles.photo} resizeMode="cover" />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <ScanFace size={PHOTO * 0.26} color="#F3A9A6" strokeWidth={1.6} />
                  </View>
                )}
              </View>
              {/* Anel = asset REAL do elipse do Figma (node 1:319) com centro transparente,
                  sobreposto à foto. Centrado; o círculo do anel = PHOTO, traço centrado na borda. */}
              <Image
                source={theme.ringImg}
                style={{
                  position: 'absolute',
                  width: RING_IMG, height: RING_IMG,
                  left: (PHOTO - RING_IMG) / 2, top: (PHOTO - RING_IMG) / 2,
                }}
              />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* ── Card de métricas (sobrepõe os 40px de baixo da foto, como no Figma) ──
            Réplica pixel-perfect do node 1:63: 3 colunas absolutas em x=21/149/277,
            2 linhas. Cada métrica = label (Lato) + valor (Exo 2 Bold) + barra.

            TOCAR NO CARD = compartilhar (substituiu o link "Compartilhar" que ficava
            embaixo dele). O TouchableOpacity envolve o card POR FORA e carrega só a
            posição (margens + zIndex): o card em si tem `overflow: 'hidden'`, que já
            causou problema de toque no New Architecture neste projeto. Como o wrapper
            não tem filhos em fluxo normal além do próprio card, a grade absoluta do
            node 1:63 não se move. */}
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={skinScore == null}
          accessibilityRole="button"
          accessibilityLabel="Compartilhar minhas métricas"
          style={[styles.metricsCardTouch, { marginTop: -CARD_OVERLAP }]}
          onPress={() => { haptics.tap(); router.push('/(share)/share-capture' as any); }}
        >
        <View style={[styles.metricsCard, { height: 187 * MS }]}>
          {/* Wrapper absoluto que PREENCHE o card: as métricas seguem posicionadas pelas
              coordenadas do Figma (left/top a partir de 0), idêntico a antes. Existe só
              para apagar as 6 de uma vez no estado legado, virando fundo do aviso. */}
          <View style={[StyleSheet.absoluteFill, legacyScan && { opacity: 0.22 }]}>
          {METRIC_DEFS.map((m, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const twoLine = m.label.includes('\n');
            // tops (Figma, node 1:63) — label sobe para 91 quando tem 2 linhas
            const labelTop = row === 0 ? 17 : twoLine ? 91 : 101;
            const numTop = row === 0 ? 34.24 : 118.24;
            const trackTop = row === 0 ? 71.85 : 155.85;
            // valor real do último scan (null = sem dado → "—" + barra vazia)
            const v = metricas?.[m.key] ?? null;
            const fill = v == null ? 0 : v / 100;
            const barColor = v == null ? 'transparent' : metricColor(v, m.positive);
            return (
              <View key={m.label} style={{ position: 'absolute', left: COLS[col], top: 0, width: 110 * MS, height: '100%' }}>
                <Text
                  numberOfLines={2}
                  style={{
                    position: 'absolute', left: 0, top: labelTop * MS, width: 110 * MS,
                    fontFamily: fLato, fontSize: 12.536 * MS, lineHeight: 14.5 * MS,
                    color: '#000000', letterSpacing: -0.2507 * MS,
                  }}
                >
                  {m.label}
                </Text>
                {loading ? (
                  <Skeleton style={{ position: 'absolute', left: 0, top: numTop * MS, width: 34 * MS, height: 24 * MS, borderRadius: 6 }} />
                ) : (
                  <Text
                    style={{
                      position: 'absolute', left: 0, top: numTop * MS,
                      fontFamily: fExo, fontSize: 28.206 * MS,
                      color: '#000000', letterSpacing: -0.5641 * MS, textTransform: 'uppercase',
                    }}
                  >
                    {v == null ? '—' : v}
                  </Text>
                )}
                <View
                  style={{
                    position: 'absolute', left: 0, top: trackTop * MS,
                    width: 76 * MS, height: 4.701 * MS, borderRadius: 40,
                    backgroundColor: '#F3F3F4', overflow: 'hidden',
                  }}
                >
                  <View style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: fill * 76 * MS, borderRadius: 40, backgroundColor: barColor }} />
                </View>
              </View>
            );
          })}
          </View>

          {/* Estado LEGADO: a usuária tem scan (logo, tem score), mas o scan é anterior
              às 6 métricas — `full_result.metricas` não existe. Sem esse aviso o card
              vira 6 travessões sem explicação. Os travessões ficam de fundo (opacity
              acima) e o scrim carrega a mensagem: mostram A FORMA do que ela desbloqueia.
              Sem CTA próprio de propósito — o botão "Escanear" já é fixo no rodapé. */}
          {legacyScan && (
            <View style={styles.metricsLock} pointerEvents="none">
              <Text style={[styles.metricsLockTitle, { fontFamily: fXBold, fontSize: 15 * MS }]}>
                Aprimoramos a análise de pele.
              </Text>
              <Text style={[styles.metricsLockBody, { fontFamily: fSemi, fontSize: 12.5 * MS, lineHeight: 17 * MS, marginTop: 6 * MS }]}>
                Faça um novo scan para desbloquear suas 6 novas métricas e ter uma análise mais precisa.
              </Text>
            </View>
          )}
        </View>
        </TouchableOpacity>

        {/* ── Dica do dia (toca para expandir o conteúdo) ─────────────────
            Colapsado: eyebrow + título (o gancho). Expandido: nas receitas, os
            ingredientes e o preparo vêm ANTES do corpo. O campo `fonte` do catálogo
            é auditoria interna — nunca é renderizado. */}
        <TouchableOpacity activeOpacity={0.85} style={styles.tipCard} onPress={toggleTip}>
          <View style={styles.tipHeader}>
            <View style={styles.tipIconBox}>
              <Lightbulb size={24} color="#121212" strokeWidth={2} />
            </View>
            <View style={styles.tipTexts}>
              {/* A frase é escrita aqui, não lida do catálogo: lá o `eyebrow` é 'DICA DO DIA'
                  (caixa alta, uniforme nas 26 dicas) e a caixa certa na UI é "Dica do Dia" —
                  que nenhum textTransform produz ('capitalize' maiusculiza o "do"). */}
              <Text style={[styles.tipKicker, { fontFamily: fXBold }]} numberOfLines={1}>
                Dica do Dia
              </Text>
              <Text
                style={[styles.tipTitle, { fontFamily: fXBold }]}
                numberOfLines={tipOpen ? undefined : 2}
              >
                {dica.titulo}
              </Text>
            </View>
            {tipOpen
              ? <ChevronUp size={20} color="#B5B5B5" strokeWidth={2.5} />
              : <ChevronDown size={20} color="#B5B5B5" strokeWidth={2.5} />}
          </View>

          {tipOpen && (
            <View style={styles.tipBody}>
              {!!dica.ingredientes?.length && (
                <View style={styles.tipSection}>
                  <Text style={[styles.tipBlockLabel, { fontFamily: fBold }]}>Ingredientes</Text>
                  {dica.ingredientes.map((item, i) => (
                    <View key={i} style={styles.tipListRow}>
                      <View style={styles.tipBullet} />
                      <Text style={[styles.tipListText, { fontFamily: fSemi }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!!dica.preparo?.length && (
                <View style={styles.tipSection}>
                  <Text style={[styles.tipBlockLabel, { fontFamily: fBold }]}>Preparo</Text>
                  {dica.preparo.map((passo, i) => (
                    <View key={i} style={styles.tipListRow}>
                      <Text style={[styles.tipStepNumber, { fontFamily: fBold }]}>{i + 1}</Text>
                      <Text style={[styles.tipListText, { fontFamily: fSemi }]}>{passo}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* "Por que fazer" existe em TODA dica — receita ou não. É a anatomia fixa
                  do card: a usuária sempre sabe onde procurar o motivo. */}
              <View style={styles.tipSection}>
                <Text style={[styles.tipBlockLabel, { fontFamily: fBold }]}>Por que fazer</Text>
                <Text style={[styles.tipParagraph, { fontFamily: fSemi }]}>{dica.corpo}</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Para você — 2 primeiros produtos recomendados (reais) ──────────
            Toque abre direto o detalhe do produto na tela de recomendação. */}
        {featured.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { fontFamily: fBold }]}>Para você</Text>
            <View style={styles.productsRow}>
              {featured.map((f) => (
                <TouchableOpacity
                  key={f.productId}
                  activeOpacity={0.9}
                  style={styles.productCard}
                  onPress={() => {
                    haptics.tap();
                    setProductDetailTarget(f.productId);
                    router.push('/recomendacao-produtos' as any);
                  }}
                >
                  <ExpoImage source={{ uri: f.imagemUrl }} style={styles.productImg} contentFit="contain" />
                </TouchableOpacity>
              ))}
              {/* completa a linha se só houver 1 produto (mantém o card à esquerda) */}
              {featured.length === 1 && <View style={[styles.productCard, { opacity: 0 }]} pointerEvents="none" />}
            </View>
          </>
        )}

      </ScrollView>

      {/* ── Botão Escanear — fixo, logo acima da tab bar (não rola com o conteúdo) ──
          bottom = BAR_HEIGHT da navbar (80px, node 1:27) + 12px de respiro. */}
      <View style={styles.scanWrap} pointerEvents="box-none">
        <TouchableOpacity activeOpacity={0.9} onPress={() => { haptics.action(); startFaceScan(); }}>
          <LinearGradient
            colors={['#FF9D9D', '#FF9D9D']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.scanBtn}
          >
            <ScanFace size={22} color="#FFFFFF" strokeWidth={2} />
            <Text style={[styles.scanText, { fontFamily: fBold }]}>Escanear</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9F9F9' },
  scroll: { flex: 1, backgroundColor: '#F9F9F9' },
  // paddingBottom = navbar (80) + botão fixo (48, bottom 108) + respiros → conteúdo rola livre atrás do botão
  content: { paddingBottom: 186 },

  heroGradient: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 520,
  },

  // Score
  scoreBlock: { alignItems: 'center', paddingTop: 2 },
  scoreLogo: { resizeMode: 'contain' }, // tamanho definido inline (LOGO, proporcional à largura)
  scoreNumber: { fontSize: 72, color: '#121212', letterSpacing: -2.88, marginTop: 2 },
  scoreLabel: { fontSize: 30.5, color: '#121212', letterSpacing: -1.2, marginTop: -14 },
  scoreUnderline: { width: 160, height: 7, marginTop: 3 },

  // Foto
  photoWrap: { alignItems: 'center', marginTop: 10, width: '100%', zIndex: 1 },
  photoCircle: {
    overflow: 'hidden',
    backgroundColor: '#F3F3F4',
    // Só a foto (círculo). O anel é uma Image sobreposta (asset real do elipse do Figma,
    // node 1:319) — ver render. `profile-photo.png` não é mais usado.
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },

  // Métricas — card réplica do node 1:63. Sem padding: as métricas são posicionadas
  // absolutamente pelas coordenadas do Figma (ver render). overflow hidden = "overflow-clip".
  // Wrapper tocável (compartilhar): carrega SÓ a posição do card. A `marginHorizontal: 12`
  // é a mesma do card "Dica do dia" — as duas caixas têm a mesma largura de propósito.
  metricsCardTouch: {
    marginHorizontal: 12,
    zIndex: 2,
  },
  metricsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E3E3E6',
    borderRadius: 16,
    overflow: 'hidden',
  },

  // Aviso do estado legado — scrim sobre as métricas fantasmas, DENTRO do card (que já
  // tem overflow:hidden + borderRadius 16, então se recorta sozinho). Não altera a altura
  // do card nem a grade absoluta do node 1:63 — é sobreposição pura.
  metricsLock: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  metricsLockTitle: { color: '#121212', textAlign: 'center', letterSpacing: -0.3 },
  metricsLockBody: { color: '#818181', textAlign: 'center' },

  // Dica do dia — mesma casca do antigo card de skincare (borda, sombra, chip 62×62,
  // expansão por LayoutAnimation). Só o conteúdo mudou.
  tipCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E3E3E6',
    borderRadius: 18,
    marginHorizontal: 12, marginTop: 16,
    paddingHorizontal: 12, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },
  tipHeader: { flexDirection: 'row', alignItems: 'center' },
  tipIconBox: {
    width: 68, height: 68, borderRadius: 15,
    backgroundColor: '#F9F9F9',
    alignItems: 'center', justifyContent: 'center',
  },
  tipTexts: { flex: 1, marginLeft: 12, marginRight: 8 },
  // "Dica do dia" — NÃO é um eyebrow: mesma tipografia do título (Nunito ExtraBold 17),
  // só que em rosa. Faz parte do texto, não é uma etiqueta.
  tipKicker: { fontSize: 17, lineHeight: 23, color: '#FF9D9D', letterSpacing: -0.5 },
  tipTitle: { fontSize: 17, lineHeight: 23, color: '#121212', letterSpacing: -0.5 },
  // Conteúdo expandido — alinhado à coluna do título (chip 68 + gap 12 = 80).
  // Anatomia fixa: INGREDIENTES + PREPARO (só receitas) + POR QUE FAZER (todas as dicas).
  tipBody: { marginTop: 14, paddingLeft: 80, paddingRight: 4, paddingBottom: 4 },
  tipSection: { marginBottom: 16 },
  tipBlockLabel: {
    fontSize: 12, color: '#121212', letterSpacing: 0.3,
    textTransform: 'uppercase', marginBottom: 8,
  },
  tipListRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  tipBullet: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#FF9D9D',
    marginTop: 8, marginRight: 10,
  },
  // Número do passo do preparo — largura fixa para os textos alinharem numa coluna só
  tipStepNumber: {
    width: 14, marginRight: 8,
    fontSize: 14, lineHeight: 20, color: '#FF9D9D', letterSpacing: -0.2,
  },
  tipListText: { flex: 1, fontSize: 14, lineHeight: 20, color: '#515151', letterSpacing: -0.2 },
  tipParagraph: { fontSize: 14, lineHeight: 21, color: '#515151', letterSpacing: -0.2 },

  // Para você
  sectionTitle: { fontSize: 20, color: '#121212', letterSpacing: -0.8, marginTop: 22, marginLeft: 16 },
  productsRow: { flexDirection: 'row', gap: 8, marginTop: 14, paddingHorizontal: 16 },
  productCard: {
    flex: 1, height: 142,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E3E3E6',
    borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  productImg: { height: 120, width: '55%' },

  // Escanear — fixo acima da tab bar (80px de altura, node 1:27)
  scanWrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 108,
    alignItems: 'center',
  },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 48, width: 134, borderRadius: 42,
    shadowColor: '#FF9D9D', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 12, elevation: 6,
  },
  scanText: { fontSize: 16, color: '#FFFFFF' },
});
