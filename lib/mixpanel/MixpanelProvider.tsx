import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { mixpanel, initMixpanel } from './mixpanelClient';

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
