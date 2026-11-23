// Reações declaradas pela usuária (users.allergy_description, texto livre) → restrições
// por INGREDIENTE, não pela família inteira (decisão do produto, 23/nov/2026).
//
// Leitura do texto:
//   · nome específico ("ácido glicólico", "salicílico", "Vitacid") → aquele ingrediente;
//   · termo genérico ("ácidos", "peeling", "esfoliante", "AHA") → a família inteira;
//   · "ácido" dentro de um nome ("ácido azelaico", "ácido hialurônico") não conta como família.
// Intensidade: marcador "(leve)" / "(forte)" no texto (a coluna users.reacoes vem na 1.64).
// Sem marcador = FORTE (decisão do produto para as contas antigas).
//
// Efeito:
//   · LEVE: sai só o ingrediente. Na mesma família, só produto suave/moderado em que se sabe
//     qual é o ingrediente (ex.: glicólico → lático/mandélico); os outros ficam "com ressalva".
//     Nenhuma outra família é afetada.
//   · FORTE: sai a família do ingrediente (glicólico → todos os AHAs), com `revisarDermato`.
//     AHA forte não inclui o PHA: o PHA fica "com ressalva".
//   · Termo genérico: a família inteira (como antes).

import { ATIVOS, ativosDosCodigos, type AtivoId } from './ativos.ts'

export type Intensidade = 'leve' | 'forte'
export type Ingrediente =
  | 'acido_glicolico' | 'acido_latico' | 'acido_mandelico'
  | 'salicilico' | 'pha' | 'azelaico' | 'retinoide' | 'niacinamida' | 'peroxido' | 'vitc_pura'

