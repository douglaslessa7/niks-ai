// SOS espinha (08/nov/2026): as travas de segurança que valem NO CÓDIGO, não só no prompt.
// Funções puras (sem banco nem rede), testadas em `regras.test.ts`.
//
// Duas camadas: `produtosPermitidos` tira da lista o que não pode ir para a IA, e
// `sanearResposta` confere de novo o que voltou. A IA só escolhe pela referência curta (p1,
// p2...): produto que não está na lista permitida não chega à tela.
//
// ⚠️ RETINOID_RE é a 4ª cópia do detector de retinoide: mudou uma, mude todas
// (`isRetinoidStep` em generate-protocol, `passo_tem_retinoide` no banco e `temRetinoide` em
// lib/avisoProduto.ts).

const RETINOID_RE = /(retinol|retinal|retinaldeido|tretinoina|isotretinoina|retinoide|retinoid|retinil|retinyl|adapalen|tazaroten|trifaroten|hidroxipinacolona|hydroxypinacolone|granactive|\bhpr\b)/
const HIDROQUINONA_RE = /(hidroquinona|hydroquinone)/

// Desligado a pedido do produto (08/nov/2026): a NIKS não fala em dermatologista por enquanto.
// A classificação continua por dentro (sinal de infecção segue zerando os produtos).
// Para religar: `true` aqui, em `prompt.ts`/`prompt_conversa.ts` e em `sos-resultado.tsx`.
export const MOSTRAR_DERMATOLOGISTA = false

const citaDermatologista = (t: string) => /dermatolog/.test(norm(t))

/** Com o aviso desligado, tira as frases que mandam procurar dermatologista. */
export function semDermatologista(texto: string): string {
  if (MOSTRAR_DERMATOLOGISTA) return texto
  return texto.split(/\n\s*\n/)
    .map((par) => par.split(/(?<=[.!?])\s+/).filter((f) => !citaDermatologista(f)).join(' ').trim())
    .filter(Boolean).join('\n\n')
}

export const norm = (s: unknown) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function temRetinoide(texto: string): boolean {
  let t = norm(texto)
  // "bakuchiol (alternativa ao retinol)" não é retinoide.
  if (t.includes('bakuchiol')) t = t.replace(/(alternativa|substitut\w*|similar|parecid\w*)[^,.;()]*?retin\w*/g, ' ')
  return RETINOID_RE.test(t)
}

const proibidoNaGestacao = (texto: string) => temRetinoide(texto) || HIDROQUINONA_RE.test(norm(texto))

export type Memoria = { type?: unknown; value?: unknown }

export type Perfil = {
  pregnancy_status?: unknown
  allergy_type?: unknown
  allergy_description?: unknown
}

export type ProdutoSos = {
  ref: string
  colecaoId: string
  nome: string
  marca: string | null
  categoria: string | null
  ativos: string[]
  alergenos: string[]
  seguroGestante: boolean | null
  indicadoSensivel: boolean | null
  veredito: string | null
  naRotina: string[]
}

const FASES_BLOQUEADAS = ['pregnant', 'breastfeeding', 'trying']

/** Grávida, amamentando ou tentando: pelo cadastro ou pelo que ela contou no chat (memória). */
export function emGestacao(perfil: Perfil | null, memorias: Memoria[]): boolean {
  if (FASES_BLOQUEADAS.includes(String(perfil?.pregnancy_status ?? ''))) return true
  return memorias.some((m) => {
    if (m?.type !== 'pregnancy_status') return false
    const v = norm(m.value)
    if (/\b(nao|nunca|sem)\b.{0,24}(gravid|gestant|gestacao|amament|engravid)/.test(v)) return false
    return /(gravid|gestant|gestacao|amament|engravid)/.test(v)
  })
}

export function peleSensivel(perfil: Perfil | null, memorias: Memoria[]): boolean {
  return perfil?.allergy_type === 'sensitive' || memorias.some((m) => m?.type === 'sensitivity')
}

