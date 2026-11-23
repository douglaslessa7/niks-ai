// Motor da rotina v2 — produtos DE CASA no "Montar minha rotina com o que eu tenho" (lote).
// Só código, sem banco e sem IA (19/nov/2026, plano aprovado pelo produto).
//
// Princípio: produto escaneado = ela já tem em casa. Usar ele poupa tempo e dinheiro, então
// ele tem prioridade sobre o produto do catálogo sempre que fizer o MESMO PAPEL no passo da
// rotina ideal. Fica de fora só quando:
//   · ela não pode usar (corte de segurança: remédio de receita, reação/alergia, memória de
//     reação ao produto, gravidez, isotretinoína, barreira, rosácea, pele sensível com
//     fragrância, ativo forte fora do plano);
//   · é claramente pior para a dor do que o recomendado (concentração abaixo do piso, FPS < 30,
//     salicílico fraco para espinhas) — aí fica o do catálogo, como "Quero comprar";
//   · outro produto de casa faz o mesmo papel e trata melhor a dor principal;
//   · não faz o papel de nenhum passo;
//   · a conferência final (2 fortes, incompatíveis no mesmo turno) precisou tirar.
// Todo produto que fica de fora sai com o motivo numa frase simples.
//
// ⚠️ Pisos de concentração e FPS: PROPOSTOS, valem até a validação com dermatologista.

import { ATIVOS, INCOMPATIVEIS, fortesDosCodigos, ativosDosCodigos, type AtivoId, type Dia } from './ativos.ts'
import { detectarAtivos } from './detectar.ts'
import { DOR_ATIVOS, DOR_NOME, type Dor } from './dores.ts'
import type { PerfilMotor, Plano } from './plano.ts'
import { diasDoPasso, type Passo } from './conferencia.ts'
import { normMarca, normNome, semelhanca } from '../ingredientes.ts'
import { listaDoCatalogo, produtoBateComPasso, tipoDoPasso, type FiltrosPele, type ProdutoCatalogo, type TipoPasso } from './produtos.ts'
import { avaliarProduto, textoReacao } from './reacoes.ts'

const norm = (s: string | null | undefined) => ` ${String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `.replace(/\s+/g, ' ')

// ── Ficha do produto de casa ─────────────────────────────────────────────────────────

export type CategoriaCasa =
  | 'limpeza' | 'limpeza_oleosa' | 'micelar' | 'tonico' | 'serum' | 'esfoliante' | 'tratamento'
  | 'olhos' | 'hidratante' | 'oclusivo' | 'protetor' | 'mascara' | 'outro'

export const CATEGORIAS_CASA: CategoriaCasa[] = [
  'limpeza', 'limpeza_oleosa', 'micelar', 'tonico', 'serum', 'esfoliante', 'tratamento',
  'olhos', 'hidratante', 'oclusivo', 'protetor', 'mascara', 'outro',
]

export interface EntradaFicha {
  indice: number                 // posição no lote (Produto 1, 2, …)
  colecaoId?: string | null
  nome: string
  marca: string
  categoria?: string | null      // a da identificação (lista fechada) ou um texto livre
  inci?: string[] | null         // lista conhecida (tabela de ingredientes)
  concentracoes?: { ingrediente: string; valor: string }[] | null
  fps?: number | null
  corpo?: boolean | null
}

export interface FichaCasa {
  indice: number
  colecaoId: string | null
  nome: string
  marca: string
  categoria: CategoriaCasa
  temLista: boolean
  /** Ativos para SEGURANÇA: nome, concentração impressa e qualquer posição relevante da lista. */
  seguranca: AtivoId[]
  /** Ativos que contam para o PAPEL do produto (o que ele trata de verdade). */
  papel: AtivoId[]
  /** Concentrações conhecidas (%). */
  pct: Partial<Record<AtivoId, number>>
  retinal: boolean
  /** Só LHA / betaína salicilato (sem ácido salicílico de verdade). */
  salicilicoFraco: boolean
  fps: number | null
  corpo: boolean
  fragrancia: boolean
  alcool: boolean
  medicamento: boolean
  /** Nome + lista, normalizados (alergênicos e memória de reação). */
  texto: string
}

// Ingredientes que costumam estar no máximo em 1% (o que vem DEPOIS deles está abaixo disso).
const MARCADOR_1PCT = /^ (phenoxyethanol|fenoxietanol|parfum|fragrance|perfume|aroma|sodium benzoate|potassium sorbate|chlorphenesin|disodium edta|tetrasodium edta|benzyl alcohol|ethylhexylglycerin) $/
// Salicilatos que NÃO são ácido salicílico (filtros solares e fragrância).
const NAO_SALICILICO = /(ethylhexyl|octyl|benzyl|methyl|trolamine|isoamyl|butyloctyl|homo) ?salicylat/
const SALICILICO_FRACO = /(capryloyl salicylic|betaine salicylate|salicilato de betaina|\blha\b)/
const VITC_PURA_ITEM = /^ (l-)?ascorbic acid $|^ acido (l-)?ascorbico $/
const FRAGRANCIA = /^ (parfum|fragrance|perfume|aroma|fragrancia) $/
const ALCOOL = /^ (alcohol denat\.?|alcohol|sd alcohol[^,]*|ethanol|alcool( etilico)?) $/
// "Pró-Adapaleno" (Creamy, adapalenato de oleíla) é cosmético: o "pro" antes não é remédio.
// Nomes comerciais de remédio de receita (sem a lista, o nome é o que se sabe).
const MEDICAMENTO = /((?<!pro[- ]?)\badapalene\b|(?<!pro[- ]?)\badapaleno\b|tretino|isotretino|benzoyl peroxide|peroxido de benzoila|hydroquinone|hidroquinona|clindamic|eritromic|erythromyc|\bepiduo\b|\bvitacid\b|\bdifferin\b|\badacne\b|\bderiva\b|retin-a\b|\bvitanol\b|\bbenzac ac\b|\bacnase\b|\bsolugel\b|\bclindoxyl\b|\bdalacin\b|\bclinagel\b|\bstieva\b)/
// Ativos que agem mesmo em concentração baixa (contam em qualquer posição da lista).
const AGE_EM_POUCO: AtivoId[] = ['retinoide', 'salicilico', 'peroxido']

const ENUM_CAT = new Set<string>(CATEGORIAS_CASA)

