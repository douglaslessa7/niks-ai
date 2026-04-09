import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

export default function OnboardingLayout() {
  const router = useRouter();
  const { track, timeEvent, registerSuperProperties, isReady } = useMixpanel();
  const [isInOnboarding, setIsInOnboarding] = useState(false);
  const hasTrackedStart = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (__DEV__) {
        setIsInOnboarding(true);
        return;
      }

      if (session) {
        try {
          const info = await getCustomerInfo();
          if (isSubscribed(info)) {
            router.replace('/(app)/home');
            return;
          }
        } catch {
          // RevenueCat falhou — mantém o usuário no onboarding (não dá acesso ao app)
        }
      }
      setIsInOnboarding(true);
    });
  }, []);

  useEffect(() => {
    if (!isReady || !isInOnboarding || hasTrackedStart.current) return;
    hasTrackedStart.current = true;
    timeEvent('onboarding_completed');
    track('onboarding_started', { onboarding_version: '1.0', total_steps: 23 });
    registerSuperProperties({ onboarding_version: '1.0' });
  }, [isReady, isInOnboarding]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
