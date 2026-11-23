// Conferência da análise de produto DEPOIS da IA (nov/2026).
//
// 1) Nota e veredito: só a pele dela. Aqui o código garante a parte de SEGURANÇA (gravidez,
//    amamentação, tentativa, isotretinoína, alergia, barreira, rosácea) e que a nota caia na
//    faixa do veredito. A rotina nunca mexe nesses dois campos.
// 2) Decisão de rotina ("Adicionar à minha rotina"): as regras do motor da rotina v2
//    (_shared/motor): no máximo 2 ativos fortes, sem ativo repetido, substituir só um passo
//    do mesmo ativo, ativo forte com no máximo 3 dias por semana e fora dos dias de um ativo
//    incompatível no mesmo turno, e as mesmas travas de segurança.
// Textos novos ao usuário: PROPOSTOS (aguardam aprovação do produto).

import { ATIVOS, DIAS, FORTES, INCOMPATIVEIS, type AtivoId, type Dia } from '../_shared/motor/ativos.ts'
import { detectarAtivos } from '../_shared/motor/detectar.ts'
import { perfilMotor } from '../_shared/motor/perfil.ts'
import { avaliarProduto, lerReacoes, textoReacao } from '../_shared/motor/reacoes.ts'
import { bloqueioDeSeguranca, type Motivo } from '../_shared/motor/plano.ts'
import { ativosDoPasso, diasDoPasso } from '../_shared/motor/conferencia.ts'
import type { ProductContext } from './context.ts'

const FAIXA: Record<string, [number, number]> = {
  evitaria: [0, 35], com_ressalva: [40, 70], pode_usar: [75, 100],
}

const MOTIVO_SEGURANCA: Partial<Record<Motivo, (ativo: string) => string>> = {
  gravidez: (a) => `Com gestação, amamentação ou tentativa de engravidar, eu evitaria: ele tem ${a}. Confirme com seu obstetra antes de usar.`,
  isotretinoina: (a) => `Durante o tratamento com isotretinoína eu evitaria: ele tem ${a}, que irrita a pele sensibilizada pelo remédio. Combine com seu dermatologista.`,
  alergia: (a) => `Você já teve reação a ${a}, que está neste produto. Eu evitaria.`,
  barreira: (a) => `Sua barreira está comprometida agora, e ${a} pode irritar mais. Eu evitaria até ela se recuperar.`,
  // Nunca dizer "rosácea" para a usuária (pedido do produto, 18/nov/2026).
  rosacea: (a) => `Seu scan mostrou vermelhidão e sensibilidade, e ${a} tende a irritar. Eu evitaria por enquanto.`,
}

// Inglês (etapa 3 da tradução): os mesmos textos, só quando o app pede `idioma: 'en'`.
const MOTIVO_SEGURANCA_EN: Partial<Record<Motivo, (ativo: string) => string>> = {
  gravidez: (a) => `If you're pregnant, breastfeeding or trying to conceive, I'd skip this one: it has ${a}. Check with your OB-GYN before using it.`,
  isotretinoina: (a) => `While you're on isotretinoin, I'd skip this one: it has ${a}, which irritates skin that's already sensitized by the medication. Talk to your dermatologist first.`,
  alergia: (a) => `You've had a reaction to ${a} before, and it's in this product. I'd skip it.`,
  barreira: (a) => `Your skin barrier is compromised right now, and ${a} could irritate it more. I'd skip it until it recovers.`,
  rosacea: (a) => `Your scan showed redness and sensitivity, and ${a} tends to irritate. I'd skip it for now.`,
}
const NOME_CURTO_EN: Record<AtivoId, string> = {
  salicilico: 'salicylic acid', aha: 'glycolic acid', pha: 'PHA', retinoide: 'retinol',
  peroxido: 'benzoyl peroxide', azelaico: 'azelaic acid', niacinamida: 'niacinamide',
  vitc_pura: 'vitamin C', vitc_derivado: 'vitamin C', tranexamico: 'tranexamic acid',
  alfa_arbutin: 'alpha-arbutin', peptideos: 'peptides', ceramidas: 'ceramides',
  hialuronico: 'hyaluronic acid', cafeina: 'caffeine',
}
const DIA_EN: Record<string, string> = { Seg: 'Mon', Ter: 'Tue', Qua: 'Wed', Qui: 'Thu', Sex: 'Fri', 'Sáb': 'Sat', Dom: 'Sun' }
const MANTER_EN = "I'd keep your routine as it is."
let en = false