/** Categoria do produto: a da identificação (lista fechada) ou deduzida do texto e do nome. */
export function categoriaDe(categoria: string | null | undefined, nome: string): CategoriaCasa {
  const c = String(categoria ?? '').trim().toLowerCase()
  const cn = norm(categoria)
  const t = norm(`${categoria ?? ''} ${nome}`)
  // Limpeza oleosa e micelar primeiro: são "limpeza", mas de outro tipo.
  // Demaquilante líquido conta como a pré-limpeza (como a micelar).
  if (/micelar|micellar|demaquilante|makeup remover|make-up remover/.test(t)) return 'micelar'
  // Palavra inteira: "antioleosidade e limpeza" não é óleo de limpeza.
  if (/\b(oleo|oil|balm|balsamo)\b.{0,20}(limpeza|cleansing|demaquil)|(limpeza|cleansing|demaquil).{0,20}\b(oleo|oil|balm|balsamo)\b/.test(t)) return 'limpeza_oleosa'
  if (ENUM_CAT.has(c)) return c as CategoriaCasa
  const porTexto = (x: string): CategoriaCasa | null => {
    if (/protetor|\bfps\b|\bspf\b|filtro solar|sunscreen|fotoprote/.test(x)) return 'protetor'
    if (/limpeza|limpador|cleanser|sabonete|espuma|\bfoam\b|\bwash\b/.test(x)) return 'limpeza'
    if (/\bolhos?\b|\beye\b|olheira|periocular/.test(x)) return 'olhos'
    if (/tonico|toner|essencia|essence/.test(x)) return 'tonico'
    if (/esfoliante|peeling|exfoli/.test(x)) return 'esfoliante'
    if (/mascara|\bmask\b/.test(x)) return 'mascara'
    if (/serum|ampola|ampoule|booster/.test(x)) return 'serum'
    if (/oclusivo|vaselina|pomada/.test(x)) return 'oclusivo'
    if (/hidratante|\bcreme\b|\bcream\b|gel-creme|moistur|\blocao\b|emulsao|reparador|\bbaume\b|\bbalm\b/.test(x)) return 'hidratante'
    if (/tratamento|secativo|\bspot\b/.test(x)) return 'tratamento'
    return null
  }
  return porTexto(cn) ?? porTexto(norm(nome)) ?? 'outro'
}

function numero(v: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(v)
  return m ? Number(m[1].replace(',', '.')) : null
}

/** Porcentagens escritas no nome ("Tônico Ácido Salicílico 2%", "Niacinamide 10% + Zinc 1%"). */
function pctDoTexto(texto: string): { ativo: AtivoId; pct: number }[] {
  const out: { ativo: AtivoId; pct: number }[] = []
  const re = /(\d+(?:[.,]\d+)?)\s*%/g
  let ultimo = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    const antes = texto.slice(ultimo, m.index)
    ultimo = m.index + m[0].length
    const ativos = detectarAtivos(antes)
    if (ativos.length) out.push({ ativo: ativos[ativos.length - 1], pct: Number(m[1].replace(',', '.')) })
  }
  return out
}

/** Ativos de UM item da lista de ingredientes (INCI), com as correções do vocabulário. */
function ativosDoItem(item: string): { ativos: AtivoId[]; salFraco: boolean } {
  const t = norm(item)
  let ativos = detectarAtivos(item)
  let salFraco = false
  if (ativos.includes('salicilico')) {
    if (NAO_SALICILICO.test(t)) ativos = ativos.filter((a) => a !== 'salicilico')
    else if (SALICILICO_FRACO.test(t)) salFraco = true
  }
  // Vitamina C pura só quando o item é o ácido ascórbico; o resto (ascorbyl…, ascorbate) é derivado.
  if (ativos.includes('vitc_pura') && !VITC_PURA_ITEM.test(t)) ativos = ativos.map((a) => a === 'vitc_pura' ? 'vitc_derivado' : a)
  return { ativos, salFraco }
}

export function montarFicha(e: EntradaFicha): FichaCasa {
  const nome = String(e.nome ?? '').trim()
  const marca = String(e.marca ?? '').trim()
  const inci = Array.isArray(e.inci) && e.inci.length ? e.inci.map(String) : null
  const seguranca = new Set<AtivoId>()
  const papel = new Set<AtivoId>()
  const pct: Partial<Record<AtivoId, number>> = {}
  let salReal = false
  let salFraco = false

  // 1. O nome anuncia o ativo.
  for (const a of detectarAtivos(nome)) { seguranca.add(a); papel.add(a) }
  if (/salicil|salicyl|\bbha\b/.test(norm(nome)) && !SALICILICO_FRACO.test(norm(nome))) salReal = true
  for (const { ativo, pct: p } of pctDoTexto(nome)) { pct[ativo] = p; seguranca.add(ativo); papel.add(ativo) }

  // 2. Concentrações impressas (frente ou tabela de ingredientes).
  for (const c of e.concentracoes ?? []) {
    const { ativos, salFraco: f } = ativosDoItem(String(c?.ingrediente ?? ''))
    const v = numero(String(c?.valor ?? ''))
    for (const a of ativos) {
      seguranca.add(a); papel.add(a)
      if (v != null && v > 0 && v <= 100 && pct[a] == null) pct[a] = v
      if (a === 'salicilico') { if (f) salFraco = true; else salReal = true }
    }
  }

  // 3. Lista de ingredientes: posição relativa ao "marcador de 1%".
  let fragrancia = false
  let alcool = false
  if (inci) {
    const marco = inci.findIndex((i) => MARCADOR_1PCT.test(norm(i)))
    const limite = marco >= 0 ? marco : 15
    inci.forEach((item, i) => {
      const t = norm(item)
      const acima = i < limite
      if (FRAGRANCIA.test(t)) fragrancia = true
      if (acima && ALCOOL.test(t)) alcool = true
      const { ativos, salFraco: f } = ativosDoItem(item)
      for (const a of ativos) {
        // Abaixo de 1%: só o que age em pouca quantidade conta (o ácido lático no fim da
        // lista é corretor de pH, a niacinamida lá embaixo não trata nada).
        if (!acima && !AGE_EM_POUCO.includes(a)) continue
        seguranca.add(a); papel.add(a)
        if (a === 'salicilico') { if (f) salFraco = true; else salReal = true }
      }
    })
  }

  const textoNome = norm(`${marca} ${nome}`)
  const texto = norm(`${marca} ${nome} ${(inci ?? []).join(' , ')}`)
  const fpsNome = /(?:fps|spf)\s*(\d{1,3})/.exec(textoNome)
  let categoria = categoriaDe(e.categoria, nome)
  // "Tratamento" sem nenhum ativo de tratamento e com cara de creme (Cicabio, Cicaplast):
  // é o creme reparador, faz o papel de hidratante (19/nov/2026, teste com lotes reais).
  if (categoria === 'tratamento' && !papel.size && /\b(creme|cream|creme|baume|balm|reparador|cica\w*)\b/.test(norm(nome))) categoria = 'hidratante'
  // Solução/gel de LIMPEZA que veio como tônico: o nome manda.
  if (categoria === 'tonico' && /limpeza|cleanser|cleansing/.test(norm(nome))) categoria = 'limpeza'
  // "Vitamina C" só no nome de sabonete, hidratante ou protetor (sem a lista): é derivado. A
  // regra conservadora (sem classificação = pura, forte) fica para sérum e tratamento.
  const BASICOS: CategoriaCasa[] = ['limpeza', 'limpeza_oleosa', 'micelar', 'hidratante', 'oclusivo', 'protetor']
  const vitcPuraDeVerdade = /\bpura\b|ascorbic acid|acido ascorbico|l-ascorb/.test(texto) || (pct.vitc_pura ?? 0) >= 8
  const trocaVitc = (s: Set<AtivoId>) => {
    if (!inci && BASICOS.includes(categoria) && s.has('vitc_pura') && !vitcPuraDeVerdade) { s.delete('vitc_pura'); s.add('vitc_derivado') }
  }
  trocaVitc(seguranca)
  trocaVitc(papel)
  return {
    indice: e.indice,
    colecaoId: e.colecaoId ?? null,
    nome, marca,
    categoria,
    temLista: !!inci,
    seguranca: [...seguranca],
    papel: [...papel],
    pct,
    retinal: /retinal|retinaldeh/.test(texto),
    salicilicoFraco: salFraco && !salReal,
    fps: typeof e.fps === 'number' && e.fps > 0 ? e.fps : fpsNome ? Number(fpsNome[1]) : null,
    corpo: e.corpo === true || /\b(corpo|corporal|body)\b/.test(textoNome),
    fragrancia,
    alcool,
    medicamento: MEDICAMENTO.test(texto),
    texto,
  }
}

