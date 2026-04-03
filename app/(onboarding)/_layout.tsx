import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { usePlacement } from 'expo-superwall';

export default function OnboardingLayout() {
  const router = useRouter();
  const { registerPlacement } = usePlacement();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        try {
          const info = await getCustomerInfo();
          if (isSubscribed(info)) {
            router.replace('/(app)/home');
          } else {
            registerPlacement({ placement: 'paywall_onboarding' });
          }
        } catch {
          // RevenueCat falhou — mantém o usuário no onboarding (não dá acesso ao app)
        }
      }
    });
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
