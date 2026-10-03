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
import { haptics } from '../../lib/haptics';

// FONTE ÚNICA do texto legal do consentimento de IA — usada também pela folha do
// onboarding novo (`components/onboarding/ConsentSheet.tsx`, modelo 8b). Mudou aqui,
// muda nas duas.
// ⚠️ Os fornecedores citados têm de bater com as Edge Functions: pele
// (`analyze-skin`/`analyze-skin-app`) e produto (`analisar-produto`) usam OpenAI;
// só a refeição (`analyze-food`) usa Google Gemini. Trocou o modelo de uma função?
// Atualize esta frase. (Até set/2026 o texto citava só o Gemini, o que estava errado.)
export const CONSENT_BODY =
  'Para gerar sua análise, o NIKS AI processa a foto capturada, seu perfil de pele e ' +
  'preocupações do onboarding por meio de serviços de inteligência artificial: a OpenAI, ' +
  'nas análises de pele e de produto, e o Google Gemini, na análise de refeição. ' +
  'Os dados são usados exclusivamente para produzir o resultado e não são retidos ou utilizados para outros fins.';
export const CONSENT_AUTH_PREFIX = 'Ao continuar, você autoriza esse processamento conforme nossa ';
export const PRIVACY_URL =
  'https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5';

interface AIConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  /**
   * `modal` (padrão): `<Modal>` nativo — usado pelas câmeras.
   * `inline`: camada absoluta DENTRO da tela, sem `<Modal>`. Para telas abertas por
   * fora do fluxo normal (share-product-loading): o `<Modal>` nativo não aparece se
   * houver outro controlador apresentado (ex.: seletor de fotos) — o iOS recusa com
   * "already presenting" e o consentimento some para sempre. A tela precisa ocupar
   * a janela inteira (a camada cobre só a própria tela).
   */
  presentation?: 'modal' | 'inline';
}

export function AIConsentModal({ visible, onAccept, onDecline, presentation = 'modal' }: AIConsentModalProps) {
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

  const content = (
    <>
      {/* Backdrop — não fecha o modal */}
      <Pressable style={styles.backdrop} />

      {/* Card */}
      <Animated.View style={[styles.card, { transform: [{ translateY }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Ícone */}
        <View style={styles.iconCircle}>
          <ShieldCheck size={22} color="#FF5EA8" strokeWidth={2} />
        </View>

        {/* Título */}
        <Text style={styles.title}>Antes de continuar</Text>

        {/* Parágrafo principal */}
        <Text style={styles.body}>{CONSENT_BODY}</Text>

        {/* Parágrafo secundário com link inline */}
        <Text style={styles.body}>
          {CONSENT_AUTH_PREFIX}
          <Text
            style={styles.link}
            onPress={() => {
              haptics.tap();
              Linking.openURL(PRIVACY_URL);
            }}
          >
            Política de Privacidade
          </Text>
          .
        </Text>

        {/* Botão Continuar */}
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => {
            haptics.action();
            onAccept();
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>Continuar</Text>
        </TouchableOpacity>

        {/* Botão Cancelar */}
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => {
            haptics.tap();
            onDecline();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.btnSecondaryText}>Cancelar</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );

  if (presentation === 'inline') {
    if (!visible) return null;
    return <View style={[StyleSheet.absoluteFill, styles.inlineLayer]}>{content}</View>;
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDecline}>
      {content}
    </Modal>
  );
}

// Identidade nova (home 38e / NIKS Chat 39a-b): SF Pro (sistema), rosa #FF5EA8,
// tinta #121212, cinza #8A8387, links #E8468F, botão em pílula com brilho rosa.
const styles = StyleSheet.create({
  inlineLayer: {
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18,18,18,0.35)',
  },
  card: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 21,
    paddingBottom: 40,
    shadowColor: '#783C48',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E3DCDF',
    alignSelf: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FDEEF4',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: -0.5,
    color: '#121212',
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.25,
    color: '#8A8387',
    marginBottom: 12,
  },
  link: {
    color: '#E8468F',
    fontWeight: '500',
  },
  btnPrimary: {
    height: 50,
    borderRadius: 100,
    backgroundColor: '#FF5EA8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 8,
    shadowColor: '#FF5EA8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
  },
  btnPrimaryText: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: '#FFFFFF',
  },
  btnSecondary: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  btnSecondaryText: {
    fontSize: 17,
    letterSpacing: -0.3,
    color: '#8A8387',
  },
});
