// Motor da rotina v2 — textos em INGLÊS (etapa 3 da tradução, nov/2026).
// Usados só quando o app manda `idioma: 'en'`. Em português nada daqui entra: os textos
// em português continuam nos arquivos de sempre (ativos.ts, conferencia.ts, plano.ts).
// ⚠️ Os dias da semana continuam em CÓDIGO português ("Seg","Qua"…) no campo `dias` e no
// sufixo do `ingredient` — é o que os apps e a conferência leem; o app traduz na tela.

import type { AtivoId } from './ativos.ts'
import type { Dor } from './dores.ts'

export type Idioma = 'pt' | 'en'
export const paraIdioma = (v: unknown): Idioma => (v === 'en' ? 'en' : 'pt')

/** Acrescentado ao fim do prompt de sistema quando idioma = 'en'. */
export const INSTRUCAO_EN_ROTINA = `

## LANGUAGE — OVERRIDES ANY INSTRUCTION ABOVE ABOUT THE OUTPUT LANGUAGE
The user's phone is in English. Write EVERY user-facing text value in natural American English, in a warm, light, friendly tone (the instructions above are in Portuguese; follow them, but write the output in English): "name", "ingredient", "instruction", "steps", "introduction_warnings", "expected_timeline" and "introduction_schedule".
- Keep the JSON keys, the "ativo" codes and the hex colors exactly as specified.
- Step names must say the product type with these English words, so the app can recognize them: "Cleanser" (any cleansing step), "Toner", "Serum", "Moisturizer" (any moisturizing/barrier cream step), "Sunscreen" (always the last morning step, e.g. "Sunscreen SPF 50"), "Eye Cream" (eye-area step), "Occlusive". Examples: "Gentle Gel Cleanser", "Salicylic Acid Serum", "Ceramide Moisturizer", "Sunscreen".
- Days of the week are CODES and stay in Portuguese: the "dias" list uses only "Seg","Ter","Qua","Qui","Sex","Sáb","Dom", and the days at the end of "ingredient" keep the exact format "(Seg/Qua/Sex)". Never write Mon/Wed/Fri there.
- Use decimal points in concentrations (e.g. "0.3%", "2.5%"), "SPF" instead of "FPS", and say "analysis", never "diagnosis".`

