import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Keyboard, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB, ObScreen, ObTitle, ObSubtitle, ObPillButton, useObFrame } from '../../components/onboarding/kit';
import BotaoColarCodigo from '../../components/grupos/BotaoColarCodigo';
import { extrairCodigo, mensagemDoCodigo } from '../../lib/codigoConvite';
import { guardarCodigoGrupo, lerCodigoGrupo, limparCodigoGrupo } from '../../lib/convidada';
import { validarCodigo } from '../../lib/gruposServidor';

// Código de grupo no onboarding (Parte B, Fase 4), logo depois do nome. Fora da numeração do
// funil. O código é conferido na hora; "Pular" fica sempre visível.
const COMPLETO = /^(NIKS-?)?[2-9A-HJ-NP-Z]{6}$/i;

export default function CodigoGrupo() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y } = useObFrame();
  const nomeDela = useAppStore((s) => s.pendingName)?.trim() ?? '';
  const [codigo, setCodigo] = useState('');
  const [grupo, setGrupo] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const pedido = useRef(0);

  useEffect(() => {
    track('codigo_tela_vista');
    void lerCodigoGrupo().then((c) => { if (c) { setCodigo(c.codigo); setGrupo(c.grupo); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conferir = async (valor: string, origem: 'digitado' | 'colado') => {
    const id = ++pedido.current;
    const r = await validarCodigo(valor);
    if (id !== pedido.current) return;
    if (!r) { setErro(mensagemDoCodigo('rede')); return; }
    const resultado = r.motivo === 'limite' ? 'limite' : !r.valido ? 'invalido' : r.cheio ? 'cheio' : 'ok';
    track('codigo_digitado', { resultado, origem });
    if (resultado === 'ok') {
      haptics.success();
      setGrupo(r.nome ?? '');
      await guardarCodigoGrupo({ codigo: valor, grupo: r.nome ?? '' });
      return;
    }
    haptics.error();
    setErro(mensagemDoCodigo(resultado === 'invalido' ? 'convite_invalido' : resultado));
  };

  const mudar = (texto: string, origem: 'digitado' | 'colado') => {
    const valor = texto.toUpperCase();
    setCodigo(valor);
    setGrupo(null);
    setErro('');
    pedido.current += 1;
    void limparCodigoGrupo();
    if (COMPLETO.test(valor.trim())) void conferir(valor.trim(), origem);
  };

  const continuar = () => {
    if (grupo === null) return;
    haptics.action();
    router.push('/(onboarding)/goal-desire');
  };

  const pular = async () => {
    haptics.tap();
    pedido.current += 1;
    await limparCodigoGrupo();
    track('codigo_pulado');
    router.push('/(onboarding)/goal-desire');
  };

  return (
    <ObScreen>
      <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, paddingTop: y(90), justifyContent: 'center' }}>
          <View>
            <ObTitle>{nomeDela ? `${nomeDela}, você tem um código de grupo do NIKS?` : 'Você tem um código de grupo do NIKS?'}</ObTitle>
            <ObSubtitle style={{ marginTop: 24, marginHorizontal: 30 }}>Se uma amiga te convidou, digite o código que ela te mandou.</ObSubtitle>
            <View style={{ marginTop: 24, marginHorizontal: 17, height: 57, borderRadius: 12, backgroundColor: OB.option, justifyContent: 'center' }}>
              <TextInput
                value={codigo}
                onChangeText={(t) => mudar(t, 'digitado')}
                placeholder="NIKS-XXXXXX"
                placeholderTextColor="rgba(18,18,18,0.25)"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
                returnKeyType="done"
                selectionColor={OB.pink}
                cursorColor={OB.pink}
                style={{ textAlign: 'center', fontSize: 26, fontWeight: '700', color: OB.ink, paddingHorizontal: 16 }}
              />
            </View>
            <Text style={{ marginTop: 10, marginHorizontal: 17, minHeight: 22, textAlign: 'center', fontSize: 16, lineHeight: 22, fontWeight: '600', color: erro ? '#D93A6B' : OB.pink }}>
              {erro || (grupo !== null ? `Grupo ${grupo} ✓` : '')}
            </Text>
            <View style={{ alignItems: 'center' }}><BotaoColarCodigo onColar={(c) => mudar(extrairCodigo(c), 'colado')} /></View>
            <ObPillButton onPress={continuar} disabled={grupo === null} style={{ marginTop: 48 }} />
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }} onPress={pular} style={{ alignSelf: 'center', marginTop: 14 }}>
              <Text style={{ fontSize: 17, lineHeight: 23, fontWeight: '600', color: OB.ink }}>Pular</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </ObScreen>
  );
}
