// Trecho SENSÍVEL para o Session Replay do Mixpanel: tudo o que está dentro sai mascarado na
// gravação (câmera, rosto, mensagens do chat, nome e e-mail). Sem o módulo nativo no binário,
// vira uma `View` comum com o mesmo estilo — o layout é idêntico nos dois casos.
// Ver lib/mixpanel/sessionReplay.ts e docs/tracking-plan.md ("Session Replay").
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { sessionReplayModulo } from '../lib/mixpanel/sessionReplay';

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
};

export default function Sensivel({ children, style, pointerEvents }: Props) {
  const Mascara = sessionReplayModulo()?.MPSessionReplayView;
  if (!Mascara) return <View style={style} pointerEvents={pointerEvents} collapsable={false}>{children}</View>;
  return <Mascara sensitive style={style} pointerEvents={pointerEvents}>{children}</Mascara>;
}
