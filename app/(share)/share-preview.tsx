import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, Image, TouchableOpacity, useWindowDimensions, Alert,
  ActivityIndicator, PixelRatio,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { ChevronLeft, Share2, Download, Sparkles } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useAppStore } from '../../store/onboarding';
import { supabase } from '../../lib/supabase';
import { getUserId } from '../../lib/currentUser';
import NiksStickerView from '../../components/NiksStickerView';
import StickerSheet from '../../components/share/StickerSheet';
import { haptics } from '../../lib/haptics';
import { Metricas, hasMetrics, availableKeys } from '../../lib/metricDefs';
import { useStickerFonts } from '../../lib/stickerFonts';
import {
  StickerSpec, StickerPose, SPEC_SCORE_ONLY,
  stickerAspect, stickerBaseFraction, specId, normalizeSpec,
} from '../../lib/stickerSpec';

// ── Preview da colagem + exportação 1080×1920 ─────────────────────────────────
// Bloco D. As fotos chegam pelo store (`collagePhotos`) — nunca por router params.

const WHITE    = '#FFFFFF';
const INK      = '#121212';
const INK_MUTE = '#818181';
const CORAL    = '#FF9D9D';
const CARD_BD  = '#E3E3E6';

// ⚠️ O tamanho inicial do adesivo NÃO é mais uma constante em pontos: cada forma tem
// sua largura-base como FRAÇÃO da colagem (`stickerBaseFraction`), porque um valor
// fixo em pt ocuparia proporcionalmente mais foto num iPhone SE que num Pro Max.
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.9;

// ── Resolução da exportação ───────────────────────────────────────────────────
// O nativo do view-shot faz:
//   size = options.width/height (em PONTOS) ?? view.bounds.size
//   UIGraphicsBeginImageContextWithOptions(size, NO, 0)   // 0 = escala da TELA
// Logo: pixels de saída = size(pt) × escalaDaTela. Passar width:1080 seria 1080
// PONTOS × 3 = 3240px — errado. A forma correta de sair EXATAMENTE em 1080×1920 px,
// sem reamostrar nada, é dar à view de export um tamanho em PONTOS que, multiplicado
// pela escala do device, dê 1080×1920 — e capturar SEM passar width/height.
const PX = PixelRatio.get();          // 3 no iPhone deste projeto
const EXPORT_W = 1080 / PX;           // 360pt @3x · 540pt @2x
const EXPORT_H = 1920 / PX;           // 640pt @3x · 960pt @2x  (mantém 9:16)

// `StickerPose` (nx/ny/nW, tudo em fração da colagem) mora em `lib/stickerSpec` —
// preview, export e a matemática de clamp precisam do MESMO tipo. ⚠️ O campo era
// `nSize` e assumia adesivo quadrado; virou `nW` (só a largura) quando entrou o
// adesivo em card, cuja altura sai de `stickerAspect(spec)`.

