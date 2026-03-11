import Anthropic from 'npm:@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageBase64, skinProfile, mimeType } = await req.json()

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'imageBase64 é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const systemPrompt = `Você é um nutricionista especializado em dermatologia nutricional — a ciência que estuda como a alimentação impacta diretamente a saúde da pele.
Analise a foto da refeição fornecida e retorne APENAS um JSON válido, sem texto adicional, sem markdown, sem explicações.

O JSON deve seguir exatamente esta estrutura:
{
  "meal_score": <"Ótimo" | "Bom" | "Moderado" | "Atenção">,
  "meal_summary": <string: resumo de 1-2 frases sobre o impacto geral da refeição na pele>,
  "foods": [
    {
      "name": <string: nome do alimento identificado>,
      "impact": <"positivo" | "neutro" | "negativo">,
      "evidence": <string: evidência científica resumida>,
      "mechanism": <string: mecanismo biológico de como afeta a pele>,
      "relevance_to_skin": <string: como esse alimento se relaciona com a pele do usuário>,
      "substitution": <string | null: sugestão de substituição se impacto negativo, null se positivo/neutro>
    }
  ],
  "highlights": [<string>, <string>],
  "watch_out": [<string>],
  "science_note": <string: fato científico curto e viral sobre essa refeição e a pele — estilo TikTok>,
  "disclaimer": "Esta é uma análise nutricional por IA, não um diagnóstico médico ou nutricional."
}

IMPORTANTE:
- Identifique todos os alimentos visíveis na foto
- Seja específico e pessoal, considerando o perfil de pele do usuário
- Nunca use a palavra "diagnóstico" — sempre "análise" ou "avaliação"
- science_note deve ser curto, impactante e fácil de compartilhar — sem emojis, sem aspas especiais
- Responda em português brasileiro`

    const userMessage = skinProfile
      ? `Analise esta foto de refeição. Contexto da pele do usuário: tipo de pele: ${skinProfile.skin_type || 'não informado'}, preocupações principais: ${skinProfile.concerns?.join(', ') || 'não informadas'}.`
      : 'Analise esta foto de refeição e retorne o JSON.'

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: (mimeType ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: userMessage,
            },
          ],
        },
      ],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    // Extrai JSON mesmo se vier com markdown ou texto extra
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Resposta da IA não contém JSON válido')
    }
    const result = JSON.parse(jsonMatch[0])

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Erro na analyze-food:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})