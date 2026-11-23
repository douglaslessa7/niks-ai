// Motor da rotina v2 — Etapa 4 (parte 1): CONFERÊNCIA da rotina escrita pela IA,
// antes de salvar. Acha os problemas (para pedir uma correção à IA) e, se ainda
// sobrar algum, CORRIGE no código. A rotina corrigida nunca volta pior: só remove o que
// é proibido, acrescenta o que falta, separa turnos/dias e garante o protetor.

import { ATIVOS, DIAS, INCOMPATIVEIS, type AtivoId, type Dia, type Periodo } from './ativos.ts'
import { detectarAtivos } from './detectar.ts'
import type { Plano } from './plano.ts'
import { BASICO_EN, PASSO_MODELO_EN, type Idioma } from './ingles.ts'

export interface Passo {
  id?: number
  name: string
  ingredient: string
  instruction?: string
  steps?: string[]
  color?: string
  waitTime?: string | null
  product_suggestions?: string[]
  /** v2: ativo do plano que este passo trata (null = passo básico). */
  ativo?: string | null
  /** v2: dias da semana (null = todo dia). */
  dias?: string[] | null
}

export interface Protocolo {
  morning: Passo[]
  night: Passo[]
  introduction_warnings?: string | null
  expected_timeline?: Record<string, string | null> | null
  introduction_schedule?: string | null
  [k: string]: unknown
}

export type Problema =
  | { tipo: 'falta_ativo'; ativo: AtivoId }
  | { tipo: 'proibido'; ativo: AtivoId; passo: string }
  | { tipo: 'forte_fora_do_plano'; ativo: AtivoId; passo: string }
  | { tipo: 'limite'; fortes: AtivoId[] }
  | { tipo: 'turno'; ativo: AtivoId; passo: string; periodo: Periodo }
  | { tipo: 'conflito'; a: AtivoId; b: AtivoId; periodo: Periodo; motivo: string }
  | { tipo: 'sem_protetor' }
  | { tipo: 'sem_basico'; basico: 'limpeza' | 'hidratante'; periodo: Periodo }
  | { tipo: 'so_basicos'; passo: string }
  | { tipo: 'nome_interno'; ativo: AtivoId; passo: string }
  | { tipo: 'fora_do_plano'; ativo: AtivoId; passo: string }
  | { tipo: 'olhos'; passo: string }
  | { tipo: 'diario'; ativo: AtivoId }
  | { tipo: 'um_turno'; ativo: AtivoId }
  | { tipo: 'frequencia'; ativo: AtivoId; passo: string; max: number }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const PER: Record<'morning' | 'night', Periodo> = { morning: 'am', night: 'pm' }
const CHAVE: Record<Periodo, 'morning' | 'night'> = { am: 'morning', pm: 'night' }

const RE_PROTETOR = /protetor|\bfps\b|\bspf\b|filtro solar|sunscreen|sunblock|sun protection/
const RE_LIMPEZA = /limpeza|cleanser|sabonete|espuma|demaquil|micelar|cleansing|face wash|facial wash|makeup remover|micellar/
const RE_HIDRATANTE = /hidratante|gel-creme|gel creme|emoliente|creme hidrat|oclusivo|balm|barreira|moisturi[sz]|occlusive|emollient|gel-cream|gel cream|lotion/
// Inglês: "Ceramide Cream", "Night Cream"… é hidratante; "Eye Cream" não (é o passo de olhos).
const RE_CREME_EN = /\bcream\b/
const RE_OLHOS = /olho|olheira|periocular|\beye|under-eye|undereye/
const RE_DIAS = /\s*\(((?:seg|ter|qua|qui|sex|sab|sáb|dom|mon|tue|wed|thu|fri|sat|sun)[^)]*)\)\s*$/i