export interface Reacao {
  ingrediente: Ingrediente | null   // null = termo genérico (família inteira)
  familia: AtivoId[]                // ativos do motor que formam a família
  intensidade: Intensidade
  /** Termo genérico: a família inteira sai, qualquer intensidade. */
  inteira: boolean
  /** Forte sem ser genérico: a família sai "até o dermatologista avaliar" (só campo, sem aviso). */
  revisarDermato: boolean
  rotulo: string
  rotuloEn: string
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Ingredientes que são uma PARTE da família (o resto da família continua possível no leve).
const SUB_AHA: Ingrediente[] = ['acido_glicolico', 'acido_latico', 'acido_mandelico']

const ING: Record<Ingrediente, { re: RegExp; familia: AtivoId[]; codigos: string[]; rotulo: string; rotuloEn: string }> = {
  acido_glicolico: { re: /glicolic|glycolic/, familia: ['aha'], codigos: ['acido_glicolico'], rotulo: 'ácido glicólico', rotuloEn: 'glycolic acid' },
  acido_latico: { re: /\blatic|\blactic|\blactico/, familia: ['aha'], codigos: ['acido_latico'], rotulo: 'ácido lático', rotuloEn: 'lactic acid' },
  acido_mandelico: { re: /mandelic/, familia: ['aha'], codigos: ['acido_mandelico'], rotulo: 'ácido mandélico', rotuloEn: 'mandelic acid' },
  salicilico: { re: /salicil|salicyl|\bbha\b|\blha\b/, familia: ['salicilico'], codigos: [], rotulo: 'ácido salicílico', rotuloEn: 'salicylic acid' },
  pha: { re: /\bpha\b|gluconolact|lactobion|maltobion/, familia: ['pha'], codigos: [], rotulo: 'PHA', rotuloEn: 'PHA' },
  azelaico: { re: /azela/, familia: ['azelaico'], codigos: [], rotulo: 'ácido azelaico', rotuloEn: 'azelaic acid' },
  // Tretinoína pelo nome de marca (Vitacid, Vitaminacid, Vitanol-A, Retin-A) e adapaleno (Differin, Epiduo).
  retinoide: { re: /retino|retinal|tretino|adapalen|vitamina a\b|vitamin a\b|vitacid|vitaminacid|vitanol|retin[- ]?a\b|differin|epiduo/, familia: ['retinoide'], codigos: [], rotulo: 'retinoide', rotuloEn: 'retinoids' },
  niacinamida: { re: /niacin|vitamina b3|vitamin b3/, familia: ['niacinamida'], codigos: [], rotulo: 'niacinamida', rotuloEn: 'niacinamide' },
  peroxido: { re: /peroxid|benzoil|benzoyl|epiduo/, familia: ['peroxido'], codigos: [], rotulo: 'peróxido de benzoíla', rotuloEn: 'benzoyl peroxide' },
  // "Vitamina C" = a pura (ácido ascórbico); a família inclui os derivados.
  vitc_pura: { re: /vitamina c\b|vit\.? c\b|vitamin c\b|ascorbic/, familia: ['vitc_pura', 'vitc_derivado'], codigos: [], rotulo: 'vitamina C', rotuloEn: 'vitamin C' },
}

// "ácido <nome>" / "<name> acid": o "ácido" é parte do nome, não a família.
const ACIDO_COM_NOME = /\bacid[oa]s?\s+(de\s+)?(glicolic|glycolic|l?-?latic|lactic|mandelic|salicil|salicyl|azela|hialur|hyalur|ascorb|tranex|kojic|ferul|succin|poliglut|polyglut|retino|vitacid|vitaminacid|lactobion|maltobion|alfa|alpha|beta)\w*/g
const NOME_ACID = /\b(glycolic|lactic|mandelic|salicylic|azelaic|hyaluronic|ascorbic|tranexamic|kojic|ferulic|succinic|polyglutamic|lactobionic|maltobionic)\s+acids?\b/g
const GENERICO_ACIDO = /\bacid(o|os|a|as|s)?\b|esfolia|exfolia|peeling|\bpeels?\b|\baha\b/
const FAMILIA_ACIDOS: AtivoId[] = ['aha', 'pha', 'salicilico']

function intensidadeDo(t: string): Intensidade {
  if (/\(\s*(reacao\s+)?leve\s*\)|reac\w*\s+leve|\(\s*mild\s*\)|mild reaction/.test(t)) return 'leve'
  return 'forte'
}

/** Lê o texto livre da reação. Vazio → []. */
export function lerReacoes(descricao: unknown): Reacao[] {
  if (typeof descricao !== 'string' || !descricao.trim()) return []
  const t = norm(descricao)
  const intensidade = intensidadeDo(t)
  const out: Reacao[] = []
  for (const [id, d] of Object.entries(ING) as [Ingrediente, typeof ING[Ingrediente]][]) {
    if (!d.re.test(t)) continue
    const sub = SUB_AHA.includes(id) || id === 'vitc_pura'
    out.push({
      ingrediente: id, familia: d.familia, intensidade, inteira: false,
      revisarDermato: intensidade === 'forte' && sub,
      rotulo: d.rotulo, rotuloEn: d.rotuloEn,
    })
  }
  // Termo genérico, sem os "ácido <nome>" e o "AHA" de "AHA/BHA/PHA" já lido como família.
  const resto = t.replace(ACIDO_COM_NOME, ' ').replace(NOME_ACID, ' ')
    .replace(/hialuronic\w*|hyaluronic/g, ' ')
  if (GENERICO_ACIDO.test(resto)) {
    out.push({
      ingrediente: null, familia: FAMILIA_ACIDOS, intensidade, inteira: true, revisarDermato: false,
      rotulo: 'ácidos esfoliantes', rotuloEn: 'exfoliating acids',
    })
  }
  return out
}

/** A reação tira a família inteira do plano? (genérico, forte, ou o ingrediente É a família). */
function tiraFamilia(r: Reacao): boolean {
  if (r.inteira || r.intensidade === 'forte') return true
  return !(r.ingrediente && (SUB_AHA.includes(r.ingrediente) || r.ingrediente === 'vitc_pura'))
}

/** Ativos do motor que não podem entrar no plano (o antigo `alergiaCorta`). */
export function ativosCortados(rs: Reacao[]): AtivoId[] {
  const out = new Set<AtivoId>()
  for (const r of rs) {
    if (tiraFamilia(r)) r.familia.forEach((a) => out.add(a))
    else if (r.ingrediente === 'vitc_pura') out.add('vitc_pura') // leve: o derivado continua
  }
  return [...out]
}

// Ingredientes AHA identificados num produto (pelos códigos do catálogo ou pelo texto).
function ahasDoProduto(codigos: string[], texto: string): Ingrediente[] {
  return SUB_AHA.filter((i) => ING[i].codigos.some((c) => codigos.includes(c)) || ING[i].re.test(texto))
}

export interface ProdutoReacao {
  /** produtos.ativos_principais (catálogo), se houver. */
  codigos?: readonly string[] | null
  /** produtos.alergenos (catálogo), se houver. */
  alergenos?: readonly string[] | null
  /** Ativos do motor já detectados (casa/scan). */
  ativos?: readonly AtivoId[] | null
  /** Nome + lista de ingredientes, para achar o ingrediente específico. */
  texto?: string | null
  /** produtos.intensidade ('suave' | 'moderado' | 'forte'). */
  intensidade?: string | null
}

export interface Veredito {
  tipo: 'bloqueia' | 'ressalva'
  reacao: Reacao
  /** Por que (para o log e para escolher o texto). */
  porque: 'ingrediente' | 'familia' | 'pode_conter' | 'mais_forte' | 'mesma_familia' | 'pha_depois_aha'
}

/** O produto esbarra numa reação dela? Bloqueio vem antes da ressalva. */
export function avaliarProduto(p: ProdutoReacao, rs: Reacao[]): Veredito | null {
  if (!rs.length) return null
  const codigos = (p.codigos ?? []).map((c) => String(c).toLowerCase())
  const texto = norm(p.texto)
  const ativos = new Set<AtivoId>([...(p.ativos ?? []), ...ativosDosCodigos(codigos)])
  const ahas = ahasDoProduto(codigos, texto)
  if (ahas.length) ativos.add('aha')
  // Etiqueta "aha_bha" sem nenhum ácido identificado: não dá para saber qual é.
  const tagAmbigua = (p.alergenos ?? []).includes('aha_bha') &&
    !['aha', 'salicilico', 'pha'].some((a) => ativos.has(a as AtivoId))
  let ressalva: Veredito | null = null
  for (const r of rs) {
    if (tiraFamilia(r)) {
      if (r.familia.some((a) => ativos.has(a))) {
        return { tipo: 'bloqueia', reacao: r, porque: r.inteira || !r.ingrediente || !SUB_AHA.includes(r.ingrediente) || (r.ingrediente && ahas.includes(r.ingrediente)) ? 'ingrediente' : 'familia' }
      }
      if (tagAmbigua && r.familia.some((a) => a === 'aha' || a === 'salicilico')) return { tipo: 'bloqueia', reacao: r, porque: 'pode_conter' }
      if (!ressalva && r.familia.includes('aha') && !r.familia.includes('pha') && ativos.has('pha')) ressalva = { tipo: 'ressalva', reacao: r, porque: 'pha_depois_aha' }
      continue
    }
    // LEVE, ingrediente que é parte da família.
    if (r.ingrediente === 'vitc_pura') {
      if (ativos.has('vitc_pura')) return { tipo: 'bloqueia', reacao: r, porque: 'ingrediente' }
      if (!ressalva && ativos.has('vitc_derivado')) ressalva = { tipo: 'ressalva', reacao: r, porque: 'mesma_familia' }
      continue
    }
    if (r.ingrediente && ahas.includes(r.ingrediente)) return { tipo: 'bloqueia', reacao: r, porque: 'ingrediente' }
    if (tagAmbigua) return { tipo: 'bloqueia', reacao: r, porque: 'pode_conter' }
    if (!ativos.has('aha')) continue
    // AHA sem saber qual (código genérico "aha", "AHA" no rótulo): pode ser o glicólico.
    if (!ahas.length) return { tipo: 'bloqueia', reacao: r, porque: 'pode_conter' }
    // Outro AHA: só o suave/moderado; e fica com ressalva no scan.
    if (/forte/.test(norm(p.intensidade))) return { tipo: 'bloqueia', reacao: r, porque: 'mais_forte' }
    if (!ressalva) ressalva = { tipo: 'ressalva', reacao: r, porque: 'mesma_familia' }
  }
  return ressalva
}

/** Leve na família deste ativo? (o motor prefere o produto suave no passo). */
export function prefereSuave(ativo: AtivoId | null, rs: Reacao[]): boolean {
  return !!ativo && rs.some((r) => !tiraFamilia(r) && r.familia.includes(ativo))
}

/** Texto para a usuária (por quê o produto saiu / tem ressalva). */
export function textoReacao(v: Veredito, en = false): string {
  const r = v.reacao
  const nome = en ? r.rotuloEn : r.rotulo
  const marcou = en
    ? `You've told us you had a ${r.intensidade === 'leve' ? 'mild ' : ''}reaction to ${nome}`
    : `Você marcou reação${r.intensidade === 'leve' ? ' leve' : ''} a ${nome}`
  switch (v.porque) {
    case 'ingrediente':
      if (r.inteira) return en ? `${marcou}, and this product has one of them. I'd skip it.` : `${marcou}, e este produto tem um deles. Eu evitaria.`
      return en ? `${marcou}, and it's in this product. I'd skip it.` : `${marcou}, que está neste produto. Eu evitaria.`
    case 'familia': return en
      ? `${marcou}. This product has an acid from the same family, so I'd skip it until your dermatologist checks.`
      : `${marcou}. Este produto tem um ácido da mesma família; eu evitaria até seu dermatologista avaliar.`
    case 'pode_conter': return en
      ? `${marcou}. This product's label doesn't say which acid it uses, and it may be that one. I'd skip it.`
      : `${marcou}. O rótulo não diz qual ácido ele usa, e pode ser esse. Eu evitaria.`
    case 'mais_forte': return en
      ? `${marcou}. This one is a strong formula from the same family; I'd go with a gentler one.`
      : `${marcou}. Este é uma fórmula forte da mesma família; eu iria de uma mais suave.`
    case 'mesma_familia': return en
      ? `${marcou}. This is a gentler one from the same family: patch test on a small area for a few days first.`
      : `${marcou}. Este é um ativo mais suave da mesma família: teste numa área pequena por alguns dias antes.`
    case 'pha_depois_aha': return en
      ? `${marcou}. PHA is gentler, but patch test on a small area for a few days first.`
      : `${marcou}. O PHA é mais suave, mas teste numa área pequena por alguns dias antes.`
  }
}

/** Resumo para as instruções da IA (o que o código já decidiu). */
export function resumoParaIA(rs: Reacao[]): string {
  if (!rs.length) return ''
  return rs.map((r) => {
    const fam = r.familia.map((a) => ATIVOS[a].nome).join(' / ')
    if (r.inteira) return `- família inteira de ${r.rotulo} (${fam}): EXCLUIR`
    if (tiraFamilia(r)) {
      const pha = r.familia.includes('aha') ? ' O PHA pode entrar, com cautela.' : ''
      return `- ${r.rotulo}, reação FORTE: EXCLUIR o ingrediente e a família (${fam}) até o dermatologista avaliar.${pha} As outras famílias de ativos NÃO são afetadas.`
    }
    const alt = r.familia.includes('aha') ? ' Se a pele pedir esfoliação, preferir ácido lático ou mandélico em concentração baixa, ou PHA.' : ''
    return `- ${r.rotulo}, reação LEVE: EXCLUIR só este ingrediente.${alt} BHA (salicílico), PHA, azelaico, vitamina C e as outras famílias NÃO são afetados.`
  }).join('\n')
}
