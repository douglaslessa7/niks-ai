// Motor da rotina v2 — acha os ativos do vocabulário do motor num TEXTO (nome do passo,
// ingrediente, ativos lidos pela IA num scan). Devolve TODOS os que aparecerem, para a
// conferência pegar um ativo forte que a IA tenha colocado por conta própria (ex.:
// "Gel de Limpeza com Ácido Salicílico").

import type { AtivoId } from './ativos.ts'

const norm = (s: string) => ` ${s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `

// Ordem importa só para o que vem antes no texto; todos os que casarem entram.
const REGRAS: [AtivoId, RegExp][] = [
  // Bakuchiol é a alternativa segura ao retinol: "bakuchiol (alternativa ao retinol)" não é retinoide.
  ['retinoide', /(retinol|retinal|retinaldeido|tretinoina|isotretinoina|retinoide|retinoid|retinil|retinyl|adapalen|tazaroten|trifaroten|hidroxipinacolona|hydroxypinacolone|granactive|\bhpr\b)/],
  ['salicilico', /(salicil|salicyl|\bbha\b|betaidroxi|\blha\b|beta[- ]hidroxi|beta[- ]hydroxy)/],
  ['aha', /(glicolic|glycolic|mandelic|latic|lactic|lactico|\baha\b|alfa[- ]hidroxi|alpha[- ]hydroxy)/],
  ['pha', /(gluconolact|\bpha\b|lactobion|polihidroxi|polyhydroxy)/],
  ['peroxido', /(peroxido de benzoila|benzoyl peroxide|\bbpo\b)/],
  ['azelaico', /(azelaic|azelaico)/],
  ['niacinamida', /(niacinamid|nicotinamid|vitamina b3|vitamin b3)/],
  ['tranexamico', /(tranexam)/],
  ['alfa_arbutin', /(arbutin)/],
  ['peptideos', /(peptide|peptideo|matrixyl|argirelin)/],
  ['ceramidas', /(ceramid)/],
  ['hialuronico', /(hialuron|hyaluron)/],
  ['cafeina', /(cafeina|caffeine)/],
]

// Vitamina C: derivado (SAP, MAP, ascorbil glucosídeo, THD, etil ascórbico) não é forte;
// "vitamina C" sem dizer qual conta como PURA (forte) — escolha conservadora.
const VITC = /(vitamina c|vit\.? c\b|vitamin c|ascorb)/
const VITC_DERIVADO = /(ascorbil|ascorbyl|fosfato|phosphate|glucosid|\bsap\b|\bmap\b|\bthd\b|tetrahexil|etil ascorb|ethyl ascorb|3-o-ethyl|estavel|derivad|stable|derivative)/

export function detectarAtivos(...textos: (string | null | undefined)[]): AtivoId[] {
  let t = norm(textos.filter(Boolean).join(' '))
  if (t.includes('bakuchiol')) t = t.replace(/(alternativa|substitut\w*|similar|parecid\w*)[^,.;()]*?retin\w*/g, ' ')
  const out = new Set<AtivoId>()
  for (const [id, re] of REGRAS) if (re.test(t)) out.add(id)
  if (VITC.test(t)) out.add(VITC_DERIVADO.test(t) ? 'vitc_derivado' : 'vitc_pura')
  // "Ácido hialurônico" não é ácido esfoliante; "ácido" sozinho não dispara nada.
  return [...out]
}
