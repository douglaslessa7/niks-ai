// Motor da rotina v2 — Etapa 1: PLANO DE ATAQUE (só código, sem IA).
//
// Decide QUAIS ativos de tratamento entram, a partir das dores marcadas (a principal
// primeiro), das dores que o scan viu, da segurança (barreira, rosácea, gravidez,
// isotretinoína, alergia) e do catálogo (só entra ativo com produto que sirva para ela).
// Regras:
//  - cobertura: uma dor está coberta quando algum ativo escolhido está na lista dela;
//  - escolha gulosa: dor por dor, na ordem de prioridade; para a dor ainda aberta, o
//    ativo permitido que cobre MAIS dores abertas (marcadas pesam 10, do scan pesam 1);
//    empate → a ordem da tabela da dor;
//  - no máximo `limiteFortes` (2) ativos fortes; o limite só pesa quando nenhum ativo
//    permitido cobre a dor;
//  - dor MARCADA que ficar sem ativo vira aviso com o motivo; dor do scan, não.

import { ATIVOS, type AtivoId } from './ativos.ts'
import { DOR_ATIVOS, DOR_NOME, type Dor } from './dores.ts'
import { AVISO_ISOTRETINOINA_AMAMENTACAO_EN, textoAvisoEn, type Idioma } from './ingles.ts'

// `limite` = já tem os 2 ativos fortes; `teto` = já tem o máximo de tratamentos da rotina.
export type Motivo = 'isotretinoina' | 'gravidez' | 'barreira' | 'rosacea' | 'alergia' | 'sem_produto' | 'limite' | 'teto'

export interface PerfilMotor {
  marcadas: Dor[]                 // ordem de prioridade (a principal primeiro)
  doScan: Dor[]
  gravida: boolean                // grávida, amamentando ou tentando
  isotretinoina: boolean
  barreiraComprometida: boolean
  rosacea: boolean
  alergiaCorta: AtivoId[]         // famílias cortadas pela alergia declarada
  amamentando?: boolean
}

export interface PlanoAtivo { ativo: AtivoId; dores: Dor[]; alternativas: AtivoId[] }
export interface AvisoDor { dor: Dor; motivo: Motivo; texto: string }
export interface Plano {
  ativos: PlanoAtivo[]
  avisos: AvisoDor[]
  marcadas: Dor[]
  /** Ativos que NÃO podem aparecer (segurança), com o motivo. */
  proibidos: Partial<Record<AtivoId, Motivo>>
  limiteFortes: number
  /** Isotretinoína (16/nov/2026): só limpeza suave, hidratante e protetor — nenhum passo de tratamento. */
  soBasicos: boolean
  /** Avisos que não são de uma dor (ex.: isotretinoína + amamentação). Vêm antes dos outros. */
  avisosGerais: string[]
}

export interface OpcoesPlano {
  /** O catálogo tem ao menos 1 produto desse ativo que passa nos filtros dela? */
  temProduto: (a: AtivoId) => boolean
  limiteFortes?: number
  /** Teto de ativos de tratamento (sem contar os básicos). */
  maxAtivos?: number
  /** Só para testes: troca a tabela de dores. */
  tabela?: Partial<Record<Dor, AtivoId[]>>
  /**
   * Ativos que ela JÁ TEM em casa (lote, 22/nov/2026), na ordem de prioridade: para uma dor,
   * se algum deles a cobre e é permitido (segurança, limite de fortes), ele é o escolhido no
   * lugar do 1º da tabela. Contam como "com produto" mesmo sem item no catálogo.
   */
  preferir?: AtivoId[]
}

const ORDEM_MOTIVO: Motivo[] = ['isotretinoina', 'gravidez', 'barreira', 'rosacea', 'alergia', 'sem_produto', 'limite', 'teto']

/** Por que este ativo NÃO pode entrar (segurança/catálogo), ou null se pode. */
export function bloqueioDeSeguranca(a: AtivoId, p: PerfilMotor, temProduto: (a: AtivoId) => boolean): Motivo | null {
  const at = ATIVOS[a]
  // Isotretinoína: nenhum ativo de tratamento, nem os não fortes; só o que vai no hidratante (ceramidas).
  if (p.isotretinoina && (at.forte || at.lugar !== 'hidratante')) return 'isotretinoina'
  if (p.gravida && !at.seguroGravidez) return 'gravidez'
  if (p.barreiraComprometida && at.proibidoBarreira) return 'barreira'
  if (p.rosacea && at.proibidoRosacea) return 'rosacea'
  if (p.alergiaCorta.includes(a)) return 'alergia'
  if (!temProduto(a)) return 'sem_produto'
  return null
}

