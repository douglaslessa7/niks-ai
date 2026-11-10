// Deslizar da borda esquerda para voltar ONDE O GESTO NATIVO NÃO CHEGA (10/nov/2026).
// As telas secundárias do app já têm o gesto do iOS (pilha nativa de `app/(app)/_layout.tsx`).
// Este componente fica só para: a aba do Chat, as camadas internas de Produtos e de Conquistas,
// e as telas de scan cujo voltar não é um `router.back()` (gesto nativo desligado nelas).
//
// A tela SEGUE O DEDO (Reanimated, no thread de UI): arrastando a partir da borda (faixa de
// 20 pt), ela anda junto, com sombra na borda e o fundo escurecendo de leve. Ao soltar:
//   • passou de 1/3 da largura, ou soltou rápido para a direita → termina de sair e chama
//     `onVoltar` (A MESMA função do botão de voltar/X — o destino é sempre o do botão);
//   • senão → volta para o lugar com mola.
// Por baixo aparece o fundo do app, não a tela de trás (isso só a pilha nativa tem).
//   • `ativo={false}` desliga (folha aberta, modo que não tem voltar…).
//   • Toques comuns não são afetados: o gesto só ativa depois de 12 pt na horizontal, e a
//     rolagem vertical cancela (failOffsetY).
import { useRef, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const BORDA = 20;
const VELOCIDADE = 600;
const MOLA = { damping: 26, stiffness: 260, mass: 0.9 };

type Props = {
  onVoltar: () => void;
  ativo?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export default function VoltarPelaBorda({ onVoltar, ativo = true, style, children }: Props) {
  const { width: W } = useWindowDimensions();
  const cb = useRef(onVoltar);
  cb.current = onVoltar;
  const x = useSharedValue(0);

  // Chama o voltar e, no quadro seguinte (o conteúdo já trocou), devolve a tela ao lugar.
  const disparar = () => {
    cb.current();
    requestAnimationFrame(() => requestAnimationFrame(() => { x.value = 0; }));
  };

  const pan = Gesture.Pan()
    .enabled(ativo)
    .hitSlop({ left: 0, width: BORDA })
    .activeOffsetX(12)
    .failOffsetY([-25, 25])
    .onUpdate((e) => {
      'worklet';
      x.value = Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      'worklet';
      const vai = e.translationX > W / 3 || (e.velocityX > VELOCIDADE && e.translationX > 20);
      if (vai) {
        const resta = Math.max(0, W - x.value);
        const ms = Math.min(260, Math.max(140, (resta / Math.max(e.velocityX, 900)) * 1000));
        x.value = withTiming(W, { duration: ms, easing: Easing.out(Easing.cubic) }, (fim) => {
          if (fim) scheduleOnRN(disparar);
        });
      } else {
        x.value = withSpring(0, { ...MOLA, velocity: e.velocityX });
      }
    })
    .onFinalize((_e, ok) => {
      'worklet';
      if (!ok && x.value > 0 && x.value < W) x.value = withSpring(0, MOLA);
    });

  const telaSt = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const veuSt = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, W], [0.18, 0], 'clamp') * (x.value > 0 ? 1 : 0) }));
  const sombraSt = useAnimatedStyle(() => ({ opacity: x.value > 0 ? 1 : 0 }));

  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={[{ flex: 1, backgroundColor: '#F9F1F4' }, style]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, veuSt]} />
        <Animated.View style={[{ flex: 1 }, telaSt]}>
          {children}
          <Animated.View pointerEvents="none" style={[styles.sombra, sombraSt]} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // Sombra na borda esquerda da tela que sai (como a da pilha do iOS).
  sombra: {
    position: 'absolute', top: 0, bottom: 0, left: -1, width: 1,
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: -4, height: 0 },
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});
