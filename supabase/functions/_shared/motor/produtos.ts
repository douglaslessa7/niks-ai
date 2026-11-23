// Motor da rotina v2 — Etapa 3: PRODUTOS de cada passo (puro, sem banco).
//
// Ordem de prioridade (decisão do produto): segurança > dor tratada > passo preenchido >
// orçamento. O orçamento é preferência, nunca filtro: se nada couber, entra o de menor
// faixa que serve, com aviso.
// Produto de casa entra primeiro quando tem o ativo que o passo pede e passa nos filtros;
// nunca dois produtos de casa do mesmo ativo; o que sobra fica com o motivo.

import { ATIVOS, SALICILICO_REAL, ativosDosCodigos, fortesDosCodigos, type AtivoId } from './ativos.ts'
import { detectarAtivos } from './detectar.ts'
import { ehHidratante, ehLimpeza, ehOlhos, ehProtetor, type Passo } from './conferencia.ts'
import { avisoOrcamentoEn, CASA_FORA_SEGURANCA_EN, casaForaForteEn, casaForaRepetidoEn, type Idioma } from './ingles.ts'
import { avaliarProduto, prefereSuave, type Reacao } from './reacoes.ts'

export interface ProdutoCatalogo {
  id: string
  marca: string
  nome: string
  categoria: string
  ativos_principais: string[] | null
  tipos_pele: string[] | null
  concerns: string[] | null
  alergenos: string[] | null
  intensidade: string | null
  indicado_pele_sensivel: boolean | null
  seguro_gestante: boolean | null
  faixa_preco: number | null
  ideal_para?: string | null
  nivel_fama?: string | null
}

export interface ItemCasa {
  colecaoId: string
  produtoId: string | null      // origem catálogo
  nome: string
  marca: string
  categoria: string | null      // do catálogo ou o texto lido no scan
  ativos: AtivoId[]
  alergenos: string[]           // só do catálogo (do scan não sabemos)
  seguroGestante: boolean | null
}

export interface FiltrosPele {
  tipoPele: string | null
  gravida: boolean
  sensivel: boolean
  alergenosCortados: string[]   // códigos de produtos.alergenos
  alergiaAtivos: AtivoId[]
  /** Reações declaradas, por ingrediente (reacoes.ts). */
  reacoes?: Reacao[]
  proibidos: AtivoId[]          // segurança do plano (gravidez, barreira, rosácea, isotretinoína)
  fortesPermitidos: AtivoId[]   // os fortes do plano: nenhum outro forte pode entrar por produto
  orcamento: number | null      // 1–3, null = sem preferência
  concernsCodigos: string[]     // dores dela no vocabulário de produtos.concerns
  /** Ativos do plano (efetivo): um produto não traz junto outro deles que seja "uma vez por dia". */
  ativosDoPlano?: AtivoId[]
  /** Ativos que tratam as dores dela (orçamento 3: fórmula mais completa para ela). */
  ativosDasDores?: AtivoId[]
}

export type TipoPasso = 'limpeza' | 'tonico' | 'tratamento' | 'olhos' | 'hidratante' | 'protetor'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function tipoDoPasso(p: Passo): TipoPasso {
  if (ehProtetor(p)) return 'protetor'
  if (ehLimpeza(p)) return 'limpeza'
  if (ehOlhos(p)) return 'olhos'
  const t = norm(`${p.name} ${p.ingredient}`)
  if (/tonico|essencia|toner|essence/.test(t)) return 'tonico'
  if (ehHidratante(p)) return 'hidratante'
  return 'tratamento'
}

export function categoriasDoPasso(p: Passo, tipo: TipoPasso, ativo: AtivoId | null): string[] {
  const t = norm(`${p.name} ${p.ingredient}`)
  switch (tipo) {
    case 'protetor': return ['protetor_solar']
    case 'limpeza': return /oleo|balm|balsamo|oil/.test(t) ? ['limpeza_oleosa'] : ['limpeza']
    case 'tonico': return ['tonico']
    case 'olhos': return ['olhos']
    case 'hidratante': return /oclusivo|vaselina|esqualano/.test(t) ? ['oclusivo', 'hidratante'] : ['hidratante']
    case 'tratamento':
      if (ativo === 'cafeina') return ['olhos'] // cafeína só em produto para a área dos olhos
      if (ativo === 'peroxido') return ['tratamento_local', 'serum']
      if (ativo === 'retinoide') return ['tratamento_noturno', 'serum']
      if (ativo === 'aha' || ativo === 'pha' || ativo === 'salicilico') return ['serum', 'esfoliante', 'tonico', 'tratamento_noturno']
      return ['serum', 'tratamento_noturno', 'tratamento_local']
  }
}