// ── Nomes para os textos ─────────────────────────────────────────────────────────────

function nomeAtivo(a: AtivoId, f?: FichaCasa): string {
  const t = f?.texto ?? ''
  switch (a) {
    case 'salicilico': return 'ácido salicílico'
    case 'aha': return /mandel/.test(t) ? 'ácido mandélico' : /lact|latic/.test(t) ? 'ácido lático' : 'ácido glicólico'
    case 'pha': return 'PHA'
    case 'retinoide': return /retinal|retinaldeh/.test(t) ? 'retinal' : /adapalen/.test(t) ? 'adapalenato' : 'retinol'
    case 'peroxido': return 'peróxido de benzoíla'
    case 'azelaico': return 'ácido azelaico'
    case 'niacinamida': return 'niacinamida'
    // "Pura" só quando a lista diz ácido ascórbico; pelo nome não dá para saber.
    case 'vitc_pura': return /ascorbic acid|acido ascorbico|l-ascorbic/.test(t) ? 'vitamina C pura' : 'vitamina C'
    case 'vitc_derivado': return 'vitamina C'
    case 'tranexamico': return 'ácido tranexâmico'
    case 'alfa_arbutin': return 'alfa-arbutin'
    case 'peptideos': return 'peptídeos'
    case 'ceramidas': return 'ceramidas'
    case 'hialuronico': return 'ácido hialurônico'
    case 'cafeina': return 'cafeína'
  }
}

export function nomeDoProduto(f: { marca?: string | null; nome?: string | null }): string {
  const marca = String(f.marca ?? '').trim()
  const nome = String(f.nome ?? '').trim()
  if (!marca) return nome
  return norm(nome).startsWith(norm(marca).trimEnd()) ? nome : `${marca} ${nome}`
}

// ── Pisos (claramente pior) ──────────────────────────────────────────────────────────

// ⚠️ PROPOSTOS (19/nov/2026), valem até a validação com dermatologista.
export const PISO_PCT: Partial<Record<AtivoId, number>> = {
  salicilico: 0.5, niacinamida: 2, azelaico: 10, aha: 5, vitc_pura: 8, tranexamico: 2, alfa_arbutin: 1,
}
export const PISO_RETINOL = 0.1
export const PISO_RETINAL = 0.05
export const PISO_FPS = 30

const fmtPct = (v: number) => String(v).replace('.', ',')

// ── Contexto e motivos ───────────────────────────────────────────────────────────────

export interface ContextoCasa {
  perfil: PerfilMotor
  plano: Plano
  filtros: FiltrosPele
  /** Texto livre da alergia/reação do perfil (users.allergy_description). */
  alergiaDescricao: string | null
  memorias: { type?: string; value?: string }[]
  /** Fortes do plano efetivo (os únicos que podem entrar). */
  fortesPermitidos: AtivoId[]
  /** Ativos do plano efetivo. */
  ativosDoPlano: AtivoId[]
}

export type TipoMotivo =
  | 'medicamento' | 'reacao' | 'memoria' | 'gravidez' | 'isotretinoina' | 'barreira' | 'rosacea'
  | 'sensivel' | 'forte' | 'pior' | 'repetido' | 'conflito' | 'sem_passo' | 'duplicado'

export interface Motivo { tipo: TipoMotivo; texto: string }

/** Cortes de segurança: ela não pode usar → nunca entra. */
const SEGURANCA: TipoMotivo[] = ['reacao', 'memoria', 'gravidez', 'isotretinoina', 'barreira', 'rosacea', 'sensivel']
export const ehCorteDeSeguranca = (m: Motivo | null | undefined) => !!m && SEGURANCA.includes(m.tipo)

// Reação a uma CATEGORIA inteira, dita no perfil ("protetor solar").
const REACAO_CATEGORIA: { re: RegExp; cats: CategoriaCasa[]; catalogo: string[]; rotulo: string }[] = [
  { re: /protetor|filtro solar|\bfps\b|sunscreen|fotoprote/, cats: ['protetor'], catalogo: ['protetor_solar'], rotulo: 'protetor solar' },
  { re: /hidratante/, cats: ['hidratante', 'oclusivo'], catalogo: ['hidratante', 'oclusivo'], rotulo: 'hidratante' },
  { re: /sabonete|gel de limpeza|limpeza facial/, cats: ['limpeza'], catalogo: ['limpeza'], rotulo: 'sabonete' },
]