export function montarPlano(p: PerfilMotor, op: OpcoesPlano): Plano {
  const limite = op.limiteFortes ?? 2
  const maxAtivos = op.maxAtivos ?? 4
  const tabela = { ...DOR_ATIVOS, ...(op.tabela ?? {}) } as Record<Dor, AtivoId[]>
  // Gravidez/amamentação/tentante: sem salicílico, o azelaico entra no lugar para cravos
  // (para acne ele já é o próximo da lista) — 16/nov/2026.
  if (p.gravida && !op.tabela && !tabela['Cravos'].includes('azelaico')) {
    tabela['Cravos'] = [...tabela['Cravos']]
    tabela['Cravos'].splice(tabela['Cravos'].indexOf('salicilico') + 1, 0, 'azelaico')
  }

  const preferir = op.preferir ?? []
  const temProduto = (a: AtivoId) => preferir.includes(a) || op.temProduto(a)
  const proibidos: Partial<Record<AtivoId, Motivo>> = {}
  const todos = new Set<AtivoId>(Object.values(tabela).flat())
  for (const a of todos) {
    const m = bloqueioDeSeguranca(a, p, temProduto)
    if (m) proibidos[a] = m
  }

  const marcadas = [...new Set(p.marcadas)]
  const doScan = p.doScan.filter((d) => !marcadas.includes(d))
  const escolhidos: PlanoAtivo[] = []
  const cobertas = new Set<Dor>()
  const avisos: AvisoDor[] = []
  const fortes = () => escolhidos.filter((e) => ATIVOS[e.ativo].forte).length

  const cobre = (a: AtivoId) => (Object.keys(tabela) as Dor[]).filter((d) => tabela[d]?.includes(a))
  const pontos = (a: AtivoId) => cobre(a).reduce((s, d) =>
    s + (cobertas.has(d) ? 0 : marcadas.includes(d) ? 10 : doScan.includes(d) ? 1 : 0), 0)

  const tentar = (dor: Dor, marcada: boolean) => {
    if (cobertas.has(dor)) return
    const lista = tabela[dor] ?? []
    if (!lista.length) return
    // Um ativo já escolhido que cubra a dor resolve (não deveria acontecer: cobertas já marcou).
    const ja = escolhidos.find((e) => lista.includes(e.ativo))
    if (ja) { ja.dores.push(dor); cobertas.add(dor); return }

    const seguros = lista.filter((a) => !proibidos[a])
    const cabem = seguros.filter((a) => !ATIVOS[a].forte || fortes() < limite)
    const teto = escolhidos.length >= (marcada ? maxAtivos : Math.min(maxAtivos, 3))
    if (!cabem.length || teto) {
      if (!marcada) return
      // O motivo REAL (16/nov/2026): segurança/catálogo quando nenhum ativo pode; senão o teto
      // de tratamentos da rotina; senão o limite de 2 fortes.
      const motivo: Motivo = !seguros.length
        ? ORDEM_MOTIVO.find((m) => lista.some((a) => proibidos[a] === m)) ?? 'sem_produto'
        : teto ? 'teto' : 'limite'
      avisos.push({ dor, motivo, texto: textoAviso(dor, motivo, escolhidos) })
      return
    }
    // O que ela já tem em casa vem primeiro (na ordem de `preferir`); senão, o que cobre mais dores.
    const daCasa = preferir.find((a) => cabem.includes(a))
    let melhor = daCasa ?? cabem[0]
    if (!daCasa) for (const a of cabem) if (pontos(a) > pontos(melhor)) melhor = a
    const dores = cobre(melhor).filter((d) => !cobertas.has(d) && (marcadas.includes(d) || doScan.includes(d)))
    if (!dores.includes(dor)) dores.unshift(dor)
    dores.forEach((d) => cobertas.add(d))
    escolhidos.push({ ativo: melhor, dores, alternativas: [] })
  }

  // Lote (22/nov/2026): o que ela já tem em casa entra PRIMEIRO, cobrindo as dores marcadas que
  // trata; o resto das dores é preenchido depois, como sempre (segurança e limite valem igual).
  for (const a of preferir) {
    if (proibidos[a] || escolhidos.some((e) => e.ativo === a)) continue
    if (ATIVOS[a].forte && fortes() >= limite) continue
    if (escolhidos.length >= maxAtivos) continue
    const dores = cobre(a).filter((d) => !cobertas.has(d) && (marcadas.includes(d) || doScan.includes(d)))
    if (!dores.some((d) => marcadas.includes(d))) continue
    dores.forEach((d) => cobertas.add(d))
    escolhidos.push({ ativo: a, dores, alternativas: [] })
  }

  for (const d of marcadas) tentar(d, true)
  for (const d of doScan) tentar(d, false)

  // Barreira fragilizada: ceramidas sempre entram (recuperação primeiro).
  if (p.barreiraComprometida && !escolhidos.some((e) => e.ativo === 'ceramidas') && !proibidos.ceramidas) {
    escolhidos.push({ ativo: 'ceramidas', dores: [], alternativas: [] })
  }

  // Alternativas: outro ativo permitido da MESMA dor principal do ativo, que mantém o
  // limite de fortes (a IA pode trocar só por uma delas).
  for (const e of escolhidos) {
    const dorBase = e.dores[0]
    if (!dorBase) continue
    const fortesSemEste = fortes() - (ATIVOS[e.ativo].forte ? 1 : 0)
    e.alternativas = (tabela[dorBase] ?? []).filter((a) =>
      a !== e.ativo && !proibidos[a] && !escolhidos.some((x) => x.ativo === a) &&
      (!ATIVOS[a].forte || fortesSemEste < limite))
  }

  const avisosGerais: string[] = []
  if (p.isotretinoina && p.amamentando) avisosGerais.push(AVISO_ISOTRETINOINA_AMAMENTACAO)
  return { ativos: escolhidos, avisos, marcadas, proibidos, limiteFortes: limite, soBasicos: p.isotretinoina, avisosGerais }
}

