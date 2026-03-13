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

ETAPA 1 — ANÁLISE VISUAL (faça isso antes de qualquer número):
Examine a imagem com atenção e identifique:
a) Todos os alimentos visíveis — seja específico (não "carne", mas "carne bovina grelhada" ou "frango empanado")
b) Método de preparo visível: frito, grelhado, cozido, cru, assado?
c) Proporções: qual alimento domina o prato?
d) O que NÃO está visível mas pode ser inferido (molhos, temperos, óleo)?
Se a imagem estiver ilegível ou sem comida visível, retorne meal_score 0 e explique no meal_summary.

ETAPA 2 — CALIBRAÇÃO DO SCORE:
O meal_score DEVE refletir o impacto real na pele. Use estas referências:
- Frituras, açúcar refinado, ultraprocessados dominando o prato → 10 a 35
- Refeição mista com elementos negativos relevantes → 36 a 55
- Refeição equilibrada com alguns pontos de atenção → 56 a 72
- Refeição majoritariamente anti-inflamatória → 73 a 88
- Refeição excelente para a pele, rica em antioxidantes → 89 a 100

ETAPA 3 — RETORNE o JSON abaixo. Sem texto antes ou depois, sem markdown:
{
  "meal_name": <nome específico baseado no que você viu, ex: "Prato feito com frango grelhado e arroz" — nunca genérico>,
  "meal_score": <integer baseado estritamente na ETAPA 2>,
  "meal_label": <"Ótimo" | "Bom" | "Moderado" | "Atenção">,
  "meal_summary": <1-2 frases sobre o impacto real desta refeição específica na pele>,
  "foods": [
    {
      "name": <nome específico do alimento — método de preparo incluso quando relevante>,
      "impact": <"positivo" | "neutro" | "negativo">,
      "evidence": <evidência científica resumida>,
      "mechanism": <mecanismo biológico de como afeta a pele>,
      "relevance_to_skin": <como esse alimento se relaciona com a pele do usuário>,
      "substitution": <sugestão de substituição se negativo, null se positivo/neutro>
    }
  ],
  "highlights": [<ponto positivo específico desta refeição>, <outro ponto positivo>],
  "watch_out": [<alerta específico com nome do alimento>, <outro alerta>],
  "science_note": <fato científico curto e impactante sobre esta refeição e a pele — estilo TikTok, sem emojis>,
  "disclaimer": "Esta é uma análise nutricional por IA, não um diagnóstico médico ou nutricional."
}

REGRAS FINAIS:
- meal_name nunca pode ser genérico — deve descrever o que você viu
- foods deve listar apenas alimentos realmente visíveis na imagem
- Nunca use a palavra "diagnóstico"
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