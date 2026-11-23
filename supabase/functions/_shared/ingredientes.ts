// Tabela de ingredientes (INCI) — chave do produto e conferências do código (18/nov/2026).
// A chave junta marca + nome normalizados, para o mesmo produto escrito de jeitos diferentes
// ("Creamy Skincare" / "Creamy", "La Roche-Posay" / "la roche posay", "50ml") cair na mesma linha.
// As conferências decidem se uma lista achada na internet entra (confiança média) ou fica
// para revisar: só entra se passar em TODAS.

import { detectarAtivos } from './motor/detectar.ts'
import { ativosDosCodigos, type AtivoId } from './motor/ativos.ts'

/** Minúsculas, sem acento, sem texto entre parênteses, sem tamanho/volume, sem pontuação. */
export function normTexto(s: string | null | undefined): string {
  return ` ${s ?? ''} `
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[®™©]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' e ')
    .replace(/\bspf\b/g, 'fps')
    .replace(/\b\d+(?:[.,]\d+)?\s*(mg|g|mcg)\s*\/\s*(g|ml|kg)\b/g, ' ')
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(ml|g|gr|mg|kg|l|oz|fl\.? ?oz|un|unid|unidades)\b/g, ' ')
    .replace(/\bfps\s*(\d+)/g, 'fps$1')
    .replace(/[^a-z0-9%+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Marca escrita de vários jeitos → uma forma só. Só apelidos seguros (Simple ≠ Simple Organic).
const MARCAS: Record<string, string> = {
  'creamy skincare': 'creamy',
  'mantecorp skincare': 'mantecorp', 'mantecorp skin care': 'mantecorp',
  'darrow laboratorio': 'darrow',
  'skin1004 madagascar centella': 'skin1004', 'skin 1004': 'skin1004',
  'garnier skinactive': 'garnier', 'garnier skin active': 'garnier',
  'adcos dermocosmeticos': 'adcos', 'adcos professional': 'adcos',
  'bepantol derma': 'bepantol',
  'nivea sun': 'nivea',
  'l oreal paris': 'loreal', 'l oreal': 'loreal', 'loreal paris': 'loreal',
  'la roche posay': 'la roche posay', 'laroche posay': 'la roche posay',
  'dr althea': 'dr althea', 'dr. althea': 'dr althea',
  'avene': 'avene', 'eau thermale avene': 'avene',
  'principia skincare': 'principia', 'principia skin': 'principia',
  'the ordinary.': 'the ordinary',
  'o boticario': 'boticario', 'boticario': 'boticario',
  'cosrx inc': 'cosrx',
  'beauty of joseon': 'beauty of joseon',
  'theraskin farmaceutica': 'theraskin',
  'galderma cetaphil': 'cetaphil',
}

export function normMarca(marca: string | null | undefined): string {
  const m = normTexto(marca).replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
  return MARCAS[m] ?? m
}

/** Nome sem a marca repetida no começo (ex.: "CeraVe Gel de Limpeza" → "gel de limpeza"). */
export function normNome(nome: string | null | undefined, marca?: string | null): string {
  let n = normTexto(nome)
  const m = normTexto(marca)
  const mn = normMarca(marca)
  for (const pref of [m, mn]) if (pref && n.startsWith(pref + ' ')) n = n.slice(pref.length + 1)
  return n.trim()
}

export function chaveProduto(marca: string | null | undefined, nome: string | null | undefined) {
  const marca_norm = normMarca(marca)
  const nome_norm = normNome(nome, marca)
  return { chave: `${marca_norm}|${nome_norm}`, marca_norm, nome_norm }
}

// ── Conferências ─────────────────────────────────────────────────────────────

// Palavras de nome em português ↔ inglês (a fonte pode estar em inglês).
const SINONIMOS: [RegExp, string][] = [
  [/^(limpeza|limpador|cleanser|cleansing|wash|lavagem)$/, 'limpeza'],
  [/^(hidratante|hidratacao|moisturizer|moisturizing|moisturising|moisture|hydrating|hydra)$/, 'hidratante'],
  [/^(creme|cream|crema)$/, 'creme'],
  [/^(protetor|sunscreen|sunblock|fotoprotetor|protector)$/, 'protetor'],
  [/^(solar|sun)$/, 'solar'],
  [/^(tonico|toner|tonique|toning)$/, 'tonico'],
  [/^(esfoliante|exfoliant|exfoliating|peeling|exfoliator)$/, 'esfoliante'],
  [/^(olhos|eye|eyes|olho)$/, 'olhos'],
  [/^(espuma|foam|foaming|espumante)$/, 'espuma'],
  [/^(oleo|oil)$/, 'oleo'],
  [/^(agua|water)$/, 'agua'],
  [/^(mascara|mask|masque)$/, 'mascara'],
  [/^(serum|serum|essencia|essence|ampoule|ampola)$/, 'serum'],
  [/^(acido|acid)$/, 'acido'],
  [/^(vitamina|vitamin)$/, 'vitamina'],
  [/^(micelar|micellar)$/, 'micelar'],
  [/^(adapaleno|adapalene)$/, 'adapaleno'],
  [/^(niacinamida|niacinamide)$/, 'niacinamida'],
  [/^(salicilico|salicylic)$/, 'salicilico'],
  [/^(glicolico|glycolic)$/, 'glicolico'],
  [/^(latico|lactico|lactic)$/, 'latico'],
  [/^(mandelico|mandelic)$/, 'mandelico'],
  [/^(azelaico|azelaic)$/, 'azelaico'],
  [/^(hialuronico|hyaluronic)$/, 'hialuronico'],
  [/^(tranexamico|tranexamic)$/, 'tranexamico'],
  [/^(ceramidas?|ceramides?)$/, 'ceramida'],
  [/^(retinal|retinaldeido|retinaldehyde)$/, 'retinal'],
  [/^(purificante|purifying|purifiant)$/, 'purificante'],
  [/^(concentrado|concentrated|concentre)$/, 'concentrado'],
  [/^(diario|daily)$/, 'diario'],
  [/^(clareador|clareadora|brightening)$/, 'clareador'],
  [/^(calmante|calming|soothing)$/, 'calmante'],
  [/^(\+|plus)$/, ''],
  [/^(facial|face|rosto)$/, ''],
]
const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'para', 'e', 'a', 'o', 'the', 'for', 'with', 'and', 'of', 'em', 'in', 'pele', 'skin', 'new', 'novo', 'nova'])

