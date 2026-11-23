import { OnboardingData } from '../../store/onboarding';
import { ObChoice } from './kit';
import { t } from '../../lib/i18n';

// Perguntas da personalização da rotina (04/nov/2026), depois do "Seu caminho": FONTE ÚNICA da
// ordem, dos textos, das opções e do que cada uma grava. Usada pela transição rosa
// (`app/(scan)/personalizar.tsx`) e pela tela de cada pergunta (`app/(scan)/pergunta.tsx`).
//
// Textos na tela (`titulo`, `subtitulo`, `label`, `reveal`) passam por `t()`; os `value` (gravados)
// ficam em português, sempre.
//
// Valores gravados (no "Continuar"):
//   tempo no sol → `sun_exposure` (os MESMOS valores da tela antiga `sun-exposure.tsx`)
//   ácidos       → `frequency` ('Iniciante — …' | 'Intermediário — …': a regra que a
//                  generate-protocol já tem — iniciante = introdução mais gradual)
//   maquiagem    → `makeup` (sem coluna em `users`: só vai para a rotina do onboarding)
//   gravidez     → `pregnancy_status` (grávida/amamentando/tentando = sem retinoide)
//   alergia      → `allergy_type` + `allergy_description` ("qual ativo", só se já teve reação)
//   protetor     → `sunscreen` ('Todo dia' | 'Às vezes' | 'Não uso')
//   isotretinoína → `isotretinoina` ('sim' | 'nao'; → users.isotretinoina) — 1.63, motor v2:
//                  quem toma não recebe nenhum ativo forte
//   orçamento    → `orcamento` ('1' | '2' | '3' = faixa de preço do catálogo; → users.orcamento_faixa)
//                  — 1.63, motor v2: preferência, nunca filtro
//   água         → `hydration` (os MESMOS valores da tela antiga `hydration.tsx`); com ela
//                  respondida, a rotina começa a ser gerada (`lib/onboardingPrefetch.ts`).

export type PerguntaId = 'tempoSol' | 'acidos' | 'maquiagem' | 'gravidez' | 'isotretinoina' | 'alergia' | 'alergiaQual' | 'protetor' | 'orcamento' | 'agua';
type ComOpcoes = Exclude<PerguntaId, 'alergiaQual'>;

// Enquadramento (`ObChoiceScreen`): título no topo e as opções CENTRALIZADAS entre ele e o
// botão (`centerOptions`) em TODAS as perguntas, como o "Qual a pele dos seus sonhos?"
// (06/nov/2026, pedido do produto; antes só a água era centralizada e as outras ficavam logo
// abaixo do título).
export type Pergunta = { titulo: string; subtitulo?: string; opcoes: ObChoice<string>[]; campo: keyof OnboardingData };

// ORDEM das perguntas (o protetor logo depois do tempo no sol, pedido do produto em
// 06/nov/2026; antes era o penúltimo). "Qual ativo ou produto causou?" (`alergiaQual`) não está
// na lista: é a continuação da alergia, só para quem já teve reação.
// Isotretinoína logo depois da gravidez e orçamento por último (1.63, motor da rotina v2).
// A água SAIU (16/nov/2026, pedido do produto): `hydration` chega vazio à IA. A definição em
// PERGUNTAS fica, sem uso, caso volte.
export const ORDEM: ComOpcoes[] = ['tempoSol', 'protetor', 'acidos', 'maquiagem', 'gravidez', 'isotretinoina', 'alergia', 'orcamento'];
// Numeração do funil v2 (17 a 23): só as 7 perguntas de antes. As novas ficam FORA da
// numeração (passo 0) até o funil ser renumerado — senão colidiriam com os passos 24 e 25.
export const ORDEM_FUNIL: ComOpcoes[] = ['tempoSol', 'protetor', 'acidos', 'maquiagem', 'gravidez', 'alergia', 'agua'];
export const PRIMEIRA = ORDEM[0];

