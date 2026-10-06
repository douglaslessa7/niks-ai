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

// Tela 17 do fluxo completo — detalhe da alergia (condicional: `allergy_type`
// 'reaction' ou 'sensitive', nota do design). Campo #F0F0F0 no padrão do nome,
// bloco centrado acima do teclado (título → 9 → subtítulo → 21 → campo → 39 →
// botão), com texto livre. Libera com 4+ caracteres e grava `allergy_description`
// — que também vira a 3ª frase do loading da rotina ("Deixando … de fora…").
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
          <ObSubtitle style={{ marginTop: 9, marginHorizontal: 30 }}>Pode ser um ingrediente, marca ou produto específico.</ObSubtitle>
          <View style={{ marginTop: 21, marginHorizontal: 17, minHeight: 57, borderRadius: 12, backgroundColor: OB.option, justifyContent: 'center' }}>
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
          <ObPillButton onPress={handleContinue} disabled={!isActive} style={{ marginTop: 39 }} />
        </View>
      </KeyboardAvoidingView>

      <ObHeader onBack={() => router.back()} />
    </ObScreen>
  );
}
