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
    const { imageBase64, skinProfile } = await req.json()

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'imageBase64 é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const systemPrompt = `Você é um especialista em dermatologia estética e análise de pele por imagem. 
Analise a foto do rosto fornecida e retorne APENAS um JSON válido, sem texto adicional, sem markdown, sem explicações.

O JSON deve seguir exatamente esta estrutura:
{
  "skin_score": <número inteiro de 0 a 100>,
  "skin_type_detected": <"seca" | "oleosa" | "mista" | "normal" | "sensível">,
  "headline": <string curta e pessoal, ex: "Sua pele está quase lá!">,
  "metrics": {
    "hydration": { "score": <0-100>, "label": <"Baixa"|"Média"|"Boa"|"Ótima">, "insight": <string curta> },
    "oiliness": { "score": <0-100>, "label": <"Baixa"|"Média"|"Alta"|"Muito Alta">, "insight": <string curta> },
    "acne": { "score": <0-100>, "label": <"Limpa"|"Leve"|"Moderada"|"Intensa">, "insight": <string curta> },
    "dark_spots": { "score": <0-100>, "label": <"Nenhuma"|"Leves"|"Moderadas"|"Intensas">, "insight": <string curta> },
    "texture": { "score": <0-100>, "label": <"Lisa"|"Boa"|"Irregular"|"Muito Irregular">, "insight": <string curta> },
    "sensitivity": { "score": <0-100>, "label": <"Baixa"|"Média"|"Alta"|"Muito Alta">, "insight": <string curta> }
  },
  "zones": {
    "testa": { "concern": <string>, "severity": <"baixa"|"média"|"alta"> },
    "nariz_zona_t": { "concern": <string>, "severity": <"baixa"|"média"|"alta"> },
    "bochecha_esquerda": { "concern": <string>, "severity": <"baixa"|"média"|"alta"> },
    "bochecha_direita": { "concern": <string>, "severity": <"baixa"|"média"|"alta"> },
    "queixo": { "concern": <string>, "severity": <"baixa"|"média"|"alta"> }
  },
  "top_concerns": [<string>, <string>, <string>],
  "positive_highlights": [<string>, <string>],
  "disclaimer": "Esta é uma análise estética por IA, não um diagnóstico médico."
}

IMPORTANTE: 
- Nunca use a palavra "diagnóstico" — sempre "análise" ou "avaliação"
- Seja específico e pessoal, como se estivesse falando diretamente com o usuário
- skin_score é calculado assim: média ponderada de hydration(25%) + texture(20%) + oiliness_inverso(20%) + acne_inverso(15%) + dark_spots_inverso(10%) + sensitivity_inverso(10%)
- Responda em português brasileiro`

    const userMessage = skinProfile
      ? `Analise esta foto de pele. Contexto adicional do usuário: tipo de pele declarado: ${skinProfile.skin_type || 'não informado'}, preocupações principais: ${skinProfile.concerns?.join(', ') || 'não informadas'}.`
      : 'Analise esta foto de pele e retorne o JSON.'

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
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
    const cleanJson = rawText.replace(/```json|```/g, '').trim()
    const result = JSON.parse(cleanJson)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Erro na analyze-skin:', error)
    return new Response(JSON.stringify({ error: 'Erro interno ao analisar a pele' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
