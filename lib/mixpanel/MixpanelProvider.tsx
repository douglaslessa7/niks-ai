import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { PaywalloClient } from '@virex-tech/paywallo-sdk';
import { mixpanel, initMixpanel } from './mixpanelClient';
import { OB_STEP_TOTAL } from '../../components/onboarding/kit';

/**
 * Paywallo: funil de onboarding (tela Dropout). O SDK só monta o funil com
 * `PaywalloClient.onboardingStep(order, name)` — então todo `onboarding_step_viewed`
 * do Mixpanel é repassado daqui, num ponto só (nenhuma tela chama o Paywallo).
 *
 * - Só passos do funil atual: `step_total === OB_STEP_TOTAL` (é o que o `obStep` do
 *   kit gera). As telas com numeração antiga escrita à mão (`camera-multi`,
 *   `scan-prep-app`, `rate-us`, com `step_total: 23`) ficam de fora — as duas
 *   primeiras são o scan DENTRO do app e encheriam o funil de passos falsos.
 * - Só `step_number > 0` (telas fora do fluxo valem 0).
 * - Fire-and-forget: nunca lança nem segura a tela.
 */
function forwardOnboardingStepToPaywallo(event: string, properties?: Record<string, unknown>) {
  if (event !== 'onboarding_step_viewed' || properties?.step_total !== OB_STEP_TOTAL) return;
  const step = properties.step_number;
  const name = properties.step_name;
  if (typeof step !== 'number' || step <= 0 || typeof name !== 'string') return;
  try {
    PaywalloClient.onboardingStep(step, name).catch(() => {});
  } catch {}
}

interface MixpanelContextValue {
  track: (event: string, properties?: Record<string, unknown>) => void;
  identify: (userId: string) => void;
  reset: () => void;
  flush: () => void;
  timeEvent: (event: string) => void;
  setUserProperties: (properties: Record<string, unknown>) => void;
  registerSuperProperties: (properties: Record<string, unknown>) => void;
  isReady: boolean;
}

const MixpanelContext = createContext<MixpanelContextValue | null>(null);

export function MixpanelProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    initMixpanel()
      .then(() => setIsReady(true))
      .catch(console.error);
  }, []);

  const value: MixpanelContextValue = {
    track: (event, properties) => {
      // Antes do `isReady`: o funil do Paywallo não depende do Mixpanel ter iniciado
      // (senão a 1ª tela, que monta cedo, poderia se perder).
      forwardOnboardingStepToPaywallo(event, properties);
      if (!isReady) return;
      mixpanel.track(event, properties);
    },
    identify: (userId) => {
      if (!isReady) return;
      mixpanel.identify(userId);
    },
    reset: () => {
      if (!isReady) return;
      mixpanel.reset();
    },
    flush: () => {
      if (!isReady) return;
      mixpanel.flush();
    },
    timeEvent: (event) => {
      if (!isReady) return;
      mixpanel.timeEvent(event);
    },
    setUserProperties: (properties) => {
      if (!isReady) return;
      mixpanel.getPeople().set(properties);
    },
    registerSuperProperties: (properties) => {
      if (!isReady) return;
      mixpanel.registerSuperProperties(properties);
    },
    isReady,
  };

  return (
    <MixpanelContext.Provider value={value}>
      {children}
    </MixpanelContext.Provider>
  );
}

export function useMixpanel(): MixpanelContextValue {
  const ctx = useContext(MixpanelContext);
  if (!ctx) throw new Error('useMixpanel must be used within MixpanelProvider');
  return ctx;
}
