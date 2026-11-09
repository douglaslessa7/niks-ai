import { useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OB, ObScreen, ObTitle, ObPillButton } from '../../components/onboarding/kit';
import BotaoColarCodigo from '../../components/grupos/BotaoColarCodigo';
import { haptics } from '../../lib/haptics';
import { entrarComCodigo } from '../../lib/gruposServidor';
import { mensagemDoCodigo } from '../../lib/codigoConvite';
import { useAuth } from '../../hooks/useAuth';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';

// Conta sem assinatura e fora de todos os grupos (Parte B, Fase 5). Pontos e medalha ficam guardados.
export default function SemGrupo() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupada, setOcupada] = useState(false);

  const entrar = async () => {
    if (!codigo.trim() || ocupada) return;
    haptics.action();
    setOcupada(true);
    setErro('');
    try {
      const r = await entrarComCodigo(codigo.trim());
      trackFora('entrar_com_codigo', { tela: 'sem_grupo', resultado: r.ok ? 'ok' : r.motivo });
      if (r.ok) { router.replace('/(app)/home' as any); return; }
      setErro(mensagemDoCodigo(r.motivo));
    } catch {
      setErro(mensagemDoCodigo('rede'));
    }
    setOcupada(false);
  };

  return (
    <ObScreen>
      <Pressable style={{ flex: 1, justifyContent: 'center' }} onPress={Keyboard.dismiss} accessible={false}>
        <ObTitle>Você não está em nenhum grupo. Assine para continuar ou entre com um novo convite.</ObTitle>
        <ObPillButton label="Assinar o NIKS" onPress={() => { haptics.action(); router.replace('/(onboarding)/paywall-soft'); }} style={{ marginTop: 32 }} width={260} />
        <View style={{ marginTop: 28, marginHorizontal: 17, height: 57, borderRadius: 12, backgroundColor: OB.option, justifyContent: 'center' }}>
          <TextInput
            value={codigo}
            onChangeText={(t) => { setCodigo(t.toUpperCase()); setErro(''); }}
            placeholder="NIKS-XXXXXX"
            placeholderTextColor="rgba(18,18,18,0.25)"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            selectionColor={OB.pink}
            style={{ textAlign: 'center', fontSize: 24, fontWeight: '700', color: OB.ink, paddingHorizontal: 16 }}
          />
        </View>
        {!!erro && <Text style={{ marginTop: 10, textAlign: 'center', fontSize: 15, fontWeight: '600', color: '#D93A6B' }}>{erro}</Text>}
        <View style={{ alignItems: 'center' }}><BotaoColarCodigo onColar={(c) => { setCodigo(c); setErro(''); }} /></View>
        <TouchableOpacity activeOpacity={0.7} onPress={entrar} disabled={ocupada} style={{ alignSelf: 'center', marginTop: 16, height: 44, justifyContent: 'center' }}>
          {ocupada ? <ActivityIndicator color={OB.pink} /> : <Text style={{ fontSize: 17, fontWeight: '600', color: OB.pink }}>Entrar com código</Text>}
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.6} onPress={() => { haptics.tap(); void signOut().then(() => router.replace('/' as any)); }} style={{ alignSelf: 'center', marginTop: 8, height: 44, justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, color: OB.sub }}>Sair da conta</Text>
        </TouchableOpacity>
      </Pressable>
    </ObScreen>
  );
}
