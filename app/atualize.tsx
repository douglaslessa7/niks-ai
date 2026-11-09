import { Linking, Text, TouchableOpacity, View } from 'react-native';

// Parte B, Fase 8: versão abaixo de `grupos_config.versao_minima`.
const APP_STORE = 'https://apps.apple.com/app/id6760590018';

export default function Atualize() {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 26, fontWeight: '700', letterSpacing: -0.5, color: '#121212', textAlign: 'center' }}>Atualize o NIKS</Text>
      <Text style={{ marginTop: 10, fontSize: 16, lineHeight: 22, color: '#7A7076', textAlign: 'center' }}>Para continuar, instale a versão mais recente.</Text>
      <TouchableOpacity activeOpacity={0.85} onPress={() => Linking.openURL(APP_STORE)} style={{ marginTop: 28, height: 54, paddingHorizontal: 40, borderRadius: 27, backgroundColor: '#FF5EA8', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Atualizar</Text>
      </TouchableOpacity>
    </View>
  );
}
