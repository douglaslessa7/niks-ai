import { Modal, View, Text, TouchableOpacity, Animated, Pressable, StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { AIConsentModal } from '../ui/AIConsentModal';
import { useAIConsent } from '../../hooks/useAIConsent';
import { useAppStore } from '../../store/onboarding';

interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark?: boolean;
}

// ── Static night sky (56 estrelas SVG sem estrelas cadentes) ──────────────────
const STAR_DATA = Array.from({ length: 56 }, (_, i) => ({
  cx: `${(i * 37 + 13) % 100}%`,
  cy: `${(i * 53 + 7) % 100}%`,
  r:   i % 3 === 0 ? 1.3 : 0.7,
  op:  0.3 + ((i * 17) % 60) / 100,
}));

function NightSkyStatic() {
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: 28, overflow: 'hidden' }]} pointerEvents="none">
      <LinearGradient
        colors={['#1A1F2E', '#2A1F28']}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        {STAR_DATA.map((s, i) => (
          <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#fff" opacity={s.op} />
        ))}
      </Svg>
    </View>
  );
}

// ── ScanModal (visual: ScanTypeSheet do design Horizonte Reformulado) ─────────
export function ScanModal({ isOpen, onClose, isDark = false }: ScanModalProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();
  const { setScanSource } = useAppStore();

  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Regular': require('../../assets/fonts/PlayfairDisplay-Regular.ttf'),
    'PlayfairDisplay-Italic':  require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const displayFont = fontsLoaded ? 'PlayfairDisplay-Italic' : undefined;
  const displayFontReg = fontsLoaded ? 'PlayfairDisplay-Regular' : undefined;

  const accent    = '#FB7B6B';
  const ink       = isDark ? '#FFFFFF'               : '#2B2724';
  const inkSoft   = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(43,39,36,0.58)';
  const inkHair   = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(43,39,36,0.08)';
  const sheetBg   = isDark ? 'transparent'            : '#FFFFFF';
  const cardBg    = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(43,39,36,0.06)';
  const cardShadow = isDark ? {} : { shadowColor: '#2B2724', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 14, elevation: 2 };
  const iconBg    = isDark ? 'rgba(251,123,107,0.14)' : 'rgba(251,123,107,0.10)';
  const backdropBg = isDark ? 'rgba(0,0,0,0.5)' : 'rgba(43,39,36,0.3)';

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

  const handleScanFood = () => {
    onClose();
    setTimeout(() => {
      requestConsent(() => { router.push('/(scan)/food-scan-intro' as any); });
    }, 220);
  };

  const handleScanFace = () => {
    setScanSource('app');
    onClose();
    setTimeout(() => {
      requestConsent(() => { router.push('/(scan)/scan-prep' as any); });
    }, 220);
  };

  return (
    <>
      <Modal transparent visible={isOpen} animationType="none" onRequestClose={onClose}>
        {/* Backdrop */}
        <Animated.View style={{ flex: 1, opacity }}>
          <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: backdropBg }} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            backgroundColor: sheetBg,
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            paddingTop: 14, paddingHorizontal: 24,
            paddingBottom: insets.bottom > 0 ? insets.bottom + 16 : 32,
            transform: [{ translateY }],
            overflow: 'hidden',
          }}
        >
          {/* Fundo estrelado no modo noite */}
          {isDark && <NightSkyStatic />}

          {/* Conteúdo com zIndex acima do fundo */}
          <View style={{ position: 'relative', zIndex: 1 }}>
            {/* Handle */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: inkHair, alignSelf: 'center', marginBottom: 24 }} />

            {/* Cabeçalho centralizado */}
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 2.8, color: accent, textTransform: 'uppercase' }}>
                Novo scan
              </Text>
              <Text style={{ fontFamily: displayFontReg, fontSize: 28, color: ink, letterSpacing: -0.7, lineHeight: 30.8, marginTop: 8, textAlign: 'center' }}>
                <Text style={{ fontFamily: displayFont, fontStyle: 'italic' }}>Escolha</Text>
                {' o tipo de scan'}
              </Text>

              {/* Divisor filigrana */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
                <View style={{ width: 28, height: 0.5, backgroundColor: inkHair }} />
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accent }} />
                <View style={{ width: 28, height: 0.5, backgroundColor: inkHair }} />
              </View>

              <Text style={{ fontSize: 12, fontWeight: '500', letterSpacing: 0.3, color: inkSoft, marginTop: 14 }}>
                Selecione o que você deseja analisar
              </Text>
            </View>

            {/* Cards */}
            <View style={{ marginTop: 24, gap: 10 }}>
              {/* Scanear Refeição */}
              <TouchableOpacity
                onPress={handleScanFood}
                activeOpacity={0.88}
                style={{ backgroundColor: cardBg, borderWidth: 0.5, borderColor: cardBorder, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, position: 'relative', ...cardShadow }}
              >
                {/* Stripe esquerda */}
                <View style={{ position: 'absolute', left: 0, top: 18, bottom: 18, width: 2, borderRadius: 1, backgroundColor: accent }} />

                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 6 }}>
                  <Svg width={22} height={22} viewBox="0 0 24 24">
                    <Path d="M7 2v8a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2M9 2v20" stroke={accent} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <Path d="M17 2c-1.5 0-3 1.5-3 4v6c0 1 .5 2 2 2v8" stroke={accent} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </Svg>
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={{ fontFamily: displayFontReg, fontSize: 19, color: ink, letterSpacing: -0.285, lineHeight: 21 }}>Scanear refeição</Text>
                    {/* Badge "mais usado" */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingLeft: 7, paddingRight: 9, borderRadius: 100, borderWidth: 0.5, borderColor: accent, backgroundColor: isDark ? 'rgba(251,123,107,0.08)' : 'rgba(251,123,107,0.06)' }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
                      <Text style={{ fontFamily: displayFont, fontStyle: 'italic', fontSize: 11, color: accent, letterSpacing: -0.055 }}>mais usado</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '500', letterSpacing: 0.3, color: inkSoft, marginTop: 5, lineHeight: 17.4 }}>
                    Analise o impacto da comida na sua pele
                  </Text>
                </View>

                {/* Chevron */}
                <Svg width={7} height={12} viewBox="0 0 7 12" style={{ flexShrink: 0 }}>
                  <Path d="M1 1L6 6L1 11" stroke={accent} strokeWidth={1.2} fill="none" strokeLinecap="round" />
                </Svg>
              </TouchableOpacity>

              {/* Scanear Rosto */}
              <TouchableOpacity
                onPress={handleScanFace}
                activeOpacity={0.88}
                style={{ backgroundColor: cardBg, borderWidth: 0.5, borderColor: cardBorder, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, position: 'relative', ...cardShadow }}
              >
                <View style={{ position: 'absolute', left: 0, top: 18, bottom: 18, width: 2, borderRadius: 1, backgroundColor: accent }} />

                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 6 }}>
                  <Svg width={22} height={22} viewBox="0 0 24 24">
                    <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke={accent} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <Circle cx={12} cy={13} r={4} stroke={accent} strokeWidth={1.6} fill="none" />
                  </Svg>
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: displayFontReg, fontSize: 19, color: ink, letterSpacing: -0.285, lineHeight: 21 }}>Scanear rosto</Text>
                  <Text style={{ fontSize: 12, fontWeight: '500', letterSpacing: 0.3, color: inkSoft, marginTop: 5, lineHeight: 17.4 }}>
                    Faça uma análise facial completa
                  </Text>
                </View>

                <Svg width={7} height={12} viewBox="0 0 7 12" style={{ flexShrink: 0 }}>
                  <Path d="M1 1L6 6L1 11" stroke={accent} strokeWidth={1.2} fill="none" strokeLinecap="round" />
                </Svg>
              </TouchableOpacity>

              {/* Cancelar */}
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.7}
                style={{ paddingTop: 18, paddingBottom: 4, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: displayFont, fontStyle: 'italic', fontSize: 15, color: inkSoft, letterSpacing: -0.075 }}>
                  cancelar
                </Text>
              </TouchableOpacity>
            </View>
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
