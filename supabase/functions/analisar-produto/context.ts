import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Context pack para a análise de produto — mesma lógica de montagem do niks-chat
// (buscar perfil, último skin scan, protocolo e memórias ativas com a service
// role), adaptada: SEM histórico de conversa / food scans / sugestão pendente, e
// COM os dois campos de rotina do onboarding (skincare_routine_type/description)
// que o context do chat carrega via select('*') mas não renderiza no XML.

export type ProductContext = {
  profile: Record<string, unknown> | null
  lastScan: Record<string, unknown> | null
  protocol: Record<string, unknown> | null
  memories: Array<Record<string, unknown>>
}

export function createSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function getProfile(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  // select('*') traz skincare_routine_type e skincare_routine_description
  // (colunas do onboarding na tabela users) além do resto do perfil.
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

async function getProtocol(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  const { data } = await supabase
    .from('protocolos')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  return data
}

async function getMemories(supabase: ReturnType<typeof createSupabaseClient>, userId: string) {
  const { data } = await supabase
    .from('coach_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
  return data ?? []
}

export async function buildContext(
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string,
): Promise<ProductContext> {
  // Promise.allSettled → se qualquer busca falhar (ex.: usuária sem scan ainda),
  // degrada graciosamente em vez de quebrar a função.
  const results = await Promise.allSettled([
    getProfile(supabase, userId),
    getLastScan(supabase, userId),
    getProtocol(supabase, userId),
    getMemories(supabase, userId),
  ])

  const getValue = <T>(r: PromiseSettledResult<T>): T | null =>
    r.status === 'fulfilled' ? r.value : null

  return {
    profile: getValue(results[0]) as ProductContext['profile'],
    lastScan: getValue(results[1]) as ProductContext['lastScan'],
    protocol: getValue(results[2]) as ProductContext['protocol'],
    memories: (getValue(results[3]) ?? []) as ProductContext['memories'],
  }
}
