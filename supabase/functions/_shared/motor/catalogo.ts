// Motor da rotina v2 — catálogo e filtros de pele (compartilhado pela geração da rotina
// e pela escolha dos produtos, para que as duas etapas vejam o MESMO catálogo filtrado).

// deno-lint-ignore-file no-explicit-any
import { ATIVOS, CODIGOS_MEDICAMENTO, FORTES, type AtivoId } from './ativos.ts'
import { DOR_ATIVOS } from './dores.ts'
import type { Plano, PerfilMotor } from './plano.ts'
import { DOR_CONCERN, passaFiltros, type FiltrosPele, type ProdutoCatalogo } from './produtos.ts'
import { lerReacoes } from './reacoes.ts'

export const SELECT_PRODUTO =
  'id, marca, nome, categoria, ativos_principais, tipos_pele, concerns, alergenos, intensidade, indicado_pele_sensivel, seguro_gestante, faixa_preco, ideal_para, imagem_url, nivel_fama'

export async function carregarCatalogo(supabase: any): Promise<ProdutoCatalogo[]> {
  const { data, error } = await supabase.from('produtos').select(SELECT_PRODUTO).eq('ativo', true)
  if (error) throw new Error(`catálogo: ${error.message}`)
  // Medicamento nunca é recomendado (16/nov/2026).
  return ((data ?? []) as ProdutoCatalogo[]).filter((p) => !ehMedicamento(p))
}

export function ehMedicamento(p: Pick<ProdutoCatalogo, 'ativos_principais'>): boolean {
  return (p.ativos_principais ?? []).some((c) => CODIGOS_MEDICAMENTO.includes(String(c).toLowerCase()))
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Mesmo vocabulário do ALLERGEN_KEYWORDS de recomendar-produtos (na dúvida, corta).
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  fragrancia: ['fragr', 'perfum', 'aroma'],
  // aha_bha: decidido por ingrediente em reacoes.ts (23/nov/2026), não por palavra.
  oleos_essenciais: ['oleo essencial', 'oleos essenciais', 'essential oil'],
  vitamina_c: ['vitamina c', 'vit c', 'ascorbico'],
  centella: ['centella', 'cica', 'gotu kola'],
  alcool: ['alcool', 'alcohol'],
  niacinamida_alta: ['niacinamida', 'niacin', 'vitamina b3'],
  propolis: ['propolis', 'propole'],
  retinoides: ['retino', 'tretinoina', 'retinal', 'adapaleno', 'vitamina a', 'vitacid', 'vitaminacid', 'vitanol', 'differin', 'epiduo'],
}
export function alergenosCortados(descricao: unknown): string[] {
  if (typeof descricao !== 'string' || !descricao.trim()) return []
  const t = norm(descricao)
  return Object.entries(ALLERGEN_KEYWORDS).filter(([, ks]) => ks.some((k) => t.includes(k))).map(([c]) => c)
}

const TIPOS = ['oleosa', 'seca', 'mista', 'normal']
export function tipoPeleCodigo(tipoPele: unknown, scan: any): string | null {
  const d = norm(String(tipoPele ?? ''))
  if (TIPOS.includes(d)) return d
  const seb = norm(String(scan?.skin_type_sebaceous ?? ''))
  if (TIPOS.includes(seb)) return seb
  const det = norm(String(scan?.skin_type_detected ?? ''))
  return TIPOS.find((t) => det.includes(t)) ?? null
}

export function filtrosDaPele(perfil: PerfilMotor, onboarding: any, scan: any, plano: Plano | null): FiltrosPele {
  const proibidos = (Object.entries(plano?.proibidos ?? {}) as [AtivoId, string][])
    .filter(([, m]) => m !== 'sem_produto' && m !== 'limite').map(([a]) => a)
  const fortesDoPlano = plano ? plano.ativos.map((e) => e.ativo).filter((a) => ATIVOS[a].forte) : FORTES
  const orc = Number(onboarding?.orcamento ?? onboarding?.orcamento_faixa)
  return {
    tipoPele: tipoPeleCodigo(onboarding?.skin_type ?? onboarding?.tipo_pele, scan),
    gravida: perfil.gravida,
    sensivel: onboarding?.allergy_type === 'sensitive',
    alergenosCortados: alergenosCortados(onboarding?.allergy_description),
    alergiaAtivos: perfil.alergiaCorta,
    reacoes: lerReacoes(onboarding?.allergy_description),
    proibidos,
    fortesPermitidos: fortesDoPlano,
    orcamento: orc >= 1 && orc <= 3 ? orc : null,
    concernsCodigos: [...perfil.marcadas, ...perfil.doScan].map((d) => DOR_CONCERN[d]).filter(Boolean),
    ativosDasDores: [...new Set([...perfil.marcadas, ...perfil.doScan].flatMap((d) => DOR_ATIVOS[d] ?? []))],
  }
}

/**
 * O catálogo tem ao menos 1 produto deste ativo que sirva para ela? (usado pelo plano:
 * ativo sem produto não entra). Só a segurança e o tipo de pele contam aqui; o limite de
 * fortes é decidido pelo plano.
 */
export function temProdutoPara(catalogo: ProdutoCatalogo[], f: FiltrosPele) {
  return (a: AtivoId): boolean => {
    const at = ATIVOS[a]
    // O produto não pode trazer OUTRO forte junto (senão a rotina estoura o limite).
    const fA: FiltrosPele = { ...f, fortesPermitidos: at.forte ? [a] : [] }
    return catalogo.some((p) => {
      if (a === 'cafeina') return p.categoria === 'olhos' && (p.ativos_principais ?? []).includes('cafeina') && passaFiltros(p, fA)
      if (!(p.ativos_principais ?? []).some((c) => at.codigos.includes(String(c).toLowerCase()))) return false
      if (at.lugar === 'hidratante' && p.categoria !== 'hidratante') return false
      return passaFiltros(p, fA)
    })
  }
}