/** O produto serve para ela neste passo? (segurança + regra dos fortes). */
export function passaFiltros(p: ProdutoCatalogo, f: FiltrosPele): boolean {
  if (f.tipoPele && Array.isArray(p.tipos_pele) && p.tipos_pele.length && !p.tipos_pele.includes(f.tipoPele)) return false
  if (f.gravida && p.seguro_gestante !== true) return false
  if ((p.alergenos ?? []).some((a) => f.alergenosCortados.includes(a))) return false
  if (avaliarProduto({ codigos: p.ativos_principais, alergenos: p.alergenos, texto: p.nome, intensidade: p.intensidade }, f.reacoes ?? [])?.tipo === 'bloqueia') return false
  const ativos = ativosDosCodigos(p.ativos_principais)
  if (ativos.some((a) => f.alergiaAtivos.includes(a) || f.proibidos.includes(a))) return false
  if (fortesDosCodigos(p.ativos_principais).some((a) => !f.fortesPermitidos.includes(a))) return false
  return true
}

function casaPassaFiltros(c: ItemCasa, f: FiltrosPele): boolean {
  if (f.gravida && c.seguroGestante === false) return false
  if (c.alergenos.some((a) => f.alergenosCortados.includes(a))) return false
  if (avaliarProduto({ ativos: c.ativos, alergenos: c.alergenos, texto: c.nome }, f.reacoes ?? [])?.tipo === 'bloqueia') return false
  if (c.ativos.some((a) => f.alergiaAtivos.includes(a) || f.proibidos.includes(a))) return false
  if (c.ativos.some((a) => ATIVOS[a].forte && !f.fortesPermitidos.includes(a))) return false
  return true
}

const temAtivo = (codigos: string[] | null, a: AtivoId) =>
  (codigos ?? []).some((c) => ATIVOS[a].codigos.includes(String(c).toLowerCase()))

/**
 * O produto bate com o passo? (16/nov/2026: o "Sérum de Niacinamida" recebeu o Medicube Azelaic
 * Acid 16, que tem niacinamida, mas é um sérum de azelaico.) Num passo de tratamento, quando o
 * NOME do produto anuncia um ativo de tratamento, tem que anunciar o ativo do passo.
 */
export function produtoBateComPasso(nomeProduto: string, ativo: AtivoId | null): boolean {
  if (!ativo) return true
  const anunciados = detectarAtivos(nomeProduto).filter((a) => ATIVOS[a].lugar !== 'hidratante')
  return !anunciados.length || anunciados.includes(ativo)
}

/** Conferência final: passos de tratamento cujo produto não bate com o ativo do passo. */
export function produtosQueNaoBatem(escolhas: Escolha[]): Escolha[] {
  return escolhas.filter((e) => ['tratamento', 'olhos'].includes(tipoDoPasso(e.passo)) && e.ativo &&
    !produtoBateComPasso(e.casa ? e.casa.nome : e.principal?.nome ?? '', e.ativo))
}

