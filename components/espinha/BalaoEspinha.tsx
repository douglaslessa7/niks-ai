// Balão do acompanhamento da espinha, logo acima da navbar. O NIKS Chat não tem ícone na navbar
// (saiu em out/2026), por isso o balão não aponta para um item: tocar nele abre a conversa.
// O de dúvida, depois do "Concluir", some sozinho; o de retorno fica até ela tocar ou fechar.
import { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, X } from 'lucide-react-native';
import { OB } from '../onboarding/kit';
import { haptics } from '../../lib/haptics';
import { marcarConviteVisto, rotaConversaEspinha, useBalaoEspinha } from '../../lib/espinhaAcompanhamento';

const DUVIDA_MS = 8000;

export default function BalaoEspinha() {
  const balao = useBalaoEspinha((s) => s.balao);
  const fechar = useBalaoEspinha((s) => s.fechar);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (balao?.tipo !== 'duvida') return;
    const t = setTimeout(fechar, DUVIDA_MS);
    return () => clearTimeout(t);
  }, [balao, fechar]);

  if (!balao || pathname === '/niks-chat') return null;

  const abrir = () => {
    haptics.tap();
    if (balao.tipo === 'retorno') marcarConviteVisto(balao.conversationId);
    fechar();
    router.push(rotaConversaEspinha(balao.conversationId));
  };
  const dispensar = () => {
    haptics.tap();
    if (balao.tipo === 'retorno') marcarConviteVisto(balao.conversationId);
    fechar();
  };

  // Navbar: 64 pt de altura, a `Math.max(16, insets.bottom - 8)` da base.
  const bottom = Math.max(16, insets.bottom - 8) + 64 + 12;

  return (
    <Animated.View
      key={`${balao.conversationId}-${balao.tipo}`}
      entering={FadeInDown.springify().damping(13).stiffness(170)}
      exiting={FadeOut.duration(180)}
      style={[styles.caixa, { bottom }]}
      accessibilityLiveRegion="polite"
    >
      <TouchableOpacity onPress={abrir} activeOpacity={0.9} style={styles.toque} accessibilityRole="button" accessibilityLabel={balao.texto}>
        <View style={styles.icone}><MessageCircle size={18} color="#FFFFFF" strokeWidth={2.2} /></View>
        <Text style={styles.texto}>{balao.texto}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={dispensar} hitSlop={10} style={styles.fechar} accessibilityRole="button" accessibilityLabel="Fechar">
        <X size={16} color={OB.sub} strokeWidth={2.4} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#FFC2DB',
    shadowColor: 'rgb(192,32,106)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 8,
  },
  toque: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 12 },
  icone: { width: 34, height: 34, borderRadius: 17, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' },
  texto: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '500', color: OB.ink },
  fechar: { paddingHorizontal: 12, paddingVertical: 12 },
});
