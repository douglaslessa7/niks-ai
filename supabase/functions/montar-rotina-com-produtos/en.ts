// Inglês do "Montar minha rotina" (etapa 3 da tradução, nov/2026). O app manda
// `idioma: 'pt' | 'en'`; sem o campo (builds antigas) = português, exatamente como antes.
// Em português NADA aqui é usado: o motor (`_shared/motor`) continua escrevendo os mesmos
// textos, e só no inglês eles passam por `motivoEn`/`resultadoEn` DEPOIS de prontos.
// Frase que não casar com nenhum modelo abaixo fica como veio (nunca some texto).
// deno-lint-ignore-file no-explicit-any
export type Idioma = 'pt' | 'en'

export function idiomaDoCorpo(body: unknown): Idioma {
  return (body as { idioma?: unknown } | null)?.idioma === 'en' ? 'en' : 'pt'
}

// Lote antigo (reserva do motor novo): vai no fim do texto da usuária, só em inglês.
export const INSTRUCAO_EN =
  `\n\nRESPONSE LANGUAGE: American English (the user's phone is in English).\n` +
  `- Write every text she reads in natural American English, in the NIKS voice (warm, light, close — never a literal translation): produtos[].motivo, produtos[].avisos, fora_da_rotina[].motivo, faltam[].por_que and the step names/instructions in rotina.\n` +
  `- produtos[].ativos_detectados: in their usual English/INCI names (e.g. "salicylic acid 2%", "niacinamide", "glycerin").\n` +
  `- Never translate: JSON keys and code values (veredito, nivel_aviso, precisao, periodo, booleans, indices).\n` +
  `- Keep in Portuguese: produtos[].categoria (the Portuguese category words) and the day codes (Seg, Ter, Qua, Qui, Sex, Sáb, Dom).\n` +
  `- nome and marca: as printed on the package. Never mention that she is not pregnant.`

export const PUSH = {
  pronto: { pt: ['Sua rotina está pronta ✨', 'Montei uma rotina com os produtos que você tem. Toque para ver.'], en: ['Your routine is ready ✨', 'I built a routine with the products you already have. Tap to see it.'] },
  erro: { pt: ['Não deu para montar sua rotina', 'Suas fotos estão guardadas. Toque para tentar de novo.'], en: ["We couldn't build your routine", 'Your photos are saved. Tap to try again.'] },
} as const

// Nomes que o motor põe dentro das frases (`nomeAtivo`, `ATIVOS[].nome`, rótulos de alergia).
const NOME: Record<string, string> = {
  'ácido salicílico': 'salicylic acid', 'ácido mandélico': 'mandelic acid', 'ácido lático': 'lactic acid',
  'ácido glicólico': 'glycolic acid', 'adapalenato': 'adapalene', 'peróxido de benzoíla': 'benzoyl peroxide',
  'ácido azelaico': 'azelaic acid', 'niacinamida': 'niacinamide', 'vitamina C pura': 'pure vitamin C',
  'vitamina C': 'vitamin C', 'ácido tranexâmico': 'tranexamic acid', 'alfa-arbutin': 'alpha-arbutin',
  'peptídeos': 'peptides', 'ceramidas': 'ceramides', 'ácido hialurônico': 'hyaluronic acid', 'cafeína': 'caffeine',
  'ácido salicílico (BHA)': 'salicylic acid (BHA)', 'AHA (glicólico, mandélico ou lático)': 'AHA (glycolic, mandelic or lactic)',
  'PHA (gluconolactona)': 'PHA (gluconolactone)', 'retinoide (retinol, retinal ou adapaleno)': 'retinoid (retinol, retinal or adapalene)',
  'vitamina C pura (ácido L-ascórbico)': 'pure vitamin C (L-ascorbic acid)', 'vitamina C estável (derivado)': 'stable vitamin C (derivative)',
  'cafeína (área dos olhos)': 'caffeine (eye area)',
  // rótulos de alergia/reação (casa.ts)
  'protetor solar': 'sunscreen', 'hidratante': 'moisturizer', 'sabonete': 'cleanser', 'fragrância': 'fragrance',
  'ácidos': 'acids', 'óleos essenciais': 'essential oils', 'álcool': 'alcohol', 'própolis': 'propolis', 'retinoides': 'retinoids',
}
const nome = (s: string) => NOME[s.trim()] ?? s.trim()

const DOR: Record<string, string> = {
  espinhas: 'breakouts', manchas: 'dark spots', cravos: 'blackheads', oleosidade: 'oiliness', 'linhas e rugas': 'fine lines and wrinkles',
  'poros dilatados': 'large pores', olheiras: 'dark circles', ressecamento: 'dryness', 'textura irregular': 'uneven texture',
}
const dor = (s: string) => DOR[s.trim()] ?? s.trim()
const pct = (s: string) => s.replace(',', '.')

