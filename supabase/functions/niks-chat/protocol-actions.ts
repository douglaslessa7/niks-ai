import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=' +
  GEMINI_API_KEY

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
]

const TRIGGER_PHRASE = 'posso incluir isso no seu protocolo?'

type SuggestionPayload = {
  reason: string
  proposed_changes: {
    action: 'add' | 'remove' | 'pause'
    step_name: string
    period: 'morning' | 'night' | 'both' | null
    duration_days: number | null
    details: string
  }
}

function stripMarkdown(text: string): string {
  return text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
}

export async function checkForSuggestion(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  conversationId: string,
  assistantResponse: string
): Promise<void> {
  try {
    if (!assistantResponse.toLowerCase().includes(TRIGGER_PHRASE)) return

    // Verificar se já existe sugestão pendente
    const { data: existing } = await supabase
      .from('coach_protocol_suggestions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .limit(1)

    if (existing && existing.length > 0) return

    // Extrair justificativa e mudanças via Gemini
    const prompt = `A NIKS (coach de skincare) propôs uma alteração no protocolo da usuária na mensagem abaixo.
Extraia a justificativa clínica e as mudanças propostas.
Retorne SOMENTE JSON válido, sem markdown, sem texto antes ou depois:

{
  "reason": "justificativa clínica em linguagem natural, conforme descrita pela NIKS",
  "proposed_changes": {
    "action": "add | remove | pause",
    "step_name": "nome do ativo ou produto mencionado",
    "period": "morning | night | both | null",
    "duration_days": null ou número inteiro se mencionado,
    "details": "qualquer detalhe adicional relevante da proposta"
  }
}

Resposta da NIKS: ${assistantResponse}`

    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 512 },
        safetySettings: SAFETY_SETTINGS,
      }),
    })

    if (!resp.ok) {
      console.error('protocol-actions.ts: Gemini error', resp.status, await resp.text())
      return
    }

    const data = await resp.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) return

    const parsed = JSON.parse(stripMarkdown(raw)) as SuggestionPayload

    await supabase.from('coach_protocol_suggestions').insert({
      user_id: userId,
      conversation_id: conversationId,
      reason: parsed.reason,
      proposed_changes: parsed.proposed_changes,
      status: 'pending',
    })
  } catch (err) {
    console.error('protocol-actions.ts: checkForSuggestion failed', err)
  }
}

type ProtocolStep = {
  name: string
  ingredient: string
  instruction: string
  [key: string]: unknown
}

type ProposedChanges = {
  action: 'add' | 'remove' | 'pause'
  step_name: string
  period: 'morning' | 'night' | 'both' | null
  duration_days: number | null
  details: string
}

function applyProtocolChanges(steps: ProtocolStep[], changes: ProposedChanges): ProtocolStep[] {
  if (changes.action === 'add') {
    return [
      ...steps,
      {
        name: changes.step_name,
        ingredient: changes.step_name,
        instruction: changes.details || 'Aplique conforme orientação da NIKS.',
      },
    ]
  }
  const needle = changes.step_name.toLowerCase()
  return steps.filter(
    s =>
      !s.name.toLowerCase().includes(needle) &&
      !s.ingredient.toLowerCase().includes(needle),
  )
}

export async function checkApprovalIntent(
  supabase: any,
  userId: string,
  userMessage: string,
  pendingSuggestion: {
    id: string
    proposed_changes: any
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

    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 512 },
        safetySettings: SAFETY_SETTINGS,
      }),
    })

    if (!resp.ok) {
      console.error('protocol-actions.ts: checkApprovalIntent Gemini error', resp.status, await resp.text())
      return
    }

    const data = await resp.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) return

    const { intent } = JSON.parse(stripMarkdown(raw)) as { intent: 'approved' | 'rejected' | 'unclear' }

    if (intent === 'unclear') return

    if (intent === 'rejected') {
      await supabase
        .from('coach_protocol_suggestions')
        .update({ status: 'rejected' })
        .eq('id', pendingSuggestion.id)
      return
    }

    // approved
    const { data: protocol } = await supabase
      .from('protocolos')
      .select('id, rotina_am, rotina_pm')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (!protocol) {
      console.error('protocol-actions.ts: checkApprovalIntent — protocolo não encontrado')
      return
    }

    const changes = pendingSuggestion.proposed_changes as ProposedChanges
    const { period } = changes

    let rotinaAm: ProtocolStep[] = protocol.rotina_am ?? []
    let rotinaPm: ProtocolStep[] = protocol.rotina_pm ?? []

    if (period === 'morning') {
      rotinaAm = applyProtocolChanges(rotinaAm, changes)
    } else if (period === 'night') {
      rotinaPm = applyProtocolChanges(rotinaPm, changes)
    } else {
      rotinaAm = applyProtocolChanges(rotinaAm, changes)
      rotinaPm = applyProtocolChanges(rotinaPm, changes)
    }

    const now = new Date().toISOString()

    await supabase
      .from('protocolos')
      .update({ rotina_am: rotinaAm, rotina_pm: rotinaPm, updated_at: now })
      .eq('id', protocol.id)

    await supabase
      .from('coach_protocol_suggestions')
      .update({ status: 'applied', approved_at: now, applied_at: now })
      .eq('id', pendingSuggestion.id)
  } catch (err) {
    console.error('protocol-actions.ts: checkApprovalIntent failed', err)
  }
}
