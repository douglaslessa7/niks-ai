import { useAcesso } from '../../lib/acesso';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { confirmPremium } from '../../lib/subscriptionGate';
import { PULAR_PAYWALL } from '../../lib/devPaywall';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEP_TOTAL } from '../../components/onboarding/kit';
import { useAppStore } from '../../store/onboarding';

export default function OnboardingLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { track, timeEvent, registerSuperProperties, isReady } = useMixpanel();
  const [isInOnboarding, setIsInOnboarding] = useState(false);
  const hasTrackedStart = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (PULAR_PAYWALL) {
        setIsInOnboarding(true);
        useAppStore.getState().markSplashDestinationReady();
        return;
      }

      // Reforço contra o loop de nome: nunca expulsar quem está na etapa `nome`.
      // O (app)/_layout já não navega mais para cá, mas se um assinante cair na
      // etapa de nome por qualquer caminho, este bounce para /home reabriria o
      // ping-pong. Na etapa de nome, deixamos a captura acontecer.
      const onNameStep = segments[segments.length - 1] === 'nome';
      // Tela de espera depois da compra (06/nov/2026): a assinante JÁ tem premium e ainda
      // precisa ficar aqui até o scan e a rotina serem gravados (inclusive na retomada ao
      // reabrir o app, `app/index.tsx`). Ela mesma abre a home no fim.
      const naEspera = segments[segments.length - 1] === 'loading-rotina';

      // Ex-convidada que acabou de assinar: as boas-vindas ficam no onboarding.
      if (session && !onNameStep && !naEspera && !useAcesso.getState().boasVindasEx) {
        if (await confirmPremium({ label: 'onboarding:layout' })) {
          router.replace('/(app)/home');
          return;
        }
      }
      setIsInOnboarding(true);
      // Abertura direto numa tela do onboarding (deep link): destino pronto.
      useAppStore.getState().markSplashDestinationReady();
    });
  }, []);

  useEffect(() => {
    if (!isReady || !isInOnboarding || hasTrackedStart.current) return;
    hasTrackedStart.current = true;
    timeEvent('onboarding_completed');
    track('onboarding_started', { onboarding_version: '2.0', total_steps: OB_STEP_TOTAL });
    registerSuperProperties({ onboarding_version: '2.0' });
  }, [isReady, isInOnboarding]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
