import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateProposal, applyProposal, logRefusal } from '../_shared/protocol-write.ts'
import { verifyJWT } from '../_shared/jwt.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Log dos guardas de ENTRADA (auth / corpo / sugestão não encontrada). Prefixo próprio,
// SEPARADO do PROTOCOL_REFUSED (que mede recusa clínica/de schema da PROPOSTA) — misturar
// os dois arruinaria a métrica de qualidade do que a NIKS propõe.
const logReject = (reason: string, ctx: Record<string, unknown> = {}) =>
  console.warn('APPROVE_ENDPOINT_REJECTED', JSON.stringify({ reason, ...ctx }))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      logReject('auth-missing')
      return json({ error: 'Unauthorized' }, 401)
    }

    // Verificação LOCAL do JWT (crypto.subtle) — igual à niks-chat, que migrou de
    // auth.getUser() por causa de 401 falsos documentados. Fonte única em _shared/jwt.ts.
    const jwtPayload = await verifyJWT(authHeader.slice(7))
    if (!jwtPayload?.sub) {
      logReject('auth-invalid')
      return json({ error: 'Unauthorized' }, 401)
    }
    const user_id = jwtPayload.sub

    const body = await req.json()
    const { suggestion_id, approved } = body as {
      suggestion_id?: string
      approved?: boolean
    }

    if (!suggestion_id || approved === undefined) {
      logReject('bad-request', { hasSuggestionId: !!suggestion_id, approvedType: typeof approved })
      return json({ error: 'suggestion_id e approved são obrigatórios' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Buscar sugestão pendente
    const { data: suggestion, error: suggestionError } = await supabase
      .from('coach_protocol_suggestions')
      .select('id, proposed_changes, created_at')
      .eq('id', suggestion_id)
      .eq('user_id', user_id)
      .eq('status', 'pending')
      .single()

    if (suggestionError || !suggestion) {
      logReject('suggestion-not-found', { user_id, suggestionId: suggestion_id, error: suggestionError?.message })
      return json({ error: 'Sugestão não encontrada ou já processada' }, 404)
    }

    if (!approved) {
      await supabase
        .from('coach_protocol_suggestions')
        .update({ status: 'rejected' })
        .eq('id', suggestion_id)

      return json({ success: true, action: 'rejected' }, 200)
    }

    const rawChanges = suggestion.proposed_changes

    // Rule 8 — expiração. created_at OBRIGATÓRIO: falta = falha explícita e logada.
    const createdMs = suggestion.created_at ? new Date(suggestion.created_at).getTime() : NaN
    if (!Number.isFinite(createdMs)) {
      console.error('PROTOCOL_MISSING_CREATED_AT', JSON.stringify({
        scope: 'apply-endpoint', user_id, suggestionId: suggestion_id, created_at: suggestion.created_at ?? null,
      }))
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', suggestion_id)
      return json({ success: true, action: 'not_applied', reason: 'missing-created_at' }, 200)
    }
    if (Date.now() - createdMs > 24 * 60 * 60 * 1000) {
      console.warn('PROTOCOL_EXPIRED', JSON.stringify({
        scope: 'apply-endpoint', user_id, suggestionId: suggestion_id, createdAt: suggestion.created_at,
      }))
      await supabase.from('coach_protocol_suggestions').update({ status: 'expired' }).eq('id', suggestion_id)
      return json({ success: true, action: 'expired' }, 200)
    }

    // Contenção de pausa (INTACTA).
    if ((rawChanges as Record<string, unknown> | null)?.action === 'pause') {
      const rc = rawChanges as Record<string, unknown>
      console.warn(
        'approve-coach-protocol-change: PAUSE_CONTAINMENT — pausa aprovada mas NÃO aplicada (sem implementação segura):',
        JSON.stringify({ user_id, suggestionId: suggestion_id, action: rc.action, step_name: rc.step_name, period: rc.period }),
      )
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', suggestion_id)
      return json({ success: true, action: 'not_applied', reason: 'pause' }, 200)
    }

    // Rule 1 — validação de schema em runtime.
    const validation = validateProposal(rawChanges)
    if (!validation.ok) {
      logRefusal('apply-endpoint', validation.reason, { user_id, suggestionId: suggestion_id, payload: rawChanges })
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', suggestion_id)
      return json({ success: true, action: 'not_applied', reason: validation.reason }, 200)
    }

    // Buscar protocolo atual
    const { data: protocol, error: protocolError } = await supabase
      .from('protocolos')
      .select('id, rotina_am, rotina_pm, updated_at')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (protocolError || !protocol) {
      logRefusal('apply-endpoint', 'protocol-not-found', { user_id, suggestionId: suggestion_id })
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', suggestion_id)
      return json({ error: 'Protocolo não encontrado' }, 404)
    }

    const result = applyProposal(
      { rotina_am: protocol.rotina_am ?? [], rotina_pm: protocol.rotina_pm ?? [] },
      validation.value,
    )
    if (!result.ok) {
      logRefusal('apply-endpoint', result.reason, { user_id, suggestionId: suggestion_id, payload: validation.value })
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', suggestion_id)
      return json({ success: true, action: 'not_applied', reason: result.reason }, 200)
    }

    const now = new Date().toISOString()

    // Captura de erro de escrita: não marca 'applied' se a gravação falhar.
    const { error: updateProtocolError } = await supabase
      .from('protocolos')
      .update({ rotina_am: result.next.rotina_am, rotina_pm: result.next.rotina_pm, updated_at: now })
      .eq('id', protocol.id)

    if (updateProtocolError) {
      console.error('PROTOCOL_WRITE_FAILED', JSON.stringify({
        scope: 'apply-endpoint', user_id, suggestionId: suggestion_id, error: updateProtocolError.message,
      }))
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', suggestion_id)
      return json({ error: 'Falha ao gravar protocolo' }, 500)
    }

    await supabase
      .from('coach_protocol_suggestions')
      .update({ status: 'applied', approved_at: now, applied_at: now })
      .eq('id', suggestion_id)

    return json({
      success: true,
      action: 'applied',
      protocol: {
        id: protocol.id,
        rotina_am: result.next.rotina_am,
        rotina_pm: result.next.rotina_pm,
        updated_at: now,
      },
    }, 200)
  } catch (error) {
    console.error('approve-coach-protocol-change: erro não tratado', error)
    return json({ error: 'Erro interno' }, 500)
  }
})
