import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Animated, Easing, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { X, Image as ImageIcon } from 'lucide-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { CONSENT_SOS_BODY } from '../../components/ui/AIConsentModal';
import { haptics } from '../../lib/haptics';
import { guardarFoto, lerUltimaAnalise } from '../../lib/sosEspinha';

// Câmera do SOS espinha: o layout de `product-camera.tsx`, com a câmera frontal. A frontal não
// tem flash nem as lentes 0,5x e 2x, por isso esses controles não existem aqui. A foto vai em
// 768 px (o produto usa 512), para a espinha ter detalhe suficiente.

function SosIcon({ size = 22, color = '#1A1A1A' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
      <Path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" />
      <Path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" />
      <Path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <Circle cx={12} cy={12} r={3.2} />
    </Svg>
  );
}

function Canto({ estilo, h, v }: { estilo: object; h: object; v: object }) {
  return (
    <View style={[{ position: 'absolute', width: 44, height: 44 }, estilo]}>
      <View style={[{ position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: 'white', borderRadius: 2 }, h]} />
      <View style={[{ position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: 'white', borderRadius: 2 }, v]} />
    </View>
  );
}

function BotaoRedondo({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </TouchableOpacity>
  );
}

export default function SosCamera() {
  const router = useRouter();
  // Aceite próprio: mesmo quem já aceitou o aviso geral precisa ver que a foto fica guardada.
  const { consentGate } = useScanConsentGate({ chave: 'ai_consent_sos_v1', body: CONSENT_SOS_BODY });
  const { width } = useWindowDimensions();
  const FRAME_SIZE = Math.round(width * 0.88);
  const SCAN_TRAVEL = FRAME_SIZE - 16;
  const [ocupado, setOcupado] = useState(false);
  const [temUltima, setTemUltima] = useState(false);
  const navegandoRef = useRef(false);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const isSimulator = !Device.isDevice;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: SCAN_TRAVEL, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [SCAN_TRAVEL, scanAnim]);

  // Ao voltar para a câmera, libera o disparo e confere se ainda há análise das últimas 24 h.
  useFocusEffect(useCallback(() => {
    navegandoRef.current = false;
    let vivo = true;
    lerUltimaAnalise().then((a) => { if (vivo) setTemUltima(!!a); });
    return () => { vivo = false; };
  }, []));

  const processar = async (uri: string) => {
    if (navegandoRef.current) return;
    navegandoRef.current = true;
    try {
      const m = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 768 } }], {
        compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true,
      });
      if (!m.base64) throw new Error('sem base64');
      guardarFoto(m.base64, m.uri);
      router.push('/(scan)/sos-loading' as any);
    } catch {
      navegandoRef.current = false;
      Alert.alert('Erro', 'Não foi possível processar a imagem.');
    }
  };

  const fotografar = async () => {
    if (!cameraRef.current) return;
    try {
      setOcupado(true);
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
      if (!foto?.uri) throw new Error('Falha ao capturar');
      await processar(foto.uri);
    } catch {
      Alert.alert('Erro', 'Não foi possível capturar a foto. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  };

  const galeria = async () => {
    try {
      setOcupado(true);
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: false, exif: false,
      });
      if (r.canceled || !r.assets[0]) return;
      await processar(r.assets[0].uri);
    } catch {
      Alert.alert('Erro', 'Não foi possível selecionar a imagem.');
    } finally {
      setOcupado(false);
    }
  };

  if (!isSimulator && !permission?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ color: 'white', fontSize: 17, textAlign: 'center', marginBottom: 24 }}>
          O NIKS precisa da câmera para analisar sua espinha.
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
      {!isSimulator && permission?.granted && (
        <CameraView ref={cameraRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="front" />
      )}

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <BotaoRedondo onPress={() => { haptics.tap(); router.back(); }}>
          <X size={20} color="white" strokeWidth={2.5} />
        </BotaoRedondo>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 112, paddingBottom: 266 }}>
        <View style={{ position: 'relative', width: FRAME_SIZE, height: FRAME_SIZE }}>
          <Canto estilo={{ top: 0, left: 0 }} h={{ top: 0 }} v={{ left: 0 }} />
          <Canto estilo={{ top: 0, right: 0 }} h={{ top: 0 }} v={{ right: 0 }} />
          <Canto estilo={{ bottom: 0, left: 0 }} h={{ bottom: 0 }} v={{ left: 0 }} />
          <Canto estilo={{ bottom: 0, right: 0 }} h={{ bottom: 0 }} v={{ right: 0 }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 4 }} />
          <Animated.View
            style={{
              position: 'absolute', left: 12, right: 12, top: 8, height: 2, borderRadius: 1, backgroundColor: '#FF5EA8',
              shadowColor: '#FF5EA8', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6,
              transform: [{ translateY: scanAnim }],
            }}
          />
          <View style={{ position: 'absolute', bottom: -36, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' }}>
              Aproxime o rosto, a um palmo da câmera, com a espinha no centro
            </Text>
          </View>
        </View>
      </View>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 48 }}>
        {temUltima && (
          <TouchableOpacity
            onPress={() => { haptics.tap(); router.push('/(scan)/sos-resultado' as any); }}
            activeOpacity={0.8}
            style={{ alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)', marginBottom: 16 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>Ver minha última análise</Text>
          </TouchableOpacity>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 24 }}>
          <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.95)', minWidth: 100 }}>
            <SosIcon />
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#1A1A1A', textAlign: 'center' }}>SOS espinha</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 48 }}>
          <View style={{ width: 44, height: 44 }} />
          <TouchableOpacity
            onPress={() => { haptics.action(); isSimulator ? galeria() : fotografar(); }}
            disabled={ocupado}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Tirar foto"
            style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', opacity: ocupado ? 0.5 : 1 }}
          >
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.92)' }} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { haptics.tap(); galeria(); }}
            disabled={ocupado}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Escolher da galeria"
            style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', opacity: ocupado ? 0.5 : 1 }}
          >
            <ImageIcon size={20} color="rgba(255,255,255,0.8)" strokeWidth={1.8} />
          </TouchableOpacity>
        </View>
      </View>

      {consentGate}
    </View>
  );
}