const IGNORAR = new Set([
  'acido', 'acidos', 'alergia', 'alergica', 'alergico', 'tenho', 'minha', 'minhas', 'meu', 'meus', 'pele', 'produto',
  'produtos', 'creme', 'cremes', 'serum', 'muito', 'muita', 'forte', 'fortes', 'maneira', 'sempre', 'quando', 'usar',
  'usei', 'uso', 'preciso', 'precisou', 'frequencia', 'reacao', 'reacoes', 'irritacao', 'sensivel', 'sensibilidade',
  'qualquer', 'alguns', 'algumas', 'alguma', 'algum', 'nao', 'sei', 'nada', 'coisa', 'coisas', 'demais', 'para',
  'como', 'mais', 'menos', 'muitos', 'muitas', 'isso', 'esse', 'essa', 'tipo', 'tipos',
])

// Nome em português no cadastro, em inglês na lista INCI dos rótulos.
const SINONIMOS: Record<string, string[]> = {
  salicilico: ['salicylic', 'salicilato', 'salicylate', 'bha'],
  glicolico: ['glycolic', 'aha'],
  latico: ['lactic'],
  mandelico: ['mandelic'],
  azelaico: ['azelaic'],
  hialuronico: ['hyaluronic', 'hialuronato', 'hyaluronate'],
  ascorbico: ['ascorbic', 'ascorbil', 'ascorbyl'],
  niacinamida: ['niacinamide'],
  benzoila: ['benzoyl'],
  benzoil: ['benzoyl'],
  enxofre: ['sulfur', 'sulphur'],
  lanolina: ['lanolin'],
  fragrancia: ['fragrance', 'parfum', 'perfume'],
  perfume: ['fragrance', 'parfum', 'fragrancia'],
  parabeno: ['paraben'],
  parabenos: ['paraben'],
  epiduo: ['adapalen', 'benzoyl', 'benzoila'],
}

const TEXTOS_DE_ALERGIA = (perfil: Perfil | null, memorias: Memoria[]) => [
  perfil?.allergy_description,
  ...memorias.filter((m) => m?.type === 'allergy').map((m) => m.value),
].filter(Boolean).map(norm)

/** Verdadeiro quando algo do que ela declarou como alergia aparece no produto. */
export function bateComAlergia(produto: ProdutoSos, perfil: Perfil | null, memorias: Memoria[]): boolean {
  const alvo = norm([produto.nome, produto.categoria, ...produto.ativos, ...produto.alergenos].join(' '))
  for (const texto of TEXTOS_DE_ALERGIA(perfil, memorias)) {
    const palavras = texto.split(/[^a-z0-9]+/).filter(Boolean)
    const termos = palavras.filter((p) => p.length >= 4 && !IGNORAR.has(p))
    // "Ácidos" / "ácido muito forte", sem dizer qual: vale para todo ácido.
    if (termos.length === 0 && palavras.some((p) => p === 'acido' || p === 'acidos')) {
      if (/(acid|\baha\b|\bbha\b|\bpha\b)/.test(alvo)) return true
      continue
    }
    for (const termo of termos) {
      if (alvo.includes(termo)) return true
      if ((SINONIMOS[termo] ?? []).some((s) => alvo.includes(s))) return true
      if (/retin|adapalen|tretinoin/.test(termo) && temRetinoide(alvo)) return true
    }
  }
  return false
}

/**
 * O que pode ir para a IA. Sem ativos conhecidos o produto fica de fora: a IA não pode
 * afirmar o que ele contém.
 */
export function produtosPermitidos(produtos: ProdutoSos[], perfil: Perfil | null, memorias: Memoria[]): ProdutoSos[] {
  const vetados = new Set(produtosVetados(produtos, perfil, memorias))
  return produtos.filter((p) => p.ativos.length > 0 && !vetados.has(p))
}

/** Os que têm um motivo real para não usar (ativo desconhecido não é motivo: é falta de dado). */
export function produtosVetados(produtos: ProdutoSos[], perfil: Perfil | null, memorias: Memoria[]): ProdutoSos[] {
  const gestacao = emGestacao(perfil, memorias)
  const sensivel = peleSensivel(perfil, memorias)
  return produtos.filter((p) => {
    if (p.veredito === 'evitaria') return true
    const texto = [p.nome, p.categoria, ...p.ativos].join(' ')
    if (gestacao && (proibidoNaGestacao(texto) || p.seguroGestante === false)) return true
    if (sensivel && p.indicadoSensivel === false) return true
    return bateComAlergia(p, perfil, memorias)
  })
}

