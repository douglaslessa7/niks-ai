import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Linking, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { PRIVACY_URL, TERMOS_URL } from '../../lib/linksLegais';
import { OB, ObPillButton } from './kit';
import { PrivacyIllustration } from './PrivacyIllustration';

// Pop-up "Sua pele. Seus dados." por cima da CÂMERA do scan de rosto (`(scan)/camera`,
// via `useScanConsentGate({ sheet: 'seusDados' })`) — 03/nov/2026, pedido do produto: o
// conteúdo da antiga tela "Seus dados" (0.2 do fluxo completo, NF 7 "Termos" do novo
// fluxo) virou este pop-up; primeiro abria no tutorial do scan, depois foi para a câmera.
//
// Camada absoluta DENTRO da tela (não `<Modal>`), véu rgba(18,18,18,.40), folha branca
// com raio 28 no topo e alça 36×5. A ilustração do escudo, o título e o texto são os da
// "Seus dados"; as duas caixinhas de lá viraram UMA, com o texto resumido e menor (pedido
// do produto). ⚠️ A caixinha cita "inteligência artificial de parceiros": é o aviso que a
// regra 5.1.2(i) da Apple pede antes de mandar a foto a uma IA de terceiros (o aviso
// antigo da câmera, `AIConsentModal`, dizia isso) — não tirar ao encurtar o texto, e não
// nomear os fornecedores (README, seção 14). "Aceitar e continuar" marca a caixinha e segue (o botão é o aceite
// explícito; a caixinha também pode ser marcada à mão). "Cancelar" fecha e a câmera
// volta para a tela anterior: sem aceite não há scan. O véu não fecha.
//
// Aceitar grava `ai_consent_accepted` (pelo `useAIConsent` de quem abre a folha) — a
// mesma chave do portão das câmeras (`useScanConsentGate`), que não pede de novo.
export function ConsentSheet({ visible, onAccept, onDecline }: {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(700)).current;
  const [aceito, setAceito] = useState(false);

  useEffect(() => {
    if (visible) {
      translateY.setValue(700);
      Animated.spring(translateY, { toValue: 0, friction: 10, tension: 80, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible) return null;

  const aceitar = () => {
    haptics.action();
    setAceito(true);
    onAccept();
  };

  const bodyText = { flex: 1, fontSize: 13.5, lineHeight: 19, color: OB.body } as const;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      {/* Véu — não fecha a folha (consentimento explícito) */}
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,18,0.40)' }]} />
      <Animated.View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF',
        paddingTop: 10, paddingBottom: Math.max(28, insets.bottom),
        alignItems: 'center', transform: [{ translateY }],
      }}>
        <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: OB.track }} />
        <View style={{ marginTop: 6 }} pointerEvents="none">
          <PrivacyIllustration width={230} />
        </View>
        <Text style={{
          marginTop: 2, marginHorizontal: 17, textAlign: 'center',
          fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.4, color: OB.ink,
        }}>
          Sua pele. Seus dados.
        </Text>
        <Text style={{ marginTop: 10, marginHorizontal: 30, textAlign: 'center', fontSize: 16, lineHeight: 22, color: OB.sub }}>
          Suas fotos e dados de pele não são vendidos a ninguém, e você pode apagá-los quando quiser.
        </Text>

        <View style={{ marginTop: 22, alignSelf: 'stretch', marginLeft: 24, marginRight: 28 }}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <CheckCircle on={aceito} onPress={() => { haptics.select(); setAceito((v) => !v); }} />
            <Text style={bodyText}>
              Concordo com a análise das minhas fotos e dados de pele pela NIKS, com inteligência artificial de parceiros, conforme a{' '}
              <PolicyLink label="Política de Privacidade" /> e os <PolicyLink label="Termos de Uso" />.
            </Text>
          </View>
        </View>

        <ObPillButton label="Aceitar e continuar" width={245} onPress={aceitar} style={{ marginTop: 24 }} />
        <TouchableOpacity
          onPress={() => { haptics.tap(); onDecline(); }}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
          style={{ marginTop: 14, height: 24, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 16, color: OB.sub }}>Cancelar</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function CheckCircle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{
        width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
        borderColor: on ? OB.pink : OB.radio, backgroundColor: on ? OB.pink : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {on && (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Path d="M6.5 11.2 L9.6 14.2 L15.5 8" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </TouchableOpacity>
  );
}

function PolicyLink({ label }: { label: string }) {
  const url = label === 'Termos de Uso' ? TERMOS_URL : PRIVACY_URL;
  return (
    <Text
      onPress={() => { haptics.tap(); Linking.openURL(url); }}
      style={{ color: OB.pink, fontWeight: '500' }}
    >
      {label}
    </Text>
  );
}