// ── Colagem ───────────────────────────────────────────────────────────────────
// UMA única fonte de layout, parametrizada por `width`. O preview e a view de export
// renderizam ESTE mesmo componente com larguras diferentes — é isso que garante que a
// imagem exportada seja o que a usuária vê, e não uma segunda implementação que derrapa.
// Linhas com `flex: 1` (sem flexWrap) — mesma lição do Bloco A.
function Collage({
  photos, width, gap, skinScore, metricas, spec, pose,
}: {
  photos: string[];
  width: number;
  gap: number;
  skinScore: number | null;
  metricas: Metricas;
  spec: StickerSpec;
  pose: StickerPose | null; // null = não desenha o adesivo (o preview usa o interativo)
}) {
  const height = (width * 16) / 9;

  // Layout adaptativo: 1 = inteira · 2 = faixas empilhadas · 3 = larga em cima +
  // duas embaixo · 4 = grid 2×2. Cada sub-array é uma linha de células.
  const rows: number[][] =
    photos.length === 1 ? [[0]]
    : photos.length === 2 ? [[0], [1]]
    : photos.length === 3 ? [[0], [1, 2]]
    : [[0, 1], [2, 3]];

  // Largura do adesivo nesta escala; a altura vem da proporção da FORMA escolhida
  // (1 no círculo, baseW/baseH no card).
  const sw = pose ? pose.nW * width : 0;
  const sh = sw / stickerAspect(spec);

  return (
    <View style={{ width, height, backgroundColor: WHITE, overflow: 'hidden' }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flex: 1, flexDirection: 'row', marginTop: r === 0 ? 0 : gap }}>
          {row.map((idx, c) => (
            <View
              key={idx}
              style={{ flex: 1, marginLeft: c === 0 ? 0 : gap, backgroundColor: '#F3F3F4' }}
            >
              <Image
                source={{ uri: photos[idx] }}
                resizeMode="cover" // nunca esticada
                style={{ width: '100%', height: '100%' }}
              />
            </View>
          ))}
        </View>
      ))}

      {/* Adesivo — posição/tamanho vêm das FRAÇÕES, então acompanham a escala: o
          mesmo enquadramento vale no preview (349pt) e no export (360pt). */}
      {pose && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: width / 2 - sw / 2 + pose.nx * width,
            top: height / 2 - sh / 2 + pose.ny * height,
          }}
        >
          <NiksStickerView spec={spec} skinScore={skinScore} metricas={metricas} width={sw} />
        </View>
      )}
    </View>
  );
}