export const PERGUNTAS: Record<ComOpcoes, Pergunta> = {
  tempoSol: {
    titulo: t('Quanto tempo você fica exposta ao sol por dia?'),
    campo: 'sun_exposure',
    opcoes: [
      { label: t('Quase nada'), value: 'Quase nenhum' },
      { label: t('Menos de 1 hora'), value: 'Menos de 1 hora por dia' },
      { label: t('1 a 3 horas'), value: 'Entre 1 a 3 horas por dia' },
      { label: t('Mais de 3 horas'), value: 'Mais de 3 horas por dia' },
    ],
  },
  acidos: {
    titulo: t('Já usou ácidos ou retinol?'),
    campo: 'frequency',
    opcoes: [
      { label: t('Sim'), value: 'Intermediário — já usou ácidos ou retinol' },
      { label: t('Não'), value: 'Iniciante — nunca usou ácidos nem retinol' },
      {
        label: t('Não faço ideia'), value: 'Iniciante — não sabe se já usou ácidos ou retinol',
        reveal: t('Ácidos e retinol são ativos: ingredientes usados para cuidar de algo específico na pele.'),
      },
    ],
  },
  maquiagem: {
    titulo: t('Você usa maquiagem?'),
    campo: 'makeup',
    opcoes: [
      { label: t('Quase todo dia'), value: 'Quase todo dia' },
      { label: t('Às vezes'), value: 'Às vezes' },
      { label: t('Não'), value: 'Não' },
    ],
  },
  gravidez: {
    titulo: t('Alguns ativos precisam ser evitados. Você está:'),
    campo: 'pregnancy_status',
    opcoes: [
      { label: t('Nenhuma das opções'), value: 'none' },
      { label: t('Tentando engravidar'), value: 'trying' },
      { label: t('Amamentando'), value: 'breastfeeding' },
      { label: t('Grávida'), value: 'pregnant' },
    ],
  },
  // ⚠️ Textos PROPOSTOS (1.63) — aguardam aprovação do produto.
  isotretinoina: {
    titulo: t('Você está tomando isotretinoína (Roacutan)?'),
    campo: 'isotretinoina',
    opcoes: [
      { label: t('Não'), value: 'nao' },
      {
        label: t('Sim, estou tomando'), value: 'sim',
        reveal: t('Ela deixa a pele mais sensível. Sua rotina vai ter só cuidados suaves enquanto você toma.'),
      },
    ],
  },
  // Copy do produto (16/nov/2026).
  orcamento: {
    titulo: t('Como você quer montar sua rotina?'),
    subtitulo: t('A gente escolhe os produtos pensando no seu bolso também.'),
    campo: 'orcamento',
    opcoes: [
      { label: t('Quero o melhor custo-benefício'), reveal: t('Produtos acessíveis que entregam resultado'), value: '1' },
      { label: t('Posso investir um pouco mais'), reveal: t('Equilíbrio entre preço e fórmula'), value: '2' },
      { label: t('Dinheiro não importa, quero minha melhor pele'), reveal: t('Os produtos mais completos, sem olhar o preço'), value: '3' },
    ],
  },
  alergia: {
    titulo: t('Já teve alergia ou reação a algum produto?'),
    campo: 'allergy_type',
    opcoes: [
      { label: t('Não'), value: 'none' },
      { label: t('Tenho pele sensível'), value: 'sensitive' },
      { label: t('Já tive reação'), value: 'reaction' },
    ],
  },
  protetor: {
    titulo: t('E você usa protetor solar todo dia?'),
    campo: 'sunscreen',
    opcoes: [
      { label: t('Todo dia'), value: 'Todo dia' },
      { label: t('Às vezes'), value: 'Às vezes' },
      { label: t('Não uso'), value: 'Não uso' },
    ],
  },
  agua: {
    titulo: t('Quanta água você bebe por dia?'),
    campo: 'hydration',
    opcoes: [
      { label: t('Menos de 1 litro'), value: 'Menos de 1L' },
      { label: t('1 a 2 litros'), value: '1–2L' },
      { label: t('2 a 3 litros'), value: '2–3L' },
      { label: t('Mais de 3 litros'), value: '3L+' },
    ],
  },
};

/** Próxima pergunta depois de responder `q` com `v` ('fim' = resultado do scan). */
export function depoisDe(q: PerguntaId, v: string): PerguntaId | 'fim' {
  if (q === 'alergia' && v === 'reaction') return 'alergiaQual';
  const i = ORDEM.indexOf(q === 'alergiaQual' ? 'alergia' : q);
  return i + 1 < ORDEM.length ? ORDEM[i + 1] : 'fim';
}

export function ehPergunta(q: unknown): q is PerguntaId {
  return typeof q === 'string' && (q === 'alergiaQual' || (ORDEM as string[]).includes(q));
}