function tokens(s: string): string[] {
  return normTexto(s).split(' ')
    .map((t) => { for (const [re, c] of SINONIMOS) if (re.test(t)) return c; return t })
    .filter((t) => t && !VAZIAS.has(t))
}

const urlNorm = (u: string | null | undefined) => (u ?? '').trim().toLowerCase()
  .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '')

const urlTexto = (u: string | null | undefined) => {
  try { return decodeURIComponent(urlNorm(u)).replace(/[/._-]+/g, ' ') } catch { return urlNorm(u).replace(/[/._-]+/g, ' ') }
}

// Nome comercial em português no lugar do INCI.
const PORTUGUES = /^(agua|acido|extrato|oleo|glicerina|glicerol|fragrancia|essencia|manteiga|cera de|vitamina|pantenol|alantoina|alcool|conservante|corante|perfume|hidroxido|goma|edetato|fenoxietanol|nicotinamida|hialuronato|ceramida|colesterol|fitoesfingosina|carbomer|dimeticona|butilenoglicol|propilenoglicol)\b/

// Nome em português (DCB, como os sites brasileiros publicam) → INCI. Só para COMPARAR
// (ativos, lista igual); a lista guardada fica como a fonte publicou (decisão de 18/nov/2026).
const PT_INCI: [RegExp, string][] = [
  [/^agua( purificada)?$/, 'Aqua'], [/^(glicerol|glicerina)$/, 'Glycerin'],
  [/^alcool cetoestearilico$/, 'Cetearyl Alcohol'], [/^alcool cetilico$/, 'Cetyl Alcohol'], [/^alcool estearilico$/, 'Stearyl Alcohol'],
  [/^alcool( etilico)?$/, 'Alcohol'], [/^fenoxietanol$/, 'Phenoxyethanol'], [/^(nicotinamida|niacinamida)$/, 'Niacinamide'],
  [/^hialuronato de sodio$/, 'Sodium Hyaluronate'], [/^acido hialuronico$/, 'Hyaluronic Acid'],
  [/^acido salicilico$/, 'Salicylic Acid'], [/^acido glicolico$/, 'Glycolic Acid'], [/^acido (lactico|latico)$/, 'Lactic Acid'],
  [/^acido mandelico$/, 'Mandelic Acid'], [/^acido azelaico$/, 'Azelaic Acid'], [/^acido tranexamico$/, 'Tranexamic Acid'],
  [/^acido ascorbico$/, 'Ascorbic Acid'], [/^acido citrico$/, 'Citric Acid'], [/^acido benzoico$/, 'Benzoic Acid'],
  [/^hidroxido de sodio$/, 'Sodium Hydroxide'], [/^hidroxido de potassio$/, 'Potassium Hydroxide'],
  [/^goma xantana$/, 'Xanthan Gum'], [/^goma guar$/, 'Cyamopsis Tetragonoloba Gum'], [/^edetato (dissodico|de sodio)$/, 'Disodium EDTA'],
  [/^ceramida (\w+)$/, 'Ceramide $1'], [/^fitoesfingosina$/, 'Phytosphingosine'], [/^colesterol$/, 'Cholesterol'],
  [/^carbomer[oa]?$/, 'Carbomer'], [/^pantenol$/, 'Panthenol'], [/^alantoina$/, 'Allantoin'], [/^tocoferol$/, 'Tocopherol'],
  [/^acetato de tocoferol$/, 'Tocopheryl Acetate'], [/^dimeticona$/, 'Dimethicone'], [/^butilenoglicol$/, 'Butylene Glycol'],
  [/^propilenoglicol$/, 'Propylene Glycol'], [/^caprililglicol$/, 'Caprylyl Glycol'], [/^clorfenesina$/, 'Chlorphenesin'],
  [/^citrato de trietila$/, 'Triethyl Citrate'], [/^metossulfato de beentrimonio$/, 'Behentrimonium Methosulfate'],
  [/^(perfume|fragrancia)$/, 'Parfum'], [/^retinol$/, 'Retinol'], [/^cafeina$/, 'Caffeine'], [/^ureia$/, 'Urea'],
  [/^esqualano$/, 'Squalane'], [/^dioxido de titanio$/, 'Titanium Dioxide'], [/^oxido de zinco$/, 'Zinc Oxide'],
  [/^lauroil lactilato de sodio$/, 'Sodium Lauroyl Lactylate'], [/^ascorbil glicosideo$/, 'Ascorbyl Glucoside'],
]
export function paraInci(item: string): string {
  const n = normTexto(item)
  for (const [re, inci] of PT_INCI) if (re.test(n)) return n.replace(re, inci).replace(/Ceramide (\w+)/, (_, x) => `Ceramide ${x.toUpperCase()}`)
  return item
}

