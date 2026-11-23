// Motor da rotina v2 — tabela FIXA de ativos de tratamento.
//
// Fonte única do que cada ativo é: forte ou não (limite de 2 por rotina), em que turno
// pode entrar, se é seguro na gravidez, se a barreira/rosácea proíbem, quais códigos de
// `produtos.ativos_principais` o representam e com quem ele não pode cair no mesmo turno.
//
// ⚠️ Valores clínicos PROPOSTOS — a validar com dermatologista. Mudar aqui muda o motor
// inteiro (plano, conferência e escolha de produtos), sem tocar em mais nada.
//
// Decisões do produto (nov/2026):
//  - Forte = AHA, BHA (salicílico em qualquer passo, inclusive sabonete), retinoides,
//    peróxido de benzoíla e vitamina C pura (L-ascórbico). NÃO contam: azelaico,
//    niacinamida, tranexâmico, derivados de vitamina C.
//  - `lha` e `betaine_salicylate` contam como BHA (escolha conservadora).
//  - `vitamina_c` sem classificação conta como PURA (forte) até o catálogo ser revisado
//    e separar `vitamina_c_pura` / `vitamina_c_derivado`.

export type AtivoId =
  | 'salicilico' | 'aha' | 'pha' | 'retinoide' | 'peroxido'
  | 'azelaico' | 'niacinamida' | 'vitc_pura' | 'vitc_derivado'
  | 'tranexamico' | 'alfa_arbutin' | 'peptideos'
  | 'ceramidas' | 'hialuronico' | 'cafeina'

export type Periodo = 'am' | 'pm'
export const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const
export type Dia = typeof DIAS[number]

// Onde o produto desse ativo é procurado no catálogo (passo de TRATAMENTO).
// Limpeza com salicílico continua sendo limpeza: isso é decidido pelo passo, não aqui.
export type Lugar = 'tratamento' | 'olhos' | 'hidratante'

export interface Ativo {
  id: AtivoId
  nome: string               // como aparece para a IA e nos avisos
  forte: boolean
  periodos: Periodo[]        // turnos permitidos (o 1º é o preferido)
  diasPadrao: Dia[] | null   // frequência usada quando o código precisa montar o passo; null = todo dia
  seguroGravidez: boolean    // grávida, amamentando ou tentando engravidar
  proibidoBarreira: boolean  // barreira comprometida / severamente comprometida
  proibidoRosacea: boolean
  codigos: string[]          // produtos.ativos_principais
  lugar: Lugar
  /** Uma vez por dia, todo dia, num turno só (16/nov/2026: azelaico). */
  umaVezAoDia?: boolean
  /** Teto de dias por semana no começo (16/nov/2026: retinoides, 2–3×). */
  maxDiasSemana?: number
  passoModelo: { nome: string; ingrediente: string; instrucao: string; steps: string[]; cor: string; waitTime: string | null }
}

const PM: Periodo[] = ['pm']
const AM: Periodo[] = ['am']
const AMBOS_PM: Periodo[] = ['pm', 'am']
const AMBOS_AM: Periodo[] = ['am', 'pm']

