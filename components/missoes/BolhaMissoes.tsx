// Balãozinho das missões (08/nov/2026, pedido do produto): fica preso na borda direita da tela,
// entre o horário e o "Iniciar skincare", sem empurrar o conteúdo, e mostra o progresso. O painel
// com os 4 desafios (`CardMissoes`) só abre quando ela toca. Escolher um desafio fecha o painel e
// começa a dica: o Modal nativo ficaria por cima do `GuiaHost`, por isso a dica espera ele fechar.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ListChecks } from 'lucide-react-native';
import { haptics } from '../../lib/haptics';
import { quantasFeitas, type EstadoMissoes } from '../../lib/missoes';
import CardMissoes, { type MissaoId } from './CardMissoes';

const PINK = '#FF5EA8';
// Tempo do Modal sumir antes de a dica aparecer.
const FECHAR_MS = 280;

export default function BolhaMissoes({ estado, onMissao }: { estado: EstadoMissoes; onMissao: (m: MissaoId) => void }) {
  const [aberto, setAberto] = useState(false);
  const feitas = quantasFeitas(estado);

  const escolher = (m: MissaoId) => {
    setAberto(false);
    setTimeout(() => onMissao(m), FECHAR_MS);
  };

  return (
    <>
      <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(180)} style={styles.sombra}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { haptics.tap(); setAberto(true); }}
          style={styles.bolha}
          accessibilityRole="button"
          accessibilityLabel={`Suas missões, ${feitas} de 4 concluídas`}
        >
          <ListChecks size={20} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={styles.contagem}>{`${feitas}/4`}</Text>
        </TouchableOpacity>
      </Animated.View>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <View style={styles.fundo}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAberto(false)} accessibilityLabel="Fechar missões" />
          <CardMissoes estado={estado} onMissao={escolher} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // `bottom` conta a partir da base do herói: acima do botão (48), no vão até o horário.
  sombra: {
    position: 'absolute', right: 0, bottom: 52, borderTopLeftRadius: 20, borderBottomLeftRadius: 20, backgroundColor: PINK,
    boxShadow: '0px 6px 16px rgba(192,32,106,0.28)',
  },
  bolha: { width: 52, height: 62, alignItems: 'center', justifyContent: 'center', gap: 3, paddingLeft: 2 },
  contagem: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  fundo: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(26,8,18,0.45)' },
});
