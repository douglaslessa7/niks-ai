import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, InteractionManager } from 'react-native';
import { useRouter } from 'expo-router';
import { usePlacement } from 'expo-superwall';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

export default function PaywallSoft() {
  const router = useRouter();
  const hasRegistered = useRef(false);
  const { track } = useMixpanel();

  track('paywall_viewed', { screen: 'soft' });

  const handleAfterPaywall = async () => {
    try {
      const info = await getCustomerInfo();
      if (isSubscribed(info)) {
        // Assinante confirmado — entra no app (layout checa nome e redireciona se necessário)
        router.replace('/(app)/home');
        return;
      }
    } catch {
      // ignora erro — vai reapresentar o paywall
    }
    // Não assinou — reapresenta o paywall (bloqueio total)
    registerPlacement({ placement: 'paywall_onboarding' });
  };

  const { registerPlacement } = usePlacement({
    onPresent: () => {},
    onDismiss: async () => {
      await handleAfterPaywall();
    },
    onSkip: async () => {
      // Superwall decidiu não exibir (já assinante, holdout) — verifica e entra
      await handleAfterPaywall();
    },
    onError: async () => {
      // SDK falhou — reapresenta (fail closed)
      registerPlacement({ placement: 'paywall_onboarding' });
    },
  });

  useEffect(() => {
    if (__DEV__) {
      router.replace('/(app)/home');
      return;
    }

    if (hasRegistered.current) return;
    hasRegistered.current = true;

    const task = InteractionManager.runAfterInteractions(() => {
      registerPlacement({ placement: 'paywall_onboarding' });
    });

    return () => task.cancel();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#FB7B6B" />
    </View>
  );
}
