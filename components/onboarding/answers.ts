// Respostas do onboarding novo que mais de uma tela precisa ler: as opções da
// tela 5 (com as frases reveladas do design) e os rótulos curtos que o loading
// (tela 18) acende e o compromisso (tela 21) usa.
import type { OnboardingData } from '../../store/onboarding';

// Rótulos = valores gravados em `onboarding.concerns` (inalterados). Frases =
// quadro "Frases reveladas · tela 5" do design.
export const CONCERN_OPTIONS: { label: string; reveal: string }[] = [
  { label: 'Acne/espinhas', reveal: 'Vamos priorizar ativos que acalmam e desobstruem, sem ressecar.' },
  { label: 'Manchas', reveal: 'Sua rotina vai focar em uniformizar o tom e proteger do sol todos os dias.' },
  { label: 'Cravos', reveal: 'Vamos incluir uma limpeza que ajuda a manter os poros livres.' },
  { label: 'Oleosidade', reveal: 'Vamos equilibrar o brilho sem tirar a hidratação que sua pele precisa.' },
  { label: 'Rugas', reveal: 'Vamos trazer ativos que estimulam firmeza e cuidam da pele a longo prazo.' },
  { label: 'Poros dilatados', reveal: 'Vamos cuidar da textura e da oleosidade para os poros ficarem mais discretos.' },
  { label: 'Olheiras', reveal: 'Vamos incluir um cuidado específico para a área dos olhos.' },
  { label: 'Ressecamento', reveal: 'Vamos reforçar a hidratação e proteger a barreira da sua pele.' },
  { label: 'Textura irregular', reveal: 'Vamos incluir uma renovação suave para a pele ficar mais lisa ao toque.' },
  { label: 'Outro', reveal: 'Tudo bem. A análise da sua foto vai mostrar o que priorizar.' },
];

// Etiqueta curta de cada preocupação (chips do loading). O design mostra "Acne"
// para "Acne/espinhas"; as demais já são curtas.
const CONCERN_CHIP: Record<string, string> = { 'Acne/espinhas': 'Acne' };

// Valores gravados pelas telas de tipo de pele / sol / hidratação e sono →
// rótulo do chip, no formato dos exemplos do design ("Pele mista", "1–3 h de sol",
// "1–2 L de água", "7 h de sono").
const SKIN_CHIP: Record<string, string> = {
  Oleosa: 'Pele oleosa', Seca: 'Pele seca', Mista: 'Pele mista', Normal: 'Pele normal',
};
const SUN_CHIP: Record<string, string> = {
  'Quase nenhum': 'Quase sem sol',
  'Menos de 1 hora por dia': '< 1 h de sol',
  'Entre 1 a 3 horas por dia': '1–3 h de sol',
  'Mais de 3 horas por dia': '3+ h de sol',
};
const WATER_CHIP: Record<string, string> = {
  'Menos de 1L': '< 1 L de água', '1–2L': '1–2 L de água', '2–3L': '2–3 L de água', '3L+': '3+ L de água',
};

/** Chips da tela de loading: o que ela respondeu, na ordem do design. */
export function answerChips(o: OnboardingData): string[] {
  const chips: string[] = [];
  for (const c of o.concerns) {
    if (c === 'Outro') continue;
    chips.push(CONCERN_CHIP[c] ?? c);
  }
  if (o.skin_type && SKIN_CHIP[o.skin_type]) chips.push(SKIN_CHIP[o.skin_type]);
  if (o.sun_exposure && SUN_CHIP[o.sun_exposure]) chips.push(SUN_CHIP[o.sun_exposure]);
  if (o.hydration && WATER_CHIP[o.hydration]) chips.push(WATER_CHIP[o.hydration]);
  if (o.sleep) chips.push(`${o.sleep} h de sono`);
  return chips;
}

// Compromisso (tela 21): o que ela quer resolver, a partir da tela 5.
const CONCERN_GOAL: Record<string, string> = {
  'Acne/espinhas': 'acalmar a acne',
  Manchas: 'clarear as manchas',
  Cravos: 'diminuir os cravos',
  Oleosidade: 'controlar a oleosidade',
  Rugas: 'suavizar as rugas',
  'Poros dilatados': 'deixar os poros mais discretos',
  Olheiras: 'suavizar as olheiras',
  Ressecamento: 'hidratar a pele ressecada',
  'Textura irregular': 'deixar a pele mais lisa',
};

/**
 * Frase do compromisso. Sem preocupação marcada (ou só "Outro") cai na frase do
 * design: "cuidar da minha pele todos os dias e conquistar a pele que eu quero."
 */
export function commitmentPhrase(concerns: string[]): string {
  const goals = concerns.map((c) => CONCERN_GOAL[c]).filter(Boolean) as string[];
  if (goals.length === 0) return 'cuidar da minha pele todos os dias e conquistar a pele que eu quero.';
  const list = goals.length === 1
    ? goals[0]
    : `${goals.slice(0, -1).join(', ')} e ${goals[goals.length - 1]}`;
  return `cuidar da minha pele todos os dias, ${list}.`;
}
