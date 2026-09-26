import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 2 do onboarding novo — campo de texto (modelo 1d). É a PRIMEIRA tela do app
// para quem não tem sessão (o welcome antigo saiu: depois da splash, `app/index.tsx`
// cai direto aqui). Por isso NÃO tem voltar, e carrega o link "Já tem conta?
// Entrar" — o único caminho de login de quem já tem conta. Vem ANTES do
// signup/paywall: ainda não há sessão, então o nome só vai para o store
// (`pendingName`, persistido); quem grava em `users.nome` é o signup
// (`saveToSupabase`). A captura de nome DENTRO do app (guard do `(app)/_layout`,
// usuária legada sem nome) continua em `components/onboarding/NameCapture.tsx`.
//
// Nota do design: o teclado abre sozinho; antes de digitar, campo vazio com
// cursor e botão a 40%; o bloco fica centrado na altura livre acima do teclado.
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
        {/* Bloco com os espaçamentos do design: título → 43 → subtítulo → 25 →
            campo → 130 → botão. */}
        <View>
          <ObTitle>Como você quer ser chamada?</ObTitle>
          <ObSubtitle style={{ marginTop: 43 }}>É assim que o NIKS vai falar com você.</ObSubtitle>
          <View style={{
            marginTop: 25, marginHorizontal: 17, height: 58, borderRadius: 12,
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
          <ObPillButton onPress={handleContinue} disabled={!trimmed} style={{ marginTop: 130 }} />
          {/* Mesma copy e hierarquia do link do welcome antigo (cinza + "Entrar" em
              ink semibold), na tipografia do design novo. */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18 }}>
            <Text style={{ fontSize: 15, color: OB.sub }}>Já tem conta? </Text>
            <TouchableOpacity
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
              onPress={() => { haptics.tap(); router.push('/(onboarding)/login'); }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: OB.ink }}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Primeira tela do app: sem voltar (só a barra de progresso). */}
      <ObHeader step={STEP} />
    </ObScreen>
  );
}
