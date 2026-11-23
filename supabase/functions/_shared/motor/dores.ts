// Motor da rotina v2 — tabela FIXA dor do onboarding → ativos que tratam essa dor.
// A IA não decide SE ataca a dor, só COMO. A ordem da lista é a preferência.
// ⚠️ Proposta clínica — a validar com dermatologista.

import type { AtivoId } from './ativos.ts'

// Chaves = os valores gravados em `onboarding.concerns` / `users.concerns`
// (CONCERN_LABELS em components/onboarding/answers.ts).
export type Dor =
  | 'Acne/espinhas' | 'Manchas' | 'Cravos' | 'Oleosidade' | 'Rugas'
  | 'Poros dilatados' | 'Olheiras' | 'Ressecamento' | 'Textura irregular'

export const DOR_ATIVOS: Record<Dor, AtivoId[]> = {
  'Cravos': ['salicilico', 'retinoide', 'aha'],
  'Acne/espinhas': ['salicilico', 'azelaico', 'peroxido', 'retinoide'],
  'Oleosidade': ['niacinamida', 'salicilico'],
  'Poros dilatados': ['niacinamida', 'salicilico', 'retinoide'],
  'Manchas': ['azelaico', 'vitc_derivado', 'niacinamida', 'tranexamico', 'alfa_arbutin', 'aha'],
  'Textura irregular': ['aha', 'pha', 'salicilico', 'retinoide'],
  'Rugas': ['retinoide', 'peptideos', 'vitc_pura'],
  'Ressecamento': ['ceramidas', 'hialuronico'],
  'Olheiras': ['cafeina'],
}

// Nome curto, como ela vê nos avisos ("cravos", "manchas"…).
export const DOR_NOME: Record<Dor, string> = {
  'Acne/espinhas': 'espinhas', 'Manchas': 'manchas', 'Cravos': 'cravos', 'Oleosidade': 'oleosidade',
  'Rugas': 'linhas e rugas', 'Poros dilatados': 'poros dilatados', 'Olheiras': 'olheiras',
  'Ressecamento': 'ressecamento', 'Textura irregular': 'textura irregular',
}

