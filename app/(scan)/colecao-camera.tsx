import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, useWindowDimensions, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Zap, ZapOff, Image as ImageIcon } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_600SemiBold, Nunito_400Regular } from '@expo-google-fonts/nunito';
import { useAppStore } from '../../store/onboarding';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { useFaceScan } from '../../hooks/useFaceScan';
import { MAX_PRODUTOS_PRIMEIRO_FLUXO } from '../../lib/colecaoFlow';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';

// ─────────────────────────────────────────────────────────────────────────────
// PRIMEIRO FLUXO DA MINHA COLEÇÃO — fotografar os produtos que ela tem em casa,
// TODOS EM SEQUÊNCIA, sem esperar análise entre uma foto e outra.
//
// ⚠️ Esta tela NÃO chama a IA. Ela só enfileira as fotos no store
// (`colecaoQueue`); a análise roda depois, em background, quando o scan de pele
// de 6 fotos já estiver salvo — é isso que faz a compatibilidade de cada produto
// nascer contra o scan NOVO, sem custar uma segunda chamada de visão por produto.
// Ver o cabeçalho de `lib/colecaoFlow.ts`.
//
// Saída ÚNICA: o scan de rosto de dentro do app. "Pronto" e "Pular" vão os dois
// para lá (a spec: nos dois casos ela segue direto para o scan de pele).
// ─────────────────────────────────────────────────────────────────────────────

const PINK = '#FF9D9D';
const INK = '#121212';