export const ATIVOS: Record<AtivoId, Ativo> = {
  salicilico: {
    id: 'salicilico', nome: 'ácido salicílico (BHA)', forte: true, periodos: AMBOS_PM,
    // 16/nov/2026 (decisão do produto): sem salicílico na gravidez, amamentação e para tentante.
    diasPadrao: ['Seg', 'Qua', 'Sex'], seguroGravidez: false, proibidoBarreira: true, proibidoRosacea: true,
    codigos: ['acido_salicilico', 'lha', 'betaine_salicylate', 'bha'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Sérum de Ácido Salicílico', ingrediente: 'Sérum de Ácido Salicílico 2%',
      instrucao: 'Aplique uma camada fina na pele seca, com foco nas áreas com cravos e espinhas. O ácido salicílico entra no poro e dissolve a oleosidade que forma os cravos.',
      steps: ['Aplique algumas gotas na pele limpa e seca.', 'Espalhe uma camada fina, com foco na zona T.', 'Espere absorver antes do próximo passo.'],
      cor: '#E8EFF9', waitTime: '10–20 min',
    },
  },
  aha: {
    id: 'aha', nome: 'AHA (glicólico, mandélico ou lático)', forte: true, periodos: PM,
    diasPadrao: ['Ter', 'Qui', 'Sáb'], seguroGravidez: true, proibidoBarreira: true, proibidoRosacea: true,
    codigos: ['acido_glicolico', 'acido_mandelico', 'acido_latico', 'aha'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Sérum Esfoliante de AHA', ingrediente: 'Sérum de Ácido Mandélico 10%',
      instrucao: 'Aplique à noite, na pele seca, nos dias indicados. O AHA renova a camada de cima da pele e deixa a textura mais lisa.',
      steps: ['Aplique uma camada fina na pele limpa e seca.', 'Evite o contorno dos olhos.', 'Espere absorver antes do hidratante.'],
      cor: '#E8EFF9', waitTime: '10–20 min',
    },
  },
  pha: {
    id: 'pha', nome: 'PHA (gluconolactona)', forte: false, periodos: AMBOS_PM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: false, proibidoRosacea: false,
    codigos: ['gluconolactona_pha', 'pha'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Tônico Renovador Suave', ingrediente: 'Tônico com PHA (Gluconolactona)',
      instrucao: 'Aplique depois da limpeza. O PHA renova a pele de forma suave, sem irritar.',
      steps: ['Aplique com as mãos ou um algodão na pele limpa.', 'Espere secar antes do próximo passo.'],
      cor: '#E8F8F0', waitTime: null,
    },
  },
  retinoide: {
    id: 'retinoide', nome: 'retinoide (retinol, retinal ou adapaleno)', forte: true, periodos: PM,
    diasPadrao: ['Seg', 'Qua', 'Sex'], seguroGravidez: false, proibidoBarreira: true, proibidoRosacea: true,
    codigos: ['retinol', 'retinal', 'retinaldeido', 'adapalenato', 'adapaleno', 'granactive_retinoide', 'hidroxipinacolona_retinoato', 'tretinoina'],
    maxDiasSemana: 3,
    lugar: 'tratamento',
    passoModelo: {
      nome: 'Sérum de Retinol', ingrediente: 'Sérum de Retinol 0,3%',
      instrucao: 'Aplique à noite, nos dias indicados, na pele seca. O retinol acelera a renovação da pele, desobstrui os poros e trata linhas finas.',
      steps: ['Aplique uma quantidade do tamanho de uma ervilha na pele seca.', 'Espalhe pelo rosto todo, evitando olhos e cantos da boca.', 'Finalize com o hidratante.'],
      cor: '#F3E8FF', waitTime: null,
    },
  },
  peroxido: {
    id: 'peroxido', nome: 'peróxido de benzoíla', forte: true, periodos: AMBOS_PM,
    diasPadrao: null, seguroGravidez: false, proibidoBarreira: true, proibidoRosacea: true,
    codigos: ['peroxido_de_benzoila'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Tratamento Localizado para Espinhas', ingrediente: 'Gel com Peróxido de Benzoíla 2,5%',
      instrucao: 'Aplique só sobre as espinhas inflamadas. O peróxido de benzoíla reduz a bactéria da acne e acelera a melhora da lesão.',
      steps: ['Aplique uma camada fina só sobre a espinha.', 'Não espalhe pelo rosto todo.', 'Lave as mãos depois.'],
      cor: '#E8EFF9', waitTime: null,
    },
  },
  azelaico: {
    id: 'azelaico', nome: 'ácido azelaico', forte: false, periodos: AMBOS_PM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: false, proibidoRosacea: false,
    codigos: ['acido_azelaico'], lugar: 'tratamento', umaVezAoDia: true,
    passoModelo: {
      nome: 'Sérum de Ácido Azelaico', ingrediente: 'Sérum de Ácido Azelaico 10%',
      instrucao: 'Aplique uma camada fina no rosto todo. O ácido azelaico acalma as espinhas inflamadas e clareia as marcas que elas deixam.',
      steps: ['Aplique uma camada fina na pele limpa e seca.', 'Espalhe pelo rosto todo.', 'Espere absorver antes do próximo passo.'],
      cor: '#FDE8E8', waitTime: null,
    },
  },
  niacinamida: {
    id: 'niacinamida', nome: 'niacinamida', forte: false, periodos: AMBOS_AM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: false, proibidoRosacea: false,
    codigos: ['niacinamida'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Sérum de Niacinamida', ingrediente: 'Sérum de Niacinamida 5%',
      instrucao: 'Aplique algumas gotas no rosto todo. A niacinamida controla a oleosidade, deixa os poros mais discretos e fortalece a barreira.',
      steps: ['Aplique 3–4 gotas nas pontas dos dedos.', 'Pressione suavemente no rosto todo.', 'Espere absorver antes do próximo passo.'],
      cor: '#E8F5E9', waitTime: null,
    },
  },
  vitc_pura: {
    id: 'vitc_pura', nome: 'vitamina C pura (ácido L-ascórbico)', forte: true, periodos: AM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: true, proibidoRosacea: true,
    codigos: ['vitamina_c_pura', 'vitamina_c'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Sérum Antioxidante de Vitamina C', ingrediente: 'Sérum de Vitamina C 10%',
      instrucao: 'Aplique de manhã, antes do protetor. A vitamina C protege a pele do dano do sol e uniformiza o tom.',
      steps: ['Aplique 3–4 gotas na pele limpa e seca.', 'Espalhe pelo rosto todo.', 'Espere absorver antes do próximo passo.'],
      cor: '#FFF9E6', waitTime: '5–10 min',
    },
  },
  vitc_derivado: {
    id: 'vitc_derivado', nome: 'vitamina C estável (derivado)', forte: false, periodos: AM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: false, proibidoRosacea: false,
    codigos: ['vitamina_c_derivado'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Sérum de Vitamina C Estável', ingrediente: 'Sérum de Vitamina C Estável',
      instrucao: 'Aplique de manhã, antes do protetor. A vitamina C estável uniformiza o tom e ajuda a proteger do sol, sem irritar.',
      steps: ['Aplique 3–4 gotas na pele limpa e seca.', 'Espalhe pelo rosto todo.'],
      cor: '#FFF9E6', waitTime: null,
    },
  },
  tranexamico: {
    id: 'tranexamico', nome: 'ácido tranexâmico', forte: false, periodos: AMBOS_PM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: false, proibidoRosacea: false,
    codigos: ['acido_tranexamico'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Sérum Clareador de Manchas', ingrediente: 'Sérum de Ácido Tranexâmico',
      instrucao: 'Aplique no rosto todo. O ácido tranexâmico clareia manchas sem irritar.',
      steps: ['Aplique algumas gotas na pele limpa.', 'Espalhe pelo rosto todo.'],
      cor: '#FDE8E8', waitTime: null,
    },
  },
  alfa_arbutin: {
    id: 'alfa_arbutin', nome: 'alfa-arbutin', forte: false, periodos: AMBOS_PM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: false, proibidoRosacea: false,
    codigos: ['alfa_arbutin'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Sérum Clareador de Manchas', ingrediente: 'Sérum de Alfa-Arbutin',
      instrucao: 'Aplique no rosto todo. O alfa-arbutin clareia manchas de forma suave.',
      steps: ['Aplique algumas gotas na pele limpa.', 'Espalhe pelo rosto todo.'],
      cor: '#FDE8E8', waitTime: null,
    },
  },
  peptideos: {
    id: 'peptideos', nome: 'peptídeos', forte: false, periodos: AMBOS_PM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: false, proibidoRosacea: false,
    codigos: ['peptideos', 'matrixyl'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Sérum de Peptídeos', ingrediente: 'Sérum de Peptídeos',
      instrucao: 'Aplique no rosto todo. Os peptídeos estimulam a firmeza e suavizam linhas finas.',
      steps: ['Aplique algumas gotas na pele limpa.', 'Espalhe pelo rosto todo.'],
      cor: '#EDE8FD', waitTime: null,
    },
  },
  ceramidas: {
    id: 'ceramidas', nome: 'ceramidas', forte: false, periodos: AMBOS_PM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: false, proibidoRosacea: false,
    codigos: ['ceramidas'], lugar: 'hidratante',
    passoModelo: {
      nome: 'Hidratante com Ceramidas', ingrediente: 'Hidratante com Ceramidas',
      instrucao: 'Aplique no rosto todo. As ceramidas repõem a barreira e seguram a hidratação.',
      steps: ['Aplique uma camada no rosto todo.', 'Massageie até absorver.'],
      cor: '#FCE8E8', waitTime: null,
    },
  },
  hialuronico: {
    id: 'hialuronico', nome: 'ácido hialurônico', forte: false, periodos: AMBOS_AM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: false, proibidoRosacea: false,
    codigos: ['acido_hialuronico'], lugar: 'tratamento',
    passoModelo: {
      nome: 'Sérum Hidratante', ingrediente: 'Sérum de Ácido Hialurônico',
      instrucao: 'Aplique na pele ainda úmida. O ácido hialurônico puxa água para a pele e alivia o ressecamento.',
      steps: ['Aplique algumas gotas na pele levemente úmida.', 'Espalhe pelo rosto todo.'],
      cor: '#E8F5F0', waitTime: null,
    },
  },
  cafeina: {
    id: 'cafeina', nome: 'cafeína (área dos olhos)', forte: false, periodos: AMBOS_AM,
    diasPadrao: null, seguroGravidez: true, proibidoBarreira: false, proibidoRosacea: false,
    // Só cafeína de verdade (16/nov/2026): niacinamida e peptídeos deixavam passar um sérum
    // facial de niacinamida como "Sérum de Cafeína".
    codigos: ['cafeina'], lugar: 'olhos',
    passoModelo: {
      nome: 'Creme para a Área dos Olhos', ingrediente: 'Creme para os Olhos com Cafeína',
      instrucao: 'Aplique com o dedo anelar, em batidinhas leves, ao redor dos olhos. A cafeína desincha e suaviza a olheira.',
      steps: ['Pegue uma quantidade pequena com o dedo anelar.', 'Aplique em batidinhas leves ao redor dos olhos.'],
      cor: '#E8F5F0', waitTime: null,
    },
  },
}