type Passo = { name: string; ingredient: string; dias?: string[] | null; _rowId?: string; produto?: string | null }
type PassoRotina = { periodo: 'am' | 'pm'; passo: Passo; ativos: AtivoId[]; dias: Dia[] | null }

const ehTratamento = (a: AtivoId) => ATIVOS[a].lugar !== 'hidratante'
// Nome curto do ativo para a usuária (o `nome` do motor é técnico: "retinoide (retinol, retinal
// ou adapaleno)"). De preferência como está escrito no produto ("Retinol 0,5%" → "retinol 0,5%").
const NOME_CURTO: Record<AtivoId, string> = {
  salicilico: 'ácido salicílico', aha: 'ácido glicólico', pha: 'PHA', retinoide: 'retinol',
  peroxido: 'peróxido de benzoíla', azelaico: 'ácido azelaico', niacinamida: 'niacinamida',
  vitc_pura: 'vitamina C', vitc_derivado: 'vitamina C', tranexamico: 'ácido tranexâmico',
  alfa_arbutin: 'alfa-arbutin', peptideos: 'peptídeos', ceramidas: 'ceramidas',
  hialuronico: 'ácido hialurônico', cafeina: 'cafeína',
}
const SIGLA = /^(AHA|BHA|PHA|LHA)\b/
function nomeNoProduto(a: AtivoId, escritos: string[]): string {
  for (const t of escritos) {
    if (!detectarAtivos(t).includes(a)) continue
    const limpo = t.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
    if (!limpo || limpo.length > 40) continue
    return SIGLA.test(limpo) ? limpo : limpo.charAt(0).toLowerCase() + limpo.slice(1)
  }
  return en ? NOME_CURTO_EN[a] : NOME_CURTO[a]
}
let escritosProduto: string[] = []
const nomeAtivo = (a: AtivoId) => nomeNoProduto(a, escritosProduto)
const nomeRotina = (a: AtivoId) => (en ? NOME_CURTO_EN[a] : NOME_CURTO[a])
const lista = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')}${en ? ' and ' : ' e '}${xs[xs.length - 1]}`
const diasTexto = (xs: string[]) => (en ? xs.map((x) => DIA_EN[x] ?? x) : xs)

export type Conferencia = { result: any; mudancas: string[] }