// Problema da análise rápida (lib/analiseRapida.ts: acne, manchas, cravos…) → dor.
const PROBLEMA_PARA_DOR: Record<string, Dor> = {
  acne: 'Acne/espinhas', manchas: 'Manchas', cravos: 'Cravos', oleosidade: 'Oleosidade',
  rugas: 'Rugas', poros: 'Poros dilatados', olheiras: 'Olheiras', ressecamento: 'Ressecamento',
  textura: 'Textura irregular',
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const DOR_POR_NORM = new Map<string, Dor>((Object.keys(DOR_ATIVOS) as Dor[]).map((d) => [norm(d), d]))

/** Valor livre (rótulo do onboarding ou id da análise rápida) → dor, ou null. */
export function paraDor(v: unknown): Dor | null {
  if (typeof v !== 'string' || !v.trim()) return null
  return DOR_POR_NORM.get(norm(v)) ?? PROBLEMA_PARA_DOR[norm(v)] ?? null
}

/**
 * Dores marcadas, na ordem de prioridade: a principal (quando o app manda) primeiro,
 * depois a ordem em que ela tocou. "Outro" e valores desconhecidos saem.
 */
export function doresMarcadas(concerns: unknown, dorPrincipal?: unknown): Dor[] {
  const lista = (Array.isArray(concerns) ? concerns : []).map(paraDor).filter((d): d is Dor => !!d)
  const principal = paraDor(dorPrincipal)
  const ordem = principal ? [principal, ...lista] : lista
  return [...new Set(ordem)]
}

/** Dores que o SCAN viu (secundárias: são cobertas se couber, sem aviso se não). */
// 16/nov/2026 (decisão do produto): achado LEVE do scan não acrescenta tratamento; moderado
// ou grave, sim. As dores marcadas por ela sempre mandam (essas não passam por aqui).
//   acne: severity_score (IGA 0–4) ≤ 1 = leve · manchas: intensity_score (1–5) ≤ 2 = leve
//   oleosidade: intensity "moderado"/"intenso" · poros e textura: sem "levemente"
//   rugas: linhas finas e flacidez nenhuma/leve = leve · prioridade clínica: frase com "leve"
const TEXTO_LEVE = /\b(leve|leves|discret|sutil|minim|quase imperceptivel|mild|subtle|slight|barely)/
function acneLeve(a: any): boolean {
  const sc = Number(a?.severity_score)
  if (Number.isFinite(sc)) return sc <= 1
  return /leve|ausente/.test(norm(String(a?.severity ?? '')))
}
function manchasLeves(p: any): boolean {
  const sc = Number(p?.intensity_score)
  return Number.isFinite(sc) && sc <= 2
}
function rugasLeves(e: any): boolean {
  const linhas = norm(String(e?.lines_type ?? ''))
  const flacidez = norm(String(e?.firmness_loss ?? ''))
  return (!linhas || linhas === 'nenhuma' || linhas === 'linhas_finas') && (!flacidez || flacidez === 'nenhuma' || flacidez === 'leve')
}

export function doresDoScan(scan: any): Dor[] {
  if (!scan || typeof scan !== 'object') return []
  const out: Dor[] = []
  const primTexto = norm(String(scan?.prioridade_clinica?.primaria ?? ''))
  const prim = TEXTO_LEVE.test(primTexto) ? null : paraDorDaPrioridade(scan?.prioridade_clinica?.primaria)
  if (prim) out.push(prim)
  if (scan.acne?.present === true && !acneLeve(scan.acne)) out.push('Acne/espinhas')
  if (scan.pigmentacao?.present === true && !manchasLeves(scan.pigmentacao)) out.push('Manchas')
  const brilho = norm(String(scan.brilho_sebaceo?.intensity ?? ''))
  if (/alta|moder|intens|high/.test(brilho)) out.push('Oleosidade')
  const poros = norm(String(scan.textura_poros?.pore_visibility ?? ''))
  if (/dilatad|visiv|alto|alta|enlarged|visible|high/.test(poros) && !poros.includes('levemente') && !poros.includes('slightly')) out.push('Poros dilatados')
  const textura = norm(String(scan.textura_poros?.texture ?? ''))
  if (/irregular|aspera|rugos|uneven|rough|bumpy/.test(textura) && !textura.includes('levemente') && !textura.includes('slightly')) out.push('Textura irregular')
  if (scan.envelhecimento?.present === true && !rugasLeves(scan.envelhecimento)) out.push('Rugas')
  if (scan.skin_hydration === 'desidratada') out.push('Ressecamento')
  return [...new Set(out)]
}

function paraDorDaPrioridade(texto: unknown): Dor | null {
  const t = norm(String(texto ?? ''))
  if (!t) return null
  // Cada linha: os termos em português de sempre e, depois, os mesmos em inglês (análise em inglês).
  if (t.includes('cravo') || t.includes('comedo') || t.includes('blackhead')) return 'Cravos'
  if (t.includes('acne') || t.includes('espinha') || t.includes('breakout') || t.includes('pimple')) return 'Acne/espinhas'
  if (t.includes('mancha') || t.includes('pigment') || t.includes('melasma') || t.includes('hpi') || t.includes('dark spot') || t.includes('dark mark')) return 'Manchas'
  if (t.includes('ruga') || t.includes('linha') || t.includes('envelhec') || t.includes('wrinkle') || t.includes('fine line') || t.includes('aging') || t.includes('ageing')) return 'Rugas'
  if (t.includes('oleos') || t.includes('sebo') || t.includes('oil') || t.includes('sebum')) return 'Oleosidade'
  if (t.includes('poro') || t.includes('pore')) return 'Poros dilatados'
  if (t.includes('textura') || t.includes('texture')) return 'Textura irregular'
  if (t.includes('ressec') || t.includes('desidrat') || t.includes('dryness') || t.includes('dehydrat')) return 'Ressecamento'
  return null
}
