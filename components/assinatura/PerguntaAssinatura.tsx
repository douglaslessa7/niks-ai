// Pergunta antes de trazer uma assinatura do Apple ID para esta conta (09/nov/2026, regra em
// `lib/regraCompra.ts`): a compra só muda de dona se ela confirmar. "Usar nesta conta" faz o
// mesmo que "Restaurar compra" (origem `restaurar`); "Agora não" mostra o paywall normal.
// Textos aprovados em 09/nov/2026.
import { Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { NIKS_LOGO_PINK, OB, ObPillButton } from '../onboarding/kit';

export const PERGUNTA_ASSINATURA_LIGADA = true;

export const TEXTOS_PERGUNTA = {
  titulo: 'Você já tem uma assinatura do NIKS',
  texto: 'Esta Apple ID já tem uma assinatura ativa do NIKS. Quer usar essa assinatura nesta conta? Se ela estiver em outra conta, aquela conta perde o acesso.',
  usar: 'Usar nesta conta',
  agoraNao: 'Agora não',
};

export default function PerguntaAssinatura({ onUsar, onAgoraNao, ocupado }: {
  onUsar: () => void;
  onAgoraNao: () => void;
  ocupado?: boolean;
}) {
  const reduzir = useReducedMotion();
  const entra = reduzir ? FadeIn.duration(220) : FadeInDown.duration(320).springify().damping(18);
  return (
    <Animated.View entering={entra} style={{ width: '100%', alignItems: 'center' }}>
      <Image source={NIKS_LOGO_PINK} style={{ width: 56, height: 57, marginBottom: 24 }} contentFit="contain" />
      <Text style={{ fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5, color: OB.ink, textAlign: 'center' }}>
        {TEXTOS_PERGUNTA.titulo}
      </Text>
      <Text style={{ marginTop: 10, marginBottom: 32, fontSize: 16, lineHeight: 22, color: OB.sub, textAlign: 'center' }}>
        {TEXTOS_PERGUNTA.texto}
      </Text>
      <ObPillButton label={TEXTOS_PERGUNTA.usar} onPress={() => { haptics.action(); onUsar(); }} disabled={ocupado} />
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={() => { haptics.tap(); onAgoraNao(); }}
        disabled={ocupado}
        hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
        style={{ marginTop: 18 }}
        accessibilityRole="button"
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: OB.sub }}>{TEXTOS_PERGUNTA.agoraNao}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