export function conferirResultado(resultIn: any, ctx: ProductContext, idioma: 'pt' | 'en' = 'pt'): Conferencia {
  en = idioma === 'en'
  const mudancas: string[] = []
  if (!resultIn || resultIn.status !== 'ok') return { result: resultIn, mudancas }
  const result = structuredClone(resultIn)
  const produto = result.produto ?? {}
  const ativosProduto = detectarAtivos(
    ...(Array.isArray(produto.ativos_detectados) ? produto.ativos_detectados.map(String) : []),
    String(produto.nome ?? ''),
  )
  escritosProduto = Array.isArray(produto.ativos_detectados) ? produto.ativos_detectados.map(String) : []
  const scan = (ctx.lastScan as any)?.full_result ?? null
  const perfil = perfilMotor(scan, ctx.profile ?? {}, (ctx.memories ?? []) as any)

  // ── 1. Segurança (Camada 1) ────────────────────────────────────────────────
  // Isotretinoína: o veredito só cai pelos ativos FORTES (niacinamida, PHA e afins seguem
  // possíveis na pele); na rotina, o motor não deixa entrar nenhum ativo de tratamento.
  const bloqueios: { ativo: AtivoId; motivo: Motivo }[] = []
  for (const a of ativosProduto) {
    const m = bloqueioDeSeguranca(a, perfil, () => true)
    if (!m || m === 'sem_produto') continue
    if (m === 'isotretinoina' && !ATIVOS[a].forte) continue
    if (m === 'alergia') continue // reação: por ingrediente, logo abaixo (reacoes.ts)
    bloqueios.push({ ativo: a, motivo: m })
  }
  // Reação declarada (23/nov/2026): vale para o ingrediente que ela marcou (reacoes.ts).
  const reacao = avaliarProduto({
    ativos: ativosProduto,
    texto: [String(produto.nome ?? ''), ...escritosProduto, ...(Array.isArray(produto.ingredientes) ? produto.ingredientes.map(String) : [])].join(' '),
  }, lerReacoes((ctx.profile as any)?.allergy_description))
  if (reacao) mudancas.push(`reacao:${reacao.tipo}:${reacao.porque}:${reacao.reacao.ingrediente ?? 'familia'}`)
  if (!bloqueios.length && reacao?.tipo === 'bloqueia') bloqueios.push({ ativo: ativosProduto[0] ?? 'aha', motivo: 'alergia' })
  if (bloqueios.length) {
    const { ativo, motivo } = bloqueios[0]
    const texto = motivo === 'alergia' && reacao?.tipo === 'bloqueia'
      ? textoReacao(reacao, en)
      : (en ? MOTIVO_SEGURANCA_EN : MOTIVO_SEGURANCA)[motivo]?.(nomeAtivo(ativo))
    if (result.veredito !== 'evitaria') {
      mudancas.push(`seguranca:${motivo}:${ativo}:${result.veredito}->evitaria`)
      result.veredito = 'evitaria'
      if (texto) { result.resumo = texto; result.explicacao = null }
    }
    if (texto && !(Array.isArray(result.avisos) && result.avisos.some((x: string) => (en ? /obstetr|OB-GYN|isotretino|reaction|barrier|rosacea|redness/i : /obstetra|isotretino|reação|barreira|rosácea/i).test(String(x))))) {
      result.avisos = [texto, ...(Array.isArray(result.avisos) ? result.avisos : [])]
    }
  }

  // Ressalvas (lista fechada): só vale o motivo que os dados dela sustentam. "com_ressalva"
  // sem motivo válido vira "pode_usar"; "pode_usar" com motivo válido vira "com_ressalva".
  // A nota é levada para a faixa nova na mesma proporção.
  if (result.veredito !== 'evitaria') {
    const validas = (Array.isArray(result.ressalvas) ? result.ressalvas : [])
      .filter((r: any) => r && typeof r.codigo === 'string' && ressalvaSustentada(r.codigo, ctx, scan))
      // Fragrância não aparece na frente da embalagem: sem a lista de ingredientes lida, não sustenta.
      .filter((r: any) => !(r.codigo === 'contraindicacao_scan' && result.confianca !== 'alta' && /fragr|perfum|parfum/i.test(String(r.texto ?? ''))))
    const descartadas = (Array.isArray(result.ressalvas) ? result.ressalvas.length : 0) - validas.length
    if (descartadas > 0) mudancas.push(`ressalvas_descartadas:${descartadas}`)
    // Mesma família de uma reação leve (ou PHA depois de AHA forte): com ressalva e teste.
    if (reacao?.tipo === 'ressalva') validas.unshift({ codigo: 'sensibilidade', texto: textoReacao(reacao, en) })
    result.ressalvas = validas
    const n = Number(result.compatibilidade)
    if (result.veredito === 'com_ressalva' && !validas.length) {
      mudancas.push(`veredito:com_ressalva->pode_usar`)
      result.veredito = 'pode_usar'
      if (Number.isFinite(n)) result.compatibilidade = Math.round(75 + (Math.min(70, Math.max(40, n)) - 40) * (20 / 30))
    } else if (result.veredito === 'pode_usar' && validas.length) {
      mudancas.push(`veredito:pode_usar->com_ressalva`)
      result.veredito = 'com_ressalva'
      if (Number.isFinite(n)) result.compatibilidade = Math.round(60 + (Math.min(100, Math.max(75, n)) - 75) * (10 / 25))
    }
  } else {
    result.ressalvas = []
  }

  // Nota sempre dentro da faixa do veredito.
  const faixa = FAIXA[result.veredito]
  if (faixa) {
    const n = Number(result.compatibilidade)
    const ok = Number.isFinite(n) ? Math.round(n) : null
    const presa = ok == null ? null : Math.min(faixa[1], Math.max(faixa[0], ok))
    if (presa !== ok) mudancas.push(`nota:${result.compatibilidade}->${presa}`)
    result.compatibilidade = presa
  }

  // "evitaria": nada de rotina (igual ao prompt).
  if (result.veredito === 'evitaria') {
    result.resultado_esperado_para_voce = null
    result.decisao_rotina = {
      tipo: 'manter_rotina', passo: null, periodo: null, produto_substituivel: null,
      depois_do_passo_id: null, substitui_passo_id: null, dias: null,
      justificativa: result.decisao_rotina?.justificativa ?? null,
    }
    return { result, mudancas }
  }

  // ── 2. Rotina (Camada 2) ───────────────────────────────────────────────────
  const d = result.decisao_rotina
  if (!d || (d.tipo !== 'adicionar' && d.tipo !== 'substituir')) return { result, mudancas }

  const proto = (ctx.protocol ?? {}) as any
  const rotina: PassoRotina[] = [
    ...((proto.rotina_am ?? []) as Passo[]).map((passo) => ({ periodo: 'am' as const, passo })),
    ...((proto.rotina_pm ?? []) as Passo[]).map((passo) => ({ periodo: 'pm' as const, passo })),
  ].map((x) => ({
    ...x,
    ativos: ativosDoPasso({ name: x.passo.name ?? '', ingredient: [x.passo.ingredient, x.passo.produto].filter(Boolean).join(' ') } as any),
    dias: diasDoPasso({ name: x.passo.name ?? '', ingredient: x.passo.ingredient ?? '', dias: x.passo.dias ?? null } as any),
  }))

  const manter = (motivo: string, texto: string) => {
    mudancas.push(`rotina:${d.tipo}->manter_rotina:${motivo}`)
    result.decisao_rotina = {
      tipo: 'manter_rotina', passo: null, periodo: null, produto_substituivel: null,
      depois_do_passo_id: null, substitui_passo_id: null, dias: null, justificativa: texto,
    }
    return { result, mudancas }
  }

  // O passo trocado sai da conta (substituir).
  const alvo = d.tipo === 'substituir' ? rotina.find((x) => x.passo._rowId && x.passo._rowId === d.substitui_passo_id) : undefined
  const resto = rotina.filter((x) => x !== alvo)
  const tratamentoProduto = ativosProduto.filter(ehTratamento)

  // Isotretinoína: nenhum ativo de tratamento novo na rotina.
  if (perfil.isotretinoina && tratamentoProduto.length) {
    return manter('isotretinoina', en ? "While you're on isotretinoin, I wouldn't add a new treatment active to your routine. Stick to cleanser, moisturizer and sunscreen." : 'Enquanto você estiver em tratamento com isotretinoína, eu não colocaria um ativo de tratamento novo na rotina. Mantenha só limpeza, hidratante e protetor.')
  }

  // Substituir: o passo existe e é do mesmo ativo de tratamento.
  if (d.tipo === 'substituir') {
    if (!alvo) return manter('substituir_sem_passo', d.justificativa ?? (en ? MANTER_EN : 'Eu manteria a rotina como está.'))
    const doPasso = alvo.ativos.filter(ehTratamento)
    if (doPasso.length && !doPasso.some((a) => tratamentoProduto.includes(a))) {
      return manter('nao_bate_com_passo', en ? `It's not the same type as your "${alvo.passo.name}" step (which works with ${lista(doPasso.map(nomeRotina))}), so it isn't an equal swap. ${MANTER_EN}` : `Ele não é do mesmo tipo do passo "${alvo.passo.name}" (que trata com ${lista(doPasso.map(nomeRotina))}), então não é uma troca equivalente. Eu manteria a rotina como está.`)
    }
  }

  // Sem ativo repetido.
  const repetidos = tratamentoProduto.filter((a) => resto.some((x) => x.ativos.includes(a)))
  if (repetidos.length) {
    const onde = resto.find((x) => x.ativos.includes(repetidos[0]))!
    return manter('repetido', en ? `Your routine already has ${nomeRotina(repetidos[0])} in your "${onde.passo.name}" step. Adding another product with the same active won't add anything and makes irritation more likely. ${MANTER_EN}` : `Sua rotina já tem ${nomeRotina(repetidos[0])} no passo "${onde.passo.name}". Somar outro produto com o mesmo ativo não acrescenta e aumenta a chance de irritar. Eu manteria a rotina como está.`)
  }

  // No máximo 2 ativos fortes na rotina inteira.
  const fortesRotina = new Set<AtivoId>(resto.flatMap((x) => x.ativos.filter((a) => FORTES.includes(a))))
  const fortesProduto = ativosProduto.filter((a) => FORTES.includes(a))
  const total = new Set<AtivoId>([...fortesRotina, ...fortesProduto])
  if (fortesProduto.length && total.size > 2) {
    return manter('limite_fortes', en ? `Your routine already has ${fortesRotina.size === 1 ? 'one strong active' : `${fortesRotina.size} strong actives`} (${lista([...fortesRotina].map(nomeRotina))}). With this one you'd go over two, and skin tends to get irritated. ${MANTER_EN}` : `Sua rotina já tem ${fortesRotina.size === 1 ? 'um ativo forte' : `${fortesRotina.size} ativos fortes`} (${lista([...fortesRotina].map(nomeRotina))}). Com este, passaria de dois, e a pele costuma irritar. Eu manteria a rotina como está.`)
  }

  // Ativo forte: turno permitido, no máximo 3 dias (ou o teto do ativo), fora dos dias de
  // um ativo incompatível no mesmo turno.
  if (fortesProduto.length) {
    const permitidos = fortesProduto.map((a) => ATIVOS[a].periodos).reduce((acc, ps) => acc.filter((p) => ps.includes(p)))
    let periodo: 'am' | 'pm' = d.periodo === 'am' || d.periodo === 'pm' ? d.periodo : (permitidos[0] ?? 'pm')
    if (!permitidos.includes(periodo)) periodo = permitidos[0] ?? 'pm'
    if (periodo !== d.periodo) { mudancas.push(`periodo:${d.periodo}->${periodo}`); d.periodo = periodo }

    const teto = Math.min(3, ...fortesProduto.map((a) => ATIVOS[a].maxDiasSemana ?? 3))
    const conflitos = resto.filter((x) => x.periodo === periodo && x.ativos.some((a) =>
      fortesProduto.some((f) => INCOMPATIVEIS.some(([p, q]) => (p === a && q === f) || (p === f && q === a)))))
    const ocupados = new Set<Dia>(conflitos.flatMap((x) => x.dias ?? [...DIAS]))
    const livres = DIAS.filter((dia) => !ocupados.has(dia))
    if (!livres.length) {
      const c = conflitos[0]
      return manter('incompativel', en ? `Your "${c.passo.name}" step is used every ${periodo === 'am' ? 'morning' : 'night'} and doesn't mix with ${lista(fortesProduto.map(nomeAtivo))} in the same routine. ${MANTER_EN}` : `O passo "${c.passo.name}" da sua rotina vai toda ${periodo === 'am' ? 'manhã' : 'noite'} e não combina com ${lista(fortesProduto.map(nomeAtivo))} no mesmo turno. Eu manteria a rotina como está.`)
    }
    const atuais: Dia[] = Array.isArray(d.dias) ? d.dias.filter((x: string) => (DIAS as readonly string[]).includes(x)) : []
    const valido = atuais.length > 0 && atuais.length <= teto && atuais.every((x) => livres.includes(x))
    if (!valido) {
      const novos = espalhar(livres, teto)
      mudancas.push(`dias:${JSON.stringify(d.dias)}->${JSON.stringify(novos)}`)
      d.dias = novos
      const quando = en
        ? (conflitos.length
          ? ` Use it only on ${lista(diasTexto(novos))}, the days you don't use ${lista([...new Set(conflitos.flatMap((x) => x.ativos.filter((a) => FORTES.includes(a))))].map(nomeRotina))}.`
          : ` Start with ${novos.length} times a week (${lista(diasTexto(novos))}).`)
        : conflitos.length
        ? ` Use só ${lista(novos)}, dias em que você não usa ${lista([...new Set(conflitos.flatMap((x) => x.ativos.filter((a) => FORTES.includes(a))))].map(nomeRotina))}.`
        : ` Comece com ${novos.length} vezes por semana (${lista(novos)}).`
      d.justificativa = `${d.justificativa ?? ''}${quando}`.trim()
    }
  }
  return { result, mudancas }
}

