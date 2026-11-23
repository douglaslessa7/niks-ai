// Motor da rotina v2 — Etapa 3 + conferência final + gravação (precisa da conta).
// Lê a rotina ideal salva, escolhe o produto de cada passo (casa primeiro, catálogo por
// ATIVO), confere os fortes de TODOS os produtos, grava `recomendacoes_produtos` no
// formato de sempre e monta a Minha rotina JÁ COM PRODUTO (`montar_minha_rotina_v2`).

// deno-lint-ignore-file no-explicit-any
import { ATIVOS, ativosDosCodigos, type AtivoId } from './ativos.ts'
import { carregarCatalogo, filtrosDaPele, temProdutoPara } from './catalogo.ts'
import { ativosDoPasso, comAvisos, planoEfetivo, type Passo } from './conferencia.ts'
import { chamarIA, gerarRotinaV2, memoriasAtivas } from './gerar.ts'
import { perfilMotor } from './perfil.ts'
import { montarPlano } from './plano.ts'
import { ativoLegivelEn, PEDIDO_COPIES_EN, SEM_PRODUTO_EN, type Idioma } from './ingles.ts'
import {
  ativosDoScan, escolherProdutos, fortesDaRotina, passosVazios, tipoDoPasso,
  type Escolha, type ItemCasa, type ProdutoCatalogo, type TipoPasso, produtosQueNaoBatem, produtoBateComPasso,
} from './produtos.ts'

const ROTULO: Record<TipoPasso, string> = {
  limpeza: 'Limpeza', tonico: 'Tônico', tratamento: 'Tratamento', olhos: 'Tratamento', hidratante: 'Hidratação', protetor: 'Proteção',
}

/** Dados do onboarding a partir da linha `users` (reverso do saveToSupabase). */
export function onboardingDaLinha(u: any, scan: any): any {
  return {
    concerns: Array.isArray(u?.concerns) ? u.concerns : [],
    dor_principal: u?.dor_principal ?? null,
    pregnancy_status: u?.pregnancy_status ?? null,
    skin_type: u?.tipo_pele ?? scan?.skin_type_detected ?? null,
    allergy_type: u?.allergy_type ?? null,
    allergy_description: u?.allergy_description ?? null,
    orcamento: u?.orcamento_faixa ?? null,
    isotretinoina: u?.isotretinoina ?? null,
    birthday: u?.birthday ?? null,
    sun_exposure: u?.sun_exposure ?? null,
    hydration: u?.hydration ?? null,
    sleep: u?.sleep ?? null,
    goal_desire: u?.goal_desire ?? null,
    skincare_routine_type: u?.skincare_routine_type ?? null,
    skincare_routine_description: u?.skincare_routine_description ?? null,
    makeup: u?.makeup ?? null,
    sunscreen: u?.sunscreen ?? null,
    frequency: u?.frequency ?? null,
  }
}

async function produtosDeCasa(db: any, uid: string): Promise<ItemCasa[]> {
  const { data: itens } = await db.from('colecao_produtos')
    .select('id, origem, produto_id, product_scan_id, nome, marca, categoria, status, created_at')
    .eq('user_id', uid).eq('status', 'tenho').order('created_at', { ascending: false })
  const lista = (itens ?? []) as any[]
  const prodIds = lista.map((i) => i.produto_id).filter(Boolean)
  const scanIds = lista.map((i) => i.product_scan_id).filter(Boolean)
  const [{ data: prods }, { data: scans }] = await Promise.all([
    prodIds.length ? db.from('produtos').select('id, categoria, ativos_principais, alergenos, seguro_gestante').in('id', prodIds) : Promise.resolve({ data: [] }),
    scanIds.length ? db.from('product_scans').select('id, resultado').in('id', scanIds) : Promise.resolve({ data: [] }),
  ])
  const porProd = new Map((prods ?? []).map((p: any) => [p.id, p]))
  const porScan = new Map((scans ?? []).map((s: any) => [s.id, s]))
  return lista.map((i) => {
    const p: any = i.produto_id ? porProd.get(i.produto_id) : null
    const s: any = i.product_scan_id ? porScan.get(i.product_scan_id) : null
    const ativos: AtivoId[] = p
      ? ativosDosCodigos(p.ativos_principais)
      : ativosDoScan(s?.resultado?.produto?.ativos_detectados, i.nome)
    return {
      colecaoId: i.id,
      produtoId: i.produto_id ?? null,
      nome: i.nome ?? '',
      marca: i.marca ?? '',
      categoria: p?.categoria ?? s?.resultado?.produto?.categoria ?? i.categoria ?? null,
      ativos,
      alergenos: p?.alergenos ?? [],
      seguroGestante: p ? p.seguro_gestante ?? null : null,
    }
  })
}


