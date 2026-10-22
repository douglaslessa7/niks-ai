import { View, Text } from 'react-native';
import { Users } from 'lucide-react-native';
import { OB } from './kit';

// Prova social do loading do ONBOARDING (formato da tela 23 do "fluxo completo": ícone
// de pessoas + número em rosa + "já seguem uma rotina NIKS").
//
// ⚠️ O número é informado pelo PRODUTO (20/out/2026: "dados reais que temos"), de uma
// fonte FORA do banco do app — no banco, nessa data, eram 3.217 contas e 1.666 com
// rotina gerada. Ao mudar o número, confirmar a fonte com o produto: é uma afirmação
// para cliente (não pode ser inventada — ver "Marcadores do design" no README).
// A mesma frase para todo tipo de pele (o número não tem divisão por tipo).
const TOTAL = 237887;

export default function ProvaSocial() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Users size={20} color={OB.pink} strokeWidth={2} />
      <Text style={{ flexShrink: 1, fontSize: 15, lineHeight: 20, color: OB.sub, textAlign: 'center' }}>
        <Text style={{ fontWeight: '700', color: OB.pink }}>{`${TOTAL.toLocaleString('pt-BR')} mulheres`}</Text>
        {' já seguem uma rotina NIKS'}
      </Text>
    </View>
  );
}
