// Respostas do onboarding que mais de uma tela precisa ler: as opções de "o que te
// incomoda" (tela 4 do fluxo completo), os benefícios e etiquetas da tela 5
// ("Entendi"), as frases do loading da rotina (23) e a do compromisso (28).
import type { OnboardingData } from '../../store/onboarding';

// Rótulos = valores gravados em `onboarding.concerns` (inalterados).
export const CONCERN_LABELS = [
  'Acne/espinhas', 'Manchas', 'Cravos', 'Oleosidade', 'Rugas', 'Poros dilatados',
  'Olheiras', 'Ressecamento', 'Textura irregular', 'Outro',
];

// Frase revelada embaixo da opção marcada (modelo do Flo, a pedido do produto) —
// as mesmas do quadro "Frases reveladas · tela 5" do design anterior.
export const CONCERN_REVEAL: Record<string, string> = {
  'Acne/espinhas': 'Vamos priorizar ativos que acalmam e desobstruem, sem ressecar.',
  Manchas: 'Sua rotina vai focar em uniformizar o tom e proteger do sol todos os dias.',
  Cravos: 'Vamos incluir uma limpeza que ajuda a manter os poros livres.',
  Oleosidade: 'Vamos equilibrar o brilho sem tirar a hidratação que sua pele precisa.',
  Rugas: 'Vamos trazer ativos que estimulam firmeza e cuidam da pele a longo prazo.',
  'Poros dilatados': 'Vamos cuidar da textura e da oleosidade para os poros ficarem mais discretos.',
  Olheiras: 'Vamos incluir um cuidado específico para a área dos olhos.',
  Ressecamento: 'Vamos reforçar a hidratação e proteger a barreira da sua pele.',
  'Textura irregular': 'Vamos incluir uma renovação suave para a pele ficar mais lisa ao toque.',
  Outro: 'Tudo bem. A análise da sua foto vai mostrar o que priorizar.',
};

// Etiqueta curta de cada preocupação (etiquetas em volta da logo na tela 5 e
// chips do loading antigo). Mapa do design: o resto já é curto.
const CONCERN_CHIP: Record<string, string> = {
  'Acne/espinhas': 'Acne', 'Poros dilatados': 'Poros', 'Textura irregular': 'Textura',
};

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

// Tela 5 ("Entendi! Vamos te ajudar a:"), logo depois da tela 4. Texto do design
// (mapa `BEN` do fluxo completo), um por preocupação.
const CONCERN_BENEFIT: Record<string, string> = {
  'Acne/espinhas': 'Acalmar a acne sem ressecar a pele',
  Manchas: 'Clarear manchas e uniformizar o tom',
  Cravos: 'Desobstruir os poros e reduzir cravos',
  Oleosidade: 'Controlar o brilho sem agredir a pele',
  Rugas: 'Suavizar linhas finas e firmar a pele',
  'Poros dilatados': 'Refinar a aparência dos poros',
  Olheiras: 'Clarear e desinchar a área dos olhos',
  Ressecamento: 'Recuperar a hidratação da pele',
  'Textura irregular': 'Deixar a textura mais lisa',
  Outro: 'Montar uma rotina feita para você',
};
const GENERIC_BENEFIT = 'Seguir uma rotina simples que cabe no seu dia';

/**
 * Benefícios da tela 5: um por preocupação marcada, na ordem em que ela marcou;
 * com menos de 3, entra o genérico do design no fim (a lista tem no máx. 3).
 */
export function concernBenefits(concerns: string[]): string[] {
  const list = concerns.map((c) => CONCERN_BENEFIT[c]).filter(Boolean) as string[];
  if (list.length < 3) list.push(GENERIC_BENEFIT);
  return list.slice(0, 3);
}

/** Etiquetas em volta da logo na tela 5 (o design tem 2 posições). */
export function concernTags(concerns: string[]): string[] {
  return concerns.map((c) => CONCERN_CHIP[c] ?? c).slice(0, 2);
}

// Loading da rotina (tela 23): a frase troca a cada terço — "Escolhendo ativos
// para [concern]…" → "Ajustando para pele [tipo]…" → "Deixando [ativo] de fora…".
// A 3ª só existe se ela informou o que causou reação (tela 17). O tipo vem do
// scan (`skin_type_detected`: seca/oleosa/mista/normal), já que o fluxo completo
// não pergunta mais o tipo de pele.
const CONCERN_LOADING: Record<string, string> = {
  'Acne/espinhas': 'acne', Manchas: 'manchas', Cravos: 'cravos', Oleosidade: 'oleosidade',
  Rugas: 'rugas', 'Poros dilatados': 'poros dilatados', Olheiras: 'olheiras',
  Ressecamento: 'ressecamento', 'Textura irregular': 'textura irregular',
};

export function routineLoadingLines(o: OnboardingData, skinType: string | null | undefined): string[] {
  const concern = o.concerns.map((c) => CONCERN_LOADING[c]).find(Boolean);
  const lines = [concern ? `Escolhendo ativos para ${concern}…` : 'Escolhendo os ativos certos…'];
  const tipo = (skinType ?? '').toLowerCase();
  lines.push(['seca', 'oleosa', 'mista', 'normal'].includes(tipo) ? `Ajustando para pele ${tipo}…` : 'Ajustando para a sua pele…');
  const reacao = o.allergy_description?.trim();
  if (reacao) lines.push(`Deixando ${reacao.length > 32 ? `${reacao.slice(0, 32).trim()}…` : reacao} de fora…`);
  return lines;
}

// Compromisso (tela 28): o que ela quer resolver, a partir de "o que te incomoda".
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
