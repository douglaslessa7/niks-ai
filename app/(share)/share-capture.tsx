import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, useWindowDimensions, Alert, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Nunito_700Bold } from '@expo-google-fonts/nunito';
import { X, RefreshCw, ArrowRight, Camera } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Device from 'expo-device';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import GridIcon from '../../components/share/GridIcon';
import CameraMirror, { cameraMirrorAvailable } from '../../modules/niks-camera-mirror';
import {
  COLLAGE_GRIDS, CollageGridId, DEFAULT_GRID_ID, getGrid, cellRects,
  COLLAGE_GAP_FRACTION,
} from '../../lib/collageGrid';

// ── Compartilhar Niks score — captura da colagem ──────────────────────────────
// Réplica da tela "Layout" da câmera de Stories do Instagram (referência dada pelo
// usuário). O que isso significa, em contraste com a versão anterior desta tela:
//
//   • A CÂMERA FICA NA CÉLULA DA VEZ, não no quadro inteiro. ⚠️ Aqui NÃO seguimos o
//     Instagram, e é deliberado: a versão de quadro inteiro foi construída, testada
//     pelo usuário e REPROVADA — com a câmera cobrindo a grade toda, a célula ativa
//     vira um RECORTE da cena, e para compor a foto do primeiro quadrado a pessoa
//     tem de encaixar o rosto naquele quadrante (mexer a cabeça, o celular, o
//     ângulo). Com a câmera na célula, o quadrado É o enquadramento: o que ela vê
//     no quadrado é o que cai no quadrado. Não "consertar" isto de volta.
//   • SEM header, SEM fundo branco, SEM botão "Continuar". Ao completar a grade a
//     tela avança sozinha; se a usuária voltar do preview, o disparo vira uma SETA
//     (mesmo botão, mesmo lugar) para ela seguir de novo sem ficar presa.
//   • AS CÉLULAS VAZIAS MOSTRAM A CÂMERA AO VIVO, BORRADA — o efeito do Instagram.
//     É a MESMA câmera da célula ativa, exibida uma segunda vez pelo módulo nativo
//     `modules/niks-camera-mirror` (o iOS deixa uma sessão alimentar várias prévias;
//     o expo-camera é que não deixa, ver o Swift). Sem o binário novo, cai sozinho
//     nas células escuras de antes (`cameraMirrorAvailable`).
//   • A GRADE É ESCOLHIDA, não deduzida da quantidade de fotos — bandeja de 6 opções
//     em `lib/collageGrid.ts`, aberta pelo botão do canto inferior esquerdo.
//
// ⚠️ Um único símbolo de grade (pedido do usuário): o botão do canto É a bandeja.
// Não existe o par "ícone de modo + linha 'Alterar grade' + seta" do Instagram.

const WHITE     = '#FFFFFF';
const INK       = '#121212';
const SHEET_BG  = 'rgba(38,38,38,0.94)';
// Círculo discreto do "virar câmera", no molde do Instagram: claro o suficiente para
// aparecer sobre o preto, sem virar um botão sólido.
const CTRL_BG   = 'rgba(255,255,255,0.14)';
// ⚠️ Divisórias da captura: linhas finas TRAÇADAS POR CIMA das células, não goteira.
// A goteira da colagem é ZERO (as fotos se tocam, ver `COLLAGE_GAP_FRACTION`), então
// estas linhas existem só para mostrar a grade na hora de enquadrar — e não deixam
// rastro nenhum na imagem exportada.
const GRID_LINE   = 'rgba(255,255,255,0.55)';
const GRID_LINE_W = 1;