/** Candidatos do catálogo para o passo, já em ordem de preferência. */
export function candidatos(passo: Passo, ativo: AtivoId | null, catalogo: ProdutoCatalogo[], f: FiltrosPele): ProdutoCatalogo[] {
  const tipo = tipoDoPasso(passo)
  const cats = categoriasDoPasso(passo, tipo, ativo)
  const exige = ativo && (tipo === 'tratamento' || ATIVOS[ativo].lugar !== 'tratamento' || tipo === 'limpeza' || tipo === 'tonico')
    ? ativo : null
  let pool = catalogo.filter((p) =>
    cats.includes(p.categoria) &&
    passaFiltros(p, f) &&
    (!exige || temAtivo(p.ativos_principais, exige)) &&
    ((tipo !== 'tratamento' && tipo !== 'olhos') || produtoBateComPasso(p.nome, ativo)))
  // Salicílico de verdade (16/nov/2026): betaína salicilato e LHA sozinhos só se não houver
  // outro — e nunca para acne.
  const salReal = (p: ProdutoCatalogo) => (p.ativos_principais ?? []).some((c) => SALICILICO_REAL.includes(String(c).toLowerCase()))
  if (exige === 'salicilico') {
    const reais = pool.filter(salReal)
    pool = f.concernsCodigos.includes('acne') || reais.length ? reais : pool
  }
  // 16/nov/2026: o produto não traz OUTRO forte além do ativo do passo (ex.: o Effaclar A.Z.,
  // com azelaico + salicílico, não serve num passo de azelaico).
  const fortesDoPasso = ativo && ATIVOS[ativo].forte ? [ativo] : []
  // Nem outro ativo do plano que é "uma vez por dia" (o azelaico de um A.Z. num passo de
  // salicílico repetiria o azelaico do outro passo nos mesmos dias).
  const diariosDoPlano = (f.ativosDoPlano ?? []).filter((a) => ATIVOS[a].umaVezAoDia && a !== ativo)
  const semOutroForte = (p: ProdutoCatalogo) =>
    fortesDosCodigos(p.ativos_principais).every((a) => fortesDoPasso.includes(a)) &&
    !ativosDosCodigos(p.ativos_principais).some((a) => diariosDoPlano.includes(a))
  if (exige) pool = pool.filter(semOutroForte)
  else if (pool.some(semOutroForte)) pool = pool.filter(semOutroForte) // básico: só se não houver outro
  // Pele sensível (16/nov/2026): `indicado_pele_sensivel` é FILTRO; só se nenhum produto
  // passar, entra o melhor que sobrou.
  if (f.sensivel && pool.some((p) => p.indicado_pele_sensivel === true)) pool = pool.filter((p) => p.indicado_pele_sensivel === true)
  let ordem = ordenar(pool, f, cats)
  // Reação leve na família do passo (ex.: glicólico → lático/mandélico): o suave primeiro.
  if (prefereSuave(exige, f.reacoes ?? [])) {
    const suave = (p: ProdutoCatalogo) => /suave|leve/.test(norm(p.intensidade ?? ''))
    ordem = [...ordem.filter(suave), ...ordem.filter((p) => !suave(p))]
  }
  // Água micelar não é o sabonete da rotina: só vai primeiro se o passo pedir micelar.
  if (tipo === 'limpeza' && !/micelar/.test(norm(`${passo.name} ${passo.ingredient}`))) {
    const micelar = (p: ProdutoCatalogo) => /micelar|micellar/.test(norm(p.nome))
    ordem = [...ordem.filter((p) => !micelar(p)), ...ordem.filter(micelar)]
  }
  // Passo básico (sem ativo pedido): produto sem ativo forte primeiro — o ativo forte já
  // está no passo de tratamento; repetir no sabonete/hidratante só soma irritação.
  if (exige) return ordem
  const semForte = ordem.filter((p) => !fortesDosCodigos(p.ativos_principais).length)
  return [...semForte, ...ordem.filter((p) => !semForte.includes(p))]
}

function ordenar(pool: ProdutoCatalogo[], f: FiltrosPele, cats: string[]): ProdutoCatalogo[] {
  const leve = (p: ProdutoCatalogo) => /suave|leve/.test(norm(p.intensidade ?? '')) ? 1 : 0
  const cabe = (p: ProdutoCatalogo) => f.orcamento == null || (p.faixa_preco ?? 1) <= f.orcamento ? 0 : 1
  // Orçamento 3 = sem teto (16/nov/2026): o mais indicado para o passo, sem olhar preço —
  // fórmula com mais ativos que tratam as dores dela, depois os ícones do catálogo.
  const semTeto = f.orcamento === 3
  const completa = (p: ProdutoCatalogo) => ativosDosCodigos(p.ativos_principais).filter((a) => (f.ativosDasDores ?? []).includes(a)).length
  const icone = (p: ProdutoCatalogo) => p.nivel_fama === 'iconico' ? 1 : 0
  return [...pool].sort((a, b) =>
    // 1. dor tratada (concerns dela)
    ((b.concerns ?? []).filter((c) => f.concernsCodigos.includes(c)).length -
     (a.concerns ?? []).filter((c) => f.concernsCodigos.includes(c)).length) ||
    (semTeto ? (completa(b) - completa(a)) || (icone(b) - icone(a)) : 0) ||
    // 2. orçamento (preferência): o que cabe primeiro; fora do orçamento, o mais barato
    (cabe(a) - cabe(b)) ||
    (cabe(a) === 1 ? (a.faixa_preco ?? 1) - (b.faixa_preco ?? 1) : 0) ||
    // 3. pele sensível
    (f.sensivel ? ((b.indicado_pele_sensivel ? 1 : 0) - (a.indicado_pele_sensivel ? 1 : 0)) || (leve(b) - leve(a)) : 0) ||
    // 4. a categoria principal do passo antes das alternativas (ex.: sérum antes de esfoliante)
    (cats.indexOf(a.categoria) - cats.indexOf(b.categoria)))
}

