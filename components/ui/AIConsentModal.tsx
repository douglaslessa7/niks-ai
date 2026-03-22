import {
  Animated,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react-native';

interface AIConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function AIConsentModal({ visible, onAccept, onDecline }: AIConsentModalProps) {
  const translateY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        friction: 10,
        tension: 80,
        useNativeDriver: true,
      }).start();
    } else {
      translateY.setValue(300);
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDecline}>
      {/* Backdrop — não fecha o modal */}
      <Pressable style={styles.backdrop} />

      {/* Card */}
      <Animated.View style={[styles.card, { transform: [{ translateY }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Ícone */}
        <View style={styles.iconCircle}>
          <ShieldCheck size={22} color="#FB7B6B" strokeWidth={2} />
        </View>

        {/* Título */}
        <Text style={styles.title}>Antes de continuar</Text>

        {/* Parágrafo principal */}
        <Text style={styles.body}>
          Para gerar sua análise, o NIKS AI processa a foto capturada, seu perfil de pele e
          preocupações do onboarding por meio de um serviço de inteligência artificial — o Google Gemini. Os dados são
          usados exclusivamente para produzir o resultado e não são retidos ou utilizados para outros
          fins.
        </Text>

        {/* Parágrafo secundário com link inline */}
        <Text style={styles.body}>
          {'Ao continuar, você autoriza esse processamento conforme nossa '}
          <Text
            style={styles.link}
            onPress={() =>
              Linking.openURL(
                'https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5'
              )
            }
          >
            Política de Privacidade
          </Text>
          .
        </Text>

        {/* Botão Continuar */}
        <TouchableOpacity style={styles.btnPrimary} onPress={onAccept} activeOpacity={0.85}>
          <Text style={styles.btnPrimaryText}>Continuar</Text>
        </TouchableOpacity>

        {/* Botão Cancelar */}
        <TouchableOpacity style={styles.btnSecondary} onPress={onDecline} activeOpacity={0.7}>
          <Text style={styles.btnSecondaryText}>Cancelar</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF5F4',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 15,
    color: '#717182',
    lineHeight: 24.75,
    marginBottom: 12,
  },
  link: {
    color: '#FB7B6B',
  },
  btnPrimary: {
    backgroundColor: '#FB7B6B',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnSecondary: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  btnSecondaryText: {
    fontSize: 15,
    color: '#717182',
  },
});
