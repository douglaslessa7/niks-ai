import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';

export default function OnboardingLayout() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        try {
          const info = await getCustomerInfo();
          if (isSubscribed(info)) {
            router.replace('/(app)/home');
          } else {
            router.replace('/(onboarding)/paywall-soft');
          }
        } catch {
          // RevenueCat falhou — mantém o usuário no onboarding (não dá acesso ao app)
        }
      }
    });
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
