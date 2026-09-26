import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Linking, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { CONSENT_BODY, CONSENT_AUTH_PREFIX, PRIVACY_URL } from '../ui/AIConsentModal';
import { OB, ObPillButton } from './kit';

// Folha "Antes de continuar" do onboarding novo (modelo 8b): consentimento de IA
// por cima da tela 6 (preparação do scan), ao tocar em "Abrir câmera".
//
// Camada absoluta DENTRO da tela (não `<Modal>`), véu rgba(18,18,18,.40), folha
// branca com raio 28 no topo, alça 36×5 #DCD5D6, escudo branco em círculo rosa
// Ø52, título 22/28, texto 15/22 #515151, botão pílula "Continuar" e "Cancelar".
// O texto legal é o MESMO do `AIConsentModal` (constantes exportadas de lá).
//
// ⚠️ A trava de verdade continua nas câmeras (`useScanConsentGate`): esta folha só
// antecipa o pedido. Quem aceita aqui grava `ai_consent_accepted` e a câmera abre
// sem pedir de novo.
export function ConsentSheet({ visible, onAccept, onDecline }: {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(500);
      Animated.spring(translateY, { toValue: 0, friction: 10, tension: 80, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      {/* Véu — não fecha a folha (consentimento explícito) */}
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,18,0.40)' }]} />
      <Animated.View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF',
        paddingTop: 10, paddingHorizontal: 24, paddingBottom: Math.max(34, insets.bottom),
        alignItems: 'center', transform: [{ translateY }],
      }}>
        <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: OB.track }} />
        <View style={{ marginTop: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={26} height={26} viewBox="0 0 24 24">
            <Path d="M12 21.5s7.5-3.6 7.5-9.4V5.4L12 2.6 4.5 5.4v6.7c0 5.8 7.5 9.4 7.5 9.4z" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M8.8 12l2.2 2.2 4.2-4.4" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
        <Text style={{ marginTop: 16, fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, color: OB.ink, textAlign: 'center' }}>
          Antes de continuar
        </Text>
        <View style={{ marginTop: 14, gap: 14 }}>
          <Text style={{ fontSize: 15, lineHeight: 22, color: OB.body, textAlign: 'center' }}>{CONSENT_BODY}</Text>
          <Text style={{ fontSize: 15, lineHeight: 22, color: OB.body, textAlign: 'center' }}>
            {CONSENT_AUTH_PREFIX}
            <Text
              style={{ color: OB.pink, fontWeight: '500' }}
              onPress={() => { haptics.tap(); Linking.openURL(PRIVACY_URL); }}
            >
              Política de Privacidade
            </Text>
            .
          </Text>
        </View>
        <ObPillButton onPress={() => { haptics.action(); onAccept(); }} style={{ marginTop: 24 }} />
        <TouchableOpacity
          onPress={() => { haptics.tap(); onDecline(); }}
          activeOpacity={0.6}
          style={{ marginTop: 14, height: 24, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 16, color: OB.sub }}>Cancelar</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
