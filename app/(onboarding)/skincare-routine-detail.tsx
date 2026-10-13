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

// Tela 11 do onboarding — detalhe da rotina atual (condicional: `skincare_routine_type`
// 'complement' ou 'prescribed', como na versão B). Textos da versão B no visual do kit;
// mesmo esqueleto do detalhe da alergia (título → 9 → subtítulo → 21 → campo → 39 →
// botão, bloco centrado acima do teclado). Libera com 4+ caracteres e grava
// `skincare_routine_description` — que a `generate-protocol` lê como os ativos que ela
// já usa (checagem de ativo declarado).
const STEP = OB_STEPS.rotinaDetalhe;
const STEP_NAME = 'Detalhe da Rotina';

export default function SkincareRoutineDetail() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { onboarding, setOnboardingField } = useAppStore();
  const { y } = useObFrame();
  const [description, setDescription] = useState(onboarding.skincare_routine_description ?? '');
  const isPrescribed = onboarding.skincare_routine_type === 'prescribed';

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const isActive = description.length >= 4;

  const handleContinue = () => {
    if (!isActive) return;
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/allergies');
  };

  return (
    <ObScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, paddingTop: y(90), justifyContent: 'center' }}
      >
        <View>
          <ObTitle>{isPrescribed ? 'Quais produtos foram prescritos?' : 'Quais produtos você já usa?'}</ObTitle>
          <ObSubtitle style={{ marginTop: 9, marginHorizontal: 30 }}>
            Descreva brevemente. Isso nos ajuda a montar o melhor protocolo para você.
          </ObSubtitle>
          <View style={{ marginTop: 21, marginHorizontal: 17, minHeight: 57, borderRadius: 12, backgroundColor: OB.option, justifyContent: 'center' }}>
            <TextInput
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                setOnboardingField('skincare_routine_description', text || null);
              }}
              autoFocus
              multiline
              placeholder="Ex: uso vitamina C de manhã e hidratante à noite..."
              placeholderTextColor={OB.sub}
              selectionColor={OB.pink}
              cursorColor={OB.pink}
              // ⚠️ multiline: sem `height` fixo (decisão 17 do README), só maxHeight.
              style={{ maxHeight: 120, fontSize: 17, lineHeight: 23, color: OB.ink, paddingHorizontal: 16, paddingTop: 17, paddingBottom: 17 }}
            />
          </View>
          <ObPillButton onPress={handleContinue} disabled={!isActive} style={{ marginTop: 39 }} />
        </View>
      </KeyboardAvoidingView>

      <ObHeader onBack={() => router.back()} />
    </ObScreen>
  );
}
