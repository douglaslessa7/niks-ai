// Faixa de preço em 3 barrinhas iguais: as preenchidas no rosa da marca, as vazias no
// cinza-rosado claro das bordas do app. Vai no canto inferior direito da foto do card
// (o canto livre: em cima ficam o "i", o check e o selo "Na estante").
// Só para produtos recomendados do catálogo — ver lib/faixaPreco.
// `linha` = no detalhe do produto: barrinhas um pouco maiores, no fluxo do texto.
// Sem `textoStyle`, o nome da faixa (lib/faixaPreco → FAIXA_NOME) só vai para o leitor de tela.
// `textoStyle` = mostra o NOME da faixa ao lado (card do passo na Rotina), no estilo de
// texto que a tela passar — ex.: "▮▯▯ Custo-benefício".
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { FAIXA_NOME, descricaoFaixa, type FaixaPreco as Faixa } from '../../lib/faixaPreco';

const CHEIA = '#FF5EA8';
const VAZIA = '#EADDE3';

export default function FaixaPreco({ faixa, style, linha = false, textoStyle }: {
  faixa: Faixa; style?: StyleProp<ViewStyle>; linha?: boolean; textoStyle?: StyleProp<TextStyle>;
}) {
  if (textoStyle) {
    return (
      <View
        style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}
        accessible
        accessibilityLabel={descricaoFaixa(faixa)}
      >
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: n <= faixa ? CHEIA : VAZIA }} />
          ))}
        </View>
        <Text style={textoStyle} numberOfLines={1}>{FAIXA_NOME[faixa]}</Text>
      </View>
    );
  }
  if (linha) {
    return (
      <View
        style={[{ flexDirection: 'row', gap: 3, alignSelf: 'flex-start' }, style]}
        accessible
        accessibilityLabel={descricaoFaixa(faixa)}
      >
        {[1, 2, 3].map((n) => (
          <View key={n} style={{ width: 12, height: 5, borderRadius: 3, backgroundColor: n <= faixa ? CHEIA : VAZIA }} />
        ))}
      </View>
    );
  }
  return (
    <View
      style={[{ position: 'absolute', right: 7, bottom: 8, flexDirection: 'row', gap: 2 }, style]}
      accessible
      accessibilityLabel={descricaoFaixa(faixa)}
      pointerEvents="none"
    >
      {[1, 2, 3].map((n) => (
        <View key={n} style={{ width: 7, height: 3.5, borderRadius: 2, backgroundColor: n <= faixa ? CHEIA : VAZIA }} />
      ))}
    </View>
  );
}
