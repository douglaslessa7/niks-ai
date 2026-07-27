import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, useWindowDimensions, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import { ChevronLeft, Camera, Image as ImageIcon } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Device from 'expo-device';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';

// ── Compartilhar Niks score — colagem de 1 a 4 fotos + adesivo de métricas ──────
// BLOCO B: captura. A colagem é 9:16 (Stories) e o grid 2×2 divide em 4 células —
// cada célula é, por construção, também 9:16.
// Ainda NÃO implementado (Bloco C/D): adesivo, layouts de 1/2/3 fotos, view-shot,
// compartilhamento. O "Continuar" só loga as URIs.

const WHITE       = '#FFFFFF';
const INK         = '#121212';
const INK_MUTE    = '#818181';
const CORAL       = '#FF9D9D';   // rosa da Rotina (cor primária do app)
const CARD_BD     = '#E3E3E6';   // hairline-assinatura do app
const PLACEHOLDER = '#F3F3F4';   // cinza dos placeholders (mesmo da foto vazia da home)
const ICON_GRAY   = '#B5B5B5';

const MAX_SIDE = 1080; // maior lado da foto guardada (memória: 4 fotos full estouram)

// Primeira célula vazia na ordem 1→2→3→4; null se estiverem todas preenchidas.
function nextEmpty(photos: (string | null)[]): number | null {
  const i = photos.findIndex((p) => p == null);
  return i === -1 ? null : i;
}

// Downscale para MAX_SIDE no maior lado. Só redimensiona se de fato exceder —
// fotos menores passam direto (evita reencode à toa).
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

