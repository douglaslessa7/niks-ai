// Contas da Anthropic usadas em sequência pelo niks-chat e pela analisar-produto (out/2026).
// Cada conta (tabela `anthropic_contas`) tem crédito por ciclo; a situação do ciclo vem de
// `anthropic_contas_status()` (gasto em `ia_custos.anthropic_conta`). Uma conta serve se está
// ativa, tem a chave no ambiente, gastou menos que `limite_ciclo_usd` no ciclo, não deu
// "sem crédito" neste ciclo e não deu "chave inválida" nos últimos 10 min.
// Ordem (`ia_config.criterio_contas`): 'ciclo_termina_antes' (padrão — gasta primeiro o
// crédito que vence antes) ou 'ordem_fixa' (coluna `ordem`).

// deno-lint-ignore no-explicit-any
type Supabase = any

export type ContaAnthropic = { id: number; apiKey: string }

type StatusConta = {
  id: number
  segredo: string
  ordem: number
  ativa: boolean
  limite: number
  cicloFim: number
  gasto: number
  semCredito: boolean
  chaveInvalida: boolean
}

// Leituras guardadas por 60 s em cada instância: mudar a tabela vale em ≤ 1 min.
const CACHE_MS = 60_000
let statusCache: { em: number; valor: StatusConta[]; criterio: string } | null = null

const SEGREDO_VALIDO = /^ANTHROPIC_API_KEY(_[0-9]+)?$/

async function lerStatus(supabase: Supabase): Promise<{ contas: StatusConta[]; criterio: string }> {
  if (statusCache && Date.now() - statusCache.em < CACHE_MS) return { contas: statusCache.valor, criterio: statusCache.criterio }
  let contas: StatusConta[] = []
  let criterio = 'ciclo_termina_antes'
  try {
    const [st, cfg] = await Promise.all([
      supabase.rpc('anthropic_contas_status'),
      supabase.from('ia_config').select('criterio_contas').eq('id', 1).maybeSingle(),
    ])
    if (st.error) throw st.error
    contas = (st.data ?? []).map((r: any) => ({
      id: Number(r.id),
      segredo: String(r.segredo),
      ordem: Number(r.ordem),
      ativa: !!r.ativa,
      limite: Number(r.limite_ciclo_usd),
      cicloFim: new Date(r.ciclo_fim).getTime(),
      gasto: Number(r.gasto_ciclo_usd ?? 0),
      semCredito: !!r.sem_credito,
      chaveInvalida: !!r.chave_invalida,
    }))
    if (cfg.data?.criterio_contas === 'ordem_fixa') criterio = 'ordem_fixa'
  } catch (e) {
    // Sem a tabela não dá para saber o gasto: nenhuma conta é usada (vai para o gpt) — nunca
    // gastar às cegas além do crédito.
    console.error('anthropic-contas: status ilegível, sem conta da Anthropic nesta leitura', e)
  }
  statusCache = { em: Date.now(), valor: contas, criterio }
  return { contas, criterio }
}

/**
 * Contas que podem atender agora, na ordem em que devem ser tentadas. Lista vazia → gpt;
 * `motivo` resume por que cada conta ficou de fora (vai para `ia_custos.fallback_motivo`).
 */
export async function contasDisponiveis(supabase: Supabase): Promise<{ contas: ContaAnthropic[]; motivo: string | null }> {
  const { contas, criterio } = await lerStatus(supabase)
  const fora: string[] = []
  const servem: Array<StatusConta & { apiKey: string }> = []
  for (const c of contas) {
    const apiKey = SEGREDO_VALIDO.test(c.segredo) ? (Deno.env.get(c.segredo) ?? '') : ''
    if (!c.ativa) fora.push(`${c.id}=inativa`)
    else if (!apiKey) fora.push(`${c.id}=sem_chave`)
    else if (c.semCredito) fora.push(`${c.id}=sem_credito`)
    else if (c.chaveInvalida) fora.push(`${c.id}=chave_invalida`)
    else if (c.gasto >= c.limite) fora.push(`${c.id}=limite`)
    else servem.push({ ...c, apiKey })
  }
  servem.sort((a, b) => criterio === 'ordem_fixa'
    ? a.ordem - b.ordem
    : (a.cicloFim - b.cicloFim) || (a.ordem - b.ordem))
  return {
    contas: servem.map((c) => ({ id: c.id, apiKey: c.apiKey })),
    motivo: contas.length === 0 ? 'contas_ilegiveis' : (fora.length ? fora.join(',') : null),
  }
}

export type ProblemaConta = 'sem_credito' | 'chave_invalida'

/**
 * Erro da Anthropic que é da CONTA (não da pergunta): crédito insuficiente ou chave
 * inválida/revogada/sem permissão. Nesses casos a mesma pergunta vai para a próxima conta.
 */
export function problemaDaConta(e: unknown): ProblemaConta | null {
  const status = (e as { status?: number })?.status
  const msg = `${(e as Error)?.message ?? ''} ${JSON.stringify((e as { error?: unknown })?.error ?? '')}`
  if (/credit balance|insufficient.{0,20}credit/i.test(msg) || status === 402) return 'sem_credito'
  if (status === 401 || status === 403) return 'chave_invalida'
  return null
}

/** Tira a conta da fila (já nesta instância e, pela tabela, em todas). */
export async function marcarProblema(supabase: Supabase, id: number, problema: ProblemaConta, detalhe: string): Promise<void> {
  if (statusCache) {
    statusCache.valor = statusCache.valor.map((c) => c.id !== id ? c
      : problema === 'sem_credito' ? { ...c, semCredito: true } : { ...c, chaveInvalida: true })
  }
  try {
    const agora = new Date().toISOString()
    const { error } = await supabase.from('anthropic_contas').update({
      ...(problema === 'sem_credito' ? { sem_credito_em: agora } : { chave_invalida_em: agora }),
      ultimo_erro: `${problema}: ${detalhe}`.slice(0, 500),
      atualizado_em: agora,
    }).eq('id', id)
    if (error) throw error
  } catch (e) {
    console.error('anthropic-contas: falha ao marcar a conta', id, problema, e)
  }
}
