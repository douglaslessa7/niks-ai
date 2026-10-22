import { temMinhaRotina, lerMinhaRotina } from '../_shared/minha-rotina.ts'
import type { Consultas } from './claude.ts'

// Consultas do agente NIKS (out/2026) — SÓ LEITURA. A NIKS pede quando a resposta depende
// de um dado que não está no contexto fixo; a função lê, resume e devolve ao modelo.
// Regras: o user_id vem SEMPRE do token (nunca do modelo); todo resultado tem tamanho
// máximo; nada aqui grava no banco. Para mudar a rotina, continua sendo a proposta + cartão.

// deno-lint-ignore no-explicit-any
type Supabase = any

const MAX_CHARS = 8000 // teto de cada resultado (~3.500 tokens)

const json = (v: unknown) => {
  const s = JSON.stringify(v)
  return s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) + '…(cortado)' : s
}

const data = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null)

// Seção que entra no prompt de sistema SÓ no Claude (a reserva gpt-5.4-mini não tem as
// ferramentas). Fica depois do prompt principal e também vai para o cache.
export const INSTRUCOES_CONSULTAS = `<Consultas>
Você tem ferramentas de CONSULTA (só leitura) para dados que NÃO estão no contexto acima: ver_estante, ver_recomendados, ver_produtos_escaneados, ver_scan_pele, ver_evolucao_scans e ver_rotina.
- Consulte sempre que a resposta depender desses dados dela (ex.: "o que eu tenho em casa", "qual produto recomendado", "aquele produto que eu escaneei", "melhorei?", detalhes por região do rosto, "qual era minha rotina ideal"). Para dúvidas gerais, responda direto, sem consultar.
- De preferência, escreva primeiro UMA frase curta dizendo o que vai olhar (ex.: "Vou dar uma olhada na sua estante.") e só então chame a consulta. Essa frase aparece na tela dela enquanto a consulta roda; sem ela, a tela fica parada. Depois, responda usando o que voltou, sem repetir a frase.
- Nunca invente dados dela (produtos, scans, rotina, compatibilidade). Use só o que está no contexto ou no que a consulta trouxe. Se vier vazio, diga que não encontrou.
- O contexto acima (perfil, resumo do scan, rotina atual, memória, histórico) continua valendo: não consulte de novo o que já está nele.
- Consultar não muda nada. Para mudar a rotina, continue usando propor_mudanca_rotina, com as mesmas regras.
</Consultas>`

