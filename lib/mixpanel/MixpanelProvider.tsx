import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaywalloClient, onboardingManager } from '@virex-tech/paywallo-sdk';
import { mixpanel, initMixpanel } from './mixpanelClient';
import { OB_STEP_TOTAL, OB_PAYWALLO_LAST } from '../../components/onboarding/kit';
import { getOnboardingAttempt } from '../onboardingAttempt';

/**
 * Paywallo: funil de onboarding (tela Dropout). O SDK só monta o funil com
 * `PaywalloClient.onboardingStep(order, name)` — então os eventos de onboarding do
 * Mixpanel são repassados daqui, num ponto só (nenhuma tela chama o Paywallo).
 *
 * - Só passos do funil atual (`step_total === OB_STEP_TOTAL`, o que o `obStep` do kit
 *   gera) e só de 1 até `OB_PAYWALLO_LAST` (a rotina pronta, passo 25). Conta (26) e
 *   compromisso (27) vêm depois do paywall e ficam só no Mixpanel — com eles no funil,
 *   a conclusão aparecia em 0%. Telas fora do fluxo valem 0 e também ficam de fora.
 * - Espera o SDK iniciar: `onboardingStep` antes do init lança NOT_INITIALIZED e o
 *   passo se perderia (a 1ª tela monta cedo). Cada passo aguarda `waitUntilReady()`
 *   com teto de 10 s — o `waitUntilReady` nunca rejeita, mas também não resolve se o
 *   init falhar, daí o teto. Estourado o teto, tenta mesmo assim (e o erro é engolido).
 * - Ordem garantida: os passos saem por uma FILA (promise encadeada), então o 2 nunca
 *   sai antes do 1 mesmo que o SDK fique pronto no meio.
 * - Fim do onboarding: `onboardingManager.complete()` no `onboarding_step_completed`
 *   do passo `OB_PAYWALLO_LAST` ("Vamos começar", logo antes do paywall), na MESMA
 *   fila — sai sempre depois do passo 25. No máximo uma vez por instalação: a trava
 *   fica no AsyncStorage (`PAYWALLO_COMPLETED_KEY`), gravada só depois do sucesso.
 * - Só na 1ª tentativa de onboarding desta instalação (`onboarding_attempt === 1`,
 *   `lib/onboardingAttempt.ts`): quem reabre o app sem conta refaz o onboarding do
 *   zero, e repassar de novo contaria essa pessoa outra vez no passo 1. Vale para o
 *   funil inteiro (passos e `complete()`); as reaberturas ficam só no Mixpanel.
 * - Fire-and-forget: nada aqui é aguardado pela tela e nenhum erro sai daqui.
 */
const PAYWALLO_READY_TIMEOUT_MS = 10_000;
const PAYWALLO_COMPLETED_KEY = 'paywallo_onboarding_completed';
let paywalloQueue: Promise<void> = Promise.resolve();

function paywalloReadyOrTimeout(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, PAYWALLO_READY_TIMEOUT_MS);
  });
  return Promise.race([PaywalloClient.waitUntilReady().catch(() => {}), timeout]).finally(() =>
    clearTimeout(timer),
  );
}

async function completePaywalloOnboardingOnce(): Promise<void> {
  // A fila é serial: um 2º toque só lê a trava depois de o 1º ter gravado.
  if ((await AsyncStorage.getItem(PAYWALLO_COMPLETED_KEY)) === 'true') return;
  await paywalloReadyOrTimeout();
  // Falhou (ex.: SDK sem init) → lança, a trava não é gravada e um novo toque em
  // "Vamos começar" tenta de novo.
  await onboardingManager.complete();
  await AsyncStorage.setItem(PAYWALLO_COMPLETED_KEY, 'true');
}

function forwardOnboardingStepToPaywallo(event: string, properties?: Record<string, unknown>) {
  if (getOnboardingAttempt() !== 1) return;
  if (properties?.step_total !== OB_STEP_TOTAL) return;
  const step = properties.step_number;
  if (typeof step !== 'number' || step <= 0 || step > OB_PAYWALLO_LAST) return;

  if (event === 'onboarding_step_viewed') {
    const name = properties.step_name;
    if (typeof name !== 'string') return;
    paywalloQueue = paywalloQueue
      .then(paywalloReadyOrTimeout)
      .then(() => PaywalloClient.onboardingStep(step, name))
      .catch(() => {});
  } else if (event === 'onboarding_step_completed' && step === OB_PAYWALLO_LAST) {
    paywalloQueue = paywalloQueue.then(completePaywalloOnboardingOnce).catch(() => {});
  }
}

