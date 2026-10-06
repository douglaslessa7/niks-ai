import { useState } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObPillButton, useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { PrivacyIllustration } from '../../components/onboarding/PrivacyIllustration';
import { PRIVACY_URL } from '../../components/ui/AIConsentModal';

// Tela 0.2 do fluxo completo — "Sua pele. Seus dados." (LGPD: foto de rosto é dado
// biométrico). Dois consentimentos com círculo de marcar e "Aceitar e continuar".
//
// O botão do design MARCA OS DOIS e segue (no protótipo ele só preenche os
// círculos): tocar nele é o aceite explícito. Grava `ai_consent_accepted`, a MESMA
// chave do `useAIConsent` — por isso a folha de consentimento da preparação do scan
// e o portão das câmeras (`useScanConsentGate`) não aparecem de novo depois daqui.
// Os círculos podem ser marcados um a um; o botão funciona com ou sem eles.
//
// ⚠️ "Termos de Uso" abre a mesma página da Política de Privacidade — é o que o
// signup já fazia (não existe URL própria de termos no app).
const STEP = OB_STEPS.seusDados;
const STEP_NAME = 'Seus Dados';
const AI_CONSENT_KEY = 'ai_consent_accepted';

function CheckCircle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{
        width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
        borderColor: on ? OB.pink : OB.radio, backgroundColor: on ? OB.pink : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {on && (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Path d="M6.5 11.2 L9.6 14.2 L15.5 8" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </TouchableOpacity>
  );
}

function PolicyLink({ label }: { label: string }) {
  return (
    <Text
      onPress={() => { haptics.tap(); Linking.openURL(PRIVACY_URL); }}
      style={{ color: OB.pink, fontWeight: '500' }}
    >
      {label}
    </Text>
  );
}

export default function SeusDados() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y, buttonBottom } = useObFrame();
  const [dados, setDados] = useState(false);
  const [termos, setTermos] = useState(false);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const accept = async () => {
    haptics.action();
    setDados(true);
    setTermos(true);
    try {
      await AsyncStorage.setItem(AI_CONSENT_KEY, 'true');
    } catch (e) {
      // Sem gravar, o portão das câmeras pede de novo — nada se perde.
      console.warn('[seus-dados] falha ao gravar o consentimento:', e);
    }
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.replace('/(onboarding)/nome');
  };

  const bodyText = { flex: 1, fontSize: 15, lineHeight: 22, color: OB.body } as const;

  return (
    <ObScreen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: y(70), alignSelf: 'center' }}>
        <PrivacyIllustration />
      </View>

      <Text style={{
        position: 'absolute', left: 17, right: 17, top: y(376), textAlign: 'center',
        fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: OB.ink,
      }}>
        Sua pele. Seus dados.
      </Text>
      <Text style={{
        position: 'absolute', left: 30, right: 30, top: y(420), textAlign: 'center',
        fontSize: 17, lineHeight: 23, color: OB.sub,
      }}>
        Suas fotos e dados de pele não são vendidos a ninguém, e você pode apagá-los quando quiser.
      </Text>

      <View style={{ position: 'absolute', left: 24, right: 28, top: y(520), gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
          <CheckCircle on={dados} onPress={() => { haptics.select(); setDados((v) => !v); }} />
          <Text style={bodyText}>
            Concordo com o processamento das minhas fotos e dados de pele para usar as funções da NIKS. Veja mais na{' '}
            <PolicyLink label="Política de Privacidade" />.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
          <CheckCircle on={termos} onPress={() => { haptics.select(); setTermos((v) => !v); }} />
          <Text style={bodyText}>
            Concordo com a <PolicyLink label="Política de Privacidade" /> e os <PolicyLink label="Termos de Uso" />.
          </Text>
        </View>
      </View>

      <ObPillButton label="Aceitar e continuar" width={220} onPress={accept} bottom={buttonBottom} />
    </ObScreen>
  );
}
