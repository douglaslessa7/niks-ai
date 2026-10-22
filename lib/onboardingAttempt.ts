import AsyncStorage from '@react-native-async-storage/async-storage';

// Quantas vezes o onboarding COMEÇOU nesta instalação. Quem não cria conta e reabre o
// app cai de novo no Olá e refaz o onboarding do zero — sem este número, o Mixpanel
// e o Paywallo misturam essas reaberturas com quem está vendo o app pela 1ª vez.
//
// - Soma 1 no `app/index.tsx`, quando uma pessoa SEM sessão é mandada ao onboarding
//   (cada abertura a frio = uma tentativa). Voltar do segundo plano não soma.
// - Vai como `onboarding_attempt` em todo evento `onboarding_*` do Mixpanel e decide
//   o repasse ao Paywallo, que só acontece na tentativa 1
//   (`lib/mixpanel/MixpanelProvider.tsx`).
// - Migração: quem já usava o app numa versão sem o contador, mas já tem o
//   consentimento aceito ou o nome salvo, passou pelo onboarding antes → começa em 2.
// - `null` = ainda não lido (ex.: abertura direta numa tela do onboarding por link,
//   sem passar pelo `index`); o valor salvo é carregado em segundo plano.

const ATTEMPT_KEY = 'onboarding_attempt';
const AI_CONSENT_KEY = 'ai_consent_accepted';
const STORE_KEY = 'niks-app-store'; // store persistido do zustand (`pendingName`)

let attempt: number | null = null;
let loaded: Promise<number> | null = null;

/** Tentativa já feita antes desta instalação ter o contador (ver "Migração"). */
async function hadPreviousAttempt(): Promise<boolean> {
  const [consent, store] = await Promise.all([
    AsyncStorage.getItem(AI_CONSENT_KEY),
    AsyncStorage.getItem(STORE_KEY),
  ]);
  if (consent === 'true') return true;
  try {
    // Lido direto do disco: a hidratação do zustand é assíncrona e pode não ter
    // terminado quando o `index` decide o destino.
    const pendingName = store ? JSON.parse(store)?.state?.pendingName : null;
    return typeof pendingName === 'string' && pendingName.trim().length > 0;
  } catch {
    return false;
  }
}

/** Valor salvo (sem somar). 0 = nunca começou. Nunca lança. */
export function loadOnboardingAttempt(): Promise<number> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const saved = Number(await AsyncStorage.getItem(ATTEMPT_KEY));
        if (Number.isFinite(saved) && saved > 0) return saved;
        return (await hadPreviousAttempt()) ? 1 : 0;
      } catch {
        return 0;
      }
    })().then((n) => {
      if (attempt === null) attempt = n;
      return n;
    });
  }
  return loaded;
}

/** Nova tentativa (abertura sem sessão indo ao onboarding). Devolve o número dela. */
export async function startOnboardingAttempt(): Promise<number> {
  const next = (await loadOnboardingAttempt()) + 1;
  attempt = next;
  try {
    await AsyncStorage.setItem(ATTEMPT_KEY, String(next));
  } catch {
    // Sem gravar, a próxima abertura conta de novo a partir do valor antigo.
  }
  return next;
}

/** Tentativa atual, já em memória; `null` enquanto não foi lida. */
export function getOnboardingAttempt(): number | null {
  return attempt;
}