// O motivo de ressalva tem base nos dados dela?
const MEMORIA_SENSIVEL = /sens[ií]vel|sensibilidade|reativ|reag|rea[cç][aã]o|irrit|ard[eê]ncia|alergi/i
function ressalvaSustentada(codigo: string, ctx: ProductContext, scan: any): boolean {
  const perfil = (ctx.profile ?? {}) as any
  switch (codigo) {
    case 'sensibilidade':
      return ['sensitive', 'reaction'].includes(String(perfil.allergy_type ?? '')) ||
        (ctx.memories ?? []).some((m: any) =>
          ['sensitivity', 'product_reaction', 'allergy'].includes(String(m?.type ?? '')) || MEMORIA_SENSIVEL.test(String(m?.value ?? '')))
    case 'barreira_leve':
      return scan?.barrier_status === 'levemente_comprometida' || scan?.skin_hydration === 'desidratada'
    case 'contraindicacao_scan':
      return Array.isArray(scan?.contraindicacoes) && scan.contraindicacoes.length > 0
    case 'fototipo':
      return ['IV', 'V', 'VI'].includes(String(scan?.skin_phototype ?? ''))
    case 'inflamacao':
      return /moderad|grave|sever/i.test(String(scan?.acne?.severity ?? ''))
    case 'tipo_pele':
      return !!(perfil.tipo_pele || scan?.skin_type_detected || scan?.skin_type_sebaceous)
    default:
      return false
  }
}

// Até `n` dias bem espalhados na semana, só entre os livres.
function espalhar(livres: Dia[], n: number): Dia[] {
  const preferidos: Dia[][] = n >= 3
    ? [['Seg', 'Qua', 'Sex'], ['Ter', 'Qui', 'Sáb'], ['Ter', 'Qui', 'Dom']]
    : [['Seg', 'Qui'], ['Ter', 'Sex'], ['Qua', 'Sáb'], ['Ter', 'Sáb']]
  for (const p of preferidos) if (p.every((x) => livres.includes(x))) return p.slice(0, n)
  const out: Dia[] = []
  for (const x of livres) {
    if (out.length >= n) break
    const ultimo = out[out.length - 1]
    if (!ultimo || DIAS.indexOf(x) - DIAS.indexOf(ultimo) >= 2) out.push(x)
  }
  return out.length ? out : livres.slice(0, n)
}
