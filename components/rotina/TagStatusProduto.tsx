// Tag do status do produto no passo da Rotina ("Quero comprar", "Acabou") — 16/nov/2026,
// pedido do produto: o status deixou de ir colado no nome ("Quero comprar · La Roche-Posay ·
// …"). Mesma cor e ponto da pílula de status da estante (`ProdutoEstanteOverlay`), em tamanho
// de selo. "Tenho em casa" (ou sem status, cache antigo) não mostra nada.
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { STATUS_COLECAO, type ColecaoStatus } from '../../lib/colecao';
import { t } from '../../lib/i18n';

export function TagStatusProduto({ status, style }: { status?: ColecaoStatus | null; style?: StyleProp<ViewStyle> }) {
  if (!status || status === 'tenho') return null;
  const info = STATUS_COLECAO[status];
  return (
    <View style={[s.tag, { backgroundColor: info.fundo }, style]} accessibilityLabel={t(info.rotulo)}>
      <View style={[s.ponto, { backgroundColor: info.cor }]} />
      <Text style={[s.txt, { color: info.cor }]}>{t(info.rotulo)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10,
  },
  ponto: { width: 6, height: 6, borderRadius: 3 },
  txt: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: -0.1 },
});