export type Quando = 'agora' | 'manha' | 'noite'
export type Dermatologista = 'inflamada' | 'infeccao' | 'varias'

export type RespostaSos =
  | { status: 'precisa_foto' }
  | {
    status: 'ok'
    produtos: Array<{ colecao_id: string; nome: string; marca: string | null; como_usar: string; quando: Quando; na_rotina: boolean }>
    cuidados: string[]
    evitar: string[]
    dermatologista: Dermatologista | null
  }

const MAX_PRODUTOS = 3
const MAX_ITENS = 4
const MAX_TEXTO = 220

// "análise", nunca "diagnóstico".
const limparTexto = (v: unknown): string =>
  String(v ?? '').replace(/\s+/g, ' ').trim().replace(/diagn[oó]stic\w*/gi, 'análise').slice(0, MAX_TEXTO)

const listaDeTextos = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map(limparTexto).map(semDermatologista).filter(Boolean).slice(0, MAX_ITENS)

/** Confere a resposta da IA. Devolve null quando ela não serve e a análise deve falhar. */
export function sanearResposta(bruta: any, permitidos: ProdutoSos[], gestacao: boolean): RespostaSos | null {
  if (bruta?.status === 'precisa_foto') return { status: 'precisa_foto' }
  if (bruta?.status !== 'ok') return null

  let cuidados = listaDeTextos(bruta.cuidados)
  // Na gestação, um cuidado não pode mandar usar retinoide; o "evitar" pode citar.
  if (gestacao) cuidados = cuidados.filter((c) => !proibidoNaGestacao(c))
  if (cuidados.length === 0) return null

  const dermatologista: Dermatologista | null =
    bruta.dermatologista === 'inflamada' || bruta.dermatologista === 'infeccao' || bruta.dermatologista === 'varias'
      ? bruta.dermatologista
      : null

  const porRef = new Map(permitidos.map((p) => [p.ref, p]))
  const usados = new Set<string>()
  const produtos: Extract<RespostaSos, { status: 'ok' }>['produtos'] = []
  // Com sinal de infecção, nenhum ativo por conta própria: só os cuidados e o dermatologista.
  if (dermatologista !== 'infeccao') {
    for (const item of Array.isArray(bruta.produtos) ? bruta.produtos : []) {
      const p = porRef.get(String(item?.ref ?? ''))
      const como_usar = semDermatologista(limparTexto(item?.como_usar))
      if (!p || usados.has(p.ref) || !como_usar) continue
      if (gestacao && proibidoNaGestacao(como_usar)) continue
      usados.add(p.ref)
      produtos.push({
        colecao_id: p.colecaoId,
        nome: p.nome,
        marca: p.marca,
        como_usar,
        quando: item.quando === 'agora' || item.quando === 'manha' ? item.quando : 'noite',
        na_rotina: p.naRotina.length > 0,
      })
      if (produtos.length === MAX_PRODUTOS) break
    }
  }

  return { status: 'ok', produtos, cuidados, evitar: listaDeTextos(bruta.evitar), dermatologista: MOSTRAR_DERMATOLOGISTA ? dermatologista : null }
}

export const LIMITE_POR_DIA = 5

/** Início do dia de hoje em Brasília (UTC-3, sem horário de verão), em ISO. */
export function inicioDoDiaBrasilia(agora: Date): string {
  const local = new Date(agora.getTime() - 3 * 3_600_000)
  local.setUTCHours(0, 0, 0, 0)
  return new Date(local.getTime() + 3 * 3_600_000).toISOString()
}

// ── Conversa de acompanhamento ───────────────────────────────────────────────────────────

export const LIMITE_MENSAGENS_POR_DIA = 20

const QUANDO_TEXTO: Record<Quando, string> = { agora: 'Agora', manha: 'Hoje de manhã', noite: 'Hoje à noite' }