export default function SharePreview() {
  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold, Nunito_700Bold });
  const f8 = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const f7 = fontsLoaded ? 'Nunito_700Bold' : undefined;
  // Carrega as fontes dos adesivos AQUI, no topo da tela: assim as ~14 miniaturas da
  // bandeja já nascem com as fontes prontas (o useFonts do expo-font resolve o estado
  // inicial de forma síncrona) — sem flash de fonte de sistema na grade.
  useStickerFonts();

  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const S = width / 393;

  const collagePhotos = useAppStore((s) => s.collagePhotos);
  const photos = collagePhotos.slice(0, 4);

  // Geometria do preview (mesma conta da share-capture) — antes do state, porque a
  // pose inicial do adesivo depende dela.
  const H_MARGIN     = 16 * S;
  const HEADER_H     = 52 * S;
  const BUTTON_BLOCK = 48 * S + 48 * S + 40 * S; // dois botões + respiros
  // Bloco ABAIXO do preview, dentro da mesma área central: pílula "Trocar adesivo"
  // (38 + marginTop 12) + hint (~16 + marginTop 8). ⚠️ Tem de ser descontado do espaço
  // vertical, senão a colagem 9:16 (bem alta) transborda a área centralizada e cobre o
  // header ("Seu Niks score") — foi o bug desta tela.
  const SUBCAP_BLOCK = 38 * S + 12 * S + 16 * S + 8 * S;
  // ⚠️ `Math.min(width, 393)`: o contêiner desta tela tem `maxWidth: 393`. Sem o teto,
  // numa tela larga o preview passaria de 393 e seria RECORTADO pelo pai, enquanto a
  // view de export continuaria inteira — preview e arquivo exportado divergiriam.
  const availW = Math.min(width, 393) - H_MARGIN * 2;
  const availH = height - insets.top - insets.bottom - HEADER_H - BUTTON_BLOCK - SUBCAP_BLOCK - 16 * S;
  const PREVIEW_W = Math.min(availW, (availH * 9) / 16);
  const PREVIEW_H = (PREVIEW_W * 16) / 9;
  const GAP = 2 * S;
  // O gap tem de ser a MESMA fração da largura nas duas escalas, senão a colagem
  // exportada sairia com linhas mais grossas/finas que a da tela.
  const EXPORT_GAP = (GAP / PREVIEW_W) * EXPORT_W;

  const [skinScore, setSkinScore] = useState<number | null>(null);
  const [metricas, setMetricas] = useState<Metricas>(null);
  const [loaded, setLoaded] = useState(false); // fetch do scan concluído

  // Adesivo escolhido — vive no store para sobreviver ao vai-e-vem com share-capture.
  const stickerSpec = useAppStore((s) => s.stickerSpec);
  const setStickerSpec = useAppStore((s) => s.setStickerSpec);
  const stickerSheetSeen = useAppStore((s) => s.stickerSheetSeen);
  const setStickerSheetSeen = useAppStore((s) => s.setStickerSheetSeen);
  // ⚠️ NORMALIZAR aqui é o que mantém a proporção honesta. `stickerAspect` conta as
  // chaves do spec, mas o adesivo só desenha as que têm número — uma chave sem dado
  // faria o container reservar uma altura e o card desenhar outra, e aí o export
  // divergiria do preview. Normalizado, `spec.keys` = exatamente o que será desenhado.
  const spec = useMemo(
    () => normalizeSpec(stickerSpec ?? SPEC_SCORE_ONLY, availableKeys(metricas)),
    [stickerSpec, metricas],
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  // Largura-base e proporção do adesivo ATUAL, em pontos do preview. Derivadas no
  // render (nunca lendo shared value, que é da UI thread).
  const { baseW, aspect } = useMemo(() => ({
    baseW: stickerBaseFraction(spec) * PREVIEW_W,
    aspect: stickerAspect(spec),
  }), [specId(spec), PREVIEW_W]);

  // Pose inicial: adesivo centrado (nx/ny = 0), na largura-base da forma atual.
  // ⚠️ Semear a partir do adesivo GUARDADO, não de `SPEC_SCORE_ONLY`: voltando de
  // `share-capture` com um card escolhido, a fração do círculo (0.37) desenharia o
  // card do export menor que o do preview no primeiro frame (o efeito de troca corrige
  // logo em seguida, mas o export não deve depender disso).
  const [pose, setPose] = useState<StickerPose>(() => ({
    nx: 0, ny: 0, nW: stickerBaseFraction(stickerSpec ?? SPEC_SCORE_ONLY),
  }));
  const [busy, setBusy] = useState<null | 'share' | 'save'>(null);

  const exportRef = useRef<View>(null);
  const shareRef = useRef(false); // guards anti-duplo-toque (Decisão 25)
  const saveRef  = useRef(false);

  // Niks score + as 6 métricas do último scan — mesma consulta que a home faz.
  // ⚠️ As `metricas` eram lidas e DESCARTADAS aqui; é por isso que o adesivo só sabia
  // mostrar o score. Sem elas a bandeja inteira não teria o que desenhar.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        // `getUserId()` lê a sessão local; `supabase.auth.getUser()` é ida à rede.
        const uid = await getUserId();
        if (!uid || !active) { if (active) setLoaded(true); return; }
        const { data } = await supabase
          .from('skin_scans')
          .select('full_result')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!active) return;
        const full = data?.full_result as { skin_score?: number; metricas?: Metricas } | null;
        setSkinScore(typeof full?.skin_score === 'number' ? full.skin_score : null);
        setMetricas(full?.metricas ?? null);
        setLoaded(true);
      })();
      return () => { active = false; };
    }, [])
  );

  // ── Gestos: pan + pinch, em pontos do PREVIEW ───────────────────────────────
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const savedScale = useSharedValue(1);

  // Largura-base e proporção do adesivo atual, espelhadas para a UI thread. Shared
  // values (e não closure) porque o clamp roda em worklet: hoje o gesture é
  // reconstruído a cada render e uma closure funcionaria, mas basta alguém memoizar
  // o gesture no futuro para o worklet passar a ler valores velhos, silenciosamente.
  const baseWSV = useSharedValue(baseW);
  const aspectSV = useSharedValue(aspect);

  // O adesivo não pode sair da colagem. Agora com as DUAS dimensões separadas: um
  // card 312×268 tem altura bem maior que a largura e um clamp quadrado o deixaria
  // furar a borda de cima e de baixo.
  const clampPose = (
    x: number, y: number, sc: number
  ): { x: number; y: number } => {
    'worklet';
    const w = baseWSV.value * sc;
    const h = w / aspectSV.value;
    const maxX = Math.max(0, (PREVIEW_W - w) / 2);
    const maxY = Math.max(0, (PREVIEW_H - h) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const commit = useCallback((x: number, y: number, sc: number) => {
    setPose({
      nx: x / PREVIEW_W,
      ny: y / PREVIEW_H,
      nW: (baseW * sc) / PREVIEW_W,
    });
  }, [PREVIEW_W, PREVIEW_H, baseW]);

  const pan = Gesture.Pan()
    // ⚠️ Ancorar no INÍCIO do pan, não só no fim. Como pan e pinch são simultâneos, o
    // `onEnd` do pinch (e o reposicionamento que ele faz ao re-clampar) mexia em
    // `tx/savedTx` com o pan ainda ativo; o `e.translationX` seguinte já vinha somado
    // desde o começo do arrasto e o adesivo PULAVA a distância já percorrida ao
    // levantar um dedo e continuar arrastando com o outro.
    .onStart(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate((e) => {
      const p = clampPose(savedTx.value + e.translationX, savedTy.value + e.translationY, scale.value);
      tx.value = p.x;
      ty.value = p.y;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      runOnJS(commit)(tx.value, ty.value, scale.value);
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const sc = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
      scale.value = sc;
      // Reprende: ao crescer, o adesivo pode passar a furar a borda.
      const p = clampPose(tx.value, ty.value, sc);
      tx.value = p.x;
      ty.value = p.y;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      runOnJS(commit)(tx.value, ty.value, scale.value);
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const stickerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  // ── Troca de adesivo ────────────────────────────────────────────────────────
  // Preserva a posição, RESETA a escala. O reset é obrigatório, não estético: um card
  // de 312×268 herdando a escala 1.9 de um círculo estouraria a colagem inteira.
  // ⚠️ O clamp aqui usa os números LOCAIS (`baseW`/`aspect`), não `baseWSV.value` —
  // ler o shared value recém-escrito dependeria da ordem de propagação JS→UI thread.
  useEffect(() => {
    baseWSV.value = baseW;
    aspectSV.value = aspect;
    scale.value = 1;
    savedScale.value = 1;

    const maxX = Math.max(0, (PREVIEW_W - baseW) / 2);
    const maxY = Math.max(0, (PREVIEW_H - baseW / aspect) / 2);
    const x = Math.min(maxX, Math.max(-maxX, tx.value));
    const y = Math.min(maxY, Math.max(-maxY, ty.value));
    tx.value = x;
    ty.value = y;
    savedTx.value = x;
    savedTy.value = y;

    setPose({ nx: x / PREVIEW_W, ny: y / PREVIEW_H, nW: baseW / PREVIEW_W });
    // ⚠️ As deps são todas PRIMITIVAS de propósito — não trocar por `[spec]`. O
    // `useFocusEffect` refaz o fetch a cada foco e gera um objeto `metricas` novo, o
    // que dá identidade nova ao `spec` sem que nada tenha mudado de fato; com `[spec]`
    // nas deps, voltar do share sheet do iOS RESETARIA a escala do adesivo.
  }, [specId(spec), baseW, aspect, PREVIEW_W, PREVIEW_H]);

  // ── A bandeja sobe sozinha ao chegar (uma vez por sessão) ───────────────────
  // Esperar o fetch é o que impede a grade de 14 miniaturas nascer toda com "—".
  // Os 350ms não são enfeite: abrir um <Modal> nativo durante a transição de push do
  // expo-router engasga a animação no iOS.
  useEffect(() => {
    if (stickerSheetSeen || !loaded || !photos.length) return;
    // Scan legado (sem as 6 métricas): a bandeja teria um item só. Não vale interromper.
    if (!hasMetrics(metricas)) { setStickerSheetSeen(true); return; }
    const t = setTimeout(() => {
      setSheetOpen(true);
      setStickerSheetSeen(true);
    }, 350);
    return () => clearTimeout(t);
  }, [loaded, metricas, photos.length, stickerSheetSeen, setStickerSheetSeen]);

  // ── Exportação ──────────────────────────────────────────────────────────────
  // Captura a view de EXPORT (EXPORT_W × EXPORT_H pt), não a do preview. Sem passar
  // width/height: o contexto nativo usa a escala da tela, então bounds × PX = 1080×1920 px.
  const capture = async (): Promise<string> => {
    return await captureRef(exportRef, {
      format: 'jpg',
      quality: 0.95,
      result: 'tmpfile',
    });
  };

  const handleShare = async () => {
    if (shareRef.current || !photos.length) return;
    haptics.action();
    shareRef.current = true;
    setBusy('share');
    try {
      const uri = await capture();
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Indisponível', 'Compartilhamento não está disponível neste device.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' });
    } catch (e) {
      console.error('Erro ao compartilhar:', e);
      Alert.alert('Erro', 'Não foi possível gerar a imagem.');
    } finally {
      shareRef.current = false;
      setBusy(null);
    }
  };

  const handleSave = async () => {
    if (saveRef.current || !photos.length) return;
    haptics.action();
    saveRef.current = true;
    setBusy('save');
    try {
      // Permissão pedida NO TOQUE, não antes.
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Sem permissão', 'Permita o acesso às fotos para salvar sua colagem.');
        return;
      }
      const uri = await capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Salvo!', 'Sua colagem foi salva na galeria.');
    } catch (e) {
      console.error('Erro ao salvar:', e);
      Alert.alert('Erro', 'Não foi possível salvar na galeria.');
    } finally {
      saveRef.current = false;
      setBusy(null);
    }
  };

  if (!photos.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: f7, color: INK_MUTE }}>Nenhuma foto para montar a colagem.</Text>
        <TouchableOpacity
          onPress={() => {
            haptics.tap();
            router.back();
          }}
          style={{ marginTop: 16 }}
        >
          <Text style={{ fontFamily: f7, color: CORAL }}>Voltar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

        {/* Header */}
        <View style={{ height: HEADER_H, paddingHorizontal: 24 * S, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => {
              haptics.tap();
              router.back();
            }}
            activeOpacity={0.7}
            style={{
              width: 40 * S, height: 40 * S, borderRadius: 100,
              backgroundColor: WHITE, borderWidth: 1, borderColor: CARD_BD,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={18 * S} color={INK} />
          </TouchableOpacity>
          <Text
            style={{
              flex: 1, marginRight: 40 * S, textAlign: 'center',
              fontFamily: f7, fontSize: 20 * S, color: INK, letterSpacing: -0.6 * S,
            }}
          >
            Seu Niks score
          </Text>
        </View>

        {/* Preview interativo */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              // Cantos RETOS, iguais aos da view de export (que não tem raio) — senão
              // a tela mostraria a colagem arredondada e a imagem sairia retangular.
              width: PREVIEW_W, height: PREVIEW_H,
              overflow: 'hidden', backgroundColor: WHITE,
            }}
          >
            {/* Fotos — mesmo componente/layout que o export usa */}
            <Collage
              photos={photos}
              width={PREVIEW_W}
              gap={GAP}
              skinScore={skinScore}
              metricas={metricas}
              spec={spec}
              pose={null} /* sem adesivo aqui — o interativo (animado) vai por cima */
            />

            {/* Adesivo interativo (pan + pinch). Fica FORA do <Collage> porque só ele
                é animado; o <Collage> do export desenha o adesivo já na pose final. */}
            <GestureDetector gesture={gesture}>
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    left: PREVIEW_W / 2 - baseW / 2,
                    top: PREVIEW_H / 2 - baseW / aspect / 2,
                  },
                  stickerStyle,
                ]}
              >
                <NiksStickerView
                  spec={spec}
                  skinScore={skinScore}
                  metricas={metricas}
                  width={baseW}
                />
              </Animated.View>
            </GestureDetector>
          </View>

          {/* ⚠️ O gatilho da bandeja é ESTA pílula, nunca o adesivo em si: ele já é
              alvo de pan+pinch, e um TouchableOpacity competindo com
              Gesture.Simultaneous dentro de um container `overflow: 'hidden'` é
              exatamente a combinação que já quebrou toque neste projeto. */}
          <TouchableOpacity
            onPress={() => { haptics.tap(); setSheetOpen(true); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Trocar adesivo"
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              height: 38 * S, paddingHorizontal: 16 * S, borderRadius: 100,
              borderWidth: 1, borderColor: CARD_BD, backgroundColor: WHITE,
              marginTop: 12 * S,
            }}
          >
            <Sparkles size={15 * S} color={CORAL} strokeWidth={2.2} />
            <Text style={{ fontFamily: f7, fontSize: 13 * S, color: INK, marginLeft: 7 * S }}>
              Trocar adesivo
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              fontFamily: f7, fontSize: 11 * S, color: INK_MUTE,
              marginTop: 8 * S, textAlign: 'center',
            }}
          >
            Arraste e belisque o adesivo para posicionar
          </Text>
        </View>

        {/* Botões */}
        <View style={{ paddingHorizontal: H_MARGIN, paddingBottom: 20 * S }}>
          <TouchableOpacity
            onPress={handleShare}
            disabled={busy != null}
            activeOpacity={0.85}
            style={{
              height: 48 * S, borderRadius: 100, backgroundColor: CORAL,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              opacity: busy != null ? 0.6 : 1,
            }}
          >
            {busy === 'share' ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <>
                <Share2 size={18 * S} color={WHITE} strokeWidth={2.2} />
                <Text style={{ fontFamily: f8, fontSize: 16 * S, color: WHITE, marginLeft: 8 * S }}>
                  Compartilhar
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSave}
            disabled={busy != null}
            activeOpacity={0.85}
            style={{
              height: 48 * S, borderRadius: 100, backgroundColor: WHITE,
              borderWidth: 1, borderColor: CARD_BD,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              marginTop: 10 * S, opacity: busy != null ? 0.6 : 1,
            }}
          >
            {busy === 'save' ? (
              <ActivityIndicator color={INK} />
            ) : (
              <>
                <Download size={18 * S} color={INK} strokeWidth={2.2} />
                <Text style={{ fontFamily: f8, fontSize: 16 * S, color: INK, marginLeft: 8 * S }}>
                  Salvar na galeria
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ── View de EXPORT — fora da tela, em tamanho de PONTOS tal que
            bounds × escalaDaTela = 1080×1920 px. Não é escalada nem reamostrada: é
            renderizada nativamente nesse tamanho, então o texto do adesivo sai
            vetorialmente nítido. `collapsable={false}` é obrigatório, senão o RN
            achata a View e o captureRef não acha nada para capturar. */}
        <View
          style={{ position: 'absolute', left: -10000, top: 0 }}
          pointerEvents="none"
        >
          <View ref={exportRef} collapsable={false} style={{ width: EXPORT_W, height: EXPORT_H }}>
            <Collage
              photos={photos}
              width={EXPORT_W}
              gap={EXPORT_GAP}
              skinScore={skinScore}
              metricas={metricas}
              spec={spec}
              pose={pose}
            />
          </View>
        </View>

        {/* ── Bandeja de adesivos ─────────────────────────────────────────────── */}
        <StickerSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onPick={setStickerSpec}
          selected={spec}
          skinScore={skinScore}
          metricas={metricas}
        />

      </View>
    </SafeAreaView>
  );
}