// Versão de outro país.
// País declarado pela fonte (campo pais_versao): só o começo conta ("não indicado (página ...)" = não indicado).
const PAIS_OK = /^(brasil|brazil|nao indicad|nao informad|desconhecid|global|internacional|coreia|korea|south korea|japao|japan|franca|france)/
const PAIS_EUA = /^(eua|usa|us|estados unidos|united states|america)/
// Nome na fonte: marca explícita de outro país.
const NOME_OUTRO_PAIS = /(\beua\b|\busa\b|\bus only\b|united states|estados unidos|\buk\b|europe|canada|australia)/
// Observação livre: só frases explícitas (a palavra "usa" em português não conta — bug de 18/nov/2026).
const OBS_EUA = /(versao|formula|formulacao) (americana|norte americana|dos eua|dos estados unidos|us\b)|\bus only\b|\bus version\b|only (sold |available )?in the us/
const OBS_OUTRO = /(versao|formula|formulacao) (europeia|inglesa|canadense|australiana|mexicana|colombiana)/
const EXCLUSIVO_EUA = /(\bus only\b|\[us\]|exclusiv\w* (dos|para os|nos|do) (eua|estados unidos)|(somente|apenas|so) (nos|para os|no) (eua|estados unidos)|only (sold |available )?in the us|us exclusive)/
const DOMINIO_EUA = /\.us(\/|$)|\/(en-us|en_us|us)(\/|$)/
const DOMINIO_OUTRO_PAIS = /(\.co|\.com\.co|\.cl|\.pe|\.com\.pe|\.co\.uk|\.ca|\.com\.au|\.de|\.fr|\.es|\.it|\.co\.jp|\.com\.mx|\.com\.ar)(\/|$)|\/(en-gb|uk|en-ca|en-au)(\/|$)/
const PROTETOR = /(fps|sun|solar|protetor|sunscreen|sunblock|\buv\b|anthelios)/