const DEFINICOES: Consultas['definicoes'] = [
  {
    name: 'ver_estante',
    description: 'Lista os produtos que ela tem em casa (a estante do app): nome, marca, categoria, compatibilidade com a pele dela (0-100) e se o produto já está na rotina dela. Use quando ela perguntar o que tem em casa, se algum produto dela serve para algo, ou antes de sugerir comprar algo que ela talvez já tenha.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ver_recomendados',
    description: 'Mostra os produtos que o app recomendou para ela, por passo da rotina (manhã/noite): o produto principal, as alternativas e o motivo. Use quando ela perguntar o que comprar, qual produto usar num passo, ou sobre "os produtos recomendados".',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ver_produtos_escaneados',
    description: 'Lista os últimos produtos que ela escaneou no app, com o veredito (pode_usar / com_ressalva / evitaria), a compatibilidade e um resumo. Com detalhe_id, devolve a análise completa de um deles. Use quando ela falar de um produto que já escaneou.',
    input_schema: {
      type: 'object',
      properties: { detalhe_id: { type: 'string', description: 'id de um produto da lista, para ver a análise completa. Omita para listar.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'ver_scan_pele',
    description: 'Detalhes do ÚLTIMO scan de pele dela, além do resumo que já está no contexto: as 6 métricas, achados (acne, manchas, poros, oleosidade, rosácea, envelhecimento, olheiras), o que foi visto em cada região do rosto, prioridades clínicas e a qualidade da foto. Use quando precisar de detalhe por região ou por métrica.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ver_evolucao_scans',
    description: 'Evolução da pele dela: score e as 6 métricas de cada scan (até os 10 últimos, do mais antigo ao mais novo) e a diferença entre o primeiro e o último. Use quando ela perguntar se melhorou, como está evoluindo ou comparar com antes.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ver_rotina',
    description: 'Rotina dela. qual="ideal": a rotina ideal que o app montou a partir do scan (útil para comparar com a que ela faz hoje). qual="atual": a que ela faz hoje (normalmente já está no contexto em <CurrentProtocol>; só consulte se precisar de novo).',
    input_schema: {
      type: 'object',
      properties: { qual: { type: 'string', enum: ['ideal', 'atual'] } },
      required: ['qual'],
      additionalProperties: false,
    },
  },
]

// ── Leituras ────────────────────────────────────────────────────────────────

async function verEstante(supabase: Supabase, userId: string) {
  const [{ data: itens, error }, { data: passos }] = await Promise.all([
    supabase.from('colecao_produtos')
      .select('id, nome, marca, categoria, compatibilidade, product_scan_id, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(40),
    supabase.from('minha_rotina_passos')
      .select('colecao_item_id, periodo, nome').eq('user_id', userId).not('colecao_item_id', 'is', null),
  ])
  if (error) throw error
  if (!itens?.length) return 'A estante dela está vazia (nenhum produto cadastrado no app).'
  // Compatibilidade que falta na estante: a do scan do produto, quando houver.
  const semCompat = itens.filter((i: any) => i.compatibilidade == null && i.product_scan_id).map((i: any) => i.product_scan_id)
  const compatScan = new Map<string, number>()
  if (semCompat.length) {
    const { data: scans } = await supabase.from('product_scans').select('id, resultado').in('id', semCompat)
    for (const s of scans ?? []) {
      const c = s?.resultado?.compatibilidade
      if (typeof c === 'number') compatScan.set(s.id, c)
    }
  }
  const naRotina = new Map<string, string[]>()
  for (const p of passos ?? []) {
    const onde = `${p.periodo === 'am' ? 'manhã' : 'noite'}${p.nome ? ` (${p.nome})` : ''}`
    naRotina.set(p.colecao_item_id, [...(naRotina.get(p.colecao_item_id) ?? []), onde])
  }
  return json({
    produtos: itens.map((i: any) => ({
      nome: i.nome, marca: i.marca, categoria: i.categoria,
      compatibilidade: i.compatibilidade ?? compatScan.get(i.product_scan_id) ?? null,
      na_rotina: naRotina.get(i.id) ?? null,
    })),
  })
}

async function verRecomendados(supabase: Supabase, userId: string) {
  const { data: rec, error } = await supabase.from('recomendacoes_produtos')
    .select('recomendacao, created_at').eq('user_id', userId).maybeSingle()
  if (error) throw error
  const passos: any[] = Array.isArray(rec?.recomendacao) ? rec.recomendacao : []
  if (!passos.length) return 'Ela ainda não tem produtos recomendados no app.'
  const ids = [...new Set(passos.flatMap((p) => (p?.produtos ?? []).map((x: any) => x?.produto_id)).filter(Boolean))]
  const { data: prods } = ids.length
    ? await supabase.from('produtos').select('id, marca, nome, ativos_principais, seguro_gestante, intensidade').in('id', ids)
    : { data: [] }
  const porId = new Map((prods ?? []).map((p: any) => [p.id, p]))
  const nome = (id: string) => { const p: any = porId.get(id); return p ? `${p.marca} ${p.nome}` : null }
  return json({
    gerada_em: data(rec?.created_at),
    passos: passos.map((p) => {
      const lista = (p?.produtos ?? []) as any[]
      const principal = lista.find((x) => x?.principal) ?? lista[0]
      const pp: any = principal ? porId.get(principal.produto_id) : null
      return {
        periodo: ({ am: 'manhã', pm: 'noite', 'am+pm': 'manhã e noite' } as Record<string, string>)[p?.periodo] ?? p?.periodo ?? null,
        passo: p?.passo ?? p?.categoria,
        motivo: p?.motivo ?? null,
        principal: pp ? {
          produto: nome(principal.produto_id), ativos: pp.ativos_principais ?? null,
          seguro_gestante: pp.seguro_gestante ?? null, intensidade: pp.intensidade ?? null,
          por_que: principal.copy ?? null,
        } : null,
        alternativas: lista.filter((x) => x !== principal).map((x) => nome(x?.produto_id)).filter(Boolean),
        sem_produto: lista.length === 0 ? true : undefined,
      }
    }),
  })
}

async function verProdutosEscaneados(supabase: Supabase, userId: string, detalheId?: string) {
  if (detalheId) {
    const { data: s, error } = await supabase.from('product_scans')
      .select('id, produto_nome, produto_marca, resultado, created_at')
      .eq('user_id', userId).eq('id', detalheId).maybeSingle()
    if (error) throw error
    if (!s) return 'Não encontrei esse produto entre os escaneados dela.'
    const { mensagem: _m, ...resultado } = (s.resultado ?? {}) as Record<string, unknown>
    return json({ id: s.id, escaneado_em: data(s.created_at), ...resultado })
  }
  const { data: lista, error } = await supabase.from('product_scans')
    .select('id, produto_nome, produto_marca, resultado, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(10)
  if (error) throw error
  if (!lista?.length) return 'Ela ainda não escaneou nenhum produto no app.'
  return json({
    produtos: lista.map((s: any) => ({
      id: s.id,
      produto: [s.produto_marca ?? s.resultado?.produto?.marca, s.produto_nome ?? s.resultado?.produto?.nome].filter(Boolean).join(' ') || null,
      escaneado_em: data(s.created_at),
      veredito: s.resultado?.veredito ?? null,
      compatibilidade: s.resultado?.compatibilidade ?? null,
      resumo: s.resultado?.resumo ?? null,
    })),
  })
}

async function verScanPele(supabase: Supabase, userId: string) {
  const { data: s, error } = await supabase.from('skin_scans')
    .select('skin_score, full_result, created_at').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (!s) return 'Ela ainda não tem scan de pele.'
  const f = (s.full_result ?? {}) as Record<string, any>
  const achado = (o: any, ...campos: string[]) => {
    if (!o || typeof o !== 'object') return null
    const r: Record<string, unknown> = {}
    for (const c of ['present', ...campos, 'insight']) if (o[c] != null) r[c] = o[c]
    return Object.keys(r).length ? r : null
  }
  return json({
    data: data(s.created_at),
    score: s.skin_score ?? f.skin_score ?? null,
    metricas: f.metricas ?? null,
    tipo_pele: f.skin_type_sebaceous ?? f.skin_type_detected ?? null,
    hidratacao: f.skin_hydration ?? null,
    fototipo: f.skin_phototype ?? null,
    barreira: { status: f.barrier_status ?? null, leitura: f.barrier_insight ?? null },
    acne: achado(f.acne, 'lesion_type', 'severity', 'distribution', 'pattern'),
    manchas: achado(f.pigmentacao, 'type', 'intensity_score', 'distribution'),
    cicatrizes: achado(f.cicatrizes, 'type', 'severity'),
    rosacea: achado(f.rosacea, 'subtype'),
    poros_textura: achado(f.textura_poros, 'severity'),
    oleosidade: achado(f.brilho_sebaceo, 'severity', 'distribution'),
    envelhecimento: achado(f.envelhecimento, 'skin_age', 'severity'),
    area_dos_olhos: f.area_periocular ?? null,
    regioes: Array.isArray(f.region_insights)
      ? f.region_insights.map((r: any) => ({ regiao: r?.region, achado: r?.main_finding, consequencia: r?.consequence }))
      : null,
    prioridade_clinica: f.prioridade_clinica ?? null,
    contraindicacoes: f.contraindicacoes ?? null,
    qualidade_da_foto: f.qualidade_foto ? { nivel: f.qualidade_foto.nivel, notas: f.qualidade_foto.notas } : null,
  })
}

async function verEvolucaoScans(supabase: Supabase, userId: string) {
  const { data: rows, error } = await supabase.from('skin_scans')
    .select('skin_score, full_result, created_at').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(10)
  if (error) throw error
  if (!rows?.length) return 'Ela ainda não tem scan de pele.'
  const scans = [...rows].reverse().map((r: any) => ({
    data: data(r.created_at),
    score: r.skin_score ?? r.full_result?.skin_score ?? null,
    metricas: r.full_result?.metricas ?? null,
  }))
  const primeiro = scans[0]
  const ultimo = scans[scans.length - 1]
  const diferenca: Record<string, number> = {}
  if (scans.length > 1) {
    if (typeof primeiro.score === 'number' && typeof ultimo.score === 'number') diferenca.score = ultimo.score - primeiro.score
    for (const k of Object.keys(ultimo.metricas ?? {})) {
      const a = primeiro.metricas?.[k], b = ultimo.metricas?.[k]
      if (typeof a === 'number' && typeof b === 'number') diferenca[k] = b - a
    }
  }
  return json({
    total_de_scans: scans.length,
    scans,
    diferenca_primeiro_para_ultimo: scans.length > 1 ? diferenca : 'só há um scan — ainda não dá para comparar',
  })
}

async function verRotina(supabase: Supabase, userId: string, qual: string) {
  const passo = (p: any) => ({ passo: p?.name ?? p?.nome ?? null, produto_ou_ativo: p?.ingredient ?? null, como_usar: p?.instruction ?? null })
  if (qual === 'atual' && await temMinhaRotina(supabase, userId)) {
    const r = await lerMinhaRotina(supabase, userId)
    return json({ rotina: 'atual (Minha rotina)', manha: r.rotina_am.map(passo), noite: r.rotina_pm.map(passo) })
  }
  const { data: p, error } = await supabase.from('protocolos')
    .select('rotina_am, rotina_pm, updated_at').eq('user_id', userId)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (!p) return 'Ela ainda não tem rotina ideal gerada no app.'
  return json({
    rotina: qual === 'atual' ? 'atual (é a rotina ideal do app — ela não tem Minha rotina)' : 'ideal (montada pelo app a partir do scan)',
    atualizada_em: data(p.updated_at),
    manha: (Array.isArray(p.rotina_am) ? p.rotina_am : []).map(passo),
    noite: (Array.isArray(p.rotina_pm) ? p.rotina_pm : []).map(passo),
  })
}

// ── Montagem ────────────────────────────────────────────────────────────────

export function criarConsultas(supabase: Supabase, userId: string): Consultas {
  return {
    definicoes: DEFINICOES,
    instrucoes: INSTRUCOES_CONSULTAS,
    executar: (nome, entrada) => {
      const e = (entrada ?? {}) as Record<string, unknown>
      switch (nome) {
        case 'ver_estante': return verEstante(supabase, userId)
        case 'ver_recomendados': return verRecomendados(supabase, userId)
        case 'ver_produtos_escaneados':
          return verProdutosEscaneados(supabase, userId, typeof e.detalhe_id === 'string' ? e.detalhe_id : undefined)
        case 'ver_scan_pele': return verScanPele(supabase, userId)
        case 'ver_evolucao_scans': return verEvolucaoScans(supabase, userId)
        case 'ver_rotina': return verRotina(supabase, userId, e.qual === 'atual' ? 'atual' : 'ideal')
        default: return Promise.reject(new Error(`consulta desconhecida: ${nome}`))
      }
    },
  }
}