export const ehProtetor = (p: Passo) => RE_PROTETOR.test(norm(`${p.name} ${p.ingredient}`))
export const ehLimpeza = (p: Passo) => RE_LIMPEZA.test(norm(`${p.name} ${p.ingredient}`))
export const ehHidratante = (p: Passo) => {
  if (ehProtetor(p)) return false
  const t = norm(`${p.name} ${p.ingredient}`)
  return RE_HIDRATANTE.test(t) || (RE_CREME_EN.test(t) && !RE_OLHOS.test(t))
}
export const ehOlhos = (p: Passo) => RE_OLHOS.test(norm(`${p.name} ${p.ingredient}`))
const ehBasico = (p: Passo) => ehLimpeza(p) || ehHidratante(p) || ehProtetor(p)

/** O passo copiou a descrição interna de um ativo com escolha em aberto (`ATIVOS[x].nome` com
 *  "ou", ex.: "AHA (glicólico, mandélico ou lático)")? */
function nomeInterno(p: Passo): AtivoId | null {
  const t = norm(`${p.name} ${p.ingredient}`)
  for (const a of Object.keys(ATIVOS) as AtivoId[]) {
    const n = norm(ATIVOS[a].nome)
    if (n.includes(' ou ') && t.includes(n)) return a
  }
  return null
}

// 16/nov/2026: todo ativo FORTE fica num turno só e começa com no máximo 3 dias por semana
// (o salicílico chegou a sair todo dia de manhã + 3 noites). Azelaico: um turno, todo dia.
const maxDias = (a: AtivoId): number | undefined => ATIVOS[a].maxDiasSemana ?? (ATIVOS[a].forte ? 3 : undefined)
const umTurno = (a: AtivoId) => !!ATIVOS[a].umaVezAoDia || ATIVOS[a].forte

const DIA_NORM: Record<string, Dia> = {
  seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom',
  // Inglês (se a IA escrever os dias em inglês): viram os códigos de sempre.
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
}
function paraDia(v: string): Dia | null { return DIA_NORM[norm(v).trim().slice(0, 3)] ?? null }

/** Dias do passo: o campo estruturado `dias`, senão o sufixo "(Seg/Qua/Sex)" do ingrediente. null = todo dia. */
export function diasDoPasso(p: Passo): Dia[] | null {
  if (Array.isArray(p.dias)) {
    const d = [...new Set(p.dias.map(paraDia).filter((x): x is Dia => !!x))]
    return d.length && d.length < 7 ? ordenarDias(d) : null
  }
  const m = RE_DIAS.exec(p.ingredient ?? '')
  if (!m) return null
  const d = [...new Set(m[1].replace(/\be\b/gi, ' ').split(/[\/,·\s]+/).map(paraDia).filter((x): x is Dia => !!x))]
  return d.length && d.length < 7 ? ordenarDias(d) : null
}
const ordenarDias = (d: Dia[]) => DIAS.filter((x) => d.includes(x))

/** Ativos do passo (pelo texto) — o campo `ativo` da IA soma, nunca esconde o que o texto diz. */
export function ativosDoPasso(p: Passo): AtivoId[] {
  const out = new Set<AtivoId>(detectarAtivos(p.name, p.ingredient))
  // O texto do passo manda; o campo `ativo` da IA só vale quando o texto não diz nenhum
  // (a IA já marcou "azelaico" num "Sérum de Niacinamida").
  if (!out.size && p.ativo && p.ativo in ATIVOS) out.add(p.ativo as AtivoId)
  if (ehOlhos(p) && !ehLimpeza(p)) out.add('cafeina') // passo de olhos cobre "Olheiras"
  return [...out]
}

function todos(proto: Protocolo): { periodo: Periodo; passo: Passo }[] {
  return [
    ...(proto.morning ?? []).map((passo) => ({ periodo: 'am' as const, passo })),
    ...(proto.night ?? []).map((passo) => ({ periodo: 'pm' as const, passo })),
  ]
}