// Marcas coreanas: a página americana da marca vale (confiança média) quando não é versão
// exclusiva dos EUA e o produto não é protetor solar (filtros diferentes por causa do FDA).
const COREANAS = new Set([
  'medicube', 'celimax', 'skin1004', 'cosrx', 'anua', 'beauty of joseon', 'dr althea', 'numbuzin', 'mixsoon', 'some by mi',
  'isntree', 'round lab', 'banila co', 'laneige', 'torriden', 'illiyoon', 'pyunkang yul', 'abib', 'vt', 'sioris', 'axis y',
  'purito', 'klairs', 'innisfree', 'missha', 'etude', 'etude house', 'tirtir', 'haruharu wonder', 'goodal', 'heimish', 'i m from',
  'manyo', 'ma nyo', 'aestura', 'skinfood', 'holika holika', 'biodance', 'by wishtrend', 'benton', 'neogen', 'cosnori', 'dr jart',
  'apieu', 'a pieu', 'hoygi', 'medi peel', 'jumiso', 'needly', 'aprilskin', 'ongredients', 'beplain', 'kaine', 'make p rem',
])
export const ehCoreana = (marca: string | null | undefined) => COREANAS.has(normMarca(marca))

// Fonte decidida pelo domínio (não pelo que o modelo diz): base de INCI só as conhecidas;
// site oficial = domínio com o nome da marca; o resto conta como loja.
const BASES_INCI = new Set(['incidecoder.com', 'skinsort.com', 'cosdna.com'])
export function tipoDaFonte(url: string | null | undefined, marca: string): 'site_oficial' | 'base_inci' | 'loja' {
  const dominio = urlNorm(url).split('/')[0]
  if (BASES_INCI.has(dominio)) return 'base_inci'
  const d = dominio.replace(/[^a-z0-9]/g, '')
  const m = normMarca(marca)
  const compacta = m.replace(/[^a-z0-9]/g, '')
  if (compacta && d.includes(compacta)) return 'site_oficial'
  if (m.split(' ').some((t) => t.length >= 5 && d.includes(t))) return 'site_oficial'
  return 'loja'
}

const familia = (a: AtivoId) => (a === 'vitc_pura' || a === 'vitc_derivado' ? 'vitc' : a)

export interface ListaAchada {
  marca: string
  nome: string
  nome_na_fonte?: string | null
  fonte_url?: string | null
  fonte_tipo?: string | null
  observacao?: string | null
  pais_versao?: string | null
  inci?: string[] | null
  concentracoes?: { ingrediente?: string; valor?: string }[] | null
}