// Alergênicos do perfil (mesmos códigos de catalogo.alergenosCortados) → o produto tem?
const ALERGENO: Record<string, { tem: (f: FichaCasa) => boolean; rotulo: string }> = {
  fragrancia: { tem: (f) => f.fragrancia, rotulo: 'fragrância' },
  aha_bha: { tem: (f) => f.seguranca.some((a) => a === 'aha' || a === 'salicilico' || a === 'pha'), rotulo: 'ácidos' },
  oleos_essenciais: { tem: (f) => /essential oil|oleo essencial|melaleuca|lavandula|eucalyptus|mentha/.test(f.texto), rotulo: 'óleos essenciais' },
  vitamina_c: { tem: (f) => f.seguranca.some((a) => a === 'vitc_pura' || a === 'vitc_derivado'), rotulo: 'vitamina C' },
  centella: { tem: (f) => /centella|madecassos|asiaticosid|\bcica\b/.test(f.texto), rotulo: 'centella' },
  alcool: { tem: (f) => f.alcool, rotulo: 'álcool' },
  niacinamida_alta: { tem: (f) => f.papel.includes('niacinamida'), rotulo: 'niacinamida' },
  propolis: { tem: (f) => /propolis|propole/.test(f.texto), rotulo: 'própolis' },
  retinoides: { tem: (f) => f.seguranca.includes('retinoide'), rotulo: 'retinoides' },
}

const REACAO_MEMORIA = /(reac|reag|irrit|alerg|ardeu|ardencia|ardor|coceira|vermelhid|descam|queimou|queimacao|sensibiliz)/
const GENERICAS = new Set([
  'serum', 'creme', 'cream', 'facial', 'hidratante', 'limpeza', 'protetor', 'solar', 'control', 'controle',
  'oleosidade', 'antioleosidade', 'tonico', 'acido', 'toque', 'seco', 'skin', 'care', 'skincare', 'intense',
  'intensivo', 'light', 'locao', 'fluido', 'fluid', 'dermatologico', 'antiacne', 'acne', 'gel', 'espuma',
  'clareador', 'uniformizador', 'reparador', 'calmante', 'diario', 'invisible', 'toque', 'matte', 'mattifying',
  'niacinamida', 'niacinamide', 'salicilico', 'hialuronico', 'vitamina', 'retinol', 'olhos', 'cleanser',
  'moisturizer', 'sunscreen', 'water', 'agua', 'micelar', 'solution', 'solucao', 'tratamento', 'ampola',
  'ampoule', 'essence', 'essencia', 'toner', 'pele', 'rosto', 'derma', 'dermo', 'sensitive', 'sensivel',
])
function marcasDistintas(f: FichaCasa): string[] {
  const palavras = norm(`${f.marca} ${f.nome}`).trim().split(' ')
  return [...new Set(palavras.filter((p) => p.length >= 5 && !GENERICAS.has(p) && !/^\d/.test(p)))]
}

/** A memória do chat diz que ela teve reação com ESTE produto (cita a marca ou o nome)? */
export function memoriaDeReacao(f: FichaCasa, memorias: { type?: string; value?: string }[]): boolean {
  const chaves = marcasDistintas(f)
  if (!chaves.length) return false
  return memorias.some((m) => {
    const v = norm(m?.value)
    if (!(m?.type === 'product_reaction' || REACAO_MEMORIA.test(v))) return false
    return chaves.some((k) => v.includes(` ${k} `) || v.includes(` ${k},`) || v.includes(`(${k}`))
  })
}

const SAI_COM_AGUA: CategoriaCasa[] = ['limpeza', 'limpeza_oleosa']

function fortesDe(f: FichaCasa): AtivoId[] {
  return f.seguranca.filter((a) => ATIVOS[a].forte)
}

/** Ela não pode usar este produto? (null = pode). */
export function corteDeSeguranca(f: FichaCasa, ctx: ContextoCasa): Motivo | null {
  if (f.medicamento) return { tipo: 'medicamento', texto: 'Use como seu dermatologista orientou.' }

  // Reação/alergia do perfil.
  const desc = norm(ctx.alergiaDescricao)
  for (const r of REACAO_CATEGORIA) {
    if (r.re.test(desc) && r.cats.includes(f.categoria)) return { tipo: 'reacao', texto: `Você marcou reação a ${r.rotulo}, então ele fica fora.` }
  }
  for (const cod of ctx.filtros.alergenosCortados) {
    const a = ALERGENO[cod]
    if (a?.tem(f)) return { tipo: 'reacao', texto: `Você marcou reação a ${a.rotulo}, então ele fica fora.` }
  }
  // 23/nov/2026: por ingrediente (glicólico leve não tira o lático; forte tira a família).
  const porReacao = avaliarProduto({ ativos: f.seguranca, texto: f.texto }, ctx.filtros.reacoes ?? [])
  if (porReacao?.tipo === 'bloqueia') return { tipo: 'reacao', texto: textoReacao(porReacao) }
  const alerg = f.seguranca.find((a) => ctx.filtros.alergiaAtivos.includes(a))
  if (alerg) return { tipo: 'reacao', texto: `Você marcou reação a ${nomeAtivo(alerg, f)}, então ele fica fora.` }

  // Memória de reação a este produto.
  if (memoriaDeReacao(f, ctx.memorias)) return { tipo: 'memoria', texto: 'Você contou que teve reação com ele, então ele fica fora.' }

  // Gravidez, amamentação ou tentante.
  if (ctx.perfil.gravida) {
    const a = f.seguranca.find((x) => !ATIVOS[x].seguroGravidez)
    if (a) return { tipo: 'gravidez', texto: `Tem ${nomeAtivo(a, f)}, que a gente evita na gravidez e na amamentação.` }
  }

  // Isotretinoína: nenhum ativo forte.
  if (ctx.perfil.isotretinoina) {
    const a = fortesDe(f)[0]
    if (a) return { tipo: 'isotretinoina', texto: `Tem ${nomeAtivo(a, f)}. Enquanto você toma isotretinoína, só cuidados suaves entram.` }
  }

  // Barreira e rosácea (o que o plano proibiu por segurança).
  for (const a of f.seguranca) {
    const m = ctx.plano.proibidos[a]
    if (m === 'barreira') return { tipo: 'barreira', texto: `Tem ${nomeAtivo(a, f)}, que pode irritar enquanto sua barreira se recupera.` }
    if (m === 'rosacea') return { tipo: 'rosacea', texto: `Tem ${nomeAtivo(a, f)}, que pode irritar a vermelhidão e a sensibilidade da sua pele.` }
  }

  // Pele sensível: fragrância em produto que fica na pele (limpeza sai com água).
  if (ctx.filtros.sensivel && f.fragrancia && !['limpeza', 'limpeza_oleosa', 'micelar'].includes(f.categoria)) {
    return { tipo: 'sensivel', texto: 'Tem fragrância, e sua pele é sensível.' }
  }

  // Ativo forte fora do plano (estouraria o limite de 2 fortes).
  // Produto que sai com água (sabonete, óleo de limpeza) pode trazer um forte fora do plano:
  // a conferência final é que garante no máximo 2 fortes e nenhum conflito (19/nov/2026).
  const fora = fortesDe(f).find((a) => !ctx.fortesPermitidos.includes(a))
  if (fora && !SAI_COM_AGUA.includes(f.categoria)) return { tipo: 'forte', texto: textoForte(fora, f, ctx) }
  return null
}