export const FORTES: AtivoId[] = (Object.keys(ATIVOS) as AtivoId[]).filter((a) => ATIVOS[a].forte)

// Pares que não podem cair no mesmo turno nos mesmos dias (as incompatibilidades do
// prompt antigo + salicílico × retinoide e AHA × salicílico, dupla esfoliação).
export const INCOMPATIVEIS: [AtivoId, AtivoId, string][] = [
  ['peroxido', 'retinoide', 'o peróxido de benzoíla destrói o retinoide'],
  ['aha', 'retinoide', 'esfoliar por fora e por dentro na mesma noite irrita a pele'],
  ['salicilico', 'retinoide', 'ácido e retinoide na mesma noite irritam a pele'],
  ['aha', 'salicilico', 'dois ácidos esfoliantes na mesma noite irritam a pele'],
  ['vitc_pura', 'peroxido', 'o peróxido inativa a vitamina C'],
  ['aha', 'azelaico', 'o AHA atrapalha o azelaico no mesmo passo'],
]

// Códigos do catálogo → ativo. `vitamina_c` sem classificação conta como pura (forte).
const CODIGO_PARA_ATIVO = new Map<string, AtivoId>()
for (const a of Object.values(ATIVOS)) {
  for (const c of a.codigos) if (!CODIGO_PARA_ATIVO.has(c)) CODIGO_PARA_ATIVO.set(c, a.id)
}