export interface Conferencias {
  nome: boolean
  url_lida: boolean
  ativos: boolean
  inci: boolean
  tamanho: boolean
  versao: boolean
  fonte: boolean
  detalhes: Record<string, unknown>
}

/**
 * Confere uma lista achada na internet. `urlsLidas` = páginas que o modelo REALMENTE leu
 * (dos blocos de resultado das ferramentas), `codigosCatalogo` = produtos.ativos_principais.
 */
export function conferirLista(l: ListaAchada, urlsLidas: string[], codigosCatalogo: string[] = []): { passou: boolean; conferencias: Conferencias } {
  const inci = (l.inci ?? []).map((x) => String(x).trim()).filter(Boolean)

  const tipo = tipoDaFonte(l.fonte_url, l.marca)
  // Site oficial brasileiro pode publicar em português (DCB): aceito, convertendo para INCI só para comparar.
  const siteBrPt = tipo === 'site_oficial' && /\.com\.br$|\.br$/.test(urlNorm(l.fonte_url).split('/')[0])
  const comparavel = inci.map(paraInci)
  const naLista = new Set(detectarAtivos(comparavel.join(', ')).map(familia))

  // 1) Nome: as palavras do nome (e números, como FPS e %) aparecem no nome da fonte ou na URL.
  // Palavras que só nomeiam um ativo ("ácido azelaico", "niacinamida") não são exigidas quando o
  // ativo está na própria lista (a fonte costuma não repetir a descrição no nome).
  const fonteTxt = ` ${tokens(`${l.nome_na_fonte ?? ''} ${urlTexto(l.fonte_url)}`).join(' ')} `
  const descreveAtivo = (t: string) => t === 'acido' || t === 'vitamina' || detectarAtivos(t).some((a) => naLista.has(familia(a)))
  const doNome = [...new Set(tokens(l.nome))].filter((t) => /\d/.test(t) || !descreveAtivo(t) || ` ${tokens(`${l.nome_na_fonte ?? ''} ${urlTexto(l.fonte_url)}`).join(' ')} `.includes(` ${t} `))
  const achadas = doNome.filter((t) => fonteTxt.includes(` ${t} `))
  const numeros = doNome.filter((t) => /\d/.test(t))
  // Porcentagem pode vir só nas concentrações que a fonte informa (ex.: "Salicylic Acid 2%").
  const pcts = ` ${(l.concentracoes ?? []).map((c) => normTexto(c?.valor)).join(' ')} `
  const numerosOk = numeros.every((t) => fonteTxt.includes(` ${t} `) || (t.endsWith('%') && pcts.includes(` ${t} `)))
  const marcaTok = tokens(normMarca(l.marca))[0] ?? ''
  const marcaOk = !marcaTok || fonteTxt.includes(` ${marcaTok} `) || ` ${urlTexto(l.fonte_url)} `.includes(marcaTok)
  const parteNome = doNome.length ? achadas.length / doNome.length : 0
  const nome = marcaOk && numerosOk && parteNome >= 0.6

  // 2) A URL citada é uma das páginas lidas de verdade (não um trecho de busca nem URL digitada errado).
  const lidas = new Set(urlsLidas.map(urlNorm))
  const url_lida = !!l.fonte_url && lidas.has(urlNorm(l.fonte_url))

  // 3) Ativos conhecidos (do nome na frente e do catálogo) estão na lista.
  const esperados = [...new Set([...detectarAtivos(l.nome), ...ativosDosCodigos(codigosCatalogo)].map(familia))]
  const faltando = esperados.filter((a) => !naLista.has(a))
  const ativos = faltando.length === 0

  // 4) Nomenclatura INCI, não nome comercial em português.
  const emPortugues = inci.filter((x) => PORTUGUES.test(normTexto(x)))
  const inciOk = (siteBrPt || emPortugues.length <= 1) && !inci.some((x) => x.includes('?'))

  // 5) Lista inteira (no mínimo 5 itens).
  const tamanho = inci.length >= 5

  // 6) Versão do Brasil ou sem país indicado (EUA aceito só para coreana, sem exclusividade e sem FPS); 7) fonte não é loja.
  const pais = normTexto(l.pais_versao)
  const nomeFonte = normTexto(l.nome_na_fonte)
  const obs = normTexto(l.observacao)
  const url = urlNorm(l.fonte_url)
  const outroPais = (!!pais && !PAIS_OK.test(pais) && !PAIS_EUA.test(pais)) || (NOME_OUTRO_PAIS.test(nomeFonte) && !/\b(us only|usa|eua|united states|estados unidos)\b/.test(nomeFonte))
    || OBS_OUTRO.test(obs) || DOMINIO_OUTRO_PAIS.test(url)
  const sinalEua = PAIS_EUA.test(pais) || /(\beua\b|\busa\b|\bus only\b|united states|estados unidos)/.test(nomeFonte) || OBS_EUA.test(obs) || DOMINIO_EUA.test(url)
  const exclusivoEua = EXCLUSIVO_EUA.test(`${nomeFonte} ${obs} ${normTexto((l.nome_na_fonte ?? '').replace(/[[\]]/g, ' '))}`) || /\[us only\]/i.test(l.nome_na_fonte ?? '')
  const protetor = PROTETOR.test(normTexto(`${l.nome} ${l.nome_na_fonte ?? ''}`))
  const euaAceito = sinalEua && ehCoreana(l.marca) && !exclusivoEua && !protetor
  const versao = !outroPais && (!sinalEua || euaAceito)
  const fonte = tipo !== 'loja'

  const conferencias: Conferencias = {
    nome, url_lida, ativos, inci: inciOk, tamanho, versao, fonte,
    detalhes: {
      palavras_nome: doNome, achadas, marca_ok: marcaOk, numeros_ok: numerosOk,
      ativos_esperados: esperados, ativos_faltando: faltando, em_portugues: emPortugues.slice(0, 5),
      itens: inci.length, fonte_tipo: tipo, site_br_pt: siteBrPt, sinal_eua: sinalEua, eua_aceito: euaAceito, exclusivo_eua: exclusivoEua, protetor, urls_lidas: urlsLidas.slice(0, 4),
    },
  }
  return { passou: nome && url_lida && ativos && inciOk && tamanho && versao && fonte, conferencias }
}

