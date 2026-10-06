import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObTitle, ObSubtitle, ObPillButton,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 1 do fluxo completo — campo de texto. Vem depois da apresentação (0.1) e dos
// dados (0.2), que chega aqui com `replace`: NÃO tem voltar, e carrega o link "Já
// tem conta? Entrar" — o único caminho de login de quem já tem conta. Vem ANTES do
// signup/paywall: ainda não há sessão, então o nome só vai para o store
// (`pendingName`, persistido); quem grava em `users.nome` é o signup
// (`saveToSupabase`). A captura de nome DENTRO do app (guard do `(app)/_layout`,
// usuária legada sem nome) continua em `components/onboarding/NameCapture.tsx`.
//
// O teclado abre sozinho; antes de digitar, campo vazio com cursor e botão a 40%;
// o bloco fica centrado na altura livre acima do teclado.
const STEP = OB_STEPS.nome;
const STEP_NAME = 'Nome';

export default function Nome() {
  const router = useRouter();
  const { track } = useMixpanel();
  const pendingName = useAppStore((s) => s.pendingName);
  const setPendingName = useAppStore((s) => s.setPendingName);
  const { y } = useObFrame();
  const [nome, setNome] = useState(pendingName ?? '');

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const trimmed = nome.trim();

  const handleContinue = () => {
    if (!trimmed) return;
    haptics.action();
    setPendingName(trimmed);
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/prazer');
  };

  return (
    <ObScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, paddingTop: y(90), justifyContent: 'center' }}
      >
        {/* Bloco com os espaçamentos do design: título → 40 → subtítulo → 24 →
            campo (57) → 128 → botão → 14 → "Já tem conta?". */}
        <View>
          <ObTitle>Como você quer ser chamada?</ObTitle>
          <ObSubtitle style={{ marginTop: 40, marginHorizontal: 30 }}>É assim que a NIKS vai falar com você.</ObSubtitle>
          <View style={{
            marginTop: 24, marginHorizontal: 17, height: 57, borderRadius: 12,
            backgroundColor: OB.option, justifyContent: 'center',
          }}>
            <TextInput
              value={nome}
              onChangeText={setNome}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              selectionColor={OB.pink}
              cursorColor={OB.pink}
              style={{
                textAlign: 'center', fontSize: 30, fontWeight: '700', letterSpacing: -0.3,
                color: OB.ink, paddingHorizontal: 16,
              }}
            />
          </View>
          <ObPillButton onPress={handleContinue} disabled={!trimmed} style={{ marginTop: 128 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 14 }}>
            <Text style={{ fontSize: 17, lineHeight: 23, color: OB.sub }}>Já tem conta? </Text>
            <TouchableOpacity
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
              onPress={() => { haptics.tap(); router.push('/(onboarding)/login'); }}
            >
              <Text style={{ fontSize: 17, lineHeight: 23, fontWeight: '600', color: OB.ink }}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ObScreen>
  );
}