/** Ácido salicílico DE VERDADE (16/nov/2026). Betaína salicilato e LHA são mais fracos: só
 *  entram no passo de salicílico se não houver outro, e nunca para acne. */
export const SALICILICO_REAL = ['acido_salicilico', 'bha']

/** Medicamentos no Brasil (não são recomendados pelo app, 16/nov/2026): adapaleno de verdade,
 *  tretinoína, peróxido de benzoíla, hidroquinona, antibióticos tópicos. O "adapalenato" da
 *  Creamy (Pró-Adapaleno, adapalenato de oleíla 0,5%) é cosmético e continua. */
// (O Effaclar Adapaleno da La Roche-Posay estava como `adapalenato`; corrigido no banco por id
// em 16/nov/2026 para `adapaleno` — volta em ~/Developer/niks-ai-backups/2026-11-16_effaclar_adapaleno.)
export const CODIGOS_MEDICAMENTO = ['adapaleno', 'tretinoina', 'acido_retinoico', 'isotretinoina', 'peroxido_de_benzoila', 'hidroquinona', 'clindamicina', 'eritromicina']

/** Ativos (do vocabulário do motor) presentes num `ativos_principais` do catálogo. */
export function ativosDosCodigos(codigos: readonly string[] | null | undefined): AtivoId[] {
  const out = new Set<AtivoId>()
  for (const c of codigos ?? []) {
    const a = CODIGO_PARA_ATIVO.get(String(c).toLowerCase())
    if (a) out.add(a)
  }
  return [...out]
}

export function fortesDosCodigos(codigos: readonly string[] | null | undefined): AtivoId[] {
  return ativosDosCodigos(codigos).filter((a) => ATIVOS[a].forte)
}