const MAX_SIDE = 1080; // maior lado da foto guardada (memória: várias fotos full estouram)

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
  const [fontsLoaded] = useFonts({ Nunito_700Bold });
  const f7 = fontsLoaded ? 'Nunito_700Bold' : undefined;

  const router = useRouter();
  const setCollagePhotos = useAppStore((s) => s.setCollagePhotos);
  const setCollageGrid = useAppStore((s) => s.setCollageGrid);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const S = width / 393;

  const [permission, requestPermission] = useCameraPermissions();
  const isSimulator = !Device.isDevice; // simulador não tem câmera real

  const cameraRef = useRef<CameraView>(null);
  const capturingRef = useRef(false); // guard anti-duplo-toque (Decisão 25)
  const [busy, setBusy] = useState(false);

  // Lado da câmera. Começa na FRONTAL; o botão ao lado do disparo vira para a traseira.
  const [facing, setFacing] = useState<'front' | 'back'>('front');

  // ⚠️ A sessão de câmera leva um instante para subir. Sem este estado a tela ficava
  // um RETÂNGULO PRETO nesse intervalo — sem câmera e sem os placeholders, porque o
  // fundo borrado já estava "ligado" no JS enquanto o nativo ainda não tinha imagem.
  // Com ele, a grade mostra as células escuras com ícone até haver imagem de verdade.
  const [previewReady, setPreviewReady] = useState(false);

  const [gridId, setGridId] = useState<CollageGridId>(DEFAULT_GRID_ID);
  const grid = getGrid(gridId);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [photos, setPhotos] = useState<(string | null)[]>(() =>
    Array(getGrid(DEFAULT_GRID_ID).cells).fill(null)
  );

  // ⚠️ A célula ativa é DERIVADA, não estado: é sempre a primeira vazia. Antes havia um
  // `activeIndex` em state que precisava ser reempurrado a cada foto e a cada "refazer"
  // — e era ele que podia dessincronizar das fotos. Derivando, "refazer a célula 1 com
  // as outras cheias" volta a câmera para a 1 sozinho, sem nenhuma linha extra.
  const activeIndex = photos.findIndex((p) => p == null);
  const isFull = activeIndex === -1 && photos.length > 0;

  // ── Geometria ───────────────────────────────────────────────────────────────
  // ⚠️ A LARGURA MANDA: o quadro é SEMPRE da largura cheia da tela e SEM cantos
  // arredondados. Isto foi pedido depois de duas rodadas de "ainda tem borda": antes
  // ele era limitado pela ALTURA que sobrava (`min(width, availH*9/16)`) e o que
  // sobrava de largura virava faixa preta nas laterais. Não voltar a limitar pela
  // altura.
  //
  // ⚠️ O topo é `insets.top`, NÃO `0`: a grade encosta no limite da área segura, logo
  // abaixo do relógio/sinal/bateria — como o Instagram. Colada em `0` ela passa POR
  // BAIXO da status bar e o relógio fica em cima da imagem.

  // Controles primeiro: é o bloco de baixo que define quanto de altura a grade cede.
  // Medidas EXPLÍCITAS, nada de "centraliza e torce" — o respiro entre a grade e o
  // disparo é `GAP_ABOVE`, um número que dá para ajustar.
  const SHUTTER   = 72 * S;
  const FLIP      = 46 * S;
  const GAP_ABOVE = 22 * S;
  const BOTTOM_BLOCK = GAP_ABOVE + SHUTTER + Math.max(14 * S, insets.bottom);

  const FRAME_TOP = insets.top;
  const FRAME_W = width;
  // ⚠️ A altura é a de 16/9 **ou o que couber**, o que for MENOR. Com 16/9 puro a grade
  // encostava no disparo (reclamação do usuário). Como a largura é intocável, quem cede
  // é a PROPORÇÃO: o desvio fica em ~2%, some no `cover` das células e é bem menos
  // perceptível do que a faixa preta nas laterais — que é o que voltaria se a largura
  // cedesse junto para manter 16/9 exato.
  const FRAME_H = Math.min((FRAME_W * 16) / 9, height - FRAME_TOP - BOTTOM_BLOCK);
  const frameBottom = FRAME_TOP + FRAME_H;
  const barTop = frameBottom;

  // Goteira entre células. ⚠️ MESMA fração da colagem final (`COLLAGE_GAP_FRACTION`) —
  // hoje ZERO: as células se tocam aqui exatamente como as fotos se tocam no arquivo
  // exportado. A grade continua visível pelas linhas desenhadas por cima (`LINE`).
  const GAP = FRAME_W * COLLAGE_GAP_FRACTION;
  const LINE = GRID_LINE_W * S;
  const rects = cellRects(grid, FRAME_W, FRAME_H, GAP);

  // ── Controle de grade: canto inferior esquerdo da PRIMEIRA célula ───────────
  // ⚠️ NÃO é o canto do quadro. É exatamente onde o Instagram põe o dele, e foi pedido
  // assim ("na mesma posição que o do Instagram"). Numa grade 2×2 isso cai no meio da
  // tela, à esquerda — igual à referência.
  const GRID_BTN_H = 44 * S;
  const gridBtnTop = rects[0].top + rects[0].height - GRID_BTN_H - 10 * S;

  // Bandeja: abre ABAIXO do controle, como no Instagram. Em grades cuja primeira célula
  // chega perto da base (`full`, `cols2`) não caberia embaixo — aí abre para cima.
  const SHEET_H = 8 * S * 2 + 52 * S * 3;
  const sheetBelow = gridBtnTop + GRID_BTN_H + 8 * S;
  const sheetTop =
    sheetBelow + SHEET_H <= FRAME_H - 8 * S
      ? sheetBelow
      : Math.max(8 * S, gridBtnTop - 8 * S - SHEET_H);

  // ── Preenchimento ───────────────────────────────────────────────────────────
  const fill = (index: number, uri: string) => {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = uri;
      return next;
    });
  };

  // Disparo. `capturingRef` é um mutex síncrono (Decisão 25): dois toques rápidos não
  // podem virar duas capturas — `useState` só desabilitaria o botão no próximo render.
  const handleCapture = async () => {
    if (capturingRef.current || activeIndex === -1 || !cameraRef.current) return;
    capturingRef.current = true;
    const target = activeIndex; // congela o alvo: ele muda durante o await
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

  // Galeria — só é alcançável quando NÃO há câmera ao vivo (simulador ou permissão
  // negada de vez). O disparo cai nela; sem isso a tela seria um beco sem saída, já
  // que o ícone de galeria por célula saiu junto com o resto do enfeite.
  const handlePick = async (index: number) => {
    if (capturingRef.current || index < 0) return;
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

  // Refazer — um toque na célula cheia limpa a foto; como a célula ativa é derivada,
  // a câmera volta para ELA automaticamente. Sem menu, sem confirmação.
  const handleRetake = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  // Trocar a grade. As fotos já tiradas são MANTIDAS na ordem, até onde couberem —
  // trocar de 2×2 para "duas empilhadas" preserva as duas primeiras. O que não cabe é
  // descartado, e isso fica visível na hora (as células somem).
  const changeGrid = (id: CollageGridId) => {
    haptics.tap();
    const next = getGrid(id);
    setPhotos((prev) => {
      const out: (string | null)[] = Array(next.cells).fill(null);
      prev.filter((p): p is string => p != null).slice(0, next.cells)
        .forEach((uri, i) => { out[i] = uri; });
      return out;
    });
    setGridId(id);
    setSheetOpen(false);
  };

  // ── Avanço ──────────────────────────────────────────────────────────────────
  // As URIs viajam pelo STORE (regra do projeto: router params truncam no bridge),
  // junto com a GRADE — sem ela a colagem final não sabe se as 2 fotos são empilhadas
  // ou lado a lado.
  const advance = useCallback(() => {
    const taken = photos.filter((p): p is string => p != null);
    if (taken.length !== photos.length || taken.length === 0) return;
    haptics.action();
    setCollagePhotos(taken);
    setCollageGrid(gridId);
    router.push('/(share)/share-preview' as any);
  }, [photos, gridId, router, setCollagePhotos, setCollageGrid]);

  // Grade completa → avança sozinha, como no Instagram (não existe "Continuar").
  // ⚠️ `advancedRef` impede que o avanço dispare DE NOVO quando a usuária volta do
  // preview com a grade ainda cheia — seria impossível sair desta tela. Ele rearma
  // assim que a grade deixa de estar cheia (um "refazer").
  const advancedRef = useRef(false);
  useEffect(() => {
    if (!isFull) { advancedRef.current = false; return; }
    if (advancedRef.current) return;
    advancedRef.current = true;
    advance();
  }, [isFull, advance]);

  // `useCameraPermissions` NÃO pede a permissão sozinho — só devolve o estado. Sem
  // esta chamada o iOS nunca mostra o diálogo e a câmera fica eternamente "não
  // concedida".
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission?.granted, permission?.canAskAgain]);

  // `permission` é null enquanto carrega — não tratar isso como negado (senão a tela
  // pisca a mensagem de erro antes de o usuário sequer ver o diálogo).
  const cameraReady  = !isSimulator && permission?.granted === true;
  const cameraDenied = !isSimulator && permission != null && !permission.granted && !permission.canAskAgain;

  // Fundo ao vivo borrado nas células vazias. Depende do módulo NATIVO estar no
  // binário (com o JS novo sobre um build antigo, cai nas células escuras) E de a
  // câmera já estar entregando imagem — ver `previewReady`.
  const mirrorOn = cameraReady && cameraMirrorAvailable && previewReady;

  const CTRL = 40 * S; // diâmetro dos controles redondos sobre a câmera

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* ⚠️ Fundo PRETO — e não branco. O branco já foi tentado e REPROVADO no device:
          ele revela os cantos arredondados e as sobras do quadro 9:16, e a tela deixa
          de parecer a do Instagram (onde a grade "cobre a tela"). No preto essas sobras
          somem. Não trocar por branco de novo. */}
      <StatusBar style="light" />

      {/* ── Quadro da câmera — 9:16, cantos arredondados, colado no topo ────────
          A grade inteira vive DENTRO dele: câmera ao fundo, fotos e divisórias por
          cima. `overflow: 'hidden'` é seguro aqui (não há ScrollView dentro). */}
      <View
        style={{
          position: 'absolute',
          top: FRAME_TOP,
          left: 0,
          width: FRAME_W,
          height: FRAME_H,
          // Sem `borderRadius`: o canto arredondado É uma borda visível contra o preto.
          overflow: 'hidden',
          backgroundColor: '#111',
        }}
      >
        {/* ── Fundo AO VIVO borrado (efeito Instagram) ─────────────────────────
            Segunda prévia da MESMA câmera, ampliada e borrada, cobrindo o quadro
            inteiro. Fica no fundo: a célula da vez (câmera nítida) e as células
            cheias (fotos) são desenhadas POR CIMA, então o borrão só aparece nas
            vazias — exatamente como no Instagram. `dim` calibra o escurecimento
            direto daqui, sem build nativo novo. */}
        {mirrorOn && <CameraMirror style={StyleSheet.absoluteFill} dim={0.22} />}

        {/* Células VAZIAS — só quando NÃO há o fundo ao vivo (Android, ou binário
            ainda sem o módulo nativo): placeholder escuro com ícone. */}
        {!mirrorOn && rects.map((r, i) =>
          photos[i] == null ? (
            <View
              key={`empty-${i}`}
              pointerEvents="none"
              style={{
                position: 'absolute', ...r,
                backgroundColor: '#1B1B1D',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {i !== activeIndex && (
                <Camera size={26 * S} color="rgba(255,255,255,0.32)" strokeWidth={1.75} />
              )}
            </View>
          ) : null
        )}

        {/* ── Câmera ao vivo — SÓ NA CÉLULA DA VEZ ──────────────────────────────
            UMA única CameraView, NUNCA desmontada: ela é REPOSICIONADA sobre a célula
            ativa (decisão 26 — mudar os bounds do AVCaptureVideoPreviewLayer só
            redimensiona a camada; desmontar reiniciaria a sessão, com flash/atraso a
            cada foto). Cheia a grade, `active={false}` PAUSA sem desmontar.
            ⚠️ Ela não cobre o quadro inteiro DE PROPÓSITO — ver o cabeçalho do arquivo.
            `mirror` só na frontal: espelha a foto de saída para bater com o preview
            (que o iOS já espelha na frontal); na traseira inverteria a cena de verdade. */}
        {cameraReady && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              ...(activeIndex !== -1 ? rects[activeIndex] : rects[0]),
              overflow: 'hidden',
              opacity: activeIndex !== -1 ? 1 : 0, // grade cheia → some, sem desmontar
            }}
          >
            <CameraView
              ref={cameraRef}
              style={{ flex: 1 }}
              facing={facing}
              mirror={facing === 'front'}
              active={activeIndex !== -1}
              onCameraReady={() => setPreviewReady(true)}
            />
          </View>
        )}

        {/* Fotos já tiradas — `cover`, nunca esticadas (igual à colagem final). */}
        {rects.map((r, i) =>
          photos[i] ? (
            <Image
              key={`ph-${i}`}
              source={{ uri: photos[i] as string }}
              resizeMode="cover"
              style={{ position: 'absolute', ...r }}
            />
          ) : null
        )}

        {/* Divisórias SUTIS — linhas de `LINE` pt CENTRADAS na fronteira entre células,
            desenhadas POR CIMA delas. ⚠️ Não são goteira: a goteira da colagem é zero
            (as fotos se tocam no resultado final, como no Instagram), então estas linhas
            servem só para enquadrar e NÃO aparecem na imagem exportada. */}
        {rects.map((r, i) => (
          <View key={`div-${i}`} pointerEvents="none">
            {r.left > 0 && (
              <View style={{
                position: 'absolute', left: r.left - GAP - LINE / 2, top: r.top,
                width: LINE, height: r.height, backgroundColor: GRID_LINE,
              }} />
            )}
            {r.top > 0 && (
              <View style={{
                position: 'absolute', left: 0, top: r.top - GAP - LINE / 2,
                width: FRAME_W, height: LINE, backgroundColor: GRID_LINE,
              }} />
            )}
          </View>
        ))}

        {/* Toque para REFAZER — um alvo por célula cheia. Fica acima das fotos. */}
        {rects.map((r, i) =>
          photos[i] ? (
            <TouchableOpacity
              key={`tap-${i}`}
              activeOpacity={0.85}
              disabled={busy}
              onPress={() => { haptics.tap(); handleRetake(i); }}
              style={{ position: 'absolute', ...r }}
            />
          ) : null
        )}

        {/* Fechar — canto superior esquerdo, sobre a câmera (como o X do Instagram) */}
        <TouchableOpacity
          onPress={() => { haptics.tap(); router.back(); }}
          activeOpacity={0.7}
          style={{
            // Relativo ao quadro, que já começa abaixo da status bar.
            position: 'absolute', left: 12 * S, top: 12 * S,
            width: CTRL, height: CTRL, borderRadius: CTRL / 2,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={24 * S} color={WHITE} strokeWidth={2.2} />
        </TouchableOpacity>

        {/* ── Controle "Alterar grade" ────────────────────────────────────────
            Cópia do controle do Instagram, a pedido do usuário: glifo da grade PELADO
            (sem círculo de fundo) + o rótulo "Alterar grade" ao lado, no canto inferior
            esquerdo da PRIMEIRA célula. É o ÚNICO símbolo de layout da tela e ele mesmo
            abre a bandeja — não existe o par "pílula branca + linha de menu + seta" do
            Instagram, que o usuário dispensou.
            ⚠️ Não reintroduzir o círculo de fundo nem mover para o canto do quadro.
            ⚠️ O glifo é DINÂMICO (desenha a grade escolhida, via `GridIcon`), enquanto o
            do Instagram é fixo: assim o controle também informa em que grade ela está.
            Altura 44 = alvo de toque mínimo da Apple. */}
        <TouchableOpacity
          onPress={() => { haptics.tap(); setSheetOpen((v) => !v); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Alterar grade — atual: ${grid.label}`}
          style={{
            position: 'absolute', left: 10 * S, top: gridBtnTop,
            height: GRID_BTN_H,
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 10 * S,
            opacity: sheetOpen ? 0.55 : 1, // único feedback de "bandeja aberta"
          }}
        >
          <GridIcon grid={grid} width={20 * S} color={WHITE} stroke={1.9 * S} />
          <Text
            style={{
              marginLeft: 12 * S,
              fontFamily: f7,
              fontSize: 14 * S,
              color: WHITE,
              letterSpacing: -0.2 * S,
            }}
          >
            Alterar grade
          </Text>
        </TouchableOpacity>

        {/* ── Bandeja de grades ───────────────────────────────────────────────
            Sobe a partir do botão, no canto inferior esquerdo, como no Instagram:
            painel escuro com as opções em 2 colunas; a escolhida é o círculo branco. */}
        {sheetOpen && (
          <>
            {/* Fundo de dispensa — cobre o quadro, então tocar em qualquer lugar da
                câmera fecha a bandeja sem escolher nada. */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setSheetOpen(false)}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={{
                position: 'absolute',
                left: 10 * S,
                top: sheetTop, // logo abaixo do controle (ou acima, se não couber)
                backgroundColor: SHEET_BG,
                borderRadius: 18 * S,
                padding: 8 * S,
                flexDirection: 'row',
                flexWrap: 'wrap',
                width: 8 * S * 2 + 52 * S * 2, // 2 colunas de 52
              }}
            >
              {COLLAGE_GRIDS.map((g) => {
                const on = g.id === gridId;
                return (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => changeGrid(g.id)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={g.label}
                    style={{
                      width: 52 * S, height: 52 * S,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 42 * S, height: 42 * S, borderRadius: 21 * S,
                        backgroundColor: on ? WHITE : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <GridIcon
                        grid={g}
                        width={15 * S}
                        color={on ? INK : WHITE}
                        stroke={1.5 * S}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* ── Barra de controles ─────────────────────────────────────────────────
          Disparo centrado + virar a câmera à direita, na mesma linha (molde do
          Instagram). Nada mais: sem "Continuar", sem legenda, sem contador. */}
      <View
        style={{ position: 'absolute', left: 0, right: 0, top: barTop, bottom: 0 }}
      >
        {/* ⚠️ UMA LINHA de altura fixa com os dois botões dentro — e não dois filhos
            soltos numa caixa centralizada. Era esse o bug do "virar câmera torto": ele
            é `position: absolute` e, sem esta linha, quem definia a altura dele era o
            `justifyContent` do pai, que o alinhava pelo box INTEIRO enquanto o disparo
            era centrado no box MENOS o `paddingBottom`. Resultado: centros a ~15pt de
            diferença. Dentro de uma linha de altura `SHUTTER` com `alignItems: center`,
            os dois centros coincidem por construção. */}
        <View
          style={{
            marginTop: GAP_ABOVE,
            height: SHUTTER,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
        <TouchableOpacity
          onPress={() => {
            haptics.action();
            if (isFull) advance();                 // volta do preview → seguir de novo
            else if (cameraReady) handleCapture();
            else handlePick(activeIndex);          // simulador / permissão negada
          }}
          disabled={busy}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={isFull ? 'Continuar' : 'Tirar foto'}
          style={{
            width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2,
            borderWidth: 3, borderColor: WHITE,
            backgroundColor: 'rgba(0,0,0,0.15)',
            alignItems: 'center', justifyContent: 'center',
            opacity: busy ? 0.5 : 1,
          }}
        >
          <View
            style={{
              width: 58 * S, height: 58 * S, borderRadius: 29 * S,
              // ⚠️ BRANCO, não o rosa da marca: é o disparo padrão do iPhone (anel
              // branco + fresta escura + miolo branco), que todo mundo já reconhece.
              // Pedido do usuário — não repintar de coral.
              backgroundColor: WHITE,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {/* Grade cheia → o MESMO botão vira seta. Não é um "Continuar" novo: é a
                única saída para quem voltou do preview com a colagem pronta. */}
            {/* Seta escura: o miolo do disparo é branco. */}
            {isFull && <ArrowRight size={28 * S} color={INK} strokeWidth={2.6} />}
          </View>
        </TouchableOpacity>

        {/* Virar a câmera — à direita, na linha do disparo (posição do Instagram) */}
        {cameraReady && (
          <TouchableOpacity
            onPress={() => {
              haptics.tap();
              setFacing((f) => (f === 'front' ? 'back' : 'front'));
            }}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Virar a câmera"
            style={{
              // Sem `top`/`bottom`: dentro da linha, o `alignItems: 'center'` do pai
              // dá a altura — é isso que garante o alinhamento com o disparo.
              position: 'absolute', right: 28 * S,
              width: FLIP, height: FLIP, borderRadius: FLIP / 2,
              backgroundColor: CTRL_BG,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {/* Molde do Instagram: círculo discreto + as DUAS setas em laço
                (`RefreshCw`). Não é o `SwitchCamera` do lucide (câmera com setas),
                que era o de antes. */}
            <RefreshCw size={21 * S} color={WHITE} strokeWidth={2.1} />
          </TouchableOpacity>
        )}
        </View>
      </View>

      {/* Permissão negada de vez — mensagem, nunca crash. O disparo cai na galeria. */}
      {cameraDenied && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', left: 0, right: 0,
            bottom: height - barTop + 10 * S,
            alignItems: 'center', paddingHorizontal: 24 * S,
          }}
        >
          <Text
            style={{
              fontFamily: f7, fontSize: 12 * S, color: WHITE, textAlign: 'center',
              backgroundColor: 'rgba(0,0,0,0.7)',
              paddingHorizontal: 12 * S, paddingVertical: 6 * S, borderRadius: 100,
              overflow: 'hidden',
            }}
          >
            Sem acesso à câmera — o botão abre a galeria.
          </Text>
        </View>
      )}
    </View>
  );
}