// ── Busca na tabela a partir do produto identificado na foto ─────────────────

// Casamento de nomes (18/nov/2026, v2). O Haiku lê o nome com palavras a mais ("Sun Fresh Derm
// Care FPS 70 Protetor Solar Facial Sem Cor (pele mista a oleosa)") e a tabela guarda o nome
// curto ("Sun Fresh Derm Care FPS 70"). As palavras do nome se dividem em:
//   · DESCRITIVAS — ignoradas (protetor, solar, facial, pele, oleosa, uso diário…);
//   · FORMA — gel, creme, sérum, óleo…: só reprova se os DOIS nomes dizem e são diferentes;
//   · COR — com cor / sem cor / tom (clara, média…): só reprova se os DOIS dizem e discordam;
//   · VERSÃO — mild, intense, max, plus, noite, olhos, kids…: precisa estar nos dois;
//   · números (FPS, %) — precisam bater nos dois sentidos;
//   · o resto é o NÚCLEO do nome: a semelhança é calculada só com ele.
const DESCRITIVAS = new Set([
  'protetor', 'solar', 'pele', 'solucao', 'purificante', 'fortalecedor', 'suave', 'gentil', 'calmante', 'refrescante', 'rosto', 'oleosa', 'oleosas', 'mista', 'mistas', 'seca', 'secas',
  'normal', 'normais', 'sensivel', 'sensiveis', 'acneica', 'acneicas', 'todos', 'todas', 'tipos', 'tipo', 'uso', 'diario',
  'toque', 'seco', 'cuidado', 'tratamento', 'antioleosidade', 'oil', 'free', 'oilfree', 'controle', 'oleosidade',
  'dermatologico', 'dermocosmetico', 'cosmetico', 'skincare', 'beauty',
])
const FORMAS = new Set([
  'gel', 'creme', 'serum', 'tonico', 'oleo', 'espuma', 'locao', 'mascara', 'balm', 'fluido', 'fluid', 'stick', 'spray',
  'bruma', 'mist', 'sabonete', 'bastao', 'po', 'emulsao', 'emulsion', 'lotion', 'pad', 'pads', 'patch', 'patches',
  'agua', 'micelar', 'esfoliante', 'leite', 'milk', 'pomada', 'limpeza', 'hidratante',
])
// Formas de LIMPAR (sai com água) × de deixar na pele: uma não casa com a outra.
const LIMPEZA = new Set(['limpeza', 'espuma', 'sabonete', 'micelar'])
const VERSOES = new Set([
  'mild', 'intense', 'intensivo', 'intensive', 'max', 'ultra', 'plus', 'light', 'lite', 'extra', 'forte', 'strong', 'rich',
  'noite', 'night', 'noturno', 'dia', 'day', 'diurno', 'olhos', 'corpo', 'body', 'kids', 'infantil', 'baby', 'bebe',
  'men', 'homem', 'masculino', 'pro', 'advanced', 'gold', 'black', 'mini',
])
const SINGULAR: Record<string, string> = { pads: 'pad', patches: 'patch' }
const COM_COR = /(com cor|tinted|colorid|com tonalidade|\bcor\b(?! *: *sem)|pele clara|pele media|pele morena|pele escura|tom claro|tom medio|tom escuro|\bclara\b|\bmorena\b|\bescura\b)/
const SEM_COR = /(sem cor|untinted|incolor|transparente|invisible|invisivel)/

