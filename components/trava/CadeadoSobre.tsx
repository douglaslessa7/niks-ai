// Véu com cadeado por cima de um bloco trancado da Home da convidada.
import { Pressable, StyleSheet, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { haptics } from '../../lib/haptics';
import { abrirTrava, type FRASES } from '../../lib/trava';

export default function CadeadoSobre({ funcao }: { funcao: keyof typeof FRASES }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Função para assinantes"
      onPress={() => { haptics.tap(); abrirTrava(funcao); }}
      style={[StyleSheet.absoluteFill, styles.veu]}
    >
      <View style={styles.circulo}><Lock size={18} color="#E0447F" strokeWidth={2.4} /></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  veu: { zIndex: 30, borderRadius: 18, backgroundColor: 'rgba(249,242,245,0.78)', alignItems: 'center', justifyContent: 'center' },
  circulo: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
