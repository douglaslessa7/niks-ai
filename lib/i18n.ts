// Tradução do app (nov/2026). O PORTUGUÊS É A BASE e fica no próprio código:
//
//   t('Qual é o seu nome?')                → pt: o texto igual, sempre
//   t('Olá, {{nome}}!', { nome })          → en: procura a chave em `locales/en/*.json`
//
// A chave É o texto em português. Com o celular em português, `t()` devolve a chave sem
// mudar nada (nem uma vírgula) — quem usa em português não vê diferença. Qualquer outro
// idioma do celular cai no inglês. Chave sem tradução no inglês = aparece em português
// (nunca some texto): rode `node scripts/i18n/conferir.mjs` para achar as que faltam.
//
// ⚠️ Regras:
// - Traduzir só o que APARECE. Valor gravado na conta (ex.: opções do onboarding em
//   `onboarding.concerns`) continua em português: grave `valor`, mostre `t(valor)`.
// - Não usar `count` nas opções (o i18next trataria como plural). Use outro nome.
// - Texto com variável: `{{nome}}` dentro da chave, nunca concatenar pedaços.
// - O idioma é lido uma vez, na abertura (trocar o idioma do iPhone reinicia o app).
import i18next from 'i18next';
import { getLocales } from 'expo-localization';
import onboarding from '../locales/en/onboarding.json';

// ── CHAVE DO INGLÊS (1.64) ─────────────────────────────────────────────────────────
// `false` = o app fica em PORTUGUÊS para todas, mesmo com o iPhone em inglês (build 1.64).
// Desligado, tudo segue o português: telas, idioma mandado às IAs (`idioma: 'pt'`),
// `users.idioma` gravado como 'pt' (notificações do servidor em português) e o Superwall sem
// `localeIdentifier`. Para ligar o inglês numa build futura: trocar para `true`.
// Teste no Metro sem mudar o código: `EXPO_PUBLIC_INGLES=1 npx expo start --dev-client --clear`
// (só vale em desenvolvimento; em Release/TestFlight manda só esta constante).
export const INGLES_LIGADO = true;
const inglesNoTeste = __DEV__ && process.env.EXPO_PUBLIC_INGLES === '1';

function idiomaDoCelular(): 'pt' | 'en' {
  if (!INGLES_LIGADO && !inglesNoTeste) return 'pt';
  try {
    const codigo = getLocales()[0]?.languageCode?.toLowerCase();
    // Sem idioma lido (não deveria acontecer): fica como sempre foi.
    if (!codigo) return 'pt';
    return codigo === 'pt' ? 'pt' : 'en';
  } catch {
    return 'pt';
  }
}

export const idioma = idiomaDoCelular();
export const emIngles = idioma === 'en';

const i18n = i18next.createInstance();
i18n.init({
  lng: idioma,
  fallbackLng: false,
  resources: { en: { translation: { ...onboarding } } },
  keySeparator: false,      // a chave é uma frase: "." não separa nada
  nsSeparator: false,       // idem para ":"
  interpolation: { escapeValue: false }, // React já protege; sem isto "&" vira "&amp;"
  returnNull: false,
  returnEmptyString: false,
  initAsync: false,         // tudo embutido: pronto antes da primeira tela
});

/** Locale para `toLocaleString`/`Intl` (números e datas). Em português, o mesmo 'pt-BR' de sempre. */
export const localeDatas = emIngles ? 'en-US' : 'pt-BR';

/** Hora no formato americano ("8:00 AM", "8:30 PM"). Só para o ramo do inglês: em português,
 *  cada tela mantém o formato que já usava ("08:00", "20h"…), sem passar por aqui. */
export function horaEn(h: number, m = 0): string {
  const h12 = ((h % 12) + 12) % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h % 24 < 12 ? 'AM' : 'PM'}`;
}

/** Meses e dias da semana em inglês (para trocar as listas em português feitas à mão:
 *  `emIngles ? MESES_EN : MESES`). Domingo primeiro, como `Date.getDay()`. */
export const MESES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MESES_CURTOS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DIAS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DIAS_CURTOS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DIAS_INICIAIS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Vars = Record<string, string | number>;

/** Texto na língua do celular. A chave é o texto em português (ver o topo do arquivo). */
export function t(pt: string, vars?: Vars): string {
  return i18n.t(pt, vars) as string;
}