function textoForte(a: AtivoId, f: FichaCasa, ctx: ContextoCasa): string {
  return ctx.fortesPermitidos.length >= ctx.plano.limiteFortes
    ? `Tem ${nomeAtivo(a, f)}, e sua rotina já tem 2 ativos fortes.`
    : `Tem ${nomeAtivo(a, f)}, um ativo forte que não está na sua rotina agora. Somar mais um ativo forte aumenta o risco de irritação.`
}

// ── Faz o mesmo papel? ───────────────────────────────────────────────────────────────

const CATS_TRATAMENTO: CategoriaCasa[] = ['serum', 'tratamento', 'esfoliante', 'tonico']

/** O produto de casa faz o mesmo papel do passo? (só o papel; segurança e piso são à parte) */
export function fazOPapel(f: FichaCasa, passo: Passo, ativo: AtivoId | null, ctx: Pick<ContextoCasa, 'ativosDoPlano'>): boolean {
  const tipo = tipoDoPasso(passo)
  const t = norm(`${passo.name} ${passo.ingredient}`)
  const temAtivo = !ativo || f.papel.includes(ativo)
  switch (tipo) {
    case 'protetor': return f.categoria === 'protetor' && !f.corpo
    case 'limpeza':
      if (/micelar/.test(t)) return f.categoria === 'micelar'
      if (/oleo|balm|balsamo|\boil\b/.test(t)) return f.categoria === 'limpeza_oleosa'
      return f.categoria === 'limpeza' && temAtivo
    case 'tonico': return f.categoria === 'tonico' && temAtivo
    // Cafeína: confirmada pela lista; sem a lista, benefício da dúvida (creme de olhos serve).
    case 'olhos': return f.categoria === 'olhos' && (ativo !== 'cafeina' || f.papel.includes('cafeina') || !f.temLista)
    case 'hidratante': {
      const oclusivo = /oclusivo|vaselina|esqualano/.test(t)
      const ok = oclusivo ? f.categoria === 'oclusivo' : f.categoria === 'hidratante' || f.categoria === 'oclusivo'
      return ok && temAtivo
    }
    case 'tratamento': {
      if (!CATS_TRATAMENTO.includes(f.categoria)) return false
      if (!ativo) return false
      if (!f.papel.includes(ativo) || !produtoBateComPasso(f.nome, ativo)) return false
      // Não traz outro forte, nem outro ativo "uma vez por dia" do plano (somaria no mesmo dia).
      return !f.seguranca.some((a) => a !== ativo &&
        (ATIVOS[a].forte || (ATIVOS[a].umaVezAoDia && ctx.ativosDoPlano.includes(a))))
    }
  }
}

/** Claramente pior para a dor do que o recomendado? (só tratamento e protetor) */
export function claramentePior(f: FichaCasa, passo: Passo, ativo: AtivoId | null, ctx: Pick<ContextoCasa, 'plano'>): Motivo | null {
  const tipo = tipoDoPasso(passo)
  if (tipo === 'protetor' && f.fps != null && f.fps < PISO_FPS) {
    return { tipo: 'pior', texto: `FPS ${f.fps} protege pouco; o rosto precisa de FPS ${PISO_FPS} ou mais.` }
  }
  if (tipo !== 'tratamento' || !ativo) return null
  const dores = ctx.plano.ativos.find((e) => e.ativo === ativo)?.dores ?? []
  const dor = dores[0] ? DOR_NOME[dores[0]] : null
  if (ativo === 'salicilico' && f.salicilicoFraco && (ctx.plano.marcadas.includes('Acne/espinhas') || dores.includes('Acne/espinhas'))) {
    return { tipo: 'pior', texto: 'Tem um tipo mais fraco de ácido salicílico; para espinhas, o ideal é o ácido salicílico puro.' }
  }
  const piso = ativo === 'retinoide' ? (f.retinal ? PISO_RETINAL : PISO_RETINOL) : PISO_PCT[ativo]
  const p = f.pct[ativo]
  if (piso != null && p != null && p < piso) {
    return { tipo: 'pior', texto: `Tem pouco ${nomeAtivo(ativo, f)}${dor ? `; para ${dor}, o ideal é a partir de ${fmtPct(piso)}%` : `; o ideal é a partir de ${fmtPct(piso)}%`}.` }
  }
  return null
}

// ── Desempate entre dois produtos de casa ────────────────────────────────────────────

// Hidratante mais rico (reparador, bálsamo, noturno) × mais leve (gel, toque seco).
const RICO = /(baume|\bbalm\b|balsamo|\brich\b|nutri|noturn|\bnight\b|sleeping|repair|reparador|cicaplast|cicabio|\bb5\b|pomada|ointment)/
export const ehRico = (f: FichaCasa) => f.categoria === 'oclusivo' || RICO.test(f.texto)

/** Ordem de preferência entre produtos de casa no MESMO passo (o primeiro número que difere decide). */
function pontos(f: FichaCasa, plano: Plano, d?: { passo: Passo; periodo: 'am' | 'pm' }): number[] {
  const principal = plano.marcadas[0]
  const tratam = (x: Dor) => (DOR_ATIVOS[x] ?? []).some((a) => f.papel.includes(a))
  const tipo = d ? tipoDoPasso(d.passo) : null
  return [
    principal && tratam(principal) ? 1 : 0,          // trata a dor principal
    plano.marcadas.filter(tratam).length,            // quantas dores dela trata
    tipo === 'protetor' ? f.fps ?? 0 : 0,             // protetor: FPS maior
    tipo === 'hidratante' ? (ehRico(f) === (d!.periodo === 'pm') ? 1 : 0) : 0, // leve de manhã, rico à noite
    f.temLista ? 1 : 0,                               // lista de ingredientes conhecida
    -f.indice,                                        // o escaneado primeiro
  ]
}
function melhor(a: FichaCasa, b: FichaCasa, plano: Plano, d?: { passo: Passo; periodo: 'am' | 'pm' }): number {
  const pa = pontos(a, plano, d)
  const pb = pontos(b, plano, d)
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i]
  return 0
}
// "a sua oleosidade", "os seus cravos", "as suas manchas"…
const POSSESSIVO: Record<Dor, string> = {
  'Acne/espinhas': 'as suas', 'Manchas': 'as suas', 'Cravos': 'os seus', 'Oleosidade': 'a sua', 'Rugas': 'as suas',
  'Poros dilatados': 'os seus', 'Olheiras': 'as suas', 'Ressecamento': 'o seu', 'Textura irregular': 'a sua',
}
function textoRepetido(vencedor: FichaCasa, plano: Plano, perdedor?: FichaCasa): string {
  // O mesmo produto escaneado duas vezes.
  if (perdedor && norm(nomeDoProduto(perdedor)) === norm(nomeDoProduto(vencedor))) {
    return 'Você escaneou este produto duas vezes; ele já está na sua rotina.'
  }
  const d = plano.marcadas.find((x) => (DOR_ATIVOS[x] ?? []).some((a) => vencedor.papel.includes(a)))
  return d
    ? `Sua rotina já usa o ${nomeDoProduto(vencedor)}, que trata melhor ${POSSESSIVO[d]} ${DOR_NOME[d]}.`
    : `Sua rotina já usa o ${nomeDoProduto(vencedor)}, que faz o mesmo papel.`
}

