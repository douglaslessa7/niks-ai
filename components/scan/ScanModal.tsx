import { Modal, View, Text, TouchableOpacity, Animated, Pressable } from 'react-native';
import { useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import {
  Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold, Nunito_500Medium,
} from '@expo-google-fonts/nunito';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, ScanFace } from 'lucide-react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { AIConsentModal } from '../ui/AIConsentModal';
import { useAIConsent } from '../../hooks/useAIConsent';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';

interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark?: boolean; // legado — o novo design é sempre claro (harmonia com home/recomendacao/chat)
}

// ── Tokens do "Novo design app NIKS" (mesmos de home / recomendacao / niks-chat) ─
const INK        = '#121212';
const INK_MUTE   = '#818181';
const FAINT      = '#B5B5B5';
const CORAL      = '#FF9D9D';                  // rosa da Rotina (protocolo BRAND)
const CORAL_WASH = 'rgba(255,157,157,0.14)';   // wash do rosa da Rotina
const CARD_BD    = '#E3E3E6';
const WHITE      = '#FFFFFF';
const BACKDROP   = 'rgba(18,18,18,0.35)';

// Ícone "Escanear produto": moldura de scan (cantos) + frasco no meio.
function ScanProductIcon({ size = 24, color = CORAL }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {/* cantos da moldura de scan */}
      <Path d="M3 8V6a3 3 0 0 1 3-3h2" />
      <Path d="M16 3h2a3 3 0 0 1 3 3v2" />
      <Path d="M21 16v2a3 3 0 0 1-3 3h-2" />
      <Path d="M8 21H6a3 3 0 0 1-3-3v-2" />
      {/* frasco no centro */}
      <Rect x="9.4" y="10" width="5.2" height="7" rx="1.6" />
      <Path d="M10.8 10V7.6h2.4V10" />
    </Svg>
  );
}

// ── ScanModal — bottom sheet claro em Nunito, alinhado à identidade visual nova ──
export function ScanModal({ isOpen, onClose }: ScanModalProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();
  const { setScanSource } = useAppStore();

  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold,
    Nunito_700Bold,
    Nunito_600SemiBold,
    Nunito_500Medium,
  });
  const fXBold = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold  = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const fSemi  = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const fMed   = fontsLoaded ? 'Nunito_500Medium' : undefined;

  // ── Animação de entrada/saída ──────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 9, tension: 65, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 600, duration: 280, useNativeDriver: true }),
      ]).start();
    }
  }, [isOpen]);

  const handleScanProduct = () => {
    haptics.select();
    onClose();
    setTimeout(() => {
      requestConsent(() => { router.push('/(scan)/product-camera' as any); });
    }, 220);
  };

  const handleScanFace = () => {
    haptics.select();
    setScanSource('app');
    onClose();
    setTimeout(() => {
      requestConsent(() => { router.push('/(scan)/scan-prep-app' as any); });
    }, 220);
  };

  return (
    <>
      <Modal transparent visible={isOpen} animationType="none" onRequestClose={onClose}>
        {/* Backdrop */}
        <Animated.View style={{ flex: 1, opacity }}>
          <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: BACKDROP }} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            backgroundColor: WHITE,
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            paddingTop: 12, paddingHorizontal: 20,
            paddingBottom: insets.bottom > 0 ? insets.bottom + 16 : 32,
            transform: [{ translateY }],
            shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.08, shadowRadius: 24, elevation: 24,
          }}
        >
          {/* Handle */}
          <View style={{ width: 40, height: 5, borderRadius: 100, backgroundColor: CARD_BD, alignSelf: 'center', marginBottom: 22 }} />

          {/* Cabeçalho centralizado */}
          <View style={{ alignItems: 'center', paddingHorizontal: 4 }}>
            <Text style={{ fontFamily: fBold, fontSize: 11, letterSpacing: 2.4, color: CORAL, textTransform: 'uppercase' }}>
              Novo scan
            </Text>
            <Text style={{ fontFamily: fXBold, fontSize: 26, color: INK, letterSpacing: -1, marginTop: 8, textAlign: 'center' }}>
              Escolha o tipo de scan
            </Text>
            <Text style={{ fontFamily: fMed, fontSize: 14, color: INK_MUTE, letterSpacing: -0.3, marginTop: 8, textAlign: 'center' }}>
              Selecione o que você deseja analisar
            </Text>
          </View>

          {/* Cards */}
          <View style={{ marginTop: 24, gap: 12 }}>
            {/* Escanear produto (mais usado) */}
            <TouchableOpacity
              onPress={handleScanProduct}
              activeOpacity={0.85}
              style={{
                backgroundColor: WHITE, borderWidth: 1, borderColor: CARD_BD, borderRadius: 18,
                paddingVertical: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
              }}
            >
              <View style={{ width: 56, height: 56, borderRadius: 15, backgroundColor: CORAL_WASH, alignItems: 'center', justifyContent: 'center' }}>
                <ScanProductIcon size={24} color={CORAL} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fXBold, fontSize: 18, color: INK, letterSpacing: -0.5 }}>Escanear produto</Text>
                {/* Badge "mais usado" */}
                <View style={{ flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 5, marginTop: 6, paddingVertical: 3, paddingLeft: 7, paddingRight: 9, borderRadius: 100, backgroundColor: CORAL_WASH }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CORAL }} />
                  <Text style={{ fontFamily: fBold, fontSize: 11, color: CORAL, letterSpacing: -0.1 }}>mais usado</Text>
                </View>
                <Text style={{ fontFamily: fMed, fontSize: 13, color: INK_MUTE, letterSpacing: -0.2, marginTop: 6, lineHeight: 18 }}>
                  Descubra se um produto vai funcionar pra você
                </Text>
              </View>

              <ChevronRight size={20} color={FAINT} strokeWidth={2.5} />
            </TouchableOpacity>

            {/* Escanear rosto */}
            <TouchableOpacity
              onPress={handleScanFace}
              activeOpacity={0.85}
              style={{
                backgroundColor: WHITE, borderWidth: 1, borderColor: CARD_BD, borderRadius: 18,
                paddingVertical: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
              }}
            >
              <View style={{ width: 56, height: 56, borderRadius: 15, backgroundColor: CORAL_WASH, alignItems: 'center', justifyContent: 'center' }}>
                <ScanFace size={24} color={CORAL} strokeWidth={2} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fXBold, fontSize: 18, color: INK, letterSpacing: -0.5 }}>Escanear rosto</Text>
                <Text style={{ fontFamily: fMed, fontSize: 13, color: INK_MUTE, letterSpacing: -0.2, marginTop: 6, lineHeight: 18 }}>
                  Faça uma análise facial completa
                </Text>
              </View>

              <ChevronRight size={20} color={FAINT} strokeWidth={2.5} />
            </TouchableOpacity>

            {/* Cancelar */}
            <TouchableOpacity
              onPress={() => {
                haptics.tap();
                onClose();
              }}
              activeOpacity={0.7}
              style={{ paddingTop: 16, paddingBottom: 4, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: fSemi, fontSize: 15, color: INK_MUTE, letterSpacing: -0.2 }}>
                Cancelar
              </Text>
            </TouchableOpacity>
          </View>
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