/** Produto de casa que serve no passo (o mesmo ativo; básicos: mesma função). */
function casaServe(c: ItemCasa, passo: Passo, ativo: AtivoId | null, f: FiltrosPele): boolean {
  if (!casaPassaFiltros(c, f)) return false
  const tipo = tipoDoPasso(passo)
  // Passo de tratamento: o produto de casa não traz outro forte além do ativo do passo.
  if ((tipo === 'tratamento' || tipo === 'olhos') && !produtoBateComPasso(c.nome, ativo)) return false
  if ((tipo === 'tratamento' || tipo === 'olhos') && c.ativos.some((a) => a !== ativo &&
    (ATIVOS[a].forte || (ATIVOS[a].umaVezAoDia && (f.ativosDoPlano ?? []).includes(a))))) return false
  const cat = norm(c.categoria ?? '')
  const mesmaFuncao =
    tipo === 'protetor' ? /protetor|solar|fps/.test(cat)
    : tipo === 'limpeza' ? /limpeza|cleanser|sabonete/.test(cat)
    : tipo === 'tonico' ? /tonico|essencia/.test(cat)
    : tipo === 'olhos' ? /olho/.test(cat)
    : tipo === 'hidratante' ? /hidratante|creme|oclusivo/.test(cat)
    : /serum|tratamento|esfoliante|tonico|ampola/.test(cat)
  if (ativo && (tipo === 'tratamento' || tipo === 'olhos')) return c.ativos.includes(ativo) && (tipo !== 'olhos' || mesmaFuncao)
  if (ativo && !c.ativos.includes(ativo)) return false
  return mesmaFuncao
}

export interface Escolha {
  passo: Passo
  periodo: 'am' | 'pm'
  ativo: AtivoId | null
  casa: ItemCasa | null
  principal: ProdutoCatalogo | null
  alternativas: ProdutoCatalogo[]
  foraDoOrcamento: boolean
}

export interface ResultadoProdutos {
  escolhas: Escolha[]
  /** Itens de casa que ficaram de fora, com o motivo (vai para colecao_produtos.motivo_fora_rotina). */
  casaFora: { colecaoId: string; motivo: string }[]
  avisos: string[]
}

/**
 * Candidatos do catálogo para o passo, com as reservas: nenhum passo fica vazio — sem
 * candidato, afrouxa o tipo de pele; num passo básico, por último aceita o básico sem o
 * ativo pedido. A segurança nunca afrouxa.
 */
export function listaDoCatalogo(passo: Passo, ativo: AtivoId | null, catalogo: ProdutoCatalogo[], f: FiltrosPele): ProdutoCatalogo[] {
  let lista = candidatos(passo, ativo, catalogo, f)
  if (!lista.length) lista = candidatos(passo, ativo, catalogo, { ...f, tipoPele: null })
  if (!lista.length && tipoDoPasso(passo) === 'limpeza') {
    lista = candidatos({ ...passo, name: `${passo.name} oleo` }, ativo, catalogo, { ...f, tipoPele: null })
  }
  if (!lista.length && tipoDoPasso(passo) !== 'tratamento' && !(ativo && ATIVOS[ativo].forte)) {
    lista = candidatos(passo, null, catalogo, { ...f, tipoPele: null })
  }
  return lista
}

/**
 * Escolhe o produto de cada passo. `passos` vem na ordem final (manhã depois noite).
 * O mesmo passo repetido de manhã e à noite (mesmo nome) recebe o mesmo produto.
 */