// Passo modelo de cada ativo (quando o código precisa montar o passo).
export const PASSO_MODELO_EN: Record<AtivoId, { nome: string; ingrediente: string; instrucao: string; steps: string[] }> = {
  salicilico: {
    nome: 'Salicylic Acid Serum', ingrediente: 'Salicylic Acid Serum 2%',
    instrucao: 'Apply a thin layer to dry skin, focusing on areas with blackheads and breakouts. Salicylic acid gets inside the pore and dissolves the oil that forms blackheads.',
    steps: ['Apply a few drops to clean, dry skin.', 'Spread a thin layer, focusing on your T-zone.', 'Let it absorb before the next step.'],
  },
  aha: {
    nome: 'AHA Exfoliating Serum', ingrediente: 'Mandelic Acid Serum 10%',
    instrucao: 'Apply at night, on dry skin, on the days shown. AHA renews the top layer of your skin and leaves the texture smoother.',
    steps: ['Apply a thin layer to clean, dry skin.', 'Avoid the eye area.', 'Let it absorb before your moisturizer.'],
  },
  pha: {
    nome: 'Gentle Renewing Toner', ingrediente: 'Toner with PHA (Gluconolactone)',
    instrucao: 'Apply after cleansing. PHA renews your skin gently, without irritation.',
    steps: ['Apply with your hands or a cotton pad to clean skin.', 'Let it dry before the next step.'],
  },
  retinoide: {
    nome: 'Retinol Serum', ingrediente: 'Retinol Serum 0.3%',
    instrucao: 'Apply at night, on the days shown, to dry skin. Retinol speeds up skin renewal, unclogs pores and softens fine lines.',
    steps: ['Apply a pea-sized amount to dry skin.', 'Spread over your whole face, avoiding the eyes and the corners of your mouth.', 'Finish with your moisturizer.'],
  },
  peroxido: {
    nome: 'Spot Treatment for Breakouts', ingrediente: 'Benzoyl Peroxide Gel 2.5%',
    instrucao: 'Apply only on inflamed pimples. Benzoyl peroxide reduces acne bacteria and helps the spot heal faster.',
    steps: ['Apply a thin layer only on the pimple.', "Don't spread it over your whole face.", 'Wash your hands afterwards.'],
  },
  azelaico: {
    nome: 'Azelaic Acid Serum', ingrediente: 'Azelaic Acid Serum 10%',
    instrucao: 'Apply a thin layer over your whole face. Azelaic acid calms inflamed breakouts and fades the marks they leave.',
    steps: ['Apply a thin layer to clean, dry skin.', 'Spread over your whole face.', 'Let it absorb before the next step.'],
  },
  niacinamida: {
    nome: 'Niacinamide Serum', ingrediente: 'Niacinamide Serum 5%',
    instrucao: 'Apply a few drops over your whole face. Niacinamide controls oil, makes pores look smaller and strengthens your barrier.',
    steps: ['Put 3–4 drops on your fingertips.', 'Press gently over your whole face.', 'Let it absorb before the next step.'],
  },
  vitc_pura: {
    nome: 'Vitamin C Antioxidant Serum', ingrediente: 'Vitamin C Serum 10%',
    instrucao: 'Apply in the morning, before sunscreen. Vitamin C protects your skin from sun damage and evens out your tone.',
    steps: ['Apply 3–4 drops to clean, dry skin.', 'Spread over your whole face.', 'Let it absorb before the next step.'],
  },
  vitc_derivado: {
    nome: 'Stable Vitamin C Serum', ingrediente: 'Stable Vitamin C Serum',
    instrucao: 'Apply in the morning, before sunscreen. Stable vitamin C evens out your tone and helps protect against the sun, without irritation.',
    steps: ['Apply 3–4 drops to clean, dry skin.', 'Spread over your whole face.'],
  },
  tranexamico: {
    nome: 'Dark Spot Serum', ingrediente: 'Tranexamic Acid Serum',
    instrucao: 'Apply over your whole face. Tranexamic acid fades dark spots without irritation.',
    steps: ['Apply a few drops to clean skin.', 'Spread over your whole face.'],
  },
  alfa_arbutin: {
    nome: 'Dark Spot Serum', ingrediente: 'Alpha Arbutin Serum',
    instrucao: 'Apply over your whole face. Alpha arbutin gently fades dark spots.',
    steps: ['Apply a few drops to clean skin.', 'Spread over your whole face.'],
  },
  peptideos: {
    nome: 'Peptide Serum', ingrediente: 'Peptide Serum',
    instrucao: 'Apply over your whole face. Peptides boost firmness and soften fine lines.',
    steps: ['Apply a few drops to clean skin.', 'Spread over your whole face.'],
  },
  ceramidas: {
    nome: 'Ceramide Moisturizer', ingrediente: 'Ceramide Moisturizer',
    instrucao: 'Apply over your whole face. Ceramides restore your barrier and lock in hydration.',
    steps: ['Apply a layer over your whole face.', 'Massage until absorbed.'],
  },
  hialuronico: {
    nome: 'Hydrating Serum', ingrediente: 'Hyaluronic Acid Serum',
    instrucao: 'Apply to skin that is still damp. Hyaluronic acid draws water into your skin and relieves dryness.',
    steps: ['Apply a few drops to slightly damp skin.', 'Spread over your whole face.'],
  },
  cafeina: {
    nome: 'Eye Cream', ingrediente: 'Caffeine Eye Cream',
    instrucao: 'Apply with your ring finger, with light taps, around your eyes. Caffeine de-puffs and softens dark circles.',
    steps: ['Take a small amount with your ring finger.', 'Tap it gently around your eyes.'],
  },
}

// Passos básicos (mesma estrutura do BASICO de conferencia.ts).
export const BASICO_EN = {
  limpeza: { name: 'Gentle Gel Cleanser', ingredient: 'Sulfate-Free Gentle Gel Cleanser',
    instruction: 'Wash your face with cool or lukewarm water. A gentle cleanse removes oil without stressing your barrier.',
    steps: ['Wet your face.', 'Massage the gel in for 30 seconds.', 'Rinse and pat dry without rubbing.'] },
  hidratante: { name: 'Moisturizer', ingredient: 'Ceramide Moisturizer',
    instruction: 'Apply over your whole face. Moisturizer holds water in your skin and protects your barrier.',
    steps: ['Apply a layer over your whole face.', 'Massage until absorbed.'] },
  protetor: { name: 'Sunscreen', ingredient: 'Sunscreen SPF 50',
    instruction: 'Apply as the last morning step and reapply if you stay in the sun. Sunscreen is what protects your routine results the most.',
    steps: ['Apply a generous layer to your face and neck.', 'Reapply every 2 hours in the sun.'] },
}

// Nome curto da dor nos avisos.
export const DOR_NOME_EN: Record<Dor, string> = {
  'Acne/espinhas': 'breakouts', 'Manchas': 'dark spots', 'Cravos': 'blackheads', 'Oleosidade': 'oiliness',
  'Rugas': 'fine lines and wrinkles', 'Poros dilatados': 'enlarged pores', 'Olheiras': 'dark circles',
  'Ressecamento': 'dryness', 'Textura irregular': 'uneven texture',
}

