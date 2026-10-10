import { temMinhaRotina, lerMinhaRotina } from '../_shared/minha-rotina.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type UserContext = {
  profile: Record<string, unknown> | null
  lastScan: Record<string, unknown> | null
  scanHistory: Array<{ id: string; skin_score: number; created_at: string; full_result: unknown }> | null
  protocol: Record<string, unknown> | null
  recentFoodScans: Array<{
    id: string
    meal_name: string
    meal_score: number
    meal_label: string
    meal_summary: string
    full_result: unknown
    created_at: string
  }> | null
  history: Array<{ id: string; role: string; content: string; image_url: string | null; created_at: string }>
  memories: Array<Record<string, unknown>>
  pendingSuggestion: Record<string, unknown> | null
  // A última sugestão já resolvida (até 3 dias): aplicada, recusada, não aplicada… — para
  // a NIKS contar a verdade ("atualizei?") em vez de supor pela própria fala anterior.
  ultimaMudanca: Record<string, unknown> | null
}

export function createSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

async function getProfile(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

async function getLastScan(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  const { data } = await supabase
    .from('skin_scans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data
}

async function getScanHistory(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  const { data } = await supabase
    .from('skin_scans')
    .select('id, skin_score, created_at, full_result')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data
}

// Rotina do contexto: a MINHA ROTINA (a que ela faz) para quem já tem — build nova,
// `users.minha_rotina_criada_em` — e a IDEAL (`protocolos`) para os demais, como antes.
async function getProtocol(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  if (await temMinhaRotina(supabase, userId)) {
    const minha = await lerMinhaRotina(supabase, userId)
    return { ...minha, _fonte: 'minha_rotina' }
  }
  const { data } = await supabase
    .from('protocolos')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  return data
}

async function getRecentFoodScans(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  // Calcula meia-noite do dia anterior no fuso UTC-3
  // UTC-3 significa que o horário local = UTC - 3h, ou seja, UTC = local + 3h
  const nowUtcMs = Date.now()
  // Converte para timestamp no fuso UTC-3 (adiciona 3h para "mover" para UTC-3)
  const nowInUtcMinus3Ms = nowUtcMs - (3 * 60 * 60 * 1000)
  const dateInUtcMinus3 = new Date(nowInUtcMinus3Ms)
  // Zera para meia-noite nesse fuso
  dateInUtcMinus3.setUTCHours(0, 0, 0, 0)
  // Subtrai 1 dia
  dateInUtcMinus3.setUTCDate(dateInUtcMinus3.getUTCDate() - 1)
  // Converte de volta para UTC (remove os 3h que adicionamos)
  const thresholdUtcMs = dateInUtcMinus3.getTime() + (3 * 60 * 60 * 1000)
  const thresholdIso = new Date(thresholdUtcMs).toISOString()

  const { data } = await supabase
    .from('food_scans')
    .select('id, meal_name, meal_score, meal_label, meal_summary, full_result, created_at')
    .eq('user_id', userId)
    .gte('created_at', thresholdIso)
    .order('created_at', { ascending: false })
  return data
}

async function getHistory(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('coach_messages')
    .select('id, role, content, image_url, created_at')
    .eq('user_id', userId)
    .gte('created_at', threeDaysAgo)
    .order('created_at', { ascending: true })
    .limit(40)
  return data ?? []
}

async function getMemories(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  const { data } = await supabase
    .from('coach_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
  return data ?? []
}

async function getPendingSuggestion(supabase: ReturnType<typeof createSupabaseClient>, userId: string, _conversationId: string) {
  // Por USUÁRIA (out/2026): o app novo mostra a pendente num card fixo em qualquer
  // conversa, e uma proposta nova substitui a anterior. Pendente com +24h é marcada como
  // expirada DE VERDADE (antes só era ignorada na leitura e podia travar a conversa).
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('coach_protocol_suggestions')
    .update({ status: 'expired' }).eq('user_id', userId).eq('status', 'pending').lt('created_at', cutoffIso)
  const { data } = await supabase
    .from('coach_protocol_suggestions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function getUltimaMudanca(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  const desde = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('coach_protocol_suggestions')
    .select('status, proposed_changes, created_at, applied_at')
    .eq('user_id', userId)
    .neq('status', 'pending')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function buildContext(
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string,
  conversationId: string,
  includeFullScanHistory: boolean
): Promise<UserContext> {
  const promises = [
    getProfile(supabase, userId),
    getLastScan(supabase, userId),
    includeFullScanHistory ? getScanHistory(supabase, userId) : Promise.resolve(null),
    getProtocol(supabase, userId),
    getRecentFoodScans(supabase, userId),
    getHistory(supabase, userId),
    getMemories(supabase, userId),
    getPendingSuggestion(supabase, userId, conversationId),
    getUltimaMudanca(supabase, userId),
  ]

  const results = await Promise.allSettled(promises)

  const getValue = <T>(result: PromiseSettledResult<T>): T | null =>
    result.status === 'fulfilled' ? result.value : null

  return {
    profile: getValue(results[0]) as UserContext['profile'],
    lastScan: getValue(results[1]) as UserContext['lastScan'],
    scanHistory: getValue(results[2]) as UserContext['scanHistory'],
    protocol: getValue(results[3]) as UserContext['protocol'],
    recentFoodScans: getValue(results[4]) as UserContext['recentFoodScans'],
    history: (getValue(results[5]) ?? []) as UserContext['history'],
    memories: (getValue(results[6]) ?? []) as UserContext['memories'],
    pendingSuggestion: getValue(results[7]) as UserContext['pendingSuggestion'],
    ultimaMudanca: getValue(results[8]) as UserContext['ultimaMudanca'],
  }
}