export default function ShareCapture() {
  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold });
  const f8 = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const f7 = fontsLoaded ? 'Nunito_700Bold' : undefined;

  const router = useRouter();
  const setCollagePhotos = useAppStore((s) => s.setCollagePhotos);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const S = width / 393;

  const [permission, requestPermission] = useCameraPermissions();
  const isSimulator = !Device.isDevice; // simulador não tem câmera real

  const cameraRef = useRef<CameraView>(null);
  const capturingRef = useRef(false); // guard anti-duplo-toque (Decisão 25)
  const [busy, setBusy] = useState(false);

  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null]);
  // Célula com a câmera ao vivo. Começa na 1 (índice 0); null = nenhuma (todas cheias).
  const [activeIndex, setActiveIndex] = useState<number | null>(0);

  // Geometria da colagem. A proporção 9:16 é a restrição DURA: partimos da maior
  // largura possível dentro das margens e, se a altura resultante não couber na
  // área livre (header + botão + safe areas), reduzimos até caber — sempre 9:16.
  const H_MARGIN     = 16 * S;
  const HEADER_H     = 52 * S;
  const BUTTON_BLOCK = 48 * S + 40 * S; // pílula "Continuar" + respiros acima/abaixo

  // ⚠️ O disparo NÃO entra nesta conta. Ele é `position: 'absolute'` (flutua sobre a
  // base da grade) justamente para não consumir altura: como a colagem é 9:16 e a
  // ALTURA é a restrição que manda aqui, qualquer faixa reservada no fluxo encolhe a
  // colagem inteira (foi o que aconteceu: 349→296pt de largura). Flutuando, a colagem
  // fica no tamanho máximo e o botão não a empurra.
  const availW = width - H_MARGIN * 2;
  const availH = height - insets.top - insets.bottom - HEADER_H - BUTTON_BLOCK - 16 * S;

  const COLLAGE_W = Math.min(availW, (availH * 9) / 16);
  const COLLAGE_H = (COLLAGE_W * 16) / 9;

  const GAP = 2 * S;

  // Retângulo de cada célula em coordenadas do container. Estes números são
  // EXATAMENTE os que o flex calcula: cada linha/célula é `flex: 1` sobre o espaço
  // que sobra depois do gap, ou seja (COLLAGE_W - GAP)/2. Por isso a CameraView
  // sobreposta encaixa no quadrante sem desalinhar.
  const CELL_W = (COLLAGE_W - GAP) / 2;
  const CELL_H = (COLLAGE_H - GAP) / 2;
  const cellRect = (i: number) => ({
    left: (i % 2) * (CELL_W + GAP),
    top: Math.floor(i / 2) * (CELL_H + GAP),
    width: CELL_W,
    height: CELL_H,
  });

  const fill = useCallback((index: number, uri: string) => {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = uri;
      setActiveIndex(nextEmpty(next)); // câmera pula p/ a próxima vazia (ou some)
      return next;
    });
  }, []);

  // Disparo. `capturingRef` é um mutex síncrono (Decisão 25): dois toques rápidos
  // no botão não podem virar duas capturas — `useState` só desabilitaria o botão
  // no próximo render, tarde demais.
  const handleCapture = async () => {
    if (capturingRef.current || activeIndex == null || !cameraRef.current) return;
    capturingRef.current = true;
    const target = activeIndex; // congela o alvo: activeIndex muda durante o await
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) throw new Error('Falha ao capturar');
      const uri = await downscale(photo.uri, photo.width, photo.height);
      fill(target, uri);
    } catch (e) {
      console.error('Erro ao capturar:', e);
      Alert.alert('Erro', 'Não foi possível tirar a foto. Tente novamente.');
    } finally {
      capturingRef.current = false;
      setBusy(false);
    }
  };

  // Galeria — preenche a célula tocada (não necessariamente a ativa).
  const handlePick = async (index: number) => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        exif: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      const uri = await downscale(a.uri, a.width, a.height);
      fill(index, uri);
    } catch (e) {
      console.error('Erro ao selecionar imagem:', e);
      Alert.alert('Erro', 'Não foi possível selecionar a imagem.');
    } finally {
      capturingRef.current = false;
      setBusy(false);
    }
  };

  // Refazer — um toque na célula preenchida limpa a foto e traz a câmera de volta
  // PARA ELA (não para a primeira vazia). Sem menu, sem confirmação.
  const handleRetake = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setActiveIndex(index);
  };

  const taken = photos.filter((p): p is string => p != null);
  const canContinue = taken.length > 0;

  const handleContinue = () => {
    haptics.action();
    // As URIs viajam pelo STORE (regra do projeto: router params truncam no bridge).
    // Só as células preenchidas, na ordem — é isso que define o layout da colagem.
    setCollagePhotos(taken);
    router.push('/(share)/share-preview' as any);
  };

  // `useCameraPermissions` NÃO pede a permissão sozinho — só devolve o estado. Sem
  // esta chamada o iOS nunca mostra o diálogo, e a câmera fica eternamente "não
  // concedida" (era por isso que o preview não aparecia).
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission?.granted, permission?.canAskAgain]);

  // `permission` é null enquanto carrega — não tratar isso como negado (senão a tela
  // pisca a mensagem de erro antes de o usuário sequer ver o diálogo).
  const cameraReady  = !isSimulator && permission?.granted === true;
  const cameraDenied = !isSimulator && permission != null && !permission.granted && !permission.canAskAgain;
  // O disparo aparece sempre que há célula ativa e a câmera não foi negada. No
  // simulador (sem câmera real) ele cai na galeria — mesmo padrão do product-camera.
  const showShutter  = activeIndex != null && !cameraDenied;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

        {/* Header — voltar + título */}
        <View
          style={{
            height: HEADER_H,
            paddingHorizontal: 24 * S,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
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
              flex: 1,
              marginRight: 40 * S, // compensa o botão à esquerda → título fica centrado
              textAlign: 'center',
              fontFamily: f7,
              fontSize: 20 * S,
              color: INK,
              letterSpacing: -0.6 * S,
            }}
          >
            Sua colagem
          </Text>
        </View>

        {/* Área da colagem — 9:16, centrada. Grid 2×2 de 4 células iguais. */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: COLLAGE_W,
              height: COLLAGE_H,
              // Cantos RETOS (sem borderRadius): as fotos são retangulares, e é
              // assim que a colagem sai na imagem exportada.
              overflow: 'hidden', // seguro: não há ScrollView dentro (Decisão 24)
              backgroundColor: WHITE, // aparece nos gaps entre as células
            }}
          >
            {/* 2 linhas × 2 células. Sem `flexWrap`: dar às células largura fixa
                somando EXATAMENTE a do container deixa folga zero, e bastava o Yoga
                discordar por um sub-pixel no grid @3x para o wrap quebrar a linha.
                Com linhas explícitas + `flex: 1`, o espaço é DIVIDIDO, não testado. */}
            {[0, 1].map((row) => (
              <View
                key={row}
                style={{ flex: 1, flexDirection: 'row', marginTop: row === 1 ? GAP : 0 }}
              >
                {[0, 1].map((col) => {
                  const i = row * 2 + col;
                  const uri = photos[i];
                  return (
                    <TouchableOpacity
                      key={col}
                      // Célula preenchida = tocar refaz. Célula vazia não é clicável
                      // (o toque útil dela é o ícone de galeria).
                      activeOpacity={uri ? 0.85 : 1}
                      disabled={!uri || busy}
                      onPress={() => {
                        if (!uri) return;
                        haptics.tap();
                        handleRetake(i);
                      }}
                      style={{
                        flex: 1,
                        marginLeft: col === 1 ? GAP : 0,
                        backgroundColor: PLACEHOLDER,
                        overflow: 'hidden', // sem borderRadius: célula retangular
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {uri ? (
                        // `cover` — nunca esticada/deformada
                        <Image
                          source={{ uri }}
                          resizeMode="cover"
                          style={{ width: '100%', height: '100%' }}
                        />
                      ) : (
                        <Camera size={28 * S} color={ICON_GRAY} strokeWidth={1.75} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {/* ── Câmera ao vivo: UMA única CameraView, SEMPRE montada ────────────
                Ela nunca é desmontada ao trocar de célula — só reposicionada
                (left/top/width/height) sobre o quadrante ativo. No iOS o
                `previewLayer` é um AVCaptureVideoPreviewLayer com
                `needsDisplayOnBoundsChange`, então mudar os bounds só redimensiona
                a camada: a sessão de captura NÃO reinicia (sem flash/delay a cada
                foto). Quando as 4 estão cheias, `active={false}` PAUSA a sessão sem
                desmontar — o "refazer" volta a ligar sem recriar a CameraView.
                `mirror` espelha só a FOTO DE SAÍDA (o preview frontal do iOS já é
                espelhado por padrão) → a foto salva bate com o que a usuária viu. */}
            {cameraReady && (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  ...(activeIndex != null ? cellRect(activeIndex) : cellRect(0)),
                  overflow: 'hidden', // sem borderRadius: acompanha a célula reta

                  opacity: activeIndex != null ? 1 : 0, // sem célula ativa → invisível
                  zIndex: activeIndex != null ? 2 : 0,
                }}
              >
                <CameraView
                  ref={cameraRef}
                  style={{ flex: 1 }}
                  facing="front"
                  mirror
                  active={activeIndex != null}
                />
              </View>
            )}

            {/* Ícone de galeria — só nas células VAZIAS, canto superior direito.
                Fica FORA da CameraView (que é pointerEvents="none") e acima dela no
                zIndex, senão o preview cobriria o toque na célula ativa.
                Alvo de toque 44×44 (mínimo da Apple). */}
            {photos.map((uri, i) =>
              uri ? null : (
                <TouchableOpacity
                  key={`gal-${i}`}
                  onPress={() => {
                    haptics.tap();
                    handlePick(i);
                  }}
                  disabled={busy}
                  activeOpacity={0.8}
                  style={{
                    position: 'absolute',
                    left: cellRect(i).left + cellRect(i).width - 44 * S - 4 * S,
                    top: cellRect(i).top + 4 * S,
                    width: 44 * S,
                    height: 44 * S,
                    zIndex: 3, // acima da CameraView
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 30 * S, height: 30 * S, borderRadius: 8 * S,
                      backgroundColor: 'rgba(255,255,255,0.92)',
                      borderWidth: 1, borderColor: CARD_BD,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <ImageIcon size={16 * S} color={INK} strokeWidth={1.9} />
                  </View>
                </TouchableOpacity>
              )
            )}
          </View>

          {/* ── Disparo — FLUTUANTE (absoluto) sobre a base da grade ───────────────
              Fora do fluxo de propósito: no fluxo ele roubaria altura e, como a
              colagem é 9:16 travada pela ALTURA, encolheria a grade inteira.
              `box-none` no wrapper → só o botão captura toque; o resto da área
              continua entregando o toque às células (refazer). */}
          {showShutter && (
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: 14 * S, alignItems: 'center' }}
            >
              <TouchableOpacity
                // Sem câmera real (simulador) o disparo abre a galeria — padrão do product-camera.
                onPress={() => {
                  haptics.action();
                  if (cameraReady) handleCapture();
                  else if (activeIndex != null) handlePick(activeIndex);
                }}
                disabled={busy}
                activeOpacity={0.9}
                style={{
                  width: 72 * S, height: 72 * S, borderRadius: 36 * S,
                  borderWidth: 3, borderColor: WHITE,
                  backgroundColor: 'rgba(0,0,0,0.15)',
                  alignItems: 'center', justifyContent: 'center',
                  opacity: busy ? 0.5 : 1,
                  // sombra: mantém o botão legível sobre foto clara
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
                }}
              >
                <View
                  style={{
                    width: 58 * S, height: 58 * S, borderRadius: 29 * S,
                    backgroundColor: CORAL,
                  }}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Permissão negada de vez (canAskAgain = false) — mensagem, nunca crash.
            A galeria continua funcionando. Também é absoluto: não encolhe a colagem. */}
        {cameraDenied && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', left: 0, right: 0, bottom: BUTTON_BLOCK + 8 * S,
              alignItems: 'center', paddingHorizontal: H_MARGIN,
            }}
          >
            <Text
              style={{
                fontFamily: f7, fontSize: 12 * S, color: INK_MUTE, textAlign: 'center',
                backgroundColor: 'rgba(255,255,255,0.92)',
                paddingHorizontal: 12 * S, paddingVertical: 6 * S, borderRadius: 100,
                overflow: 'hidden',
              }}
            >
              Sem acesso à câmera — use a galeria.
            </Text>
          </View>
        )}

        {/* Continuar — habilitado a partir de 1 foto (não exige as 4) */}
        <View style={{ paddingHorizontal: H_MARGIN, paddingBottom: 20 * S }}>
          <TouchableOpacity
            disabled={!canContinue}
            onPress={handleContinue}
            activeOpacity={0.85}
            style={{
              height: 48 * S,
              borderRadius: 100,
              backgroundColor: CORAL,
              opacity: canContinue ? 1 : 0.4,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: f8, fontSize: 16 * S, color: WHITE, letterSpacing: -0.4 * S }}>
              Continuar
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              marginTop: 10 * S,
              textAlign: 'center',
              fontFamily: f7,
              fontSize: 12 * S,
              color: INK_MUTE,
              letterSpacing: -0.2 * S,
            }}
          >
            {canContinue
              ? `${taken.length} de 4 · toque numa foto para refazer`
              : 'Escolha até 4 fotos para montar sua colagem'}
          </Text>
        </View>

      </View>
    </SafeAreaView>
  );
}