const cruzam = (a: Dia[] | null, b: Dia[] | null) => !a || !b || a.some((d) => b.includes(d))

/** Aceita a troca de um ativo do plano por uma alternativa dele (a IA pode fazer isso). */
export function planoEfetivo(proto: Protocolo, plano: Plano): Set<AtivoId> {
  const presentes = new Set(todos(proto).flatMap((x) => ativosDoPasso(x.passo)))
  const efetivo = new Set<AtivoId>()
  for (const e of plano.ativos) {
    if (presentes.has(e.ativo)) { efetivo.add(e.ativo); continue }
    const troca = e.alternativas.find((a) => presentes.has(a) && !efetivo.has(a))
    efetivo.add(troca ?? e.ativo)
  }
  return efetivo
}

export function problemasDaRotina(proto: Protocolo, plano: Plano): Problema[] {
  const out: Problema[] = []
  const efetivo = planoEfetivo(proto, plano)
  const lista = todos(proto)
  const presentes = new Set(lista.flatMap((x) => ativosDoPasso(x.passo)))

  for (const a of efetivo) if (!presentes.has(a)) out.push({ tipo: 'falta_ativo', ativo: a })

  for (const { periodo, passo } of lista) {
    for (const a of ativosDoPasso(passo)) {
      if (plano.proibidos[a] && plano.proibidos[a] !== 'sem_produto' && plano.proibidos[a] !== 'limite') {
        out.push({ tipo: 'proibido', ativo: a, passo: passo.name })
      } else if (ATIVOS[a].forte && !efetivo.has(a)) {
        out.push({ tipo: 'forte_fora_do_plano', ativo: a, passo: passo.name })
      } else if (!efetivo.has(a) && !ehBasico(passo)) {
        // 16/nov/2026: nenhum tratamento fora do plano, nem os não fortes (num passo próprio).
        out.push({ tipo: 'fora_do_plano', ativo: a, passo: passo.name })
      }
      if (efetivo.has(a) && !ATIVOS[a].periodos.includes(periodo)) {
        out.push({ tipo: 'turno', ativo: a, passo: passo.name, periodo })
      }
    }
  }

  const fortes = [...presentes].filter((a) => ATIVOS[a].forte)
  if (fortes.length > plano.limiteFortes) out.push({ tipo: 'limite', fortes })

  for (const periodo of ['am', 'pm'] as Periodo[]) {
    const doTurno = lista.filter((x) => x.periodo === periodo)
    for (const [a, b, motivo] of INCOMPATIVEIS) {
      const pa = doTurno.filter((x) => ativosDoPasso(x.passo).includes(a))
      const pb = doTurno.filter((x) => ativosDoPasso(x.passo).includes(b))
      const choque = pa.some((x) => pb.some((y) =>
        x.passo !== y.passo && cruzam(diasDoPasso(x.passo), diasDoPasso(y.passo))))
      if (choque) out.push({ tipo: 'conflito', a, b, periodo, motivo })
    }
  }

  if (!(proto.morning ?? []).some(ehProtetor)) out.push({ tipo: 'sem_protetor' })
  // 16/nov/2026: limpeza e hidratante são obrigatórios nos DOIS turnos (a IA chegou a
  // entregar uma manhã só com limpeza + protetor, e a Minha rotina saiu sem hidratante).
  for (const k of ['morning', 'night'] as const) {
    const lista = proto[k] ?? []
    if (!lista.some(ehLimpeza)) out.push({ tipo: 'sem_basico', basico: 'limpeza', periodo: PER[k] })
    if (!lista.some(ehHidratante)) out.push({ tipo: 'sem_basico', basico: 'hidratante', periodo: PER[k] })
  }
  // O nome interno do ativo (ex.: "AHA (glicólico, mandélico ou lático)") não é ingrediente.
  for (const { passo } of lista) {
    const a = nomeInterno(passo)
    if (a) out.push({ tipo: 'nome_interno', ativo: a, passo: passo.name })
  }
  // 16/nov/2026 — isotretinoína: só limpeza, hidratante e protetor.
  if (plano.soBasicos) {
    for (const { passo } of lista) if (!ehBasico(passo)) out.push({ tipo: 'so_basicos', passo: passo.name })
  }
  // Cafeína só num passo de OLHOS (creme/sérum para a área dos olhos).
  for (const { passo } of lista) {
    if (!ehOlhos(passo) && detectarAtivos(passo.name, passo.ingredient).includes('cafeina')) out.push({ tipo: 'olhos', passo: passo.name })
  }
  for (const a of efetivo) {
    // Só os passos de tratamento (o sabonete com o ativo é outra decisão do plano).
    const com = lista.filter((x) => !ehBasico(x.passo) && ativosDoPasso(x.passo).includes(a))
    // Uma vez por dia, todo dia, num turno só (azelaico).
    if (ATIVOS[a].umaVezAoDia && (new Set(com.map((x) => x.periodo)).size > 1 || com.some((x) => diasDoPasso(x.passo)))) {
      out.push({ tipo: 'diario', ativo: a })
    } else if (umTurno(a) && new Set(com.map((x) => x.periodo)).size > 1) {
      out.push({ tipo: 'um_turno', ativo: a })
    }
    // Começo com teto de dias por semana (fortes: 2–3×).
    const max = maxDias(a)
    if (max) for (const x of com) {
      const d = diasDoPasso(x.passo)
      if (!d || d.length > max) out.push({ tipo: 'frequencia', ativo: a, passo: x.passo.name, max })
    }
  }
  return out
}