export const AVISO_DERMATOLOGISTA: Record<Dermatologista, string> = {
  inflamada: 'Esta espinha parece mais inflamada que o normal. Um dermatologista pode avaliar e tratar com segurança.',
  infeccao: 'A foto sugere sinais que precisam de avaliação. Se tiver febre ou se a vermelhidão estiver aumentando, procure atendimento hoje.',
  varias: 'A foto mostra várias espinhas juntas. Um dermatologista pode ver o que está causando isso.',
}

const SEM_PRODUTO = 'Nenhum produto da sua estante é indicado para esta espinha agora. Siga os cuidados abaixo.'

/** A análise como 1ª mensagem da NIKS na conversa (parágrafos viram bolhas). */
export function textoDaAnalise(r: Extract<RespostaSos, { status: 'ok' }>): string {
  const blocos = ['Esta é a sua análise de hoje.']
  if (r.dermatologista) blocos.push(AVISO_DERMATOLOGISTA[r.dermatologista])
  blocos.push(r.produtos.length
    ? `Faça agora com o que você já tem:\n${r.produtos.map((p) => `• ${p.nome} (${QUANDO_TEXTO[p.quando]}): ${p.como_usar}`).join('\n')}`
    : SEM_PRODUTO)
  blocos.push(`Cuidados sem produto:\n${r.cuidados.map((c) => `• ${c}`).join('\n')}`)
  if (r.evitar.length) blocos.push(`O que evitar:\n${r.evitar.map((c) => `• ${c}`).join('\n')}`)
  blocos.push('Ficou com dúvida? Pode me perguntar aqui e mandar fotos novas.')
  return blocos.join('\n\n')
}

// Citar para mandar EVITAR é permitido ("não use retinol").
const NEGACAO = /(evit\w*|nao use|nao usar|nao passe|nao aplique|nao indic\w*|nada de|sem usar|pare\w*|suspend\w*|longe d\w*|nunca)[^.!?\n]{0,40}$/

function citadoSemNegar(texto: string, encontrar: RegExp): boolean {
  for (const m of texto.matchAll(encontrar)) {
    if (!NEGACAO.test(texto.slice(Math.max(0, m.index - 60), m.index))) return true
  }
  return false
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type RespostaConversa = { texto: string; resolvida: boolean }

export const TEXTO_SEGURO = MOSTRAR_DERMATOLOGISTA
  ? 'Para não arriscar, prefiro não indicar nenhum produto agora. Mantenha a região limpa, não esprema e, se piorar ou doer muito, procure um dermatologista.'
  : 'Para não arriscar, prefiro não indicar nenhum produto agora. Mantenha a região limpa e não esprema.'

/**
 * Confere a resposta da conversa. `null` = refazer (ou, na 2ª vez, usar o TEXTO_SEGURO): cita
 * produto vetado, ou retinoide/hidroquinona na gestação, sem ser para mandar evitar.
 */
export function sanearConversa(bruta: any, vetados: ProdutoSos[], gestacao: boolean): RespostaConversa | null {
  if (bruta?.status !== 'ok') return null
  let texto = semDermatologista(String(bruta.texto ?? '').replace(/\*\*/g, '').trim().replace(/diagn[oó]stic\w*/gi, 'análise'))
  if (!texto) return null
  const n = norm(texto)
  if (gestacao && citadoSemNegar(n, /(retinol|retinal|tretinoina|isotretinoina|retinoide|retinoid|adapalen|tazaroten|trifaroten|hidroquinona|hydroquinone)/g)) return null
  for (const p of vetados) {
    const nome = norm(p.nome).trim()
    if (nome.length >= 4 && citadoSemNegar(n, new RegExp(escapar(nome), 'g'))) return null
  }
  if (MOSTRAR_DERMATOLOGISTA && bruta.dermatologista && !/dermatolog/.test(n)) {
    texto += '\n\nPelo que você me contou, vale procurar um dermatologista para avaliar de perto.'
  }
  return { texto: texto.slice(0, 1500), resolvida: bruta.resolvida === true }
}