function corDe(nome: string): 'com' | 'sem' | null {
  const t = ` ${nome} `.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (SEM_COR.test(t)) return 'sem'
  if (COM_COR.test(t)) return 'com'
  return null
}

function partes(nome: string) {
  const nucleo = new Set<string>(), formas = new Set<string>(), versoes = new Set<string>(), numeros = new Set<string>()
  for (const t0 of tokens(nome)) {
    const t = SINGULAR[t0] ?? t0
    if (/\d/.test(t)) { numeros.add(t); continue }
    if (t === 'cor' || t === 'sem' || t === 'clara' || t === 'media' || t === 'morena' || t === 'escura' || t === 'tom') continue
    if (DESCRITIVAS.has(t)) continue
    if (FORMAS.has(t)) { formas.add(t); continue }
    if (VERSOES.has(t)) { versoes.add(t); nucleo.add(t); continue }
    nucleo.add(t)
  }
  return { nucleo, formas, versoes, numeros, cor: corDe(nome) }
}

/** Semelhança entre dois nomes de produto (0–1). 0 = produtos diferentes com certeza. */
export function semelhanca(a: string, b: string): number {
  const A = partes(a), B = partes(b)
  if (!A.nucleo.size && !B.nucleo.size) return 0
  // Números (FPS, %, 2.0): os mesmos nos dois.
  if ([...A.numeros].some((t) => !B.numeros.has(t)) || [...B.numeros].some((t) => !A.numeros.has(t))) return 0
  // Versão: a mesma nos dois (Zero Pore Pad × Zero Pore Pad Mild).
  if ([...A.versoes].some((t) => !B.versoes.has(t)) || [...B.versoes].some((t) => !A.versoes.has(t))) return 0
  // Cor: só reprova quando os dois dizem e discordam.
  if (A.cor && B.cor && A.cor !== B.cor) return 0
  // Forma: só reprova quando os dois dizem e não têm nenhuma em comum, ou quando um é de
  // limpeza e o outro não (sérum × espuma da mesma linha; hidratante × gel de limpeza).
  if (A.formas.size && B.formas.size) {
    if (![...A.formas].some((f) => B.formas.has(f))) return 0
    const limpaA = [...A.formas].some((f) => LIMPEZA.has(f)), limpaB = [...B.formas].some((f) => LIMPEZA.has(f))
    if (limpaA !== limpaB) return 0
  }
  const comum = [...A.nucleo].filter((t) => B.nucleo.has(t)).length
  // Forma que só um dos dois diz pesa pouco (0,1 cada): "Gel-Creme" × nome sem forma ainda
  // casa, mas "Dual Cream" perde para o Booster sem forma.
  const soUm = [...A.formas].filter((f) => !B.formas.has(f)).length + [...B.formas].filter((f) => !A.formas.has(f)).length
  return Math.max(0, comum / Math.max(A.nucleo.size, B.nucleo.size) - 0.1 * soUm)
}