function synthCopy(p: ProdutoCatalogo, idioma: Idioma = 'pt'): string {
  const ativo = (p.ativos_principais ?? [])[0]
  const s = ativo
    ? (idioma === 'en' ? `${p.marca} with ${ativoLegivelEn(String(ativo))}` : `${p.marca} com ${String(ativo).replace(/_/g, ' ').replace(/\bacido\b/g, 'ácido')}`)
    : `${p.marca} ${p.nome}`
  const para = (p.ideal_para ?? '').trim()
  const t = `${s}${para ? ` — ${para}` : ''}`
  return t.length > 160 ? `${t.slice(0, 159).trimEnd()}…` : t.charAt(0).toUpperCase() + t.slice(1)
}

async function escreverCopies(escolhas: Escolha[], perfilTexto: string, idioma: Idioma = 'pt', uid: string | null = null): Promise<Map<string, string>> {
  const itens = new Map<string, { passo: string; p: ProdutoCatalogo }>()
  for (const e of escolhas) for (const p of [e.principal, ...e.alternativas]) if (p) itens.set(p.id, { passo: e.passo.name, p })
  const out = new Map<string, string>()
  if (!itens.size) return out
  const lista = [...itens.values()].map(({ passo, p }) => ({ produto_id: p.id, passo, marca: p.marca, nome: p.nome, ativos: p.ativos_principais, trata: p.concerns, ideal_para: p.ideal_para }))
  const texto = await chamarIA([
    { role: 'system', content: idioma === 'en' ? PEDIDO_COPIES_EN : 'Você é uma dermatologista consultora brasileira. Para cada produto, escreva uma frase curta (até ~18 palavras), pessoal, em pt-BR, dizendo por que ESTE produto combina com ELA neste passo — cite o tipo de pele, uma dor dela ou o ativo. Nada genérico e sem repetir frases. Responda SÓ JSON: {"copies":[{"produto_id":"...","copy":"..."}]}' },
    { role: 'user', content: `PERFIL: ${perfilTexto}\n\nPRODUTOS:\n${JSON.stringify(lista)}` },
  ], { funcao: 'motor-v2-copies', uid })
  try {
    const j = JSON.parse(texto ?? '{}')
    for (const c of j?.copies ?? []) if (typeof c?.produto_id === 'string' && typeof c?.copy === 'string' && c.copy.trim()) out.set(c.produto_id, c.copy.trim())
  } catch { /* cai na frase montada */ }
  return out
}

export interface OpcoesRecomendar {
  scanId?: string | null
  regenerate?: boolean
  substituir?: boolean
  /** Não grava nada: devolve o que seria gravado (teste). */
  simular?: boolean
  /** Perfil sintético (teste, sem conta): usa estes dados em vez da linha `users` e do scan salvo. */
  dados?: { onboarding: any; scan: any }
  /** Usa esta rotina ideal em vez da salva (teste, junto com `simular`). */
  protocolo?: { id?: string; rotina_am: unknown[]; rotina_pm: unknown[]; dicas?: (string | null)[] }
  /** Idioma do celular (etapa 3 da tradução): textos para ela em inglês. Padrão: português. */
  idioma?: Idioma
}

// Rotina do motor novo tem "ativo" em todo passo.
const ehV2 = (l: unknown) => Array.isArray(l) && l.length > 0 && l.every((s: any) => s && typeof s === 'object' && 'ativo' in s)

/** 16/nov/2026 (teste no iPhone): depois de o motor novo refazer a rotina, o app ainda gravou
 *  por cima uma rotina do motor ANTIGO (a gerada no onboarding) e pediu a recomendação de novo,
 *  que voltava do cache. A Minha rotina ficava com os passos da nova e a "ideal" era a antiga
 *  ("2 dos 5 passos ideais"). Aqui a rotina do motor novo volta a ser a mais recente. */
