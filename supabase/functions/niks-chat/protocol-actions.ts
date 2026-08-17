import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateProposal, applyProposal, logRefusal } from '../_shared/protocol-write.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

// Duas frases-gatilho, uma por sentido da ação. A frase visível é o consentimento que
// a usuária leu; ela precisa combinar com o `action` do bloco (ver cruzamento abaixo).
const INCLUDE_PHRASE = 'posso incluir isso no seu protocolo?' // add e replace
const REMOVE_PHRASE = 'posso remover isso do seu protocolo?'  // remove

// Extracts the outermost JSON object from a string, handling any preamble
// the model may have added before the JSON.
function extractJSON(text: string): string {
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return text
  return text.slice(start, end + 1)
}

export async function checkForSuggestion(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  conversationId: string,
  visibleText: string,
  blocks: string[]
): Promise<void> {
  try {
    const lowered = (visibleText ?? '').toLowerCase()
    const hasInclude = lowered.includes(INCLUDE_PHRASE)
    const hasRemove = lowered.includes(REMOVE_PHRASE)
    const hasPhrase = hasInclude || hasRemove
    const blockCount = blocks?.length ?? 0

    // Gate duplo: a sugestão só nasce se a resposta VISÍVEL tiver a frase-gatilho E
    // houver exatamente UM bloco válido. A frase é o consentimento que a usuária viu;
    // o bloco é o dado estruturado. Os descasamentos são logados separadamente para
    // o usuário medir cada direção do erro do modelo.
    if (!hasPhrase && blockCount === 0) return // mensagem normal, sem proposta
    if (hasPhrase && blockCount === 0) {
      logRefusal('create', 'phrase-without-block', { userId, conversationId })
      return
    }
    if (!hasPhrase && blockCount >= 1) {
      logRefusal('create', 'block-without-phrase', { userId, conversationId, payload: blocks })
      return
    }
    if (blockCount > 1) {
      logRefusal('create', 'multiple-blocks', { userId, conversationId, count: blockCount })
      return
    }

    // Verificar se já existe sugestão pendente (GLOBAL — no máximo uma viva por
    // usuária; é o que impede uma segunda proposta enquanto a de outra conversa está
    // aberta). Pendente com +24h deixa de contar na LEITURA (mesmo corte da regra 8),
    // senão uma pendente presa numa conversa antiga bloquearia proposta nova para sempre.
    const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existing } = await supabase
      .from('coach_protocol_suggestions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gte('created_at', cutoffIso)
      .limit(1)

    if (existing && existing.length > 0) return

    // A NIKS emite o próprio bloco estruturado (não há mais tradutor via LLM).
    let parsed: any
    try {
      parsed = JSON.parse(extractJSON(blocks[0]))
    } catch (_e) {
      logRefusal('create', 'block-parse-failed', { userId, conversationId, payload: blocks[0] })
      return
    }

    // Rule 1 — proposta fora do contrato NÃO vira sugestão e não é gravada.
    const validation = validateProposal(parsed)
    if (!validation.ok) {
      logRefusal('create', validation.reason, { userId, conversationId, payload: parsed })
      return
    }

    // Cruzamento de consentimento: a frase que a usuária leu tem que combinar com o
    // que o bloco faz. Descasamento = ela aprovaria algo diferente do que leu → recusa.
    const action = validation.value.action
    if (action === 'remove' && hasInclude) {
      // GRAVE: leu "incluir", o bloco APAGARIA um passo. Payload completo p/ medir o que
      // ela tentava remover, não só que errou.
      logRefusal('create', 'phrase-include-block-remove', { userId, conversationId, payload: validation.value })
      return
    }
    if ((action === 'add' || action === 'replace') && hasRemove) {
      logRefusal('create', 'phrase-remove-block-add-or-replace', { userId, conversationId })
      return
    }

    await supabase.from('coach_protocol_suggestions').insert({
      user_id: userId,
      conversation_id: conversationId,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      proposed_changes: validation.value,
      status: 'pending',
    })
  } catch (err) {
    console.error('protocol-actions.ts: checkForSuggestion failed', err)
  }
}

