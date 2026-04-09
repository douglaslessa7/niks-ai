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

  const navigateToApp = async () => {
    try {
      const info = await getCustomerInfo();
      if (isSubscribed(info)) {
        router.replace('/(app)/home');
      } else {
        router.replace('/(app)/home'); // guard de (app)/_layout.tsx barra se não assinou
      }
    } catch {
      router.replace('/(app)/home');
    }
  };

  const { registerPlacement } = usePlacement({
    onPresent: () => {
      // paywall visível — não faz nada, aguarda o usuário interagir
    },
    onDismiss: async (_paywallInfo, _result) => {
      // usuário fechou o paywall (assinou, restaurou ou dispensou)
      await navigateToApp();
    },
    onSkip: async () => {
      // Superwall não exibiu o paywall (holdout, sem audience match, já assinante)
      await navigateToApp();
    },
    onError: async () => {
      // SDK falhou — deixa o guard de (app)/_layout.tsx decidir
      router.replace('/(app)/home');
    },
  });

  useEffect(() => {
    if (__DEV__) {
      navigateToApp();
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
