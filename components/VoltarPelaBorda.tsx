// Deslizar da borda esquerda para voltar (10/nov/2026).
// As telas do app são ABAS (`(app)` é um <Tabs>), e aba não tem o gesto de voltar do iOS.
// Este invólucro dá o gesto: arrastar a partir da borda esquerda (faixa de 20 pt) por mais
// de 70 pt, ou soltar rápido para a direita, chama `onVoltar` — que a tela passa como A MESMA
// função do botão de voltar/X. Assim o destino é sempre o mesmo do botão.
//   • Sem a prévia da tela anterior (isso só existe numa pilha nativa) — aprovado.
//   • `ativo={false}` desliga (folha aberta, modo que não tem voltar…).
//   • Toques comuns não são afetados: o gesto só ativa depois de 12 pt na horizontal, e a
//     rolagem vertical cancela (failOffsetY).
//   • Também usado nas telas de pilha cujo botão NÃO faz `router.back()` (gesto nativo
//     desligado nelas, para o destino ser o do botão).
import { useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

const BORDA = 20;
const DISTANCIA = 70;
const VELOCIDADE = 600;

type Props = {
  onVoltar: () => void;
  ativo?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export default function VoltarPelaBorda({ onVoltar, ativo = true, style, children }: Props) {
  const cb = useRef(onVoltar);
  cb.current = onVoltar;
  const disparar = () => cb.current();

  const pan = Gesture.Pan()
    .enabled(ativo)
    .hitSlop({ left: 0, width: BORDA })
    .activeOffsetX(12)
    .failOffsetY([-25, 25])
    .onEnd((e) => {
      'worklet';
      if (e.translationX > DISTANCIA || (e.velocityX > VELOCIDADE && e.translationX > 20)) {
        scheduleOnRN(disparar);
      }
    });

  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={[{ flex: 1 }, style]}>{children}</View>
    </GestureDetector>
  );
}
