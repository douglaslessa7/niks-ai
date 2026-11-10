// Avatar sem foto de perfil (09/nov/2026): a inicial do nome no rosado, igual à Home. A foto
// do scan nunca vira avatar (ver "Feature: Foto da home escolhida pela galeria" no README).
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

export const inicialDe = (nome?: string | null) => (nome ? Array.from(nome.trim())[0]?.toLocaleUpperCase('pt-BR') ?? '' : '');

export default function InicialAvatar({ nome, tamanho, style }: { nome?: string | null; tamanho: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: '#F6D3E1', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text allowFontScaling={false} style={{ fontSize: Math.round(tamanho * 0.62), fontWeight: '700', color: '#E0447F' }}>{inicialDe(nome)}</Text>
    </View>
  );
}
