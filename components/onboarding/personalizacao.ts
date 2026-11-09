import { OnboardingData } from '../../store/onboarding';
import { ObChoice } from './kit';

// Perguntas da personalização da rotina (04/nov/2026), depois do "Seu caminho": FONTE ÚNICA da
// ordem, dos textos, das opções e do que cada uma grava. Usada pela transição rosa
// (`app/(scan)/personalizar.tsx`) e pela tela de cada pergunta (`app/(scan)/pergunta.tsx`).
//
// Valores gravados (no "Continuar"):
//   tempo no sol → `sun_exposure` (os MESMOS valores da tela antiga `sun-exposure.tsx`)
//   ácidos       → `frequency` ('Iniciante — …' | 'Intermediário — …': a regra que a
//                  generate-protocol já tem — iniciante = introdução mais gradual)
//   maquiagem    → `makeup` (sem coluna em `users`: só vai para a rotina do onboarding)
//   gravidez     → `pregnancy_status` (grávida/amamentando/tentando = sem retinoide)
//   alergia      → `allergy_type` + `allergy_description` ("qual ativo", só se já teve reação)
//   protetor     → `sunscreen` ('Todo dia' | 'Às vezes' | 'Não uso')
//   água         → `hydration` (os MESMOS valores da tela antiga `hydration.tsx`); com ela
//                  respondida, a rotina começa a ser gerada (`lib/onboardingPrefetch.ts`).

export type PerguntaId = 'tempoSol' | 'acidos' | 'maquiagem' | 'gravidez' | 'alergia' | 'alergiaQual' | 'protetor' | 'agua';
type ComOpcoes = Exclude<PerguntaId, 'alergiaQual'>;

// Enquadramento (`ObChoiceScreen`): título no topo e as opções CENTRALIZADAS entre ele e o
// botão (`centerOptions`) em TODAS as perguntas, como o "Qual a pele dos seus sonhos?"
// (06/nov/2026, pedido do produto; antes só a água era centralizada e as outras ficavam logo
// abaixo do título).
export type Pergunta = { titulo: string; opcoes: ObChoice<string>[]; campo: keyof OnboardingData };

// ORDEM das perguntas (o protetor logo depois do tempo no sol, pedido do produto em
// 06/nov/2026; antes era o penúltimo). "Qual ativo ou produto causou?" (`alergiaQual`) não está
// na lista: é a continuação da alergia, só para quem já teve reação.
export const ORDEM: ComOpcoes[] = ['tempoSol', 'protetor', 'acidos', 'maquiagem', 'gravidez', 'alergia', 'agua'];
export const PRIMEIRA = ORDEM[0];

export const PERGUNTAS: Record<ComOpcoes, Pergunta> = {
  tempoSol: {
    titulo: 'Quanto tempo você fica exposta ao sol por dia?',
    campo: 'sun_exposure',
    opcoes: [
      { label: 'Quase nada', value: 'Quase nenhum' },
      { label: 'Menos de 1 hora', value: 'Menos de 1 hora por dia' },
      { label: '1 a 3 horas', value: 'Entre 1 a 3 horas por dia' },
      { label: 'Mais de 3 horas', value: 'Mais de 3 horas por dia' },
    ],
  },
  acidos: {
    titulo: 'Já usou ácidos ou retinol?',
    campo: 'frequency',
    opcoes: [
      { label: 'Sim', value: 'Intermediário — já usou ácidos ou retinol' },
      { label: 'Não', value: 'Iniciante — nunca usou ácidos nem retinol' },
      {
        label: 'Não faço ideia', value: 'Iniciante — não sabe se já usou ácidos ou retinol',
        reveal: 'Ácidos e retinol são ativos: ingredientes usados para cuidar de algo específico na pele.',
      },
    ],
  },
  maquiagem: {
    titulo: 'Você usa maquiagem?',
    campo: 'makeup',
    opcoes: [
      { label: 'Quase todo dia', value: 'Quase todo dia' },
      { label: 'Às vezes', value: 'Às vezes' },
      { label: 'Não', value: 'Não' },
    ],
  },
  gravidez: {
    titulo: 'Alguns ativos precisam ser evitados. Você está:',
    campo: 'pregnancy_status',
    opcoes: [
      { label: 'Grávida', value: 'pregnant' },
      { label: 'Amamentando', value: 'breastfeeding' },
      { label: 'Tentando engravidar', value: 'trying' },
      { label: 'Nenhuma das opções', value: 'none' },
    ],
  },
  alergia: {
    titulo: 'Já teve alergia ou reação a algum produto?',
    campo: 'allergy_type',
    opcoes: [
      { label: 'Não', value: 'none' },
      { label: 'Tenho pele sensível', value: 'sensitive' },
      { label: 'Já tive reação', value: 'reaction' },
    ],
  },
  protetor: {
    titulo: 'E você usa protetor solar todo dia?',
    campo: 'sunscreen',
    opcoes: [
      { label: 'Todo dia', value: 'Todo dia' },
      { label: 'Às vezes', value: 'Às vezes' },
      { label: 'Não uso', value: 'Não uso' },
    ],
  },
  agua: {
    titulo: 'Quanta água você bebe por dia?',
    campo: 'hydration',
    opcoes: [
      { label: 'Menos de 1 litro', value: 'Menos de 1L' },
      { label: '1 a 2 litros', value: '1–2L' },
      { label: '2 a 3 litros', value: '2–3L' },
      { label: 'Mais de 3 litros', value: '3L+' },
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