export interface LinhaTabela { chave: string; marca: string; nome: string; nome_norm: string; nomes_alternativos?: string[] | null; nome_na_fonte?: string | null; inci: string[] | null; fonte: string | null; fonte_url: string | null; confianca: string | null; status: string; versao_na_fonte?: string | null }

/**
 * Escolhe a linha da mesma marca para o nome identificado. "exata" = chave igual;
 * "provavel" = um candidato claramente melhor (≥ 0,75 e 0,15 à frente do 2º). Empate → nenhuma.
 */
export function escolherLinha(nome: string, linhas: LinhaTabela[], chave: string): { linha: LinhaTabela; correspondencia: 'exata' | 'provavel' } | null {
  const exata = linhas.find((l) => l.chave === chave)
  if (exata) return { linha: exata, correspondencia: 'exata' }
  const notas = linhas.map((l) => ({ l, s: Math.max(semelhanca(nome, nomeComForma(l)), ...(l.nomes_alternativos ?? []).map((x) => semelhanca(nome, x))) }))
    .sort((a, b) => b.s - a.s)
  const [a, b] = notas
  if (!a || a.s < 0.75) return null
  // Um candidato claramente melhor, ou empate entre linhas DUPLICADAS do mesmo produto
  // (a mesma lista de ingredientes, ≥ 80% em comum — ex.: "Sérum AH-2" e "AH-2").
  if (!b || a.s - b.s >= 0.15 - 1e-9 || mesmaLista(a.l.inci, b.l.inci)) return { linha: a.l, correspondencia: 'provavel' }
  return null
}

/** O nome da linha sem forma ("Glycare Control") ganha a forma que a FONTE mostra (nome na
 *  página e URL: "…gel-limpeza-suave…") — senão um sérum da mesma linha casaria com o gel. */
function nomeComForma(l: LinhaTabela): string {
  if (partes(l.nome_norm).formas.size) return l.nome_norm
  const formas = partes(`${l.nome_na_fonte ?? ''} ${urlTexto(l.fonte_url)}`).formas
  return formas.size ? `${l.nome_norm} ${[...formas].join(' ')}` : l.nome_norm
}

function mesmaLista(x: string[] | null, y: string[] | null): boolean {
  if (!x?.length || !y?.length) return false
  const n = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
  const A = new Set(x.map(n)), B = new Set(y.map(n))
  const comum = [...A].filter((v) => B.has(v)).length
  return comum / new Set([...A, ...B]).size >= 0.8
}

/** Texto curto da origem, para a nota e (na 1.63) para a linha da tela. */
export function origemLegivel(l: Pick<LinhaTabela, 'fonte' | 'fonte_url'>): string {
  const dominio = urlNorm(l.fonte_url).split('/')[0]
  if (l.fonte === 'rotulo') return 'rótulo lido em outro scan deste produto'
  if (l.fonte === 'site_oficial') return `site da marca (${dominio})`
  if (l.fonte === 'base_inci') return `base de INCI (${dominio})`
  return dominio || 'internet'
}
