import { Modal, View, Text, TouchableOpacity, Animated, Pressable, Alert, Linking } from 'react-native';
import { useEffect, useRef } from 'react';
import { Camera as ExpoCamera } from 'expo-camera';
import { Camera, Utensils, ChevronRight, Star } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AIConsentModal } from '../ui/AIConsentModal';
import { useAIConsent } from '../../hooks/useAIConsent';

interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
  elevation: 3,
};

export function ScanModal({ isOpen, onClose }: ScanModalProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(400)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();

  // ── Animação ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 10, tension: 80, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 400, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [isOpen]);

  const handleScanPress = async (onGranted: () => void) => {
    const { status } = await ExpoCamera.getCameraPermissionsAsync();

    if (status === 'granted') {
      onGranted();
      return;
    }

    const { status: newStatus } = await ExpoCamera.requestCameraPermissionsAsync();

    if (newStatus === 'granted') {
      onGranted();
      return;
    }

    Alert.alert(
      'Permissão de câmera necessária',
      'Para escanear, precisamos de acesso à sua câmera. Ative nas configurações do iPhone.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Configurações', onPress: () => Linking.openURL('app-settings:') },
      ]
    );
  };

  const handleScanFood = () => {
    handleScanPress(() => {
      requestConsent(() => {
        onClose();
        router.push('/(scan)/food-scan-intro' as any);
      });
    });
  };

  const handleScanFace = () => {
    handleScanPress(() => {
      requestConsent(() => {
        onClose();
        router.push('/(scan)/scan-prep' as any);
      });
    });
  };

  return (
    <>
    <Modal transparent visible={isOpen} animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={{ flex: 1, opacity }}>
        <Pressable
          onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
        />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#F6F4EE',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 24,
          transform: [{ translateY }],
        }}
      >
        {/* Handle */}
        <View
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#D1D5DB',
            alignSelf: 'center',
            marginBottom: 24,
          }}
        />

        {/* Título */}
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: '#1D3A44',
            textAlign: 'center',
            marginBottom: 6,
          }}
        >
          Escolha o tipo de scan
        </Text>

        {/* Subtítulo */}
        <Text
          style={{
            fontSize: 14,
            color: '#9CA3AF',
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          Selecione o que você deseja analisar
        </Text>

        {/* Opção 1: Scanear Alimento */}
        <TouchableOpacity
          onPress={handleScanFood}
          activeOpacity={0.85}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginBottom: 10,
            ...SHADOW,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: '#FFF0EE',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Utensils size={22} color="#FB7B6B" strokeWidth={2} />
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1D3A44' }}>Scanear Alimento</Text>
              {/* Badge MAIS USADO */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  backgroundColor: '#7CB69D',
                  borderRadius: 100,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                }}
              >
                <Star size={9} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 }}>
                  MAIS USADO
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 18 }}>
              Analise o impacto da comida na sua pele
            </Text>
          </View>

          <ChevronRight size={20} color="#D1D5DB" strokeWidth={2} />
        </TouchableOpacity>

        {/* Opção 2: Scanear Rosto */}
        <TouchableOpacity
          onPress={handleScanFace}
          activeOpacity={0.85}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginBottom: 10,
            ...SHADOW,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: '#FFF0EE',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Camera size={22} color="#FB7B6B" strokeWidth={2} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1D3A44', marginBottom: 3 }}>
              Scanear Rosto
            </Text>
            <Text style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 18 }}>
              Faça uma análise facial completa
            </Text>
          </View>

          <ChevronRight size={20} color="#D1D5DB" strokeWidth={2} />
        </TouchableOpacity>

        {/* Botão Cancelar */}
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.8}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            height: 56,
            alignItems: 'center',
            justifyContent: 'center',
            ...SHADOW,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '500', color: '#8A8A8E' }}>Cancelar</Text>
        </TouchableOpacity>
      </Animated.View>

    </Modal>

    <AIConsentModal
      visible={consentModalVisible}
      onAccept={handleAccept}
      onDecline={handleDecline}
    />
  </>
  );
}