/** Mensagem para a correção pela IA. */
export function mensagemCorretiva(ps: Problema[]): string {
  const linhas = ps.map((p) => {
    switch (p.tipo) {
      case 'falta_ativo': return `- Falta um passo com ${ATIVOS[p.ativo].nome}, que está no plano. Inclua.`
      case 'proibido': return `- "${p.passo}" tem ${ATIVOS[p.ativo].nome}, que é proibido para ela. Tire esse ativo da rotina.`
      case 'forte_fora_do_plano': return `- "${p.passo}" tem ${ATIVOS[p.ativo].nome}, um ativo forte fora do plano. Troque por uma versão sem ativo forte.`
      case 'limite': return `- A rotina tem ${p.fortes.length} ativos fortes (${p.fortes.map((a) => ATIVOS[a].nome).join(', ')}); o máximo é 2.`
      case 'turno': return `- ${ATIVOS[p.ativo].nome} está de ${p.periodo === 'am' ? 'manhã' : 'noite'} em "${p.passo}", mas só pode ${ATIVOS[p.ativo].periodos.map((x) => x === 'am' ? 'de manhã' : 'à noite').join(' ou ')}.`
      case 'conflito': return `- ${ATIVOS[p.a].nome} e ${ATIVOS[p.b].nome} caíram ${p.periodo === 'am' ? 'na manhã' : 'na noite'} nos mesmos dias (${p.motivo}). Separe por dias (campo "dias", sem dias em comum) ou por turno.`
      case 'sem_protetor': return '- Falta o protetor solar como último passo da manhã.'
      case 'fora_do_plano': return `- "${p.passo}" trata com ${ATIVOS[p.ativo].nome}, que NÃO está no plano. Tire esse passo: só os ativos do plano viram passo de tratamento.`
      case 'nome_interno': return `- "${p.passo}" usa a descrição do plano ("${ATIVOS[p.ativo].nome}") como nome/ingrediente. Escolha UM ativo específico (ex.: "${ATIVOS[p.ativo].passoModelo.ingrediente}").`
      case 'so_basicos': return `- "${p.passo}" é um passo de tratamento. Durante a isotretinoína a rotina tem SÓ limpeza suave, hidratante e protetor solar. Tire esse passo.`
      case 'olhos': return `- "${p.passo}" tem cafeína: ela vai num passo para a ÁREA DOS OLHOS (ex.: "Creme para a Área dos Olhos"), não num sérum para o rosto.`
      case 'diario': return `- ${ATIVOS[p.ativo].nome}: uma vez por dia, TODO dia, num turno só (manhã OU noite), com "dias": null. Não divida entre manhã e noite.`
      case 'um_turno': return `- ${ATIVOS[p.ativo].nome} é um ativo forte: fica num turno só (manhã OU noite), não nos dois.`
      case 'frequencia': return `- "${p.passo}" (${ATIVOS[p.ativo].nome}) precisa começar com no máximo ${p.max} dias por semana (ex.: Seg/Qua/Sex), no campo "dias".`
      case 'sem_basico': return `- Falta ${p.basico === 'limpeza' ? 'a limpeza' : 'o hidratante'} ${p.periodo === 'am' ? 'na manhã' : 'na noite'}. Limpeza e hidratante são obrigatórios de manhã e de noite.`
    }
  })
  return `A rotina que você gerou tem problemas que precisam ser corrigidos:\n${linhas.join('\n')}\n\nReescreva a rotina COMPLETA no MESMO formato JSON (mesmos campos, inclusive "ativo" e "dias" em cada passo), corrigindo só esses pontos. Retorne apenas JSON válido.`
}