// ── Decisão do lote ──────────────────────────────────────────────────────────────────

export interface PassoLote { passo: Passo; periodo: 'am' | 'pm'; ativo: AtivoId | null }

export interface DecisaoPasso {
  passo: Passo
  periodo: 'am' | 'pm'
  ativo: AtivoId | null
  casa: FichaCasa | null
  principal: ProdutoCatalogo | null
  alternativas: ProdutoCatalogo[]
  /** Passo que não está na rotina ideal: a pré-limpeza da noite com o óleo/micelar dela. */
  extra?: boolean
  /** Passo sem produto (ex.: reação a protetor solar), com o porquê. */
  semProduto?: string | null
}

export interface ResultadoCasa {
  passos: DecisaoPasso[]
  fora: { ficha: FichaCasa; motivo: Motivo }[]
  /** Registro das trocas da conferência final (log). */
  conferencia: string[]
}


// Palavras que a leitura às vezes junta ao nome e não distinguem o produto ("Creamy skincare Solução").
const NAO_DISTINGUE = /\b(skincare|skin care|dermocosmeticos?|laboratorio|cosmeticos?)\b/g

/**
 * Cópias do mesmo produto no lote → índice do registro que fica (o mais completo: com lista
 * de ingredientes, depois com mais ativos lidos, depois o fotografado primeiro). Mesma marca
 * e nome com semelhança ≥ 0,8 (a mesma régua da tabela de ingredientes, que já separa sérum
 * × solução da mesma linha, FPS e versões diferentes).
 */
export function duplicatas(fichas: FichaCasa[]): Map<number, number> {
  const chave = (x: FichaCasa) => ({ marca: normMarca(x.marca), nome: normNome(x.nome, x.marca).replace(NAO_DISTINGUE, ' ').replace(/\s+/g, ' ').trim() })
  const rica = (a: FichaCasa, b: FichaCasa) =>
    (Number(b.temLista) - Number(a.temLista)) || (b.papel.length - a.papel.length) || (a.indice - b.indice)
  const copiaDe = new Map<number, number>()
  const grupos: FichaCasa[][] = []
  for (const x of fichas) {
    const k = chave(x)
    const g = grupos.find((g) => {
      const y = chave(g[0])
      // Mesma categoria também: a semelhança ignora palavras descritivas ("solução"), e juntar
      // dois produtos diferentes por engano tiraria um da rotina.
      return !!k.marca && k.marca === y.marca && x.categoria === g[0].categoria &&
        !!k.nome && !!y.nome && (k.nome === y.nome || semelhanca(k.nome, y.nome) >= 0.8)
    })
    if (g) g.push(x); else grupos.push([x])
  }
  for (const g of grupos) {
    if (g.length < 2) continue
    const [principal, ...copias] = [...g].sort(rica)
    for (const c of copias) copiaDe.set(c.indice, principal.indice)
  }
  return copiaDe
}

const REUSO_BASICO: TipoPasso[] = ['limpeza', 'hidratante']
const EH_TRAT = (p: Passo) => ['tratamento', 'olhos'].includes(tipoDoPasso(p))

