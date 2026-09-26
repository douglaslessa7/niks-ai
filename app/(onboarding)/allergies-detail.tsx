import { useState } from 'react';
import { View, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 15 do onboarding novo — detalhe da alergia (condicional: só para
// `allergy_type === 'reaction'`). Campo de texto no padrão da tela 2 (campo
// #F0F0F0, bloco centrado acima do teclado), com texto livre em várias linhas.
// Lógica de antes: libera com 4+ caracteres e grava `allergy_description`.
const STEP = OB_STEPS.alergiaDetalhe;
const STEP_NAME = 'Detalhe da Alergia';

export default function AllergiesDetail() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { onboarding, setOnboardingField } = useAppStore();
  const { y } = useObFrame();
  const [description, setDescription] = useState(onboarding.allergy_description ?? '');

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const isActive = description.length >= 4;

  const handleContinue = () => {
    if (!isActive) return;
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/goal-desire');
  };

  return (
    <ObScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, paddingTop: y(90), justifyContent: 'center' }}
      >
        <View>
          <ObTitle>Qual ativo ou produto causou reação?</ObTitle>
          <ObSubtitle style={{ marginTop: 11 }}>Pode ser um ingrediente, marca ou produto específico.</ObSubtitle>
          <View style={{ marginTop: 25, marginHorizontal: 17, minHeight: 58, borderRadius: 12, backgroundColor: OB.option, justifyContent: 'center' }}>
            <TextInput
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                setOnboardingField('allergy_description', text || null);
              }}
              autoFocus
              multiline
              placeholder="Ex: retinol, ácido glicólico, protetor solar X..."
              placeholderTextColor={OB.sub}
              selectionColor={OB.pink}
              cursorColor={OB.pink}
              // ⚠️ multiline: sem `height` fixo (decisão 17 do README), só maxHeight.
              style={{ maxHeight: 120, fontSize: 17, lineHeight: 23, color: OB.ink, paddingHorizontal: 16, paddingTop: 17, paddingBottom: 17 }}
            />
          </View>
          <ObPillButton onPress={handleContinue} disabled={!isActive} style={{ marginTop: 40 }} />
        </View>
      </KeyboardAvoidingView>

      <ObHeader step={STEP} onBack={() => router.back()} />
    </ObScreen>
  );
}