// ── Correção no código ──────────────────────────────────────────────────────────────

const BASICO = {
  limpeza: (): Passo => ({
    name: 'Gel de Limpeza Suave', ingredient: 'Gel de Limpeza Suave sem sulfatos',
    instruction: 'Lave o rosto com água fria ou morna. Uma limpeza suave tira a oleosidade sem agredir a barreira.',
    steps: ['Molhe o rosto.', 'Massageie o gel por 30 segundos.', 'Enxágue e seque sem esfregar.'],
    color: '#E8F4FD', waitTime: null, product_suggestions: [], ativo: null, dias: null,
  }),
  hidratante: (): Passo => ({
    name: 'Hidratante', ingredient: 'Hidratante com Ceramidas',
    instruction: 'Aplique no rosto todo. O hidratante segura a água na pele e protege a barreira.',
    steps: ['Aplique uma camada no rosto todo.', 'Massageie até absorver.'],
    color: '#FCE8E8', waitTime: null, product_suggestions: [], ativo: null, dias: null,
  }),
  protetor: (): Passo => ({
    name: 'Protetor Solar', ingredient: 'Protetor Solar FPS 50',
    instruction: 'Aplique como último passo da manhã e reaplique se ficar no sol. O protetor é o que mais protege o resultado da sua rotina.',
    steps: ['Aplique uma camada generosa no rosto e no pescoço.', 'Reaplique a cada 2 horas no sol.'],
    color: '#FFF3CD', waitTime: null, product_suggestions: [], ativo: null, dias: null,
  }),
}

function passoDoAtivo(a: AtivoId, idioma: Idioma = 'pt'): Passo {
  const m = idioma === 'en' ? { ...ATIVOS[a].passoModelo, ...PASSO_MODELO_EN[a] } : ATIVOS[a].passoModelo
  return {
    name: m.nome, ingredient: m.ingrediente, instruction: m.instrucao, steps: [...m.steps],
    color: m.cor, waitTime: m.waitTime, product_suggestions: [], ativo: a, dias: ATIVOS[a].diasPadrao,
  }
}

/** Passo básico no idioma dela (inglês: só os textos mudam). */
function basico(k: keyof typeof BASICO, idioma: Idioma): Passo {
  return idioma === 'en' ? { ...BASICO[k](), ...BASICO_EN[k], steps: [...BASICO_EN[k].steps] } : BASICO[k]()
}