/**
 * Fila até o Mixpanel iniciar. O `initMixpanel()` é assíncrono e a 1ª tela (Olá) monta
 * junto com o provider: antes, tudo o que chegava nesse intervalo era DESCARTADO
 * (`if (!isReady) return`), e o passo 1 do onboarding quase não aparecia no Mixpanel.
 *
 * - Antes de iniciar, cada chamada entra na fila, na ordem em que aconteceu. O evento
 *   guarda o horário original (`time`, em ms — o formato do SDK nativo, e as
 *   propriedades do evento sobrescrevem o horário que o SDK poria na hora do envio).
 * - Iniciou → a fila é esvaziada de uma vez, na ordem, e daí em diante tudo vai direto.
 *   O esvaziamento é síncrono e tira os itens da fila antes de enviar: nada sai em dobro.
 * - Teto de `MIXPANEL_FILA_MAX` itens (se o init nunca terminar, a fila não cresce sem
 *   fim); o que passar disso é descartado.
 * - `timeEvent` na fila começa a contar quando a fila esvazia, não no horário original.
 * - Estado de módulo, não de componente: telas que guardam o `track` do 1º render
 *   (`useOnMount`) também passam a enviar.
 */
type MixpanelPendente =
  | { tipo: 'track'; evento: string; props?: Record<string, unknown>; quando: number }
  | { tipo: 'identify'; userId: string }
  | { tipo: 'reset' }
  | { tipo: 'timeEvent'; evento: string }
  | { tipo: 'people'; props: Record<string, unknown> }
  | { tipo: 'super'; props: Record<string, unknown> };

const MIXPANEL_FILA_MAX = 200;
let mixpanelPronto = false;
const mixpanelFila: MixpanelPendente[] = [];

function executarNoMixpanel(item: MixpanelPendente, daFila: boolean) {
  switch (item.tipo) {
    case 'track':
      mixpanel.track(item.evento, daFila ? { ...item.props, time: item.quando } : item.props);
      break;
    case 'identify':
      mixpanel.identify(item.userId);
      break;
    case 'reset':
      mixpanel.reset();
      break;
    case 'timeEvent':
      mixpanel.timeEvent(item.evento);
      break;
    case 'people':
      mixpanel.getPeople().set(item.props);
      break;
    case 'super':
      mixpanel.registerSuperProperties(item.props);
      break;
  }
}

function enviarAoMixpanel(item: MixpanelPendente) {
  if (mixpanelPronto) {
    executarNoMixpanel(item, false);
    return;
  }
  if (mixpanelFila.length < MIXPANEL_FILA_MAX) mixpanelFila.push(item);
}

function esvaziarFilaMixpanel() {
  const itens = mixpanelFila.splice(0, mixpanelFila.length);
  for (const item of itens) {
    try {
      executarNoMixpanel(item, true);
    } catch (erro) {
      console.error('[mixpanel] falha ao enviar item da fila:', erro);
    }
  }
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
      .then(() => {
        esvaziarFilaMixpanel();
        mixpanelPronto = true;
        setIsReady(true);
      })
      .catch(console.error);
  }, []);

  // Segundo plano → manda o que estiver guardado no SDK (quem sai rápido não perde os
  // eventos). Antes do init não há nada no SDK; a fila em memória espera o init.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'background' && mixpanelPronto) mixpanel.flush();
    });
    return () => sub.remove();
  }, []);

  const value: MixpanelContextValue = {
    track: (event, properties) => {
      // Todo evento de onboarding leva a tentativa (1 = primeira vez nesta instalação).
      const attempt = event.startsWith('onboarding_') ? getOnboardingAttempt() : null;
      const props = attempt !== null ? { ...properties, onboarding_attempt: attempt } : properties;
      // Na hora, fora da fila: o funil do Paywallo não depende do Mixpanel ter iniciado
      // (senão a 1ª tela, que monta cedo, poderia se perder).
      forwardOnboardingStepToPaywallo(event, props);
      enviarAoMixpanel({ tipo: 'track', evento: event, props, quando: Date.now() });
    },
    identify: (userId) => enviarAoMixpanel({ tipo: 'identify', userId }),
    reset: () => enviarAoMixpanel({ tipo: 'reset' }),
    flush: () => {
      if (mixpanelPronto) mixpanel.flush();
    },
    timeEvent: (event) => enviarAoMixpanel({ tipo: 'timeEvent', evento: event }),
    setUserProperties: (properties) => enviarAoMixpanel({ tipo: 'people', props: properties }),
    registerSuperProperties: (properties) => enviarAoMixpanel({ tipo: 'super', props: properties }),
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
