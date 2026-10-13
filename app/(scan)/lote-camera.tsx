// ─────────────────────────────────────────────────────────────────────────────
// Câmera do scan em lote "Montar minha rotina com meus produtos" — réplica do Claude
// Design (`NiksLoteFlo`, telas 55b/55c/55d), em cima da câmera de verdade.
// Produto por produto (até 7):
//   1. FRENTE ("Foto da frente" · seletor Frente|Rótulo no topo);
//   2. RÓTULO de ingredientes — ou "Pular rótulo · a análise fica menos precisa".
// Depois do rótulo (ou do pular) o app monta a imagem combinada (lib/loteProdutos) e
// já pede a frente do próximo; no 7º vai direto para a revisão. A fileira de 7 espaços
// mostra quantos já foram. "Pronto" (só na frente, com 1+ produto) e o X (com produtos) levam à revisão; sem
// produtos, o X sai. Nada é analisado aqui.
// `?rotuloDe=<id>`: abre direto no rótulo de um produto já fotografado ("Adicionar
// rótulo" da revisão) e volta. No simulador (sem câmera), o disparador abre a galeria.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Animated, Easing, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image as ExpoImage } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Device from 'expo-device';
import Svg, { Path } from 'react-native-svg';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { haptics } from '../../lib/haptics';
import { MAX_PRODUTOS_LOTE, montarProduto, useLote } from '../../lib/loteProdutos';
import { usePalco } from '../../lib/palco';

type Etapa = 'frente' | 'rotulo';
const PINK = '#FF5EA8';
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

// Moldura do design (left/right 36, top 244, altura 392).
const MOLD = { x: 36, y: 244, w: 393 - 72, h: 392 };