export default function ColecaoCamera() {
  const router = useRouter();
  const { consentGate } = useScanConsentGate();
  const { startFaceScanSemGate } = useFaceScan();
  const { track } = useMixpanel();
  const { width } = useWindowDimensions();

  const colecaoQueue = useAppStore((s) => s.colecaoQueue);
  const addColecaoFoto = useAppStore((s) => s.addColecaoFoto);

  const FRAME_SIZE = Math.round(width * 0.82);
  const SCAN_TRAVEL = FRAME_SIZE - 16;
  const [flash, setFlash] = useState(false);
  const [picking, setPicking] = useState(false);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  // Guard de execução dupla (decisão 25): dois toques rápidos no obturador não
  // podem enfileirar a mesma foto duas vezes (= duas chamadas de IA depois).
  const capturingRef = useRef(false);
  const isSimulator = !Device.isDevice;

  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold, Nunito_600SemiBold, Nunito_400Regular });
  const f8 = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const f6 = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const f4 = fontsLoaded ? 'Nunito_400Regular' : undefined;

  const total = colecaoQueue.length;
  const cheio = total >= MAX_PRODUTOS_PRIMEIRO_FLUXO;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: SCAN_TRAVEL, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
      ]),
    ).start();
  }, [SCAN_TRAVEL, scanAnim]);

  // Mesmo downscale do caminho de produção do scan de produto (512px, JPEG 0.5):
  // a análise depois é a MESMA Edge Function, então a imagem tem que ser a mesma.
  const enfileirar = async (uri: string) => {
    if (capturingRef.current || cheio) return;
    capturingRef.current = true;
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 512 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!manipulated?.base64) throw new Error('sem base64');
      addColecaoFoto({ base64: manipulated.base64, mimeType: 'image/jpeg' });
      haptics.success();
    } catch (e) {
      console.error('[colecao-camera] falha ao processar a foto:', e);
      haptics.error();
      Alert.alert('Erro', 'Não foi possível usar essa foto. Tente de novo.');
    } finally {
      capturingRef.current = false;
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || cheio) return;
    try {
      setPicking(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
      if (!photo?.uri) throw new Error('Falha ao capturar');
      await enfileirar(photo.uri);
    } catch {
      Alert.alert('Erro', 'Não foi possível capturar a foto. Tente novamente.');
    } finally {
      setPicking(false);
    }
  };

  const pickFromGallery = async () => {
    if (cheio) return;
    try {
      setPicking(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: false, exif: false,
      });
      if (result.canceled || !result.assets[0]) return;
      await enfileirar(result.assets[0].uri);
    } catch (e) {
      console.error('[colecao-camera] galeria falhou:', e);
      Alert.alert('Erro', 'Não foi possível selecionar a imagem.');
    } finally {
      setPicking(false);
    }
  };

  // Única saída da tela: o scan de rosto. `startFaceScanSemGate` de propósito —
  // o gate do primeiro fluxo já foi respondido; o gated mandaria ela de volta
  // para a Rotina, em círculo.
  const seguirParaScan = () => {
    track('colecao_fotos_enfileiradas', { total });
    startFaceScanSemGate();
  };

  const sair = () => {
    // Desistir aqui descarta a fila: fotos sem análise não viram nada, e deixá-las
    // no store faria o próximo scan de pele analisar produtos que ela abandonou.
    useAppStore.getState().setColecaoQueue([]);
    track('colecao_primeiro_fluxo_abandonado', { total });
    router.back();
  };

  if (!isSimulator && !permission?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ color: 'white', fontSize: 17, textAlign: 'center', marginBottom: 24 }}>
          O NIKS precisa da câmera para reconhecer os produtos que você tem em casa.
        </Text>
        <TouchableOpacity
          onPress={() => { haptics.tap(); requestPermission(); }}
          style={{ backgroundColor: 'white', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: INK }}>Permitir câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#111111' }}>
      {!isSimulator && permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          enableTorch={flash}
        />
      )}

      {/* ===== TOPO: sair + contador ===== */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <TouchableOpacity
          onPress={() => { haptics.tap(); sair(); }}
          activeOpacity={0.8}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={20} color="white" strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Text style={{ fontFamily: f6, fontSize: 13, color: 'white' }}>
            {total === 0 ? 'Nenhum produto ainda' : `${total} de ${MAX_PRODUTOS_PRIMEIRO_FLUXO}`}
          </Text>
        </View>
      </View>

      {/* ===== MOLDURA ===== */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 96, paddingBottom: 300 }}>
        <View style={{ position: 'relative', width: FRAME_SIZE, height: FRAME_SIZE }}>
          {[
            { top: 0, left: 0 }, { top: 0, right: 0 }, { bottom: 0, left: 0 }, { bottom: 0, right: 0 },
          ].map((pos, i) => (
            <View key={i} style={{ position: 'absolute', width: 44, height: 44, ...pos }}>
              <View style={{ position: 'absolute', [i < 2 ? 'top' : 'bottom']: 0, left: 0, right: 0, height: 3, backgroundColor: 'white', borderRadius: 2 }} />
              <View style={{ position: 'absolute', top: 0, bottom: 0, [i % 2 === 0 ? 'left' : 'right']: 0, width: 3, backgroundColor: 'white', borderRadius: 2 }} />
            </View>
          ))}

          <Animated.View style={{ position: 'absolute', left: 12, right: 12, top: 8, height: 2, borderRadius: 1, backgroundColor: PINK, shadowColor: PINK, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, transform: [{ translateY: scanAnim }] }} />

          <View style={{ position: 'absolute', bottom: -44, left: -20, right: -20, alignItems: 'center' }}>
            <Text style={{ fontFamily: f8, fontSize: 16, color: 'white', textAlign: 'center' }}>
              {cheio ? 'Por hoje é isso!' : 'Fotografe um produto por vez'}
            </Text>
            <Text style={{ fontFamily: f4, fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', marginTop: 5, lineHeight: 18 }}>
              {cheio
                ? `Você chegou a ${MAX_PRODUTOS_PRIMEIRO_FLUXO} produtos. Dá para adicionar o resto depois, pela aba Minha Coleção.`
                : 'Não precisa esperar: tire uma foto atrás da outra. A NIKS analisa tudo depois.'}
            </Text>
          </View>
        </View>
      </View>

      {/* ===== BASE: miniaturas + controles ===== */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40 }}>
        {/* Pilha de miniaturas do que já foi fotografado (só as 5 últimas cabem) */}
        {total > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            {colecaoQueue.slice(-5).map((f, i) => (
              <Image
                key={i}
                source={{ uri: `data:${f.mimeType};base64,${f.base64}` }}
                style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.65)' }}
              />
            ))}
            {total > 5 && (
              <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: f8, fontSize: 13, color: 'white' }}>+{total - 5}</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 44 }}>
          <TouchableOpacity
            onPress={() => { haptics.select(); setFlash(!flash); }}
            activeOpacity={0.8}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}
          >
            {flash ? <Zap size={20} color="#FFD700" strokeWidth={2} fill="#FFD700" /> : <ZapOff size={20} color="rgba(255,255,255,0.7)" strokeWidth={1.8} />}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { haptics.action(); isSimulator ? pickFromGallery() : handleCapture(); }}
            disabled={picking || cheio}
            activeOpacity={0.9}
            style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', opacity: picking || cheio ? 0.4 : 1 }}
          >
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.92)' }} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { haptics.tap(); pickFromGallery(); }}
            disabled={picking || cheio}
            activeOpacity={0.8}
            style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', opacity: picking || cheio ? 0.4 : 1 }}
          >
            <ImageIcon size={20} color="rgba(255,255,255,0.8)" strokeWidth={1.8} />
          </TouchableOpacity>
        </View>

        {/* Avançar para o scan de rosto — rótulo muda conforme ela já fotografou algo */}
        <View style={{ paddingHorizontal: 24, marginTop: 22 }}>
          <TouchableOpacity
            onPress={() => { haptics.action(); seguirParaScan(); }}
            activeOpacity={0.9}
            style={{
              height: 54, borderRadius: 100, backgroundColor: total > 0 ? PINK : 'rgba(255,255,255,0.16)',
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Text style={{ fontFamily: f8, fontSize: 16, color: 'white' }}>
              {total > 0 ? 'Pronto, agora meu rosto' : 'Pular e escanear meu rosto'}
            </Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12h14M13 6l6 6-6 6" />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>

      {consentGate}
    </View>
  );
}