/** Passo básico que ficou com um ativo que não pode → volta ao básico sem ativo. */
function versaoBasica(p: Passo, idioma: Idioma = 'pt'): Passo | null {
  if (ehProtetor(p)) return basico('protetor', idioma)
  if (ehLimpeza(p)) return basico('limpeza', idioma)
  if (ehHidratante(p)) return basico('hidratante', idioma)
  return null
}

// Onde entra um passo de tratamento: antes do hidratante/oclusivo/protetor.
function inserirTratamento(lista: Passo[], p: Passo) {
  const i = lista.findIndex((x) => ehHidratante(x) || ehProtetor(x))
  if (i === -1) lista.push(p); else lista.splice(i, 0, p)
}

const ALTERNADOS: [Dia[], Dia[]] = [['Seg', 'Qua', 'Sex'], ['Ter', 'Qui', 'Sáb']]

export function corrigirRotina(entrada: Protocolo, plano: Plano, idioma: Idioma = 'pt'): Protocolo {
  const proto: Protocolo = structuredClone(entrada)
  proto.morning = Array.isArray(proto.morning) ? proto.morning : []
  proto.night = Array.isArray(proto.night) ? proto.night : []
  const efetivo = planoEfetivo(proto, plano)

  // 0. Isotretinoína: só os básicos ficam.
  if (plano.soBasicos) {
    proto.morning = proto.morning.filter(ehBasico)
    proto.night = proto.night.filter(ehBasico)
  }

  // 1–2. Tira ativo proibido e forte fora do plano (passo básico vira a versão sem ativo).
  for (const k of ['morning', 'night'] as const) {
    proto[k] = proto[k].flatMap((p) => {
      const ruins = ativosDoPasso(p).filter((a) =>
        (plano.proibidos[a] && plano.proibidos[a] !== 'sem_produto' && plano.proibidos[a] !== 'limite') ||
        (ATIVOS[a].forte && !efetivo.has(a)))
      if (!ruins.length) return [p]
      const bas = versaoBasica(p, idioma)
      return bas ? [bas] : []
    })
  }

  // 2b. Passo de tratamento com ativo fora do plano (inclusive não forte) sai.
  for (const k of ['morning', 'night'] as const) {
    proto[k] = proto[k].filter((p) => ehBasico(p) || ativosDoPasso(p).every((a) => efetivo.has(a)))
  }

  // 3. Turno errado → move para o turno permitido.
  for (const k of ['morning', 'night'] as const) {
    const periodo = PER[k]
    const ficam: Passo[] = []
    for (const p of proto[k]) {
      const errado = ativosDoPasso(p).find((a) => efetivo.has(a) && !ATIVOS[a].periodos.includes(periodo))
      if (errado) inserirTratamento(proto[CHAVE[ATIVOS[errado].periodos[0]]], p)
      else ficam.push(p)
    }
    proto[k] = ficam
  }

  // 4. Ativo do plano que faltou → passo modelo, no turno preferido.
  const presentes = () => new Set([...proto.morning, ...proto.night].flatMap(ativosDoPasso))
  for (const a of efetivo) {
    if (presentes().has(a)) continue
    const p = passoDoAtivo(a, idioma)
    if (ATIVOS[a].lugar === 'hidratante') {
      // Ceramidas: o hidratante da noite (ou da manhã) passa a ser com ceramidas.
      const k = proto.night.some(ehHidratante) ? 'night' : 'morning'
      const i = proto[k].findIndex(ehHidratante)
      if (i >= 0) proto[k][i] = { ...p, ativo: a }
      else inserirTratamento(proto[k], p)
      continue
    }
    inserirTratamento(proto[CHAVE[ATIVOS[a].periodos[0]]], p)
  }

  // 4a. Nome interno do ativo no passo → nome e ingrediente do passo modelo (mantém os dias).
  for (const k of ['morning', 'night'] as const) {
    proto[k] = proto[k].map((p) => {
      const a = nomeInterno(p)
      if (!a) return p
      const m = idioma === 'en' ? PASSO_MODELO_EN[a] : ATIVOS[a].passoModelo
      return { ...p, name: m.nome, ingredient: m.ingrediente, ativo: a, dias: diasDoPasso(p) }
    })
  }

  // 4b. Cafeína fora de um passo de olhos → vira o passo de olhos do modelo.
  for (const k of ['morning', 'night'] as const) {
    proto[k] = proto[k].map((p) => !ehOlhos(p) && detectarAtivos(p.name, p.ingredient).includes('cafeina')
      ? { ...passoDoAtivo('cafeina', idioma), instruction: p.instruction || (idioma === 'en' ? PASSO_MODELO_EN.cafeina.instrucao : ATIVOS.cafeina.passoModelo.instrucao) }
      : p)
  }
  // 4c. Num turno só (azelaico: todo dia; fortes: com os dias do passo que fica): fica no turno preferido.
  for (const a of efetivo) {
    if (!umTurno(a)) continue
    const diario = !!ATIVOS[a].umaVezAoDia
    const em = (k: 'morning' | 'night') => proto[k].filter((p) => ativosDoPasso(p).includes(a))
    const fica: 'morning' | 'night' = em(CHAVE[ATIVOS[a].periodos[0]]).length ? CHAVE[ATIVOS[a].periodos[0]]
      : em('morning').length ? 'morning' : 'night'
    const sai = fica === 'morning' ? 'night' : 'morning'
    proto[sai] = proto[sai].filter((p) => !ativosDoPasso(p).includes(a) || ehBasico(p))
    let primeiro = true
    proto[fica] = proto[fica].flatMap((p) => {
      if (!ativosDoPasso(p).includes(a) || ehBasico(p)) return [p]
      if (!primeiro) return []
      primeiro = false
      return [diario ? { ...p, dias: null, ingredient: String(p.ingredient ?? '').replace(RE_DIAS, '').trim() } : p]
    })
  }
  // 4d. Teto de dias por semana no começo (fortes 2–3×).
  for (const k of ['morning', 'night'] as const) {
    for (const p of proto[k]) {
      if (ehBasico(p)) continue
      for (const a of ativosDoPasso(p)) {
        const max = maxDias(a)
        if (!max || !efetivo.has(a)) continue
        const d = diasDoPasso(p)
        if (!d || d.length > max) {
          p.dias = (ATIVOS[a].diasPadrao ?? ['Seg', 'Qua', 'Sex']).slice(0, max)
          p.ingredient = String(p.ingredient ?? '').replace(RE_DIAS, '').trim()
        }
      }
    }
  }

  // 5. Conflito no mesmo turno e dias → muda de turno se der, senão divide os dias.
  for (const [a, b] of INCOMPATIVEIS) {
    for (const k of ['morning', 'night'] as const) {
      const pa = proto[k].find((p) => ativosDoPasso(p).includes(a))
      const pb = proto[k].find((p) => ativosDoPasso(p).includes(b))
      if (!pa || !pb || pa === pb) continue
      if (!cruzam(diasDoPasso(pa), diasDoPasso(pb))) continue
      const outro = k === 'morning' ? 'night' : 'morning'
      const podeMover = (x: Passo, y: AtivoId) =>
        ATIVOS[y].periodos.includes(PER[outro]) &&
        !INCOMPATIVEIS.some(([c, d]) => (c === y || d === y) &&
          proto[outro].some((q) => ativosDoPasso(q).includes(c === y ? d : c)))
      if (podeMover(pb, b)) {
        proto[k] = proto[k].filter((p) => p !== pb)
        inserirTratamento(proto[outro], pb)
      } else if (podeMover(pa, a)) {
        proto[k] = proto[k].filter((p) => p !== pa)
        inserirTratamento(proto[outro], pa)
      } else {
        pa.dias = ALTERNADOS[0]
        pb.dias = ALTERNADOS[1]
      }
    }
  }

  // 6. Protetor: sempre o último passo da manhã.
  const protetores = proto.morning.filter(ehProtetor)
  proto.morning = proto.morning.filter((p) => !ehProtetor(p))
  proto.morning.push(protetores[0] ?? basico('protetor', idioma))
  proto.night = proto.night.filter((p) => !ehProtetor(p))
  // Limpeza nos dois turnos.
  if (!proto.morning.some(ehLimpeza)) proto.morning.unshift(basico('limpeza', idioma))
  if (!proto.night.some(ehLimpeza)) proto.night.unshift(basico('limpeza', idioma))
  // Hidratante nos dois turnos (de manhã, antes do protetor).
  if (!proto.morning.some(ehHidratante)) proto.morning.splice(proto.morning.length - 1, 0, basico('hidratante', idioma))
  if (!proto.night.some(ehHidratante)) proto.night.push(basico('hidratante', idioma))

  return normalizar(proto, plano)
}

