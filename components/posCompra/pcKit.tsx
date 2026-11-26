// ─────────────────────────────────────────────────────────────────────────────
// Átomos das telas do pós-compra v2 (lib/posCompraV2.ts).
// Design: `design-handoff/pos-compra-v2/` (exportado do canvas "NIKS · Fluxo pós-compra v2",
// 26/nov/2026). Frame de 390 × 844 pt: 59 pt de status bar em cima (aqui o `insets.top`) e 34 pt
// de home indicator embaixo (aqui o `insets.bottom`). Os X são os do design (margens fixas).
// ─────────────────────────────────────────────────────────────────────────────
import { View, Text, TouchableOpacity, type ViewStyle, type StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';

export const PC = {
  pink: '#FF5EA8',
  pinkDark: '#E0418B',
  ink: '#111111',
  body: '#4A4A4A',
  sub: '#6B6B6B',
  blush: '#FDF3F7',
  rosaClaro: '#FFE1EE',
};

/** Área da tela: `top` = onde o design começa depois da status bar; `bottom` = acima do home indicator. */
export function usePcFrame() {
  const insets = useSafeAreaInsets();
  return { top: insets.top, bottom: Math.max(insets.bottom, 20), insets };
}

/** Botão pílula do design: 54 pt, raio 27, sombra rosa `0 10px 24px rgba(255,94,168,.35)`. */
export function PcBotao({ label, onPress, style, desligado }: {
  label: string; onPress: () => void; style?: StyleProp<ViewStyle>; desligado?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={desligado}
      onPress={() => { haptics.action(); onPress(); }}
      accessibilityRole="button"
      style={[{
        height: 54, borderRadius: 27, backgroundColor: PC.pink, alignItems: 'center', justifyContent: 'center',
        shadowColor: PC.pink, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 12,
        opacity: desligado ? 0.5 : 1,
      }, style]}
    >
      <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Check (✓) do design, `M2 7.5l3 3 7-7` no viewBox de 14. */
export function PcCheck({ size = 14, cor = PC.pink, traco = 1.8 }: { size?: number; cor?: string; traco?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path d="M2 7.5l3 3 7-7" fill="none" stroke={cor} strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Bolinha rosa com o check branco (18 pt) — a lista da Projeção. */
export function PcCheckCheio({ size = 18 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: PC.pink, alignItems: 'center', justifyContent: 'center' }}>
      <PcCheck size={size * 0.56} cor="#FFFFFF" traco={2.5} />
    </View>
  );
}

/** Selo "★ Exclusivo do Premium" (telas 12–14). */
export function SeloPremium({ texto }: { texto: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: PC.rosaClaro, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 }}>
      <Svg width={12} height={12} viewBox="0 0 24 24">
        <Path d="M12 2l2.6 6.6L21 9.3l-5 4.6 1.4 6.8L12 17.3 6.6 20.7 8 13.9 3 9.3l6.4-.7z" fill={PC.pinkDark} />
      </Svg>
      <Text style={{ fontSize: 12, fontWeight: '700', color: PC.pinkDark }}>{texto}</Text>
    </View>
  );
}

/** Pontinhos de página (o ativo é a pílula de 18 pt). */
export function Pontinhos({ total, ativo }: { total: number; ativo: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ width: i === ativo ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === ativo ? PC.pink : '#F6CDE0' }} />
      ))}
    </View>
  );
}

/** "Acne alta", "Muitas manchas"… — o rótulo do ponto de partida no gráfico da Projeção. */
export const DOR_ALTA: Record<string, string> = {
  acne: 'Acne alta', oleosidade: 'Oleosidade alta', ressecamento: 'Ressecamento alto',
  manchas: 'Muitas manchas', cravos: 'Muitos cravos', rugas: 'Rugas visíveis',
  poros: 'Poros dilatados', olheiras: 'Olheiras marcadas', textura: 'Textura irregular',
};

/** Primeira letra maiúscula ("acne" → "Acne"). */
export const maiuscula = (s: string) => (s ? s[0].toLocaleUpperCase('pt-BR') + s.slice(1) : s);
