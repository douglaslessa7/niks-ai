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

type ExtractedMemory = {
  type: string
  value: string
  confidence: number
}

// Extracts the outermost JSON object from a string, handling markdown fences
// and any preamble text the model may have added before the JSON.
function extractJSON(text: string): string {
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return text
  return text.slice(start, end + 1)
}

export async function extractAndSave(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    const prompt = `Analise esta troca de mensagens entre usuária e coach de skincare.
Extraia APENAS fatos duradouros e clinicamente relevantes sobre a usuária.
Não extraia preferências temporárias, estados de humor ou informações já presentes no perfil de onboarding (tipo de pele, idade, gênero, objetivo).
Retorne SOMENTE JSON válido, sem markdown, sem texto antes ou depois:

{
  "memories": [
    {
      "type": "allergy|sensitivity|pregnancy_status|medication|product_reaction|preference|routine_note|skin_observation",
      "value": "descrição em linguagem natural",
      "confidence": 0.0 a 1.0
    }
  ]
}

Se não houver fatos relevantes a extrair, retorne: { "memories": [] }

Mensagem da usuária: ${userMessage}
Resposta da NIKS: ${assistantResponse}`

    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              memories: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type:       { type: 'string' },
                    value:      { type: 'string' },
                    confidence: { type: 'number' },
                  },
                  required: ['type', 'value', 'confidence'],
                },
              },
            },
            required: ['memories'],
          },
        },
        safetySettings: SAFETY_SETTINGS,
      }),
    })

    if (!resp.ok) {
      console.error('memory.ts: Gemini error', resp.status, await resp.text())
      return
    }

    const data = await resp.json()
    const candidate   = data?.candidates?.[0]
    const finishReason = candidate?.finishReason

    // Skip parse when the model was cut off — avoids SyntaxError on truncated JSON
    if (finishReason && finishReason !== 'STOP') {
      console.warn('memory.ts: Gemini finishReason', finishReason, '— skipping parse')
      return
    }

    const raw = candidate?.content?.parts?.[0]?.text
    if (!raw) return

    const parsed = JSON.parse(extractJSON(raw)) as { memories: ExtractedMemory[] }
    const qualified = parsed.memories.filter(m => m.confidence >= 0.75)

    for (const memory of qualified) {
      // Desativar memória anterior do mesmo tipo, se existir
      const { data: existing } = await supabase
        .from('coach_memories')
        .select('id')
        .eq('user_id', userId)
        .eq('type', memory.type)
        .eq('is_active', true)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('coach_memories')
          .update({ is_active: false })
          .eq('user_id', userId)
          .eq('type', memory.type)
          .eq('is_active', true)
      }

      await supabase.from('coach_memories').insert({
        user_id: userId,
        type: memory.type,
        value: memory.value,
        confidence: memory.confidence,
        is_active: true,
      })
    }
  } catch (err) {
    console.error('memory.ts: extractAndSave failed', err)
  }
}