export const AVISO_ISOTRETINOINA_AMAMENTACAO_EN =
  "You told us you're breastfeeding and taking isotretinoin. Isotretinoin isn't recommended while breastfeeding: talk to your doctor before continuing the treatment. In the meantime, your routine only has gentle care."

export function listaEn(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? ''
  if (itens.length === 2) return `${itens[0]} and ${itens[1]}`
  return `${itens.slice(0, -1).join(', ')}, and ${itens[itens.length - 1]}`
}

/** Versão em inglês de `textoAviso` (plano.ts). `cobertas` = dores já tratadas (limite/teto). */
export function textoAvisoEn(dores: Dor[], motivo: string, cobertas: Dor[], qtdTratamentos: number): string {
  const nome = listaEn(dores.map((d) => DOR_NOME_EN[d]))
  const cob = listaEn([...new Set(cobertas.map((d) => DOR_NOME_EN[d]))])
  switch (motivo) {
    case 'isotretinoina':
      return `While you're taking isotretinoin, your skin is more sensitive, so only gentle care goes in. For ${nome}, plan your actives with your dermatologist.`
    case 'gravidez':
      return `The actives that treat ${nome} aren't recommended during pregnancy, while breastfeeding or when trying to get pregnant. Talk to your doctor before using them.`
    case 'barreira':
      return `Your skin barrier is fragile right now. First we'll restore it, for about 6 weeks; after that we can treat ${nome}.`
    case 'rosacea':
      return `With signs of rosacea, the actives that treat ${nome} can irritate your skin. We left them out to keep you safe.`
    case 'alergia':
      return `The actives that treat ${nome} belong to the family you said caused a reaction. We left them out.`
    case 'sem_produto':
      return `We don't have a product for ${nome} in our catalog yet that works for your skin.`
    case 'limite':
      return `To avoid irritating your skin, your routine has at most 2 strong actives, and they went to ${cob}. We'll add ${nome} once your skin gets used to them.`
    case 'teto':
      return `Your routine already has ${qtdTratamentos} ${qtdTratamentos === 1 ? 'treatment' : 'treatments'}, the most we add so your skin isn't overloaded, and they went to ${cob}. We'll add ${nome} once your skin gets used to them.`
    default:
      return ''
  }
}

// Nome do ativo nas frases para a usuária (o `nome` de ativos.ts, em inglês).
export const ATIVO_NOME_EN: Record<AtivoId, string> = {
  salicilico: 'salicylic acid (BHA)', aha: 'AHA (glycolic, mandelic or lactic)', pha: 'PHA (gluconolactone)',
  retinoide: 'retinoid (retinol, retinal or adapalene)', peroxido: 'benzoyl peroxide', azelaico: 'azelaic acid',
  niacinamida: 'niacinamide', vitc_pura: 'pure vitamin C', vitc_derivado: 'stable vitamin C', tranexamico: 'tranexamic acid',
  alfa_arbutin: 'alpha arbutin', peptideos: 'peptides', ceramidas: 'ceramides', hialuronico: 'hyaluronic acid', cafeina: 'caffeine',
}

// Textos da escolha de produtos (produtos.ts / recomendar.ts).
export const SEM_PRODUTO_EN = "We don't have a product in our catalog for this step yet."
export const avisoOrcamentoEn = (passo: string) =>
  `We couldn't find a product for "${passo}" within your budget, so we picked the most affordable one that works for your skin.`
export const casaForaForteEn = (ativo: AtivoId) =>
  `It has ${ATIVO_NOME_EN[ativo]}, a strong active that isn't in your routine right now. Adding another strong active raises the risk of irritation.`
export const CASA_FORA_SEGURANCA_EN = "This product isn't recommended for you right now, for safety."
export const casaForaRepetidoEn = (ativo: AtivoId) =>
  `Your routine already uses another product of yours with ${ATIVO_NOME_EN[ativo]}; two of the same don't add up to better results.`
/** Frase montada no código (quando a IA não escreve): "Marca with niacinamide — para…". */
export const ativoLegivelEn = (a: string) => String(a ?? '').replace(/_/g, ' ').replace(/\bacido\b/g, 'acid')
/** Pedido das frases dos produtos em inglês (substitui o de português quando idioma = 'en'). */
export const PEDIDO_COPIES_EN = 'You are a skincare consultant. For each product, write a short sentence (up to ~18 words), personal, in natural American English, saying why THIS product suits HER in this step — mention her skin type, one of her concerns or the active. Nothing generic and no repeated sentences. Reply ONLY with JSON: {"copies":[{"produto_id":"...","copy":"..."}]}'