export default function LoteCamera() {
  const router = useRouter();
  const { rotuloDe } = useLocalSearchParams<{ rotuloDe?: string }>();
  const { consentGate } = useScanConsentGate();
  const palco = usePalco();
  const produtos = useLote((s) => s.produtos);
  const adicionar = useLote((s) => s.adicionar);
  const substituir = useLote((s) => s.substituir);

  const alvo = rotuloDe ? produtos.find((p) => p.id === rotuloDe) ?? null : null;
  const [etapa, setEtapa] = useState<Etapa>(alvo ? 'rotulo' : 'frente');
  const [frenteUri, setFrenteUri] = useState<string | null>(alvo?.frenteUri ?? null);
  const [ocupado, setOcupado] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const isSimulator = !Device.isDevice;

  const count = produtos.length;
  const numero = alvo ? produtos.indexOf(alvo) + 1 : Math.min(count + 1, MAX_PRODUTOS_LOTE);
  const cheio = !alvo && count >= MAX_PRODUTOS_LOTE;
  const rot = etapa === 'rotulo';

  // Seletor Frente|Rótulo (.3s) · flash da foto (.28s) · disparador apertado (.15s).
  const rotV = useRef(new Animated.Value(rot ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(rotV, { toValue: rot ? 1 : 0, duration: 300, easing: EASE, useNativeDriver: false }).start();
  }, [rot, rotV]);
  const flash = useRef(new Animated.Value(0)).current;
  const piscar = () => {
    flash.setValue(0.85);
    Animated.timing(flash, { toValue: 0, duration: 280, delay: 140, easing: EASE, useNativeDriver: true }).start();
  };
  const shut = useRef(new Animated.Value(1)).current;
  const apertar = (v: number) => Animated.timing(shut, { toValue: v, duration: 150, easing: EASE, useNativeDriver: true }).start();

  // Uma foto (câmera ou, no simulador, galeria).
  const fotografar = async (): Promise<string | null> => {
    if (isSimulator) {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
      return r.canceled ? null : r.assets[0]?.uri ?? null;
    }
    const foto = await cameraRef.current?.takePictureAsync({ quality: 0.9, base64: false });
    return foto?.uri ?? null;
  };

  // Fecha o produto (com rótulo ou sem) → imagem combinada → próximo.
  const fecharProduto = async (frente: string, rotulo: string | null) => {
    if (alvo) {
      substituir(await montarProduto(frente, rotulo, alvo.id));
      router.back();
      return;
    }
    const p = await montarProduto(frente, rotulo);
    adicionar(p);
    setFrenteUri(null);
    setEtapa('frente');
    if (count + 1 >= MAX_PRODUTOS_LOTE) router.replace('/(scan)/lote-revisao' as any);
  };

  const disparar = async () => {
    if (ocupado || cheio) return;
    haptics.action();
    setOcupado(true);
    try {
      const uri = await fotografar();
      if (!uri) return;
      piscar();
      if (etapa === 'frente') {
        setFrenteUri(uri);
        setEtapa('rotulo');
      } else if (frenteUri) {
        await fecharProduto(frenteUri, uri);
      }
    } catch (e) {
      console.warn('[lote-camera] foto falhou:', e);
      Alert.alert('Não deu para usar essa foto', 'Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const pularRotulo = async () => {
    if (ocupado || !frenteUri) return;
    haptics.tap();
    setOcupado(true);
    try {
      await fecharProduto(frenteUri, null);
    } catch (e) {
      console.warn('[lote-camera] montar falhou:', e);
      Alert.alert('Não deu para usar essa foto', 'Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  // X: com produtos, vai para a revisão (de lá dá para sair); sem produtos, sai.
  const fechar = () => {
    haptics.tap();
    if (alvo || count === 0) { router.back(); return; }
    router.push('/(scan)/lote-revisao' as any);
  };
  const revisar = () => { haptics.tap(); router.push('/(scan)/lote-revisao' as any); };

  if (!isSimulator && !permission?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ color: 'white', fontSize: 17, textAlign: 'center', marginBottom: 24 }}>
          O NIKS AI precisa da câmera para fotografar seus produtos.
        </Text>
        <TouchableOpacity
          onPress={() => { haptics.tap(); requestPermission(); }}
          style={{ backgroundColor: 'white', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>Permitir câmera</Text>
        </TouchableOpacity>
        {consentGate}
      </View>
    );
  }

  // Véu fora da moldura (o box-shadow 0 0 0 999px rgba(10,8,9,.48) do design).
  const m = palco.naTela(MOLD.x, MOLD.y, MOLD.w, MOLD.h);
  const VEU = 'rgba(10,8,9,0.48)';
  const fotoAtual = rot ? frenteUri : null;

  // Fileira de 7 espaços.
  const tray = Array.from({ length: MAX_PRODUTOS_LOTE }, (_, i) => {
    const done = i < count;
    const curr = i === count && !alvo;
    return { i, done, curr, img: done ? produtos[i].frenteUri : curr && rot ? fotoAtual : null };
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#0F0D0E' }}>
      <StatusBar style="light" />
      {!isSimulator && permission?.granted && (
        <CameraView ref={cameraRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="back" />
      )}

      {/* Véu em volta da moldura (tela inteira) */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: m.y, backgroundColor: VEU }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: m.y + m.h, bottom: 0, backgroundColor: VEU }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, width: m.x, top: m.y, height: m.h, backgroundColor: VEU }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: m.x + m.w, right: 0, top: m.y, height: m.h, backgroundColor: VEU }} />

      <View style={palco.style} pointerEvents="box-none">
        {/* Cantos rosa da moldura */}
        <View pointerEvents="none" style={[st.canto, { left: 36, top: 244, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 24 }]} />
        <View pointerEvents="none" style={[st.canto, { right: 36, top: 244, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 24 }]} />
        <View pointerEvents="none" style={[st.canto, { left: 36, top: 594, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 24 }]} />
        <View pointerEvents="none" style={[st.canto, { right: 36, top: 594, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 24 }]} />

        {/* Topo: fechar · "Produto N" */}
        <View style={{ position: 'absolute', left: 18, right: 18, top: 54, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity onPress={fechar} accessibilityLabel="Fechar" activeOpacity={0.85} style={st.fechar}>
            <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" /></Svg>
          </TouchableOpacity>
          <Text style={st.produtoN}>Produto {numero}</Text>
          <View style={{ width: 40, height: 40 }} />
        </View>

        {/* Seletor Frente | Rótulo */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 106, alignItems: 'center' }}>
          <View style={st.seg}>
            <Animated.View style={[st.segItem, { backgroundColor: rotV.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', 'rgba(255,255,255,0)'] }) }]}>
              {rot && (
                <View style={st.segCheck}>
                  <Svg width={9} height={9} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#FFFFFF" strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                </View>
              )}
              <Animated.Text style={[st.segTxt, { color: rotV.interpolate({ inputRange: [0, 1], outputRange: ['#121212', 'rgba(255,255,255,0.85)'] }) }]}>Frente</Animated.Text>
            </Animated.View>
            <Animated.View style={[st.segItem, { backgroundColor: rotV.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0)', '#FFFFFF'] }) }]}>
              <Animated.Text style={[st.segTxt, { color: rotV.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.6)', '#121212'] }) }]}>Rótulo</Animated.Text>
            </Animated.View>
          </View>
        </View>

        {/* Instrução */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 28, right: 28, top: 152, alignItems: 'center', gap: 5 }}>
          <Text style={st.titulo}>{rot ? 'Agora, o rótulo de ingredientes' : 'Foto da frente'}</Text>
          <Text style={st.sub}>
            {rot ? 'Vire o produto e enquadre a lista inteira. Chegue perto, com boa luz e sem reflexo.' : 'Com o nome e a marca bem visíveis.'}
          </Text>
        </View>

        {/* Fileira de 7 espaços + contagem */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 660, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {tray.map((t) => (
            <View
              key={t.i}
              style={[st.slot,
                t.done ? { backgroundColor: '#FFFFFF' }
                  : t.curr ? { backgroundColor: rot ? '#FFFFFF' : 'rgba(255,94,168,0.12)', borderWidth: 2, borderColor: PINK }
                    : { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)' }]}
            >
              {t.img ? <ExpoImage source={{ uri: t.img }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                : t.curr ? <Text style={st.slotN}>{t.i + 1}</Text> : null}
            </View>
          ))}
        </View>
        <Text pointerEvents="none" style={st.trayNote}>{count === 0 ? `Até ${MAX_PRODUTOS_LOTE} produtos` : `${count} de ${MAX_PRODUTOS_LOTE} produtos`}</Text>

        {/* Rótulo: a frente já tirada + "Pular rótulo" */}
        {rot && (
          <>
            <View pointerEvents="none" style={st.frenteMini}>
              {!!frenteUri && <ExpoImage source={{ uri: frenteUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
            </View>
            {!alvo && (
              <TouchableOpacity onPress={pularRotulo} disabled={ocupado} activeOpacity={0.85} style={st.pular}>
                <Text style={st.pularTxt}>Pular rótulo</Text>
                <Text style={st.pularSub}>a análise fica menos precisa</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {/* Frente com produtos: "Pronto" — deixa óbvio que não precisa chegar a 7
            (no design era "Revisar (N)"; trocado a pedido do Douglas). Leva à revisão. */}
        {!rot && !alvo && count > 0 && (
          <TouchableOpacity onPress={revisar} disabled={ocupado} activeOpacity={0.85} style={st.revisar}>
            <Text style={st.revisarTxt}>Pronto</Text>
          </TouchableOpacity>
        )}

        {/* Disparador */}
        <Pressable
          onPress={disparar}
          onPressIn={() => apertar(0.88)}
          onPressOut={() => apertar(1)}
          disabled={ocupado || cheio}
          accessibilityLabel={rot ? 'Fotografar o rótulo' : 'Fotografar a frente'}
          style={[st.disparador, { opacity: cheio ? 0.4 : 1 }]}
        >
          {ocupado
            ? <ActivityIndicator color="#FFFFFF" />
            : <Animated.View style={[st.disparadorMiolo, { transform: [{ scale: shut }] }]} />}
        </Pressable>
      </View>

      {/* Flash da foto */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', opacity: flash }} />
      {consentGate}
    </View>
  );
}

const st = {
  canto: { position: 'absolute' as const, width: 42, height: 42, borderColor: PINK },
  fechar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center' as const, justifyContent: 'center' as const },
  produtoN: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.3, color: '#FFFFFF' },
  seg: { flexDirection: 'row' as const, gap: 2, padding: 3, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.12)' },
  segItem: { height: 30, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 14, borderRadius: 100 },
  segCheck: { width: 16, height: 16, borderRadius: 8, backgroundColor: PINK, alignItems: 'center' as const, justifyContent: 'center' as const },
  segTxt: { fontSize: 14, fontWeight: '600' as const, letterSpacing: -0.2 },
  titulo: { fontSize: 24, fontWeight: '700' as const, lineHeight: 29, letterSpacing: -0.6, color: '#FFFFFF', textAlign: 'center' as const },
  sub: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: 'rgba(255,255,255,0.72)', textAlign: 'center' as const },
  slot: { width: 34, height: 34, borderRadius: 10, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
  slotN: { fontSize: 13, fontWeight: '700' as const, color: PINK },
  trayNote: { position: 'absolute' as const, left: 0, right: 0, top: 704, textAlign: 'center' as const, fontSize: 12, fontWeight: '500' as const, color: 'rgba(255,255,255,0.5)' },
  frenteMini: { position: 'absolute' as const, left: 32, top: 736, width: 52, height: 52, borderRadius: 13, borderWidth: 2, borderColor: '#FFFFFF', overflow: 'hidden' as const, backgroundColor: '#FFFFFF' },
  pular: { position: 'absolute' as const, right: 22, top: 740, width: 104, alignItems: 'flex-end' as const, gap: 2 },
  pularTxt: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.3, color: '#FFFFFF' },
  pularSub: { fontSize: 12, lineHeight: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'right' as const },
  revisar: {
    position: 'absolute' as const, right: 20, top: 742, height: 40, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    paddingHorizontal: 16, borderRadius: 100, backgroundColor: PINK,
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.32, shadowRadius: 8,
  },
  revisarTxt: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.25, color: '#FFFFFF' },
  disparador: {
    position: 'absolute' as const, left: (393 - 76) / 2, top: 724, width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  disparadorMiolo: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' },
};
