import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateProposal, applyProposal, logRefusal, semCamposInternos } from '../_shared/protocol-write.ts'
import { verifyJWT } from '../_shared/jwt.ts'
import { temMinhaRotina, lerMinhaRotina, gravarMudanca } from '../_shared/minha-rotina.ts'
import { motivoSimples } from '../niks-chat/proposta.ts'

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

const tratar = async (req: Request): Promise<Response> => {
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

    // Fase 8 (plano da Rotina): quem já tem Minha rotina → a mudança vai para ELA, com as
    // mesmas travas (applyProposal). Os demais seguem na rotina ideal, como antes.
    if (await temMinhaRotina(supabase, user_id)) {
      const antes = await lerMinhaRotina(supabase, user_id)
      const res = applyProposal(antes as any, validation.value)
      if (!res.ok) {
        logRefusal('apply-endpoint', res.reason, { user_id, suggestionId: suggestion_id, payload: validation.value })
        await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', suggestion_id)
        return json({ success: true, action: 'not_applied', reason: res.reason }, 200)
      }
      try {
        await gravarMudanca(supabase, user_id, antes, res.next as any, validation.value)
      } catch (e) {
        console.error('MINHA_ROTINA_WRITE_FAILED', JSON.stringify({ scope: 'apply-endpoint', user_id, suggestionId: suggestion_id, error: String((e as Error)?.message ?? e) }))
        await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', suggestion_id)
        return json({ error: 'Falha ao gravar a rotina' }, 500)
      }
      const agora = new Date().toISOString()
      await supabase.from('coach_protocol_suggestions')
        .update({ status: 'applied', approved_at: agora, applied_at: agora }).eq('id', suggestion_id)
      return json({ success: true, action: 'applied', rotina: 'minha_rotina' }, 200)
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
      .update({ rotina_am: semCamposInternos(result.next.rotina_am), rotina_pm: semCamposInternos(result.next.rotina_pm), updated_at: now })
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
}

// Depois da decisão, a CONFIRMAÇÃO VERDADEIRA vai para a conversa (e volta para o app em
// `mensagem`): "Pronto, sua rotina da manhã foi atualizada ✓" só quando a rotina mudou;
// senão, o motivo em linguagem simples. Assim a NIKS nunca precisa "dizer que alterou".
Deno.serve(async (req) => {
  if (req.method !== 'POST') return tratar(req)
  const corpo = await req.clone().json().catch(() => null) as { suggestion_id?: string; approved?: boolean } | null
  const res = await tratar(req)
  if (res.status !== 200 || !corpo?.suggestion_id || corpo.approved !== true) return res
  try {
    const dados = await res.clone().json()
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: sug } = await supabase.from('coach_protocol_suggestions')
      .select('user_id, conversation_id, proposed_changes').eq('id', corpo.suggestion_id).maybeSingle()
    if (!sug) return res
    const pc = (sug.proposed_changes ?? {}) as Record<string, unknown>
    const periodo: 'am' | 'pm' = pc.period === 'am' ? 'am' : 'pm'
    const quando = periodo === 'am' ? 'da manhã' : 'da noite'
    let texto: string | null = null
    if (dados.action === 'applied') texto = `Pronto, sua rotina ${quando} foi atualizada ✓`
    else if (dados.action === 'not_applied') texto = `Não consegui aplicar essa mudança: ${motivoSimples(String(dados.reason ?? ''), periodo)}. Se quiser, me conta de novo o que você quer mudar.`
    else if (dados.action === 'expired') texto = 'Essa sugestão expirou. Me conta de novo o que você quer mudar que eu preparo outra.'
    if (!texto) return res
    if (sug.conversation_id) {
      await supabase.from('coach_messages').insert({
        conversation_id: sug.conversation_id, user_id: sug.user_id, role: 'assistant', content: texto,
      })
    }
    return new Response(JSON.stringify({ ...dados, mensagem: texto }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('approve-coach-protocol-change: confirmação falhou', e)
    return res
  }
})