export function decidirCasa(
  passos: PassoLote[], fichas: FichaCasa[], catalogo: ProdutoCatalogo[], f: FiltrosPele, ctx: ContextoCasa,
): ResultadoCasa {
  // O mesmo produto escaneado duas vezes no lote: só o registro mais completo é decidido; a
  // cópia sai com o motivo DELE (nunca com um motivo diferente).
  const copiaDe = duplicatas(fichas)
  const unicas = fichas.filter((x) => !copiaDe.has(x.indice))
  const cortes = new Map<number, Motivo>()
  for (const x of unicas) { const m = corteDeSeguranca(x, ctx); if (m) cortes.set(x.indice, m) }
  const aptas = unicas.filter((x) => !cortes.has(x.indice))
  const tentativos = new Map<number, Motivo[]>()
  const anota = (x: FichaCasa, m: Motivo) => tentativos.set(x.indice, [...(tentativos.get(x.indice) ?? []), m])
  const finais = new Map<number, Motivo>()     // tirados pela conferência (não voltam)
  const conferencia: string[] = []
  const decisoes: DecisaoPasso[] = []

  // Hidratante: faz o papel qualquer hidratante/creme (critério aprovado), sem exigir o ativo
  // do nome do passo ("Hidratante com Ceramidas"). Limpeza: o ativo só é exigido quando ele
  // não tem passo de tratamento próprio (senão o plano perderia o ativo).
  const emTratamento = new Set(passos.filter((p) => !['limpeza', 'hidratante', 'protetor'].includes(tipoDoPasso(p.passo)) && p.ativo).map((p) => p.ativo!))
  const ativoExigido = (d: { passo: Passo; ativo: AtivoId | null }) => {
    const tipo = tipoDoPasso(d.passo)
    if (tipo === 'hidratante') return null
    return d.ativo && tipo === 'limpeza' && emTratamento.has(d.ativo) ? null : d.ativo
  }

  // O produto de casa está livre para este passo? (limpeza e hidratante: o mesmo de manhã e de noite)
  const livre = (x: FichaCasa, d: { passo: Passo; periodo: 'am' | 'pm' }, ignorar?: DecisaoPasso) => {
    const tipo = tipoDoPasso(d.passo)
    const usos = decisoes.filter((y) => y !== ignorar && y.casa?.indice === x.indice)
    if (!usos.length) return true
    const mesmoNome = usos.every((y) => norm(y.passo.name) === norm(d.passo.name))
    return mesmoNome || (REUSO_BASICO.includes(tipo) && usos.every((y) => tipoDoPasso(y.passo) === tipo && y.periodo !== d.periodo && !y.extra))
  }

  // Produtos de casa que servem no passo, os bons em ordem e os "claramente piores".
  const opcoesDeCasa = (d: { passo: Passo; periodo: 'am' | 'pm'; ativo: AtivoId | null }, ignorar?: DecisaoPasso) => {
    const cands = aptas.filter((x) => !finais.has(x.indice) && livre(x, d, ignorar) && fazOPapel(x, d.passo, ativoExigido(d), ctx))
    const piores = new Map<number, Motivo>()
    for (const x of cands) { const m = claramentePior(x, d.passo, d.ativo, ctx); if (m) piores.set(x.indice, m) }
    let boas = cands.filter((x) => !piores.has(x.indice)).sort((a, b) => melhor(a, b, ctx.plano, d))
    // Dois hidratantes em casa: usa os dois (um de manhã, outro à noite) antes de repetir o mesmo.
    if (tipoDoPasso(d.passo) === 'hidratante') {
      const usado = (x: FichaCasa) => decisoes.some((y) => y !== ignorar && y.casa?.indice === x.indice)
      boas = [...boas.filter((x) => !usado(x)), ...boas.filter(usado)]
    }
    return { boas, cands, piores }
  }

  const catalogoDoPasso = (d: { passo: Passo; ativo: AtivoId | null }, ignorar?: DecisaoPasso) => {
    let lista = listaDoCatalogo(d.passo, d.ativo, catalogo, f)
    // O mesmo produto do catálogo não vai em dois passos de tratamento diferentes.
    if (EH_TRAT(d.passo)) {
      lista = lista.filter((p) => !decisoes.some((z) => z !== ignorar && z.principal?.id === p.id && EH_TRAT(z.passo) && norm(z.passo.name) !== norm(d.passo.name)))
    }
    return lista
  }

  // 1. Cada passo da rotina ideal: o produto de casa que faz o mesmo papel; senão o do catálogo.
  for (const { passo, periodo, ativo } of passos) {
    const d: DecisaoPasso = { passo, periodo, ativo, casa: null, principal: null, alternativas: [] }
    const { boas, cands, piores } = opcoesDeCasa(d)
    d.casa = boas[0] ?? null
    for (const x of boas.slice(1)) anota(x, { tipo: 'repetido', texto: textoRepetido(d.casa!, ctx.plano, x) })
    if (!d.casa) for (const x of cands) anota(x, piores.get(x.indice)!)
    const lista = catalogoDoPasso(d)
    d.principal = d.casa ? null : lista[0] ?? null
    d.alternativas = lista.filter((p) => p.id !== d.principal?.id).slice(0, 2)
    decisoes.push(d)
  }

  // 2. Dupla limpeza (só à noite): óleo, bálsamo ou micelar dela ANTES de um gel/espuma.
  const preLimpeza = aptas.find((x) => (x.categoria === 'limpeza_oleosa' || x.categoria === 'micelar') && !decisoes.some((d) => d.casa?.indice === x.indice))
  if (preLimpeza) {
    const i = decisoes.findIndex((d) => d.periodo === 'pm' && tipoDoPasso(d.passo) === 'limpeza' &&
      (d.casa ? d.casa.categoria === 'limpeza' : d.principal?.categoria === 'limpeza'))
    if (i >= 0) {
      const micelar = preLimpeza.categoria === 'micelar'
      decisoes.splice(i, 0, {
        passo: {
          name: micelar ? 'Água Micelar' : 'Óleo de Limpeza',
          ingredient: micelar ? 'Água Micelar' : 'Óleo ou Bálsamo de Limpeza',
          instruction: 'Use antes do gel de limpeza para tirar o protetor e a maquiagem. Depois, lave o rosto normalmente.',
          steps: micelar
            ? ['Aplique num algodão.', 'Passe no rosto todo, sem esfregar.', 'Siga com o gel de limpeza.']
            : ['Espalhe no rosto seco.', 'Massageie por 30 segundos.', 'Enxágue e siga com o gel de limpeza.'],
          color: '#E8F4FD', waitTime: null, ativo: null, dias: null,
        },
        periodo: 'pm', ativo: null, casa: preLimpeza, principal: null, alternativas: [], extra: true,
      })
    }
  }

  // 2b. Sérum suave de casa sem passo no plano (centella, peptídeos, hialurônico…) entra como
  //     passo extra: no máximo 1 por turno, sem ativo forte, sem um ativo que o plano já trata
  //     em outro passo, e só com ativos que podem naquele turno (19/nov/2026: usar o máximo
  //     do que ela já tem). Antes dos olhos/hidratante/protetor do turno.
  const suave = (x: FichaCasa) => x.categoria === 'serum' && !fortesDe(x).length &&
    !x.papel.some((a) => ctx.ativosDoPlano.includes(a)) && !decisoes.some((d) => d.casa?.indice === x.indice)
  for (const per of ['am', 'pm'] as const) {
    const pode = (x: FichaCasa) => suave(x) && x.papel.every((a) => ATIVOS[a].periodos.includes(per))
    const x = aptas.filter(pode).sort((a, b) => melhor(a, b, ctx.plano))[0]
    if (!x) continue
    const a = x.papel[0]
    const modelo = a ? ATIVOS[a].passoModelo : null
    const passo: Passo = {
      name: modelo?.nome ?? 'Sérum',
      ingredient: modelo?.ingrediente ?? 'Sérum',
      instruction: 'Aplique algumas gotas no rosto todo, depois da limpeza e antes do hidratante.',
      steps: ['Aplique algumas gotas na pele limpa.', 'Espalhe pelo rosto todo.', 'Espere absorver antes do próximo passo.'],
      color: modelo?.cor ?? '#EDE8FD', waitTime: null, ativo: null, dias: null,
    }
    const fim = decisoes.findIndex((d) => d.periodo === per && ['olhos', 'hidratante', 'protetor'].includes(tipoDoPasso(d.passo)))
    const ultimoDoTurno = decisoes.map((d) => d.periodo).lastIndexOf(per)
    const i = fim >= 0 ? fim : ultimoDoTurno + 1
    decisoes.splice(i, 0, { passo, periodo: per, ativo: null, casa: x, principal: null, alternativas: [], extra: true })
  }

  // 3. Conferência final (regra 7). Tirar um produto de casa de um passo: outro produto de
  //    casa que sirva tenta o lugar; senão volta o do catálogo.
  const tirarCasa = (alvo: DecisaoPasso, m: Motivo, porque: string, soPeriodo?: 'am' | 'pm') => {
    const x = alvo.casa!
    conferencia.push(`${porque}: tirou ${nomeDoProduto(x)} de "${alvo.passo.name}" (${alvo.periodo})`)
    finais.set(x.indice, m)
    for (let i = decisoes.length - 1; i >= 0; i--) {
      const y = decisoes[i]
      if (y.casa?.indice !== x.indice || (soPeriodo && y.periodo !== soPeriodo)) continue
      if (y.extra) { decisoes.splice(i, 1); continue }
      y.casa = opcoesDeCasa(y, y).boas[0] ?? null
      const lista = y.casa ? [] : catalogoDoPasso(y, y)
      y.principal = lista[0] ?? null
      y.alternativas = lista.slice(1, 3)
      if (y.casa) conferencia.push(`  → no lugar: ${nomeDoProduto(y.casa)}`)
    }
  }
  const ativosDe = (d: DecisaoPasso): AtivoId[] => d.casa ? [...new Set([...d.casa.papel, ...fortesDe(d.casa)])] : ativosDosCodigos(d.principal?.ativos_principais)
  const fortesDaDecisao = (d: DecisaoPasso): AtivoId[] => d.casa ? fortesDe(d.casa) : fortesDosCodigos(d.principal?.ativos_principais)

  // a) No máximo 2 fortes (TODOS os produtos; o mesmo ativo conta uma vez). Forte fora do plano
  //    só num produto que sai com água; se estourar, sai primeiro esse.
  const enxague = (d: DecisaoPasso) => !!d.casa && SAI_COM_AGUA.includes(d.casa.categoria)
  for (let volta = 0; volta < 10; volta++) {
    const fortes = new Set(decisoes.flatMap(fortesDaDecisao))
    const extras = [...fortes].filter((a) => !ctx.fortesPermitidos.includes(a) &&
      decisoes.some((d) => !enxague(d) && fortesDaDecisao(d).includes(a)))
    const estourou = fortes.size > ctx.plano.limiteFortes
    if (!estourou && !extras.length) break
    const culpa = (d: DecisaoPasso) => !!d.casa && fortesDaDecisao(d).some((a) => extras.includes(a) || (estourou && a !== d.ativo))
    const alvo = decisoes.find((d) => culpa(d) && enxague(d) && fortesDaDecisao(d).some((a) => !ctx.fortesPermitidos.includes(a))) ??
      decisoes.find(culpa)
    if (!alvo) break
    const a = fortesDaDecisao(alvo).find((x) => !ctx.fortesPermitidos.includes(x)) ?? fortesDaDecisao(alvo).find((x) => x !== alvo.ativo)!
    tirarCasa(alvo, { tipo: 'forte', texto: textoForte(a, alvo.casa!, ctx) }, 'fortes')
  }

  // b) Incompatíveis no mesmo turno e nos mesmos dias (ex.: ácido forte × retinoide na mesma noite).
  //    Sai o produto de casa que trouxe um ativo que não é o do passo dele.
  const cruzam = (x: Dia[] | null, y: Dia[] | null) => !x || !y || x.some((d) => y.includes(d))
  for (let volta = 0; volta < 20; volta++) {
    let achou: { d: DecisaoPasso; traz: AtivoId; outro: AtivoId } | null = null
    for (const per of ['am', 'pm'] as const) {
      const doTurno = decisoes.filter((d) => d.periodo === per && (d.casa || d.principal))
      for (const [a, b] of INCOMPATIVEIS) {
        for (const x of doTurno) for (const y of doTurno) {
          if (achou || x === y || !ativosDe(x).includes(a) || !ativosDe(y).includes(b)) continue
          if (!cruzam(diasDoPasso(x.passo), diasDoPasso(y.passo))) continue
          if (x.casa && x.ativo !== a) achou = { d: x, traz: a, outro: b }
          else if (y.casa && y.ativo !== b) achou = { d: y, traz: b, outro: a }
        }
      }
    }
    if (!achou) break
    tirarCasa(achou.d, {
      tipo: 'conflito',
      texto: `Tem ${nomeAtivo(achou.traz, achou.d.casa!)}, que não combina com o ${nomeAtivo(achou.outro)} da sua rotina no mesmo dia.`,
    }, 'incompatível', achou.d.periodo)
  }

  // c) Uma limpeza de cada tipo por período (a pré-limpeza é de outro tipo).
  for (const per of ['am', 'pm'] as const) {
    const principais = decisoes.filter((d) => d.periodo === per && !d.extra && tipoDoPasso(d.passo) === 'limpeza')
    for (const d of principais.slice(1)) {
      if (d.casa) tirarCasa(d, { tipo: 'repetido', texto: 'Sua rotina já tem uma limpeza desse tipo neste horário.' }, 'limpeza dupla', per)
    }
  }

  // d) Nunca sugerir algo que ela tem reação (o do catálogo também: reação a uma categoria inteira).
  const desc = norm(ctx.alergiaDescricao)
  for (const r of REACAO_CATEGORIA) {
    if (!r.re.test(desc)) continue
    for (const d of decisoes) {
      if (!d.casa && d.principal && r.catalogo.includes(d.principal.categoria)) {
        conferencia.push(`reação a ${r.rotulo}: "${d.passo.name}" ficou sem produto do catálogo`)
        d.principal = null
        d.alternativas = []
        d.semProduto = `Você marcou reação a ${r.rotulo}. Fale com seu dermatologista para escolher um que sirva para você.`
      }
    }
  }

  // e) Passos essenciais preenchidos: um passo sem produto fica registrado, com o motivo.
  for (const d of decisoes) {
    if (!d.casa && !d.principal && !d.semProduto) {
      conferencia.push(`sem produto: "${d.passo.name}" (${d.periodo})`)
      d.semProduto = 'Ainda não temos um produto no catálogo para este passo.'
    }
  }

  // Quem ficou de fora, com o motivo.
  const naRotina = new Set(decisoes.filter((d) => d.casa).map((d) => d.casa!.indice))
  const fora: ResultadoCasa['fora'] = []
  for (const x of unicas) {
    if (naRotina.has(x.indice)) continue
    const t = tentativos.get(x.indice) ?? []
    const m = cortes.get(x.indice) ?? finais.get(x.indice)
      ?? t.find((y) => y.tipo === 'repetido') ?? t[0]
      ?? { tipo: 'sem_passo' as const, texto: 'Não tem um passo para ele na sua rotina agora.' }
    fora.push({ ficha: x, motivo: m })
  }
  for (const x of fichas) {
    const principal = copiaDe.get(x.indice)
    if (principal == null) continue
    const m = fora.find((y) => y.ficha.indice === principal)?.motivo
    fora.push({
      ficha: x,
      motivo: !m
        ? { tipo: 'duplicado', texto: 'Você escaneou este produto duas vezes; ele já está na sua rotina.' }
        : { tipo: m.tipo, texto: `Você escaneou este produto duas vezes. ${m.texto}` },
    })
  }
  fora.sort((a, b) => a.ficha.indice - b.ficha.indice)
  return { passos: decisoes, fora, conferencia }
}
