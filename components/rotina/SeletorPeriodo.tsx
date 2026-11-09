import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';

// Seletor Manhã | Noite: o da tela Rotina e o da folha "Em qual passo?".

const INK = '#121212';
const SOFT = '#6E6468';

type Valor = 'am' | 'pm';

export default function SeletorPeriodo({ valor, onChange, fundo = 'rgba(255,255,255,0.55)', style }: {
  valor: Valor;
  onChange: (v: Valor) => void;
  fundo?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const botao = (v: Valor, rotulo: string) => {
    const on = valor === v;
    const ink = on ? INK : SOFT;
    return (
      <TouchableOpacity
        key={v}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => { haptics.select(); onChange(v); }}
        style={[s.seg, on && s.segOn]}
      >
        <Svg width={16} height={16} viewBox="0 0 24 24">
          {v === 'am' ? (
            <>
              <Circle cx={12} cy={12} r={4} fill="none" stroke={ink} strokeWidth={1.9} />
              <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" fill="none" stroke={ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : (
            <Path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="none" stroke={ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </Svg>
        <Text style={{ fontSize: 15, fontWeight: on ? '600' : '500', letterSpacing: -0.2, color: ink }}>{rotulo}</Text>
      </TouchableOpacity>
    );
  };
  return (
    <View style={[s.wrap, { backgroundColor: fundo }, style]}>
      {botao('am', 'Manhã')}
      {botao('pm', 'Noite')}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignSelf: 'center', flexDirection: 'row', gap: 2, padding: 3, borderRadius: 100 },
  seg: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, borderRadius: 100 },
  segOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 5,
  },
});