// Ordem dos passos por textura e função (limpeza → tônico → tratamento → olhos →
// hidratante → protetor). Estável: dentro do mesmo grupo, a ordem da IA fica.
function grupo(p: Passo): number {
  if (ehLimpeza(p)) return 0
  if (ehProtetor(p)) return 5
  if (ehHidratante(p)) return 4
  if (ehOlhos(p)) return 3
  if (/tonico|essencia|toner|essence/.test(norm(`${p.name} ${p.ingredient}`))) return 1
  return 2
}
function ordenarPassos(lista: Passo[]): Passo[] {
  const ordem = lista.map((p, i) => ({ p, i })).sort((a, b) => (grupo(a.p) - grupo(b.p)) || (a.i - b.i)).map((x) => x.p)
  // Básico repetido no mesmo turno (dois hidratantes, duas limpezas iguais) sai.
  const vistos = new Set<string>()
  return ordem.filter((p) => {
    if (grupo(p) === 2 || grupo(p) === 1 || grupo(p) === 3) return true
    const k = `${grupo(p)}|${norm(p.name).trim()}`
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

/** Ordem, campo `dias` estruturado + sufixo de dias no `ingredient` (o que os apps atuais leem) + ids. */
export function normalizar(proto: Protocolo, plano: Plano): Protocolo {
  const efetivo = planoEfetivo(proto, plano)
  for (const k of ['morning', 'night'] as const) {
    proto[k] = ordenarPassos(proto[k] ?? []).map((p, i) => {
      const dias = diasDoPasso(p)
      const base = String(p.ingredient ?? '').replace(RE_DIAS, '').trim()
      const ativo = ativosDoPasso(p).find((a) => efetivo.has(a)) ?? null
      return {
        ...p,
        id: i + 1,
        ativo,
        dias,
        ingredient: dias ? `${base} (${dias.join('/')})` : base,
        steps: Array.isArray(p.steps) ? p.steps : [],
        product_suggestions: Array.isArray(p.product_suggestions) ? p.product_suggestions : [],
        waitTime: p.waitTime ?? null,
      }
    })
  }
  return proto
}

/** Junta os avisos do plano ao `introduction_warnings` (sem repetir). `semFrasesSobre`: tira
 *  do texto da IA as frases sobre o assunto que os avisos do plano já cobrem (ex.: isotretinoína). */
export function comAvisos(proto: Protocolo, avisos: string[], semFrasesSobre?: RegExp): Protocolo {
  let atual = String(proto.introduction_warnings ?? '').trim()
  if (semFrasesSobre && avisos.length) {
    atual = (atual.match(/[^.!?]+[.!?]*\s*/g) ?? []).filter((f) => !semFrasesSobre.test(f)).join('').trim()
  }
  const novos = avisos.filter((a) => a && !atual.includes(a))
  if (!novos.length) return proto
  return { ...proto, introduction_warnings: [...novos, atual].filter(Boolean).join(' ') }
}
