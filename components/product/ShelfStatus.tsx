import { Alert, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';

// ─────────────────────────────────────────────────────────────────────────────
// Estante na página do produto (out/2026) — FONTE ÚNICA para o detalhe dos
// Recomendados (`recomendacao-produtos.tsx`) e o resultado do scan / detalhe dos
// Escaneados (`ProductAnalysis`). Estante = coleção.
//
// - fora da estante → `ShelfAddButton` mostra a cápsula rosa "Adicionar à estante";
// - já na estante   → `ShelfAddButton` vira um SELO rosa-claro "Na sua estante" (não
//   é botão), e `ShelfRemoveLink` (link cinza discreto, no fim dos botões) remove,
//   sempre passando pela confirmação `confirmShelfRemove`.
// Antes o botão rosa "Está na sua coleção" removia ao tocar — confundia.
// ─────────────────────────────────────────────────────────────────────────────

/** A confirmação de remover — a mesma do modo Editar da estante. */
export function confirmShelfRemove(name: string | null | undefined, onConfirm: () => void) {
  haptics.warning();
  Alert.alert(`Remover ${name?.trim() || 'este produto'} da sua estante?`, undefined, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Remover', style: 'destructive', onPress: onConfirm },
  ]);
}

// Ícone da estante (o mesmo do convite da estante vazia e do selo dos cards).
const ShelfIcon = ({ color, size = 17 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3.5 3v18M20.5 3v18M3.5 10.5h17M3.5 20h17" />
    <Path d="M7 10.5V6.5M10 10.5V5.5M14.5 20v-5M17.5 20v-3.5" />
  </Svg>
);

type Props = { owned: boolean; busy?: boolean; onAdd: () => void; style?: object };

/** Cápsula rosa "Adicionar à estante" ou, se já está, o selo "Na sua estante". */
export function ShelfAddButton({ owned, busy, onAdd, style }: Props) {
  if (owned) {
    return (
      <View
        accessible
        accessibilityLabel="Este produto está na sua estante"
        style={[{
          height: 50, borderRadius: 100, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#FFE3EF',
        }, style]}
      >
        <ShelfIcon color="#C0206A" />
        <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: '#C0206A' }}>Na sua estante</Text>
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#C0206A" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
      </View>
    );
  }
  return (
    <Pressable
      disabled={busy}
      onPress={() => { haptics.tap(); onAdd(); }}
      accessibilityRole="button"
      style={[{
        height: 50, borderRadius: 100, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FF5EA8',
        shadowColor: 'rgb(255,94,168)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 6,
        opacity: busy ? 0.6 : 1,
      }, style]}
    >
      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 5v14M5 12h14" /></Svg>
      <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' }}>Adicionar à estante</Text>
    </Pressable>
  );
}

/** Link discreto "Remover da estante" (só quando já está) → confirmação → `onRemove`. */
export function ShelfRemoveLink({ owned, busy, name, onRemove, style }: {
  owned: boolean; busy?: boolean; name: string | null | undefined; onRemove: () => void; style?: object;
}) {
  if (!owned) return null;
  return (
    <Pressable
      disabled={busy}
      hitSlop={10}
      onPress={() => confirmShelfRemove(name, onRemove)}
      accessibilityRole="button"
      style={[{ alignSelf: 'center', paddingVertical: 4, opacity: busy ? 0.5 : 1 }, style]}
    >
      <Text style={{ fontSize: 15, fontWeight: '500', letterSpacing: -0.2, color: '#8A8385' }}>Remover da estante</Text>
    </Pressable>
  );
}