export async function checkApprovalIntent(
  supabase: any,
  userId: string,
  userMessage: string,
  pendingSuggestion: {
    id: string
    proposed_changes: unknown
    created_at: string
  },
): Promise<void> {
  try {
    const prompt = `A usuária acabou de responder a uma proposta de alteração no protocolo de skincare dela.
Analise a mensagem e determine a intenção.
Retorne SOMENTE JSON válido, sem markdown, sem texto antes ou depois:

{
  "intent": "approved | rejected | unclear"
}

Regras:
- "approved": mensagem indica claramente que quer a alteração. Exemplos: "sim", "pode", "claro", "vai", "quero", "por favor", "tá bom", "manda ver", "vamos", "pode fazer", "faz", "vai lá", "tô dentro".
- "rejected": mensagem indica claramente que não quer. Exemplos: "não", "nao", "não quero", "prefiro não", "melhor não", "negativo", "deixa", "cancela", "esquece", "para", "não precisa".
- "unclear": qualquer outro caso — pergunta, dúvida, comentário não relacionado, mensagem ambígua.

Mensagem da usuária: ${userMessage}`

    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        max_tokens: 128,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      console.error('protocol-actions.ts: OpenAI error (checkApprovalIntent)', resp.status, await resp.text())
      return
    }

    const data = await resp.json()
    const text = data.choices[0].message.content
    const { intent } = JSON.parse(extractJSON(text)) as { intent: 'approved' | 'rejected' | 'unclear' }

    if (intent === 'unclear') return

    if (intent === 'rejected') {
      await supabase
        .from('coach_protocol_suggestions')
        .update({ status: 'rejected' })
        .eq('id', pendingSuggestion.id)
      return
    }

    // approved
    const rawChanges = pendingSuggestion.proposed_changes

    // Rule 8 — expiração. created_at é OBRIGATÓRIO: se faltar, falha explícita e
    // logada (fail-closed), nunca silêncio. Uma proposta com +24h caduca.
    const createdMs = pendingSuggestion.created_at ? new Date(pendingSuggestion.created_at).getTime() : NaN
    if (!Number.isFinite(createdMs)) {
      console.error('PROTOCOL_MISSING_CREATED_AT', JSON.stringify({
        scope: 'apply-coach', userId, suggestionId: pendingSuggestion.id, created_at: pendingSuggestion.created_at ?? null,
      }))
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', pendingSuggestion.id)
      return
    }
    if (Date.now() - createdMs > 24 * 60 * 60 * 1000) {
      console.warn('PROTOCOL_EXPIRED', JSON.stringify({
        scope: 'apply-coach', userId, suggestionId: pendingSuggestion.id, createdAt: pendingSuggestion.created_at,
      }))
      await supabase.from('coach_protocol_suggestions').update({ status: 'expired' }).eq('id', pendingSuggestion.id)
      return
    }

    // Contenção de pausa (INTACTA): 'pause' nunca aplica → 'approved'.
    if ((rawChanges as Record<string, unknown> | null)?.action === 'pause') {
      const rc = rawChanges as Record<string, unknown>
      console.warn(
        'protocol-actions.ts: PAUSE_CONTAINMENT — pausa aprovada mas NÃO aplicada (sem implementação segura):',
        JSON.stringify({ userId, suggestionId: pendingSuggestion.id, action: rc.action, step_name: rc.step_name, period: rc.period }),
      )
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', pendingSuggestion.id)
      return
    }

    // Rule 1 — validação de schema em runtime (rede de segurança do que está no banco).
    const validation = validateProposal(rawChanges)
    if (!validation.ok) {
      logRefusal('apply-coach', validation.reason, { userId, suggestionId: pendingSuggestion.id, payload: rawChanges })
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', pendingSuggestion.id)
      return
    }

    const { data: protocol } = await supabase
      .from('protocolos')
      .select('id, rotina_am, rotina_pm')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (!protocol) {
      logRefusal('apply-coach', 'protocol-not-found', { userId, suggestionId: pendingSuggestion.id })
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', pendingSuggestion.id)
      return
    }

    const result = applyProposal(
      { rotina_am: protocol.rotina_am ?? [], rotina_pm: protocol.rotina_pm ?? [] },
      validation.value,
    )
    if (!result.ok) {
      logRefusal('apply-coach', result.reason, { userId, suggestionId: pendingSuggestion.id, payload: validation.value })
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', pendingSuggestion.id)
      return
    }

    const now = new Date().toISOString()

    // Captura de erro de escrita: não marca 'applied' se a gravação falhar.
    const { error: writeError } = await supabase
      .from('protocolos')
      .update({ rotina_am: result.next.rotina_am, rotina_pm: result.next.rotina_pm, updated_at: now })
      .eq('id', protocol.id)

    if (writeError) {
      console.error('PROTOCOL_WRITE_FAILED', JSON.stringify({
        scope: 'apply-coach', userId, suggestionId: pendingSuggestion.id, error: writeError.message,
      }))
      await supabase.from('coach_protocol_suggestions').update({ status: 'approved' }).eq('id', pendingSuggestion.id)
      return
    }

    await supabase
      .from('coach_protocol_suggestions')
      .update({ status: 'applied', approved_at: now, applied_at: now })
      .eq('id', pendingSuggestion.id)
  } catch (err) {
    console.error('protocol-actions.ts: checkApprovalIntent failed', err)
  }
}
