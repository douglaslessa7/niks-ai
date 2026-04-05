import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import { X, Image as ImageIcon } from 'lucide-react-native';
import Svg, { Ellipse } from 'react-native-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Device from 'expo-device';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

export default function Camera() {
  const router = useRouter();
  const { setSkinImage } = useAppStore();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const { track } = useMixpanel();

  // Verdadeiro apenas no simulador (sem câmera real)
  const isSimulator = !Device.isDevice;

  const navigateToLoading = (base64: string, uri: string) => {
    track('onboarding_step_completed', { step_number: 14, step_name: 'Scan - Câmera', step_total: 23 });
    setSkinImage(base64, uri);
    router.push('/(scan)/loading' as any);
  };

  const handlePickImage = async () => {
    try {
      setCapturing(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (!asset.base64) throw new Error('Sem base64');
        navigateToLoading(asset.base64, asset.uri);
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível selecionar a foto.');
    } finally {
      setCapturing(false);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      if (!photo?.base64 || !photo?.uri) throw new Error('Falha ao capturar');
      navigateToLoading(photo.base64, photo.uri);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível capturar a foto. Tente novamente.');
    } finally {
      setCapturing(false);
    }
  };

  if (!isSimulator && !permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ color: 'white', fontSize: 17, textAlign: 'center', marginBottom: 24 }}>
            O NIKS AI precisa da câmera para analisar sua pele.
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            style={{ backgroundColor: 'white', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>Permitir câmera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Close button */}
      <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8} style={styles.closeBtn}>
        <X size={20} color="white" />
      </TouchableOpacity>

      {/* Camera real (dispositivo físico) */}
      {!isSimulator && permission?.granted && (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
      )}

      {/* Face Guide overlay */}
      <View style={styles.cameraPlaceholder}>
        <View style={styles.guideContainer}>
          <Svg width={256} height={320} style={StyleSheet.absoluteFill}>
            <Ellipse
              cx={128} cy={160} rx={126} ry={158}
              stroke="rgba(255,255,255,0.3)" strokeWidth={2} fill="none"
            />
          </Svg>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <View style={styles.instructionWrapper}>
            <Text style={styles.instructionText}>
              Posicione seu rosto no centro da moldura
            </Text>
          </View>
        </View>
      </View>

      {/* Botão branco de captura — centro inferior */}
      <View style={styles.captureArea}>
        <TouchableOpacity
          onPress={handleCapture}
          activeOpacity={0.9}
          disabled={capturing || isSimulator}
          style={[styles.captureOuter, (capturing || isSimulator) && { opacity: 0.5 }]}
        >
          <View style={styles.captureInner} />
        </TouchableOpacity>
      </View>

      {/* Botão galeria — simulador: único modo; celular real: alternativa */}
      <TouchableOpacity
        onPress={handlePickImage}
        activeOpacity={0.8}
        disabled={capturing}
        style={styles.galleryBtn}
      >
        <ImageIcon size={20} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
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
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideContainer: { width: 256, height: 320 },
  corner: { position: 'absolute', width: 32, height: 32 },
  cornerTL: { top: 0, left: 32, borderTopWidth: 2, borderLeftWidth: 2, borderColor: 'white', borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 32, borderTopWidth: 2, borderRightWidth: 2, borderColor: 'white', borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 32, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: 'white', borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 32, borderBottomWidth: 2, borderRightWidth: 2, borderColor: 'white', borderBottomRightRadius: 8 },
  instructionWrapper: {
    position: 'absolute', bottom: -48, left: 0, right: 0, alignItems: 'center',
  },
  instructionText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  captureArea: {
    paddingBottom: 48, alignItems: 'center',
  },
  captureOuter: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 4, borderColor: 'white',
    alignItems: 'center', justifyContent: 'center',
  },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'white' },
  galleryBtn: {
    position: 'absolute',
    bottom: 56,
    right: 32,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