async function reafirmarRotinaV2(db: any, uid: string, log: (m: string, c?: Record<string, unknown>) => void) {
  const { data: protos } = await db.from('protocolos').select('id, rotina_am, rotina_pm')
    .eq('user_id', uid).order('updated_at', { ascending: false }).limit(10)
  const lista = Array.isArray(protos) ? protos : []
  if (!lista.length || (ehV2(lista[0].rotina_am) && ehV2(lista[0].rotina_pm))) return
  const v2 = lista.find((p: any) => ehV2(p.rotina_am) && ehV2(p.rotina_pm))
  if (!v2) return
  const { error } = await db.from('protocolos').update({ updated_at: new Date().toISOString() }).eq('id', v2.id).eq('user_id', uid)
  log(error ? 'ROTINA_V2_REAFIRMAR_FALHOU' : 'ROTINA_V2_REAFIRMADA', { v2: v2.id, antiga: lista[0].id, erro: error?.message ?? null })
}

/** A rotina ideal salva veio do motor ANTIGO? Refaz pelo motor novo e salva como a mais recente. */
export async function garantirRotinaV2(
  db: any, uid: string, proto: any, scan: any, scanId: string | null, onboarding: any,
  log: (m: string, c?: Record<string, unknown>) => void,
  /** false = só gera (teste/simulação): não grava a rotina nova em `protocolos`. */
  salvar = true,
  /** Idioma do celular (etapa 3 da tradução): rotina refeita em inglês. Padrão: português. */
  idioma: Idioma = 'pt',
): Promise<any> {
  if (ehV2(proto?.rotina_am) && ehV2(proto?.rotina_pm)) return proto
  const g = await gerarRotinaV2({ scanResult: scan, onboardingData: onboarding, uid, supabase: db, idioma })
  if (!salvar) {
    log('ROTINA_V2_SEM_SALVAR', { antiga: proto?.id ?? null })
    return { id: null, rotina_am: g.protocolo.morning, rotina_pm: g.protocolo.night, dicas: null }
  }
  const dicas = [
    g.protocolo.introduction_warnings ?? null,
    (g.protocolo.expected_timeline as any)?.two_weeks ?? null,
    (g.protocolo.expected_timeline as any)?.one_month ?? null,
    (g.protocolo.expected_timeline as any)?.three_months ?? null,
    g.protocolo.introduction_schedule ?? null,
  ]
  const { data: novo, error } = await db.from('protocolos').insert({
    user_id: uid, skin_scan_id: scanId, rotina_am: g.protocolo.morning, rotina_pm: g.protocolo.night,
    dicas, updated_at: new Date().toISOString(),
  }).select('id, rotina_am, rotina_pm, dicas').single()
  if (error) throw new Error(`protocolo v2: ${error.message}`)
  log('ROTINA_REFEITA_V2', { antiga: proto?.id ?? null, nova: novo.id })
  return novo
}

/** Passos da rotina ideal na ordem final (manhã depois noite), com o ativo de cada um. */
export function passosComAtivo(rotina: { morning: Passo[]; night: Passo[] }, efetivo: Set<AtivoId>) {
  return [
    ...rotina.morning.map((p) => ({ passo: p, periodo: 'am' as const })),
    ...rotina.night.map((p) => ({ passo: p, periodo: 'pm' as const })),
  ].map(({ passo, periodo }) => {
    const ativos = ativosDoPasso(passo)
    const ativo = ativos.find((a) => efetivo.has(a)) ??
      (passo.ativo && passo.ativo in ATIVOS ? passo.ativo as AtivoId : null) ??
      (tipoDoPasso(passo) === 'tratamento' ? ativos[0] ?? null : null)
    return { passo, periodo, ativo }
  })
}

