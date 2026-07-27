import { View, Text, TouchableOpacity, Animated, Easing, useWindowDimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { useEffect, useRef, useState } from 'react';
import { X, Zap, ZapOff, Image as ImageIcon } from 'lucide-react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { haptics } from '../../lib/haptics';

// Réplica da tela de câmera do scan de comida (food-camera.tsx), adaptada para o
// scan de PRODUTO: mesma UI/animação, com o rótulo/ícone e o handoff de imagem
// próprios do produto. Aberta pelo botão "Escanear produto" da tela de Produtos.

type ZoomLevel = 0.5 | 1 | 2;

// Ícone do chip de modo — moldura de scan (cantos) com um frasco de produto no
// meio: quadradinho de "scan" + "produto" no centro.
function ProductScanIcon({ size = 22, color = '#1A1A1A' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {/* moldura de scan — cantos */}
      <Path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
      <Path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" />
      <Path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" />
      <Path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      {/* produto (frasco) no meio */}
      <Rect x={10.2} y={8} width={3.6} height={2.1} rx={0.6} />
      <Rect x={9.3} y={10.1} width={5.4} height={6.4} rx={1.4} />
    </Svg>
  );
}

export default function ProductCamera() {
  const router = useRouter();
  const { consentGate } = useScanConsentGate();
  const { setProductImage } = useAppStore();
  const { width } = useWindowDimensions();
  const FRAME_SIZE = Math.round(width * 0.88);
  const SCAN_TRAVEL = FRAME_SIZE - 16;
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [flash, setFlash] = useState(false);
  const [picking, setPicking] = useState(false);
  const navigatingRef = useRef(false);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // Verdadeiro apenas no simulador (sem câmera real)
  const isSimulator = !Device.isDevice;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: SCAN_TRAVEL,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const processAndAnalyze = async (uri: string) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    let manipulated;
    try {
      manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 512 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
    } catch (e) {
      console.error('manipulateAsync falhou:', e);
      navigatingRef.current = false;
    }

    const base64 = manipulated?.base64;
    if (!base64) {
      navigatingRef.current = false;
      Alert.alert('Erro', 'Não foi possível processar a imagem.');
      return;
    }

    console.log('base64 size KB:', Math.round((base64.length * 0.75) / 1024));
    setProductImage(base64, 'image/jpeg');
    // Vai para a tela de carregamento, que chama a Edge Function `analisar-produto`
    // e, ao terminar, navega para a tela de resultado. (navigatingRef fica true
    // para evitar dupla navegação — mesmo padrão do food-camera.)
    router.push('/(scan)/product-loading' as any);
  };

  // Captura via câmera real
  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      setPicking(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
      if (!photo?.uri) throw new Error('Falha ao capturar');
      await processAndAnalyze(photo.uri);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível capturar a foto. Tente novamente.');
    } finally {
      setPicking(false);
    }
  };

  // Abre galeria (simulador ou botão de galeria no celular real)
  const pickAndAnalyze = async () => {
    try {
      setPicking(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: false,
        exif: false,
      });

      if (result.canceled || !result.assets[0]) return;

      await processAndAnalyze(result.assets[0].uri);
    } catch (error) {
      console.error('Erro ao selecionar imagem:', error);
      Alert.alert('Erro', 'Não foi possível selecionar a imagem.');
    } finally {
      setPicking(false);
    }
  };

  const zoomLevels: ZoomLevel[] = [0.5, 1, 2];

  // Tela de permissão (apenas no celular real)
  if (!isSimulator && !permission?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ color: 'white', fontSize: 17, textAlign: 'center', marginBottom: 24 }}>
          O NIKS AI precisa da câmera para analisar seu produto.
        </Text>
        <TouchableOpacity
          onPress={() => { haptics.tap(); requestPermission(); }}
          style={{ backgroundColor: 'white', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>Permitir câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#111111' }}>
      {/* Camera real (dispositivo físico) */}
      {!isSimulator && permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          zoom={zoom === 0.5 ? 0 : zoom === 1 ? 0 : 0.5}
          enableTorch={flash}
        />
      )}

      {/* ===== TOP CONTROLS ===== */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 60,
          paddingBottom: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => { haptics.tap(); router.back(); }}
          activeOpacity={0.8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={20} color="white" strokeWidth={2.5} />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>?</Text>
        </TouchableOpacity>
      </View>

      {/* ===== SCANNING FRAME ===== */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 112, paddingBottom: 266 }}>
        <View style={{ position: 'relative', width: FRAME_SIZE, height: FRAME_SIZE }}>
          {/* Corner brackets — top-left */}
          <View style={{ position: 'absolute', top: 0, left: 0, width: 44, height: 44 }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: 'white', borderRadius: 2 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, backgroundColor: 'white', borderRadius: 2 }} />
          </View>
          {/* Corner brackets — top-right */}
          <View style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44 }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: 'white', borderRadius: 2 }} />
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, backgroundColor: 'white', borderRadius: 2 }} />
          </View>
          {/* Corner brackets — bottom-left */}
          <View style={{ position: 'absolute', bottom: 0, left: 0, width: 44, height: 44 }}>
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'white', borderRadius: 2 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, backgroundColor: 'white', borderRadius: 2 }} />
          </View>
          {/* Corner brackets — bottom-right */}
          <View style={{ position: 'absolute', bottom: 0, right: 0, width: 44, height: 44 }}>
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'white', borderRadius: 2 }} />
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, backgroundColor: 'white', borderRadius: 2 }} />
          </View>

          {/* Subtle inner border */}
          <View
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              borderRadius: 4,
            }}
          />

          {/* Animated coral scan line */}
          <Animated.View
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              height: 2,
              borderRadius: 1,
              backgroundColor: '#FB7B6B',
              shadowColor: '#FB7B6B',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 6,
              transform: [{ translateY: scanAnim }],
              top: 8,
            }}
          />

          {/* Instruction text */}
          <View style={{ position: 'absolute', bottom: -36, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' }}>
              Posicione o produto no centro
            </Text>
          </View>
        </View>
      </View>

      {/* ===== BOTTOM SECTION ===== */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 48 }}>
        {/* Zoom controls */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          {zoomLevels.map((z) => (
            <TouchableOpacity
              key={z}
              onPress={() => { haptics.select(); setZoom(z); }}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 5,
                borderRadius: 999,
                minWidth: 48,
                alignItems: 'center',
                backgroundColor: zoom === z ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.45)',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: zoom === z ? '#1A1A1A' : 'rgba(255,255,255,0.85)' }}>
                {z}x
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Mode selector */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 24 }}>
          <View
            style={{
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: 'rgba(255,255,255,0.95)',
              minWidth: 100,
            }}
          >
            <ProductScanIcon size={22} color="#1A1A1A" />
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#1A1A1A', textAlign: 'center' }}>
              Escanear produto
            </Text>
          </View>
        </View>

        {/* Camera controls row: flash | shutter | gallery */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 48 }}>
          {/* Flash toggle */}
          <TouchableOpacity
            onPress={() => { haptics.select(); setFlash(!flash); }}
            activeOpacity={0.8}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {flash ? (
              <Zap size={20} color="#FFD700" strokeWidth={2} fill="#FFD700" />
            ) : (
              <ZapOff size={20} color="rgba(255,255,255,0.7)" strokeWidth={1.8} />
            )}
          </TouchableOpacity>

          {/* Shutter — câmera real no celular, galeria no simulador */}
          <TouchableOpacity
            onPress={() => { haptics.action(); isSimulator ? pickAndAnalyze() : handleCapture(); }}
            disabled={picking}
            activeOpacity={0.9}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              borderWidth: 3,
              borderColor: 'rgba(255,255,255,0.85)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: picking ? 0.5 : 1,
            }}
          >
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.92)' }} />
          </TouchableOpacity>

          {/* Gallery button — sempre visível */}
          <TouchableOpacity
            onPress={() => { haptics.tap(); pickAndAnalyze(); }}
            disabled={picking}
            activeOpacity={0.8}
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: picking ? 0.5 : 1,
            }}
          >
            <ImageIcon size={20} color="rgba(255,255,255,0.8)" strokeWidth={1.8} />
          </TouchableOpacity>
        </View>
      </View>

      {consentGate}
    </View>
  );
}
