// Passo do funil do onboarding visto (Mixpanel e, de 1 a OB_PAYWALLO_LAST, Paywallo).
// Arquivo à parte do kit: o MixpanelProvider importa o kit, e o kit importar o provider faria um ciclo.
import { useEffect } from 'react';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { obStep } from './kit';

export function useObPassoVisto(step: number, name: string, ativo = true) {
  const { track } = useMixpanel();
  useEffect(() => {
    if (ativo && step > 0) track('onboarding_step_viewed', obStep(step, name));
  }, [step, name, ativo]); // eslint-disable-line react-hooks/exhaustive-deps
}
