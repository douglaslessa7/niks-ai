import { Modal, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_600SemiBold, Nunito_400Regular } from '@expo-google-fonts/nunito';
import { Image } from 'react-native';
import { haptics } from '../../lib/haptics';

// ─────────────────────────────────────────────────────────────────────────────
// Pop-up de pergunta Sim/Não da NIKS — identidade do "Novo design" (Nunito, card
// branco com a borda-assinatura, CTA rosa `#FF9D9D`, logo tintada no topo).
//
// UM componente para as DUAS perguntas da Minha Coleção:
//   • "Você tem produtos de skincare em casa?"  (primeiro fluxo)
//   • "Você tem esse produto em casa?"          (depois de qualquer scan de produto)
// São a mesma pergunta em momentos diferentes — duas implementações divergiriam.
//
// ⚠️ O backdrop NÃO fecha, e não há botão de fechar: a resposta muda a rotina
// dela, então o fluxo precisa de uma decisão explícita (mesma regra do
// `AIConsentModal`). "Não" é uma resposta legítima e sai daqui na hora.
// ⚠️ Sem haptic no backdrop (regra do projeto) — só nos dois botões.
// ─────────────────────────────────────────────────────────────────────────────

const WHITE = '#FFFFFF';
const INK = '#121212';
const INK_MUTE = '#818181';
const PINK = '#FF9D9D';
const CARD_BORDER = '#E3E3E6';

const LOGO = require('../../assets/home/niks-logo.png');

export default function PerguntaSimNao({
  visible, titulo, subtitulo, labelSim = 'Sim, tenho', labelNao = 'Não tenho', onSim, onNao,
}: {
  visible: boolean;
  titulo: string;
  subtitulo?: string;
  labelSim?: string;
  labelNao?: string;
  onSim: () => void;
  onNao: () => void;
}) {
  const { width } = useWindowDimensions();
  const S = width / 393;
  const s = (n: number) => n * S;

  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold, Nunito_600SemiBold, Nunito_400Regular });
  const f8 = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const f6 = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const f4 = fontsLoaded ? 'Nunito_400Regular' : undefined;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(18,18,18,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(24) }}>
        <View style={{
          width: '100%', backgroundColor: WHITE, borderRadius: s(24),
          borderWidth: 1, borderColor: CARD_BORDER, paddingHorizontal: s(22),
          paddingTop: s(26), paddingBottom: s(20), alignItems: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12, shadowRadius: 24, elevation: 10,
        }}>
          <Image source={LOGO} style={{ width: s(46), height: s(46), tintColor: PINK }} resizeMode="contain" />

          <Text style={{
            fontFamily: f8, fontSize: s(21), lineHeight: s(21) * 1.25, color: INK,
            textAlign: 'center', letterSpacing: s(-0.4), marginTop: s(14),
          }}>{titulo}</Text>

          {!!subtitulo && (
            <Text style={{
              fontFamily: f4, fontSize: s(13.5), lineHeight: s(13.5) * 1.5,
              color: INK_MUTE, textAlign: 'center', marginTop: s(8),
            }}>{subtitulo}</Text>
          )}

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => { haptics.action(); onSim(); }}
            style={{
              width: '100%', height: s(54), borderRadius: s(100), backgroundColor: PINK,
              alignItems: 'center', justifyContent: 'center', marginTop: s(22),
              shadowColor: PINK, shadowOffset: { width: 0, height: s(6) },
              shadowOpacity: 0.35, shadowRadius: s(12), elevation: 6,
            }}
          >
            <Text style={{ fontFamily: f8, fontSize: s(16), color: WHITE }}>{labelSim}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => { haptics.tap(); onNao(); }}
            style={{ width: '100%', height: s(48), alignItems: 'center', justifyContent: 'center', marginTop: s(4) }}
          >
            <Text style={{ fontFamily: f6, fontSize: s(15), color: INK_MUTE }}>{labelNao}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
