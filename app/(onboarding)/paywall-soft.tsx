import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, InteractionManager } from 'react-native';
import { useRouter } from 'expo-router';
import { usePlacement } from 'expo-superwall';
import Purchases from 'react-native-purchases';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

export default function PaywallSoft() {
  const router = useRouter();
  const hasRegistered = useRef(false);
  const { track } = useMixpanel();
  const setSubscriptionVerified = useAppStore((s) => s.setSubscriptionVerified);

  track('paywall_viewed', { screen: 'soft' });

  const handleAfterPaywall = async () => {
    try {
      let info = await getCustomerInfo();

      // Fallback: se o cache do RC não mostrar assinatura ativa, sincroniza
      // com a App Store. Isso cobre: (1) cache desatualizado pós-compra,
      // (2) usuário anônimo comprou mas RC foi trocado para usuário identificado
      // sem transferir a assinatura, (3) onPurchase retornou 'failed' mas a
      // Apple processou o pagamento normalmente.
      if (!isSubscribed(info)) {
        try {
          info = await Purchases.restorePurchases();
        } catch {
          // Se o restore falhar, info continua com o valor anterior
        }
      }

      if (isSubscribed(info)) {
        // Assinante confirmada — marca no store para (app)/_layout.tsx não re-verificar
        setSubscriptionVerified(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Usuária já tem conta (reengajamento) — vai direto para home
          router.replace('/(app)/home');
        } else {
          // Nova usuária — precisa criar a conta
          router.replace('/(onboarding)/signup');
        }
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
      router.replace('/(onboarding)/signup');
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