export function escolherProdutos(
  passos: { passo: Passo; periodo: 'am' | 'pm'; ativo: AtivoId | null }[],
  catalogo: ProdutoCatalogo[],
  casa: ItemCasa[],
  f: FiltrosPele,
  idioma: Idioma = 'pt',
): ResultadoProdutos {
  const escolhas: Escolha[] = []
  const usadosCasa = new Map<string, string>()      // colecaoId → nome do passo
  const usadosTratamento = new Map<string, string>() // produto do catálogo → passo de tratamento que o usa
  const casaPorAtivo = new Map<AtivoId, ItemCasa>()  // nunca dois de casa do mesmo ativo
  const porNome = new Map<string, Escolha>()
  const avisos: string[] = []

  for (const { passo, periodo, ativo } of passos) {
    const chave = norm(passo.name)
    const igual = porNome.get(chave)
    if (igual) { escolhas.push({ ...igual, passo, periodo }); continue }

    const deCasa = casa.find((c) =>
      !usadosCasa.has(c.colecaoId) && casaServe(c, passo, ativo, f) &&
      !(ativo && casaPorAtivo.has(ativo) && casaPorAtivo.get(ativo) !== c))
    let lista = listaDoCatalogo(passo, ativo, catalogo, f)
    // O mesmo produto não vai em dois passos de tratamento diferentes (16/nov/2026).
    const ehTrat = ['tratamento', 'olhos'].includes(tipoDoPasso(passo))
    if (ehTrat) {
      const livres = lista.filter((p) => !usadosTratamento.has(p.id) || usadosTratamento.get(p.id) === chave)
      lista = livres
    }
    let principal: ProdutoCatalogo | null = null
    let fora = false
    if (deCasa) {
      usadosCasa.set(deCasa.colecaoId, passo.name)
      if (ativo) casaPorAtivo.set(ativo, deCasa)
    } else {
      principal = lista[0] ?? null
      if (principal && ehTrat) usadosTratamento.set(principal.id, chave)
      fora = !!principal && f.orcamento != null && (principal.faixa_preco ?? 1) > f.orcamento
      if (fora) avisos.push(idioma === 'en' ? avisoOrcamentoEn(passo.name) : `Não achamos um produto para "${passo.name}" dentro do seu orçamento; escolhemos o mais em conta que serve para a sua pele.`)
    }
    const alternativas = lista.filter((p) => p.id !== principal?.id && p.id !== deCasa?.produtoId).slice(0, 2)
    const e: Escolha = { passo, periodo, ativo, casa: deCasa ?? null, principal, alternativas, foraDoOrcamento: fora }
    escolhas.push(e)
    porNome.set(chave, e)
  }

  // Itens de casa que não entraram: por quê.
  const casaFora: { colecaoId: string; motivo: string }[] = []
  for (const c of casa) {
    if (usadosCasa.has(c.colecaoId)) continue
    const forteFora = c.ativos.find((a) => ATIVOS[a].forte && !f.fortesPermitidos.includes(a))
    const motivo = !casaPassaFiltros(c, f)
      ? (forteFora && !f.proibidos.includes(forteFora) && !f.alergiaAtivos.includes(forteFora)
          ? (idioma === 'en' ? casaForaForteEn(forteFora) : `Ele tem ${ATIVOS[forteFora].nome}, um ativo forte que não está na sua rotina agora. Somar mais um ativo forte aumenta o risco de irritação.`)
          : (idioma === 'en' ? CASA_FORA_SEGURANCA_EN : 'Este produto não é indicado para você agora, por segurança.'))
      : (() => {
          const mesmo = c.ativos.find((a) => casaPorAtivo.has(a) && casaPorAtivo.get(a) !== c)
          if (mesmo) return idioma === 'en' ? casaForaRepetidoEn(mesmo) : `Sua rotina já usa outro produto seu com ${ATIVOS[mesmo].nome}; dois iguais não somam resultado.`
          return null
        })()
    if (motivo) casaFora.push({ colecaoId: c.colecaoId, motivo })
  }

  return { escolhas, casaFora, avisos: [...new Set(avisos)] }
}

/** Conferência final: fortes distintos em TODOS os produtos escolhidos (o mesmo ativo conta uma vez). */
export function fortesDaRotina(escolhas: Escolha[]): AtivoId[] {
  const out = new Set<AtivoId>()
  for (const e of escolhas) {
    const lista = e.casa ? e.casa.ativos.filter((a) => ATIVOS[a].forte) : fortesDosCodigos(e.principal?.ativos_principais)
    lista.forEach((a) => out.add(a))
  }
  return [...out]
}

/** Passos que ficaram sem produto (nem de casa nem do catálogo). */
export function passosVazios(escolhas: Escolha[]): Escolha[] {
  return escolhas.filter((e) => !e.casa && !e.principal)
}

/** Ativos lidos num scan de produto (resultado.produto.ativos_detectados) → vocabulário do motor. */
export function ativosDoScan(ativosDetectados: unknown, nome?: string): AtivoId[] {
  const textos = Array.isArray(ativosDetectados) ? ativosDetectados.map(String) : []
  return detectarAtivos(...textos, nome ?? '')
}

// Dores do onboarding → códigos de produtos.concerns.
export const DOR_CONCERN: Record<string, string> = {
  'Acne/espinhas': 'acne', 'Manchas': 'manchas', 'Cravos': 'cravos', 'Oleosidade': 'oleosidade',
  'Rugas': 'rugas', 'Poros dilatados': 'poros', 'Ressecamento': 'ressecamento', 'Textura irregular': 'textura',
}
