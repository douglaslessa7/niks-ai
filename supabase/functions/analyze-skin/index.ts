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
  "skin_type_detected": <"seca" | "oleosa" | "mista" | "normal">,
  "headline": <string curta e pessoal, ex: "Sua pele está quase lá!">,
  "acne": {
    "score": <0-100>,
    "label": <"Limpa" | "Leve" | "Moderada" | "Intensa">,
    "insight": <string curta e pessoal sobre a acne do usuário>
  },
  "skin_age": <número inteiro em anos — idade aparente da pele>,
  "pontos_fortes": [<string>, <string>],
  "pontos_fracos": [<string>, <string>, <string>],
  "disclaimer": "Esta é uma análise estética por IA, não substitui consulta dermatológica."
}

IMPORTANTE:
- skin_score é o score geral da pele de 0 a 100
- acne.score: 0 = pele limpa sem acne, 100 = acne intensa
- skin_type_detected: APENAS 4 opções (seca, oleosa, mista, normal). Nunca use "sensível"
- skin_age: nunca estime mais de 5 anos ACIMA da idade real. Se a pele está boa, estime ABAIXO da idade real
- pontos_fortes: exatamente 2 destaques positivos da pele (ex: "Boa uniformidade de tom", "Textura suave nas bochechas")
- pontos_fracos: exatamente 3 áreas de atenção (ex: "Oleosidade elevada na zona T", "Acne leve no queixo")
- headline: frase curta, pessoal e motivadora em português brasileiro
- Nunca use a palavra "diagnóstico" — sempre "análise" ou "avaliação"
- Seja específico e pessoal, como se estivesse falando diretamente com o usuário
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
