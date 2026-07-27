import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Image, ScrollView,
  ActivityIndicator, PixelRatio, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { X, Image as ImageIcon, ChevronLeft, Camera as CameraIcon } from 'lucide-react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Device from 'expo-device';
import { captureRef } from 'react-native-view-shot';
import { useFonts } from 'expo-font';
import {
  Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold, Nunito_400Regular,
} from '@expo-google-fonts/nunito';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { haptics } from '../../lib/haptics';
import { ScanCollage, scanCollageHeight } from '../../components/scan/ScanCollage';

// ── Câmera do scan de pele MULTI-FOTO — versão DENTRO DO APP ────────────────────
//
// A usuária tira 6 fotos (4 expressões + 2 perfis). As 6 são obrigatórias; ao tirar
// a última, a tela monta 2 colagens e navega sozinha para o loading.
//
// ⚠️ `camera.tsx` (1 foto) continua sendo a câmera do ONBOARDING e NÃO deve ser
// alterada — o onboarding fica com 1 foto de propósito (menos atrito antes do
// paywall). São duas telas separadas pelo mesmo motivo que existem `scan-prep.tsx`
// e `scan-prep-app.tsx`.
//
// Por que 2 colagens em vez de 6 fotos: custo. 6 imagens seriam ~3x o custo de visão
// por scan. As colagens levam as MESMAS 6 fotos em 2 imagens. A foto neutra vai
// TAMBÉM sozinha em resolução cheia, porque a API de visão reduz qualquer imagem
// para ~768px no lado menor — dentro de uma colagem 2×2 cada rosto cairia para
// ~384px, e os achados finos (poros, textura, acne pequena) se perderiam.

const WHITE      = '#FFFFFF';
const INK        = '#121212';
const INK_MUTE   = '#818181';
const CORAL      = '#FF9D9D';
const CARD_BD    = '#E3E3E6';
const PLACEHOLDER = '#F3F3F4';

const MAX_SIDE = 1080;  // maior lado de cada foto guardada (memória: 6 fotos full estouram)
const TARGET   = 2048;  // lado maior de cada colagem exportada, em PIXELS

type StepId = 'neutra' | 'sorriso' | 'surpresa' | 'brava' | 'perfil_esq' | 'perfil_dir';

type Step = {
  id: StepId;
  title: string;
  hint: string;
  short: string;                  // rótulo curto, usado sob as células da revisão
  turn?: 'left' | 'right';        // desenha a seta direcional (só nos perfis)
};

// Ordem = ordem de captura = ordem das células nas colagens.
// Índices 0..3 → Layout A (2×2) · índices 4..5 → Layout B (2 perfis).
// Textos sempre no FEMININO — o público do app é feminino.
const STEPS: Step[] = [
  { id: 'neutra',     title: 'Expressão neutra', short: 'Neutra',   hint: 'Olhe para a câmera com o rosto relaxado, sem sorrir.' },
  { id: 'sorriso',    title: 'Sorrindo',         short: 'Sorrindo', hint: 'Dê um sorriso aberto, mostrando os dentes.' },
  { id: 'surpresa',   title: 'Surpresa',         short: 'Surpresa', hint: 'Faça cara de surpresa: levante bem as sobrancelhas e abra os olhos.' },
  { id: 'brava',      title: 'Brava',            short: 'Brava',    hint: 'Faça cara de brava: franza a testa e junte as sobrancelhas.' },
  { id: 'perfil_esq', title: 'Perfil esquerdo',  short: 'Perfil esq.', hint: 'Vire o rosto para a sua esquerda, sem mexer os ombros.', turn: 'left' },
  { id: 'perfil_dir', title: 'Perfil direito',   short: 'Perfil dir.', hint: 'Vire o rosto para a sua direita, sem mexer os ombros.',  turn: 'right' },
];

const TOTAL = STEPS.length;
const SHORT_LABELS = STEPS.map((s) => s.short);

// Geometria do export. ⚠️ `width`/`height` do captureRef são PONTOS, não pixels
// (decisão 28 do README): dimensiona-se a VIEW em pontos de forma que
// pontos × escala da tela = os pixels desejados, e captura-se SEM passar width/height.
const PX         = PixelRatio.get();
const EXPORT_W   = TARGET / PX;
const EXPORT_GAP = 8 / PX;