export async function montarProdutosV2(db: any, uid: string | null, op: OpcoesRecomendar = {}) {
  if (!uid && !(op.simular && op.dados && op.protocolo)) throw new Error('sem conta só em simulação com dados e rotina')
  const log = (motivo: string, ctx: Record<string, unknown> = {}) =>
    console.warn('MOTOR_V2_PRODUTOS', JSON.stringify({ motivo, uid, ...ctx }))

  const { data: existente } = uid ? await db.from('recomendacoes_produtos').select('recomendacao').eq('user_id', uid).maybeSingle() : { data: null }
  if (existente && !op.regenerate && !op.substituir && !op.simular) {
    if (uid) await reafirmarRotinaV2(db, uid, log)
    return { recomendacao: existente.recomendacao, cached: true }
  }

  const { data: u } = uid ? await db.from('users').select('*').eq('id', uid).maybeSingle() : { data: {} }
  if (!u) throw Object.assign(new Error('usuária não encontrada'), { status: 404 })
  let scanRow: any = null
  if (uid && !op.dados) {
    let sq = db.from('skin_scans').select('id, full_result').eq('user_id', uid)
    sq = op.scanId ? sq.eq('id', op.scanId) : sq.order('created_at', { ascending: false }).limit(1)
    const { data: scans } = await sq
    scanRow = Array.isArray(scans) ? scans[0] : scans
  }
  const scan = op.dados?.scan ?? scanRow?.full_result ?? null
  let proto: any = op.protocolo ?? null
  if (!proto) {
    const { data: protos } = await db.from('protocolos').select('id, rotina_am, rotina_pm, dicas')
      .eq('user_id', uid).order('updated_at', { ascending: false }).limit(1)
    proto = Array.isArray(protos) ? protos[0] : protos
  }
  if (!proto) throw Object.assign(new Error('protocolo ainda não disponível'), { status: 409 })

  const onboarding = op.dados?.onboarding ?? onboardingDaLinha(u, scan)

  // A rotina ideal salva veio do motor ANTIGO? (ex.: no onboarding ela é gerada na compra,
  // antes da conta existir, quando a regra ainda não sabe quem é.) Quem chega aqui já usa o
  // motor novo (`usa_motor_novo`), então a rotina é refeita pelo motor novo e salva como a
  // mais recente, antes de escolher os produtos.
  if (uid && !op.simular && scan) proto = await garantirRotinaV2(db, uid, proto, scan, scanRow?.id ?? null, onboarding, log, true, op.idioma ?? 'pt')

  const [catalogo, memorias, casa] = await Promise.all([
    carregarCatalogo(db), memoriasAtivas(db, uid), uid ? produtosDeCasa(db, uid) : Promise.resolve([] as ItemCasa[]),
  ])
  const perfil = perfilMotor(scan, onboarding, memorias)
  const plano = montarPlano(perfil, { temProduto: temProdutoPara(catalogo, filtrosDaPele(perfil, onboarding, scan, null)) })
  const rotina = { morning: (proto.rotina_am ?? []) as Passo[], night: (proto.rotina_pm ?? []) as Passo[] }
  const efetivo = planoEfetivo(rotina, plano)
  const filtros = filtrosDaPele(perfil, onboarding, scan, plano)
  filtros.fortesPermitidos = [...efetivo].filter((a) => ATIVOS[a].forte)
  filtros.ativosDoPlano = [...efetivo]

  const passos = passosComAtivo(rotina, efetivo)

  const r = escolherProdutos(passos, catalogo, casa, filtros, op.idioma ?? 'pt')

  // Conferência (16/nov/2026): o produto de um passo de tratamento bate com o ativo do passo.
  // A escolha já filtra; se algo passar, troca pela 1ª alternativa que bate (ou fica sem).
  for (const e of produtosQueNaoBatem(r.escolhas)) {
    const troca = e.alternativas.find((p) => produtoBateComPasso(p.nome, e.ativo))
    log('PRODUTO_NAO_BATE', { passo: e.passo.name, ativo: e.ativo, produto: e.casa?.nome ?? e.principal?.nome, troca: troca?.nome ?? null })
    if (e.casa) e.casa = null
    e.principal = troca ?? null
  }

  // Conferência final: fortes de TODOS os produtos (o mesmo ativo conta uma vez).
  const fortes = fortesDaRotina(r.escolhas)
  const extras = fortes.filter((a) => !filtros.fortesPermitidos.includes(a))
  if (fortes.length > plano.limiteFortes || extras.length) log('FORTES_ESTOURADOS', { fortes, extras })
  const vazios = passosVazios(r.escolhas)
  if (vazios.length) log('PASSO_SEM_PRODUTO', { passos: vazios.map((e) => e.passo.name) })

  // Frases de cada produto (IA, com reserva montada no código).
  const perfilTexto = JSON.stringify({ tipo_pele: filtros.tipoPele, dores: plano.marcadas, gestante: perfil.gravida })
  const copies = await escreverCopies(r.escolhas, perfilTexto, op.idioma ?? 'pt', uid)
  const copy = (p: ProdutoCatalogo) => copies.get(p.id) ?? synthCopy(p, op.idioma ?? 'pt')

  // recomendacoes_produtos — mesmo formato de sempre; o mesmo passo de manhã e de noite vira 'am+pm'.
  const porNome = new Map<string, { e: Escolha; periodos: Set<string> }>()
  for (const e of r.escolhas) {
    const k = e.passo.name.trim().toLowerCase()
    const x = porNome.get(k)
    if (x) x.periodos.add(e.periodo); else porNome.set(k, { e, periodos: new Set([e.periodo]) })
  }
  const recomendacao = [...porNome.values()].map(({ e, periodos }) => {
    const principalId = e.casa?.produtoId ?? e.principal?.id ?? null
    const lista = [e.principal, ...e.alternativas].filter((p): p is ProdutoCatalogo => !!p)
    const produtos = lista.map((p) => ({ produto_id: p.id, principal: p.id === principalId || (!principalId && p === lista[0]), copy: copy(p) }))
    if (principalId && !produtos.some((x) => x.principal)) produtos.forEach((x, i) => { x.principal = i === 0 })
    return {
      categoria: ROTULO[tipoDoPasso(e.passo)],
      passo: e.passo.name,
      periodo: [...periodos].sort().join('+'),
      produtos,
      ...(produtos.length ? {} : { sem_produto: true, motivo: op.idioma === 'en' ? SEM_PRODUTO_EN : 'Ainda não temos um produto no catálogo para este passo.' }),
    }
  })

  // Minha rotina já com produto (o que vai para montar_minha_rotina_v2).
  const indice = { am: 0, pm: 0 }
  const passosMinha = r.escolhas.map((e) => {
    const i = indice[e.periodo]++
    return {
      periodo: e.periodo,
      nome: e.passo.name,
      ingrediente: e.passo.ingredient,
      instrucao: e.passo.instruction ?? null,
      como_usar: Array.isArray(e.passo.steps) ? e.passo.steps : null,
      tempo_espera: e.passo.waitTime ?? null,
      cor: e.passo.color ?? null,
      dias: Array.isArray(e.passo.dias) && e.passo.dias.length ? e.passo.dias : null,
      passo_ideal: { periodo: e.periodo, indice: i, id: e.passo.id ?? null, nome: e.passo.name },
      produto: e.casa ? { colecao_id: e.casa.colecaoId } : e.principal ? { produto_id: e.principal.id } : null,
      // Só para leitura humana no teste (a função SQL ignora):
      produto_nome: e.casa ? `${e.casa.marca} ${e.casa.nome} (de casa)` : e.principal ? `${e.principal.marca} ${e.principal.nome}` : null,
    }
  })

  if (op.simular) {
    return {
      simulado: true, plano, recomendacao, passosMinha, fortes, vazios: vazios.length,
      avisos: r.avisos, casaFora: r.casaFora,
    }
  }

  const { error: eRec } = await db.from('recomendacoes_produtos')
    .upsert({ user_id: uid, scan_id: scanRow?.id ?? null, recomendacao }, { onConflict: 'user_id' })
  if (eRec) log('RECOMENDACAO_ERRO', { erro: eRec.message })

  // Aviso de orçamento junto dos avisos da rotina (a Rotina mostra dicas[0]).
  if (r.avisos.length && Array.isArray(proto.dicas) && proto.id) {
    const dicas = [...proto.dicas]
    dicas[0] = comAvisos({ morning: [], night: [], introduction_warnings: dicas[0] ?? null }, r.avisos).introduction_warnings ?? null
    await db.from('protocolos').update({ dicas }).eq('id', proto.id)
  }

  const { data: nMinha, error: eMinha } = await db.rpc('montar_minha_rotina_v2', {
    p_uid: uid, p_passos: passosMinha, p_substituir: op.substituir === true,
  })
  if (eMinha) log('MINHA_ROTINA_ERRO', { erro: eMinha.message })

  // Produtos de casa: motivo de quem ficou de fora; limpa o de quem entrou.
  for (const f of r.casaFora) await db.from('colecao_produtos').update({ motivo_fora_rotina: f.motivo }).eq('id', f.colecaoId)
  for (const e of r.escolhas) if (e.casa) await db.from('colecao_produtos').update({ motivo_fora_rotina: null }).eq('id', e.casa.colecaoId)

  log('PRONTO', { passos: r.escolhas.length, vazios: vazios.length, fortes, casa: r.escolhas.filter((e) => e.casa).length, casaFora: r.casaFora.length, minha: nMinha })
  return { recomendacao, minhaRotina: nMinha ?? null, fortes, vazios: vazios.length, avisos: r.avisos }
}