const MODELOS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Use como seu dermatologista orientou\.$/, () => 'Use it the way your dermatologist told you.'],
  [/^Você marcou reação a (.+)\. Fale com seu dermatologista para escolher um que sirva para você\.$/, (m) => `You said you've reacted to ${nome(m[1])}. Talk to your dermatologist to pick one that works for you.`],
  [/^Você marcou reação a (.+), então ele fica fora\.$/, (m) => `You said you've reacted to ${nome(m[1])}, so it stays out.`],
  [/^Você contou que teve reação com ele, então ele fica fora\.$/, () => "You told me you had a reaction to it, so it stays out."],
  [/^Tem (.+), que a gente evita na gravidez e na amamentação\.$/, (m) => `It has ${nome(m[1])}, which we avoid during pregnancy and breastfeeding.`],
  [/^Tem (.+)\. Enquanto você toma isotretinoína, só cuidados suaves entram\.$/, (m) => `It has ${nome(m[1])}. While you're on isotretinoin, only gentle care goes in.`],
  [/^Tem (.+), que pode irritar enquanto sua barreira se recupera\.$/, (m) => `It has ${nome(m[1])}, which can irritate your skin while its barrier recovers.`],
  [/^Tem (.+), que pode irritar a vermelhidão e a sensibilidade da sua pele\.$/, (m) => `It has ${nome(m[1])}, which can aggravate your skin's redness and sensitivity.`],
  [/^Tem fragrância, e sua pele é sensível\.$/, () => 'It has fragrance, and your skin is sensitive.'],
  [/^Tem (.+), e sua rotina já tem 2 ativos fortes\.$/, (m) => `It has ${nome(m[1])}, and your routine already has 2 strong actives.`],
  [/^Tem (.+), um ativo forte que não está na sua rotina agora\. Somar mais um ativo forte aumenta o risco de irritação\.$/, (m) => `It has ${nome(m[1])}, a strong active that isn't in your routine right now. Adding another strong active raises the risk of irritation.`],
  [/^Tem um tipo mais fraco de ácido salicílico; para espinhas, o ideal é o ácido salicílico puro\.$/, () => 'It has a weaker form of salicylic acid; for breakouts, pure salicylic acid works best.'],
  [/^Tem pouco (.+?); para (.+), o ideal é a partir de ([\d,]+)%\.$/, (m) => `It has only a little ${nome(m[1])}; for ${dor(m[2])}, it works best from ${pct(m[3])}%.`],
  [/^Tem pouco (.+?); o ideal é a partir de ([\d,]+)%\.$/, (m) => `It has only a little ${nome(m[1])}; it works best from ${pct(m[2])}%.`],
  [/^Tem (.+), que não combina com o (.+) da sua rotina no mesmo dia\.$/, (m) => `It has ${nome(m[1])}, which doesn't mix with the ${nome(m[2])} in your routine on the same day.`],
  [/^Você escaneou este produto duas vezes; ele já está na sua rotina\.$/, () => "You scanned this product twice; it's already in your routine."],
  [/^Você escaneou este produto duas vezes\. (.+)$/, (m) => `You scanned this product twice. ${motivoEn(m[1])}`],
  [/^Sua rotina já usa o (.+), que trata melhor (?:as suas|os seus|a sua|o seu) (.+)\.$/, (m) => `Your routine already uses ${m[1]}, which works better on your ${dor(m[2])}.`],
  [/^Sua rotina já usa o (.+), que faz o mesmo papel\.$/, (m) => `Your routine already uses ${m[1]}, which does the same job.`],
  [/^Sua rotina já tem uma limpeza desse tipo neste horário\.$/, () => 'Your routine already has this kind of cleanser at this time of day.'],
  [/^Ainda não temos um produto no catálogo para este passo\.$/, () => "We don't have a product in our catalog for this step yet."],
  [/^Não tem um passo para ele na sua rotina agora\.$/, () => "There's no step for it in your routine right now."],
  [/^Sugestão: (.+)\.$/, (m) => `Suggestion: ${m[1]}.`],
  [/^Entrou na sua rotina em "(.+)"\.$/, (m) => `Added to your routine in "${m[1]}".`],
  [/^Ficou fora da rotina\.$/, () => 'It stayed out of the routine.'],
  [/^Não achamos a lista de ingredientes dele, então essa análise é menos exata\.$/, () => "We couldn't find its ingredient list, so this analysis is less precise."],
  [/^Sem a lista de ingredientes, essa análise é menos exata\.$/, () => 'Without the ingredient list, this analysis is less precise.'],
]

/** Uma frase do motor em inglês (a que não casar fica como veio). */
export function motivoEn(texto: string | null | undefined): string | null {
  if (texto == null) return texto ?? null
  for (const [re, f] of MODELOS) {
    const m = texto.match(re)
    if (m) return f(m)
  }
  return texto
}

export const ativosEn = (xs: unknown): unknown => (Array.isArray(xs) ? xs.map((x) => (typeof x === 'string' ? nome(x) : x)) : xs)

/** `rotina_lotes.resultado` do motor novo, com os textos para ela em inglês. Códigos, categorias,
 *  dias e nomes de passo/produto ficam como estão. */
export function resultadoEn(r: any): any {
  if (!r || typeof r !== 'object') return r
  for (const p of Array.isArray(r.produtos) ? r.produtos : []) {
    p.motivo = motivoEn(p.motivo)
    p.ativos_detectados = ativosEn(p.ativos_detectados)
  }
  for (const f of Array.isArray(r.fora_da_rotina) ? r.fora_da_rotina : []) f.motivo = motivoEn(f.motivo)
  for (const f of Array.isArray(r.faltam) ? r.faltam : []) f.por_que = motivoEn(f.por_que)
  for (const per of ['am', 'pm']) {
    for (const d of Array.isArray(r.rotina_completa?.[per]) ? r.rotina_completa[per] : []) d.sem_produto = motivoEn(d.sem_produto)
  }
  return r
}
