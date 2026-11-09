// Um alvo de tour/dica (`lib/coachMarks.ts`) como componente: para registrar o alvo dentro
// de um `.map` (ex.: o 1º passo vazio da Rotina) ou num item que só às vezes é o alvo.
// Renderize SÓ no elemento que é o alvo agora: duas instâncias com a mesma chave se apagam.
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useCoachMark, type CoachTargetKey } from '../../lib/coachMarks';

export default function AlvoGuia({ chave, children, style }: { chave: CoachTargetKey; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const m = useCoachMark(chave);
  return <View {...m} style={style}>{children}</View>;
}