// ⚠️ Texto PROPOSTO (16/nov/2026) — aguarda aprovação do produto.
export const AVISO_ISOTRETINOINA_AMAMENTACAO =
  'Você marcou que está amamentando e tomando isotretinoína. A isotretinoína não é indicada durante a amamentação: fale com o seu médico antes de continuar o tratamento. Enquanto isso, sua rotina tem só cuidados suaves.'

/**
 * Textos dos avisos para a usuária, UM por motivo (16/nov/2026): "Para oleosidade e manchas…"
 * em vez de uma frase repetida por dor. Os avisos gerais vêm primeiro.
 */
export function textosDosAvisos(plano: Plano, idioma: Idioma = 'pt'): string[] {
  const porMotivo = new Map<Motivo, Dor[]>()
  for (const a of plano.avisos) porMotivo.set(a.motivo, [...(porMotivo.get(a.motivo) ?? []), a.dor])
  const escolhidos = plano.ativos
  if (idioma === 'en') {
    // Mesmas regras do texto em português (textoAviso), em inglês.
    const cobertas = (motivo: Motivo) => (motivo === 'limite' ? escolhidos.filter((e) => ATIVOS[e.ativo].forte) : escolhidos).flatMap((e) => e.dores)
    return [
      ...(plano.avisosGerais ?? []).map((a) => (a === AVISO_ISOTRETINOINA_AMAMENTACAO ? AVISO_ISOTRETINOINA_AMAMENTACAO_EN : a)),
      ...[...porMotivo.entries()].map(([motivo, dores]) => textoAvisoEn(dores, motivo, cobertas(motivo), escolhidos.length)),
    ]
  }
  return [
    ...(plano.avisosGerais ?? []),
    ...[...porMotivo.entries()].map(([motivo, dores]) => textoAviso(dores, motivo, escolhidos)),
  ]
}

function lista(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? ''
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

// ⚠️ Textos PROPOSTOS — aguardam aprovação do produto.
export function textoAviso(dor: Dor | Dor[], motivo: Motivo, escolhidos: PlanoAtivo[]): string {
  const nome = lista((Array.isArray(dor) ? dor : [dor]).map((d) => DOR_NOME[d]))
  switch (motivo) {
    case 'isotretinoina':
      return `Enquanto você toma isotretinoína, a pele fica mais sensível e só cuidados suaves entram. Para ${nome}, combine os ativos com o seu dermatologista.`
    case 'gravidez':
      return `Os ativos que tratam ${nome} não são indicados na gravidez, na amamentação ou para quem está tentando engravidar. Converse com o seu médico antes de usar.`
    case 'barreira':
      return `Sua barreira está fragilizada. Primeiro vamos recuperá-la, por cerca de 6 semanas; depois dá para tratar ${nome}.`
    case 'rosacea':
      return `Com sinais de rosácea, os ativos que tratam ${nome} podem irritar a pele. Ficaram de fora por segurança.`
    case 'alergia':
      return `Os ativos que tratam ${nome} são da família que você disse ter causado reação. Ficaram de fora.`
    case 'sem_produto':
      return `Ainda não temos no catálogo um produto para ${nome} que sirva para a sua pele.`
    case 'limite': {
      const fortes = escolhidos.filter((e) => ATIVOS[e.ativo].forte)
      const cobertas = [...new Set(fortes.flatMap((e) => e.dores.map((d) => DOR_NOME[d])))]
      return `Para não irritar a pele, sua rotina tem no máximo 2 ativos fortes, e eles foram para ${lista(cobertas)}. ${nome[0].toUpperCase()}${nome.slice(1)} entra quando a sua pele se acostumar.`
    }
    case 'teto': {
      const cobertas = [...new Set(escolhidos.flatMap((e) => e.dores.map((d) => DOR_NOME[d])))]
      return `Sua rotina já tem ${escolhidos.length} tratamentos, o máximo para não sobrecarregar a pele, e eles foram para ${lista(cobertas)}. ${nome[0].toUpperCase()}${nome.slice(1)} entra quando a sua pele se acostumar.`
    }
  }
}