// Downscale para MAX_SIDE no maior lado. Só reencoda se de fato exceder.
// (mesma função de share-capture.tsx — o padrão da colagem do compartilhamento)
async function downscale(uri: string, w?: number, h?: number): Promise<string> {
  const longest = Math.max(w ?? 0, h ?? 0);
  const ops =
    longest > MAX_SIDE && w && h
      ? [{ resize: w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE } }]
      : [];
  const out = await ImageManipulator.manipulateAsync(uri, ops, {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.uri;
}

export default function CameraMulti() {
  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold, Nunito_400Regular,
  });
  const f8 = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const f7 = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const f6 = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const f4 = fontsLoaded ? 'Nunito_400Regular' : undefined;

  const router = useRouter();
  // Consentimento LGPD: vive nas telas de câmera para que toda rota nova o herde.
  const { consentGate } = useScanConsentGate();
  const setSkinScanImages = useAppStore((s) => s.setSkinScanImages);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { track } = useMixpanel();

  const [photos, setPhotos] = useState<(string | null)[]>(Array(TOTAL).fill(null));
  const [reviewOpen, setReviewOpen] = useState(false);
  const [building, setBuilding] = useState(false);

  const capturingRef = useRef(false); // mutex anti-duplo-toque (decisão 25)
  const doneRef = useRef(false);      // guard: monta/navega UMA vez só
  const refA = useRef<View>(null);
  const refB = useRef<View>(null);

  // Contador de <Image> já decodificadas nas views offscreen. Sem esperar por ele,
  // o captureRef pode capturar antes das fotos existirem e sair branco.
  const loadedRef = useRef(0);
  const bumpLoaded = useCallback(() => { loadedRef.current += 1; }, []);

  const isSimulator = !Device.isDevice;

  // Largura das colagens na revisão: tela − padding 24×2 da ScrollView − borda 1×2 do
  // frame. Derivada da tela (o app roda em 393pt e 402pt), nunca hardcoded.
  const { width: winW } = useWindowDimensions();
  const reviewW = Math.min(winW, 393) - 48 - 2;

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 14, step_name: 'Scan - Câmera (6 fotos)', step_total: 23 });
  }, []);

  // Índice ativo DERIVADO do array — nunca um state paralelo, que dessincronizaria
  // do `photos` a cada retake. -1 = as 6 estão prontas.
  const activeIndex = photos.findIndex((p) => p == null);
  const takenCount = photos.filter(Boolean).length;
  const step = activeIndex >= 0 ? STEPS[activeIndex] : null;
  // Depois de um retake pode haver buraco no meio — a miniatura é a última PREENCHIDA.
  const lastPhotoUri = [...photos].reverse().find(Boolean) ?? null;

  // ── Captura ────────────────────────────────────────────────────────────────
  const fill = (index: number, uri: string) => {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = uri;
      return next;
    });
  };

  const handleCapture = async () => {
    if (capturingRef.current || activeIndex < 0 || building) return;
    haptics.action();
    if (!cameraRef.current) return;
    capturingRef.current = true;
    // ⚠️ Congela o alvo ANTES do await: `activeIndex` muda durante a captura e a
    // foto cairia na célula errada.
    const target = activeIndex;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) throw new Error('Falha ao capturar');
      const uri = await downscale(photo.uri, photo.width, photo.height);
      fill(target, uri);
    } catch {
      Alert.alert('Erro', 'Não foi possível tirar a foto. Tente novamente.');
    } finally {
      capturingRef.current = false;
    }
  };

  // Galeria: só em __DEV__. No simulador é o único jeito de fornecer fotos (sem
  // câmera real o botão de disparo fica desabilitado). Em produção a análise de
  // pele exige foto tirada na hora — mesma regra de `camera.tsx`.
  const handlePickImage = async (fillAll: boolean) => {
    if (capturingRef.current || building) return;
    haptics.tap();
    capturingRef.current = true;
    const target = activeIndex;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // Passa pelo MESMO downscale do caminho de produção — um atalho de dev que
        // pula etapas testa um fluxo que não existe.
        const uri = await downscale(asset.uri, asset.width, asset.height);
        if (fillAll) setPhotos(Array(TOTAL).fill(uri));
        else if (target >= 0) fill(target, uri);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível selecionar a foto.');
    } finally {
      capturingRef.current = false;
    }
  };

  const handleRetake = (index: number) => {
    if (building) return;
    haptics.tap();
    // "Remover" e "refazer" são a mesma ação: esvaziar o slot. Como o índice ativo é
    // derivado, a câmera volta sozinha exatamente para este passo.
    doneRef.current = false;
    // ⚠️ Zerar o contador de imagens carregadas junto: esvaziar um slot DESMONTA as
    // views offscreen. Sem este reset, o `waitForImages` da próxima tentativa veria
    // a contagem antiga já satisfeita e capturaria antes das fotos novas decodificarem
    // — que é exatamente como se produz uma colagem em branco.
    loadedRef.current = 0;
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setReviewOpen(false);
  };

  // ── Montagem das colagens + navegação ──────────────────────────────────────
  // Espera as <Image> das views offscreen estarem decodificadas. Sem isso o
  // captureRef pode devolver uma imagem em branco.
  const waitForImages = () =>
    new Promise<void>((resolve, reject) => {
      const need = TOTAL; // 4 células do Layout A + 2 do Layout B
      const t0 = Date.now();
      const tick = () => {
        if (loadedRef.current >= need) {
          // Dois rAF aninhados: garante que o commit do Fabric já foi para a tela.
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          return;
        }
        if (Date.now() - t0 > 6000) {
          reject(new Error('timeout ao carregar as fotos'));
          return;
        }
        setTimeout(tick, 60);
      };
      tick();
    });

  const buildAndGo = async () => {
    setBuilding(true);
    try {
      await waitForImages();

      const uriA = await captureRef(refA, { format: 'jpg', quality: 0.95, result: 'tmpfile' });
      const uriB = await captureRef(refB, { format: 'jpg', quality: 0.95, result: 'tmpfile' });

      // captureRef devolve URI, não base64 → segunda passada no ImageManipulator.
      // O `resize` também NORMALIZA o tamanho (2048/3 = 682.67pt, e o arredondamento
      // nativo pode dar 2047) — não é redundante.
      const a = await ImageManipulator.manipulateAsync(
        uriA, [{ resize: { width: TARGET } }],
        { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const b = await ImageManipulator.manipulateAsync(
        uriB, [{ resize: { width: TARGET } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      // A neutra vai TAMBÉM sozinha, em resolução cheia — é dela que a IA tira os
      // achados finos (ver comentário do topo do arquivo).
      const neutral = await ImageManipulator.manipulateAsync(
        photos[0]!, [],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      if (!a.base64 || !b.base64 || !neutral.base64) throw new Error('Falha ao gerar as imagens');

      const kb = (s: string) => Math.round((s.length * 0.75) / 1024);
      console.log(
        `[scan-multi] neutra ${kb(neutral.base64)}KB · layoutA ${kb(a.base64)}KB · ` +
        `layoutB ${kb(b.base64)}KB · total ${kb(neutral.base64) + kb(a.base64) + kb(b.base64)}KB`,
      );

      track('onboarding_step_completed', { step_number: 14, step_name: 'Scan - Câmera (6 fotos)', step_total: 23 });
      // `photos[0]` (e não `neutral.uri`) é exatamente a foto que a revisão mostrou.
      setSkinScanImages({ base64: neutral.base64, uri: photos[0]! }, [neutral.base64, a.base64, b.base64]);
      router.push('/(scan)/loading-dentro-app' as any);
    } catch (e) {
      console.warn('[scan-multi] falha ao montar as colagens', e);
      doneRef.current = false;
      Alert.alert('Erro', 'Não foi possível preparar suas fotos. Tente novamente.');
    } finally {
      setBuilding(false);
    }
  };

  // Dispara sozinho ao completar as 6. Fica num efeito (e não dentro do handleCapture)
  // para o setPhotos já ter comitado quando o build começa.
  useEffect(() => {
    if (takenCount === TOTAL && !doneRef.current && !reviewOpen) {
      doneRef.current = true;
      buildAndGo();
    }
  }, [takenCount, reviewOpen]);

  // ── Permissão ──────────────────────────────────────────────────────────────
  if (!isSimulator && !permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ color: 'white', fontSize: 17, textAlign: 'center', marginBottom: 24, fontFamily: f6 }}>
            O NIKS precisa da câmera para analisar sua pele.
          </Text>
          <TouchableOpacity
            onPress={() => { haptics.tap(); requestPermission(); }}
            style={{ backgroundColor: 'white', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 100 }}
          >
            <Text style={{ fontSize: 16, color: '#1A1A1A', fontFamily: f7 }}>Permitir câmera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Fechar */}
      <TouchableOpacity
        onPress={() => { haptics.tap(); router.back(); }}
        activeOpacity={0.8}
        style={styles.closeBtn}
      >
        <X size={20} color="white" />
      </TouchableOpacity>

      {/* Contador */}
      <View style={styles.counterWrap}>
        <Text style={[styles.counterText, { fontFamily: f7 }]}>
          {activeIndex >= 0 ? `Foto ${activeIndex + 1} de ${TOTAL}` : `${TOTAL} de ${TOTAL} fotos`}
        </Text>
      </View>

      {/* Câmera real. `active={!reviewOpen}` PAUSA a sessão sem desmontar — remontar
          recria a sessão de captura do iOS e dá flash/delay (decisão 26). */}
      {!isSimulator && permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="front"
          active={!reviewOpen}
        />
      )}
      {/* ⚠️ SEM `mirror`: a foto sai anatomicamente verdadeira (a bochecha direita
          dela aparece à esquerda da imagem). Espelhar inverteria esquerda/direita em
          acne.distribution, pigmentacao.location e region_insights — inaceitável
          numa análise. O prompt do Layout B avisa a IA disso explicitamente. */}

      {/* Moldura + instrução */}
      <View style={styles.cameraPlaceholder}>
        <View style={styles.guideContainer}>
          <Svg width={256} height={320} style={StyleSheet.absoluteFill}>
            <Ellipse
              cx={128} cy={160} rx={126} ry={158}
              stroke="rgba(255,255,255,0.3)" strokeWidth={2} fill="none"
            />
          </Svg>
          {/* A moldura NÃO se desloca nos perfis: cada célula da colagem é quadrada e
              usa `cover`; rosto fora do centro = metade da célula vira fundo, e a
              resolução se perde justamente onde os perfis importam. */}
          {(['TL', 'TR', 'BL', 'BR'] as const).map((c) => (
            <View
              key={c}
              style={[
                styles.corner,
                styles[`corner${c}`],
                step?.turn ? { borderColor: CORAL } : null,
              ]}
            />
          ))}

          {/* Seta direcional — só nos perfis */}
          {step?.turn ? (
            <View style={[styles.arrowWrap, step.turn === 'left' ? { left: -46 } : { right: -46 }]}>
              <Svg width={28} height={28} viewBox="0 0 24 24">
                <Path
                  d={step.turn === 'left' ? 'M15 4 L7 12 L15 20' : 'M9 4 L17 12 L9 20'}
                  stroke={CORAL} strokeWidth={2.5} fill="none"
                  strokeLinecap="round" strokeLinejoin="round"
                />
              </Svg>
            </View>
          ) : null}

          <View style={styles.instructionWrapper}>
            <Text style={[styles.stepTitle, { fontFamily: f8 }]}>{step?.title ?? 'Tudo pronto'}</Text>
            <Text style={[styles.stepHint, { fontFamily: f4 }]}>
              {step?.hint ?? 'Preparando suas fotos…'}
            </Text>
          </View>
        </View>
      </View>

      {/* Disparo */}
      <View style={styles.captureArea}>
        <TouchableOpacity
          onPress={handleCapture}
          activeOpacity={0.9}
          disabled={isSimulator || activeIndex < 0 || building}
          style={[
            styles.captureOuter,
            (isSimulator || activeIndex < 0 || building) && { opacity: 0.5 },
          ]}
        >
          <View style={styles.captureInner} />
        </TouchableOpacity>
      </View>

      {/* Pilha de miniaturas — canto inferior esquerdo, só depois da 1ª foto */}
      {takenCount > 0 && (
        <TouchableOpacity
          onPress={() => { haptics.tap(); setReviewOpen(true); }}
          activeOpacity={0.85}
          disabled={building}
          style={styles.stackWrap}
        >
          {/* As "cartas de baixo" são retângulos VAZIOS de propósito — carregar 6
              bitmaps decodificados só para sugerir uma pilha custa memória à toa. */}
          {takenCount >= 3 && (
            <View style={[styles.stackCard, styles.stackGhost, { transform: [{ rotate: '-8deg' }], opacity: 0.5 }]} />
          )}
          {takenCount >= 2 && (
            <View style={[styles.stackCard, styles.stackGhost, { transform: [{ rotate: '5deg' }], opacity: 0.75 }]} />
          )}
          {lastPhotoUri && (
            <Image source={{ uri: lastPhotoUri }} style={styles.stackCard} resizeMode="cover" />
          )}
          <View style={styles.badge}>
            <Text style={[styles.badgeText, { fontFamily: f7 }]}>{takenCount}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Galeria — SÓ em __DEV__ (no simulador é o único jeito de fornecer fotos).
          Toque = preenche o passo atual · toque longo = replica nos 6 slots. */}
      {__DEV__ && (
        <TouchableOpacity
          onPress={() => handlePickImage(false)}
          onLongPress={() => handlePickImage(true)}
          activeOpacity={0.8}
          disabled={building}
          style={styles.galleryBtn}
        >
          <ImageIcon size={20} color="white" />
        </TouchableOpacity>
      )}

      {/* ── Revisão dos 2 layouts ──────────────────────────────────────────── */}
      {reviewOpen && (
        <View style={styles.reviewOverlay}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.reviewHeader}>
              <TouchableOpacity
                onPress={() => { haptics.tap(); setReviewOpen(false); }}
                activeOpacity={0.7}
                style={styles.reviewBack}
              >
                <ChevronLeft size={18} color={INK} />
              </TouchableOpacity>
              <Text style={[styles.reviewTitle, { fontFamily: f8 }]}>Suas {TOTAL} fotos</Text>
            </View>

            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 24, paddingBottom: 32,
                maxWidth: 393, width: '100%', alignSelf: 'center',
              }}
            >
              <Text style={[styles.reviewHelp, { fontFamily: f4 }]}>
                Toque em uma foto para tirar de novo.
              </Text>

              <ReviewBlock
                caption="EXPRESSÕES"
                layout="A"
                photos={photos}
                onCellPress={handleRetake}
                disabled={building}
                fontCaption={f7}
                width={reviewW}
              />
              <ReviewBlock
                caption="PERFIS"
                layout="B"
                photos={photos}
                onCellPress={handleRetake}
                disabled={building}
                fontCaption={f7}
                width={reviewW}
              />

              <Text style={[styles.reviewFooter, { fontFamily: f4 }]}>
                {takenCount === TOTAL
                  ? 'Tudo pronto — feche para enviar a análise.'
                  : `Faltam ${TOTAL - takenCount} foto${TOTAL - takenCount > 1 ? 's' : ''}.`}
              </Text>

              <TouchableOpacity
                onPress={() => { haptics.action(); setReviewOpen(false); }}
                activeOpacity={0.85}
                disabled={building}
                style={styles.reviewCta}
              >
                <Text style={[styles.reviewCtaText, { fontFamily: f7 }]}>
                  {takenCount === TOTAL ? 'Está tudo certo' : 'Continuar tirando'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* ── Overlay de montagem ────────────────────────────────────────────── */}
      {building && (
        <View style={styles.buildingOverlay}>
          <ActivityIndicator size="large" color={CORAL} />
          <Text style={[styles.buildingText, { fontFamily: f7 }]}>Preparando suas fotos…</Text>
        </View>
      )}

      {/* ── Views de export, offscreen ─────────────────────────────────────────
          Só montadas quando as 6 fotos existem — manter 6 bitmaps de 2048px vivos
          durante toda a captura seria desperdício de memória.
          `collapsable={false}` é OBRIGATÓRIO: sem ele o RN achata a View e o
          captureRef não encontra nada para capturar. */}
      {takenCount === TOTAL && (
        <View style={{ position: 'absolute', left: -10000, top: 0 }} pointerEvents="none">
          <View
            ref={refA}
            collapsable={false}
            style={{ width: EXPORT_W, height: scanCollageHeight('A', EXPORT_W) }}
          >
            <ScanCollage layout="A" photos={photos} width={EXPORT_W} gap={EXPORT_GAP} onCellLoad={bumpLoaded} />
          </View>
          <View
            ref={refB}
            collapsable={false}
            style={{ width: EXPORT_W, height: scanCollageHeight('B', EXPORT_W) }}
          >
            <ScanCollage layout="B" photos={photos} width={EXPORT_W} gap={EXPORT_GAP} onCellLoad={bumpLoaded} />
          </View>
        </View>
      )}

      {consentGate}
    </SafeAreaView>
  );
}

// ── Bloco de um layout na tela de revisão ────────────────────────────────────
function ReviewBlock({
  caption, layout, photos, onCellPress, disabled, fontCaption, width,
}: {
  caption: string;
  layout: 'A' | 'B';
  photos: (string | null)[];
  onCellPress: (index: number) => void;
  disabled: boolean;
  fontCaption?: string;
  /** Largura útil já descontados o padding da ScrollView e a borda do frame. */
  width: number;
}) {
  const W = width;

  return (
    <View style={{ marginTop: 20 }}>
      <Text style={[styles.reviewCaption, { fontFamily: fontCaption }]}>{caption}</Text>
      <View style={styles.reviewCollageFrame}>
        <ScanCollage
          layout={layout}
          photos={photos}
          width={W}
          gap={4}
          cellLabels={SHORT_LABELS}
          renderCellWrapper={(index, children) => (
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={disabled}
              onPress={() => onCellPress(index)}
              style={{ flex: 1 }}
            >
              {children}
              {!photos[index] && (
                <View style={styles.emptyCell}>
                  <CameraIcon size={20} color="#B5B5B5" />
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  closeBtn: {
    position: 'absolute', top: 56, left: 24, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  counterWrap: {
    position: 'absolute', top: 64, left: 0, right: 0, alignItems: 'center', zIndex: 9,
  },
  counterText: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },

  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  guideContainer: { width: 256, height: 320 },
  corner: { position: 'absolute', width: 32, height: 32 },
  cornerTL: { top: 0, left: 32, borderTopWidth: 2, borderLeftWidth: 2, borderColor: 'white', borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 32, borderTopWidth: 2, borderRightWidth: 2, borderColor: 'white', borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 32, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: 'white', borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 32, borderBottomWidth: 2, borderRightWidth: 2, borderColor: 'white', borderBottomRightRadius: 8 },
  arrowWrap: { position: 'absolute', top: 146, alignItems: 'center', justifyContent: 'center' },

  instructionWrapper: { position: 'absolute', bottom: -76, left: -24, right: -24, alignItems: 'center' },
  stepTitle: { color: '#FFFFFF', fontSize: 20, marginBottom: 6 },
  stepHint: { color: 'rgba(255,255,255,0.72)', fontSize: 13, textAlign: 'center', lineHeight: 19 },

  captureArea: { paddingBottom: 48, alignItems: 'center' },
  captureOuter: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 4, borderColor: 'white',
    alignItems: 'center', justifyContent: 'center',
  },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'white' },

  stackWrap: { position: 'absolute', bottom: 56, left: 32, width: 62, height: 62, zIndex: 10 },
  stackCard: {
    position: 'absolute', top: 3, left: 3, width: 56, height: 56,
    borderRadius: 12, borderWidth: 2, borderColor: WHITE,
    backgroundColor: PLACEHOLDER, overflow: 'hidden',
  },
  stackGhost: { backgroundColor: 'rgba(255,255,255,0.35)' },
  badge: {
    position: 'absolute', top: -6, right: -6,
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: WHITE, fontSize: 12 },

  galleryBtn: {
    position: 'absolute', bottom: 56, right: 32,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },

  reviewOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: WHITE, zIndex: 20 },
  reviewHeader: { paddingVertical: 6, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
  reviewBack: {
    width: 40, height: 40, borderRadius: 100, backgroundColor: WHITE,
    borderWidth: 1, borderColor: CARD_BD, alignItems: 'center', justifyContent: 'center',
  },
  reviewTitle: { fontSize: 20, color: INK },
  reviewHelp: { fontSize: 13, color: INK_MUTE, marginTop: 12 },
  reviewCaption: { fontSize: 11, color: CORAL, letterSpacing: 2.4, marginBottom: 8 },
  reviewCollageFrame: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: CARD_BD },
  emptyCell: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reviewFooter: { fontSize: 13, color: INK_MUTE, textAlign: 'center', marginTop: 20 },
  reviewCta: {
    height: 56, borderRadius: 100, backgroundColor: CORAL,
    alignItems: 'center', justifyContent: 'center', marginTop: 14,
  },
  reviewCtaText: { fontSize: 16, color: WHITE },

  buildingOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 30,
    backgroundColor: 'rgba(26,26,26,0.82)', alignItems: 'center', justifyContent: 'center',
  },
  buildingText: { color: WHITE, fontSize: 15, marginTop: 16 },
});
