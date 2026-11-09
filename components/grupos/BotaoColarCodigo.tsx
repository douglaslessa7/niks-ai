// Botão "Colar" do sistema (Parte B, decisão 2): não mostra o alerta de permissão do iOS, ao
// contrário de ler a área de transferência sozinho. Sem suporte no aparelho, não aparece.
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { extrairCodigo } from '../../lib/codigoConvite';

export default function BotaoColarCodigo({ onColar }: { onColar: (codigo: string) => void }) {
  if (!Clipboard.isPasteButtonAvailable) return null;
  return (
    <View style={{ alignItems: 'flex-start', marginTop: 12 }}>
      <Clipboard.ClipboardPasteButton
        acceptedContentTypes={['plain-text']}
        displayMode="iconAndLabel"
        style={{ width: 96, height: 36 }}
        onPress={(d) => { if (d.type === 'text') onColar(extrairCodigo(d.text)); }}
      />
    </View>
  );
}
