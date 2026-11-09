import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Limite das funções de IA abertas no onboarding (Parte B, Fase 8): 20 chamadas por hora e por
// IP, por função. Guarda só o hash do IP. Se o limite falhar, a chamada segue.
const LIMITE = 20

export async function limitePorIp(req: Request, funcao: string): Promise<Response | null> {
  try {
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sem-ip'
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}:${service}`)))
    const chave = `ia:${funcao}:${Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')}`
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', service)
    const { data, error } = await supabase.rpc('limite_por_ip', { p_chave: chave, p_limite: LIMITE })
    if (error || data !== false) return null
    return new Response(JSON.stringify({ error: 'limite' }), {
      status: 429,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[limiteIp]', (e as Error).message)
    return null
  }
}
