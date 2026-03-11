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
    const { scanResult, onboardingData } = await req.json()

    if (!scanResult) {
      return new Response(JSON.stringify({ error: 'scanResult é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const systemPrompt = `Você é um dermatologista especializado em criar rotinas de skincare personalizadas para o mercado brasileiro.
Com base nos dados do scan de pele fornecidos, crie uma rotina AM e PM personalizada.
Retorne APENAS um JSON válido, sem texto adicional, sem markdown, sem explicações.

O JSON deve seguir exatamente esta estrutura:
{
  "morning": [
    {
      "id": <número inteiro sequencial>,
      "name": <string: nome do produto, ex: "Gel de Limpeza">,
      "ingredient": <string: ativo principal, ex: "Ácido Salicílico 2%">,
      "instruction": <string: instrução de uso curta>,
      "color": <string: cor hex para o ícone — use cores variadas e bonitas>,
      "waitTime": <string | null: tempo de espera antes do próximo passo, ex: "2 min", null se não precisar>,
      "product_suggestions": [<string: nome de produto brasileiro real e acessível>]
    }
  ],
  "night": [
    {
      "id": <número inteiro sequencial>,
      "name": <string>,
      "ingredient": <string>,
      "instruction": <string>,
      "color": <string: cor hex>,
      "waitTime": <string | null>,
      "product_suggestions": [<string>]
    }
  ],
  "introduction_warnings": <string | null: aviso importante se tiver retinol ou ativo forte, null caso contrário>,
  "expected_timeline": {
    "two_weeks": <string: o que esperar em 2 semanas>,
    "one_month": <string: o que esperar em 1 mês>,
    "three_months": <string: o que esperar em 3 meses>
  }
}

REGRAS:
- Máximo 5 passos pela manhã, 4 à noite
- Sempre inclua limpeza, hidratante e protetor solar pela manhã
- Sempre inclua limpeza e hidratante à noite
- Produtos devem ser encontráveis em farmácias brasileiras (Raia, Droga Raia, Ultrafarma)
- Nunca use a palavra "diagnóstico"
- Nunca use emojis em nenhum campo do JSON
- Seja específico para o tipo de pele e concerns do usuário
- Responda em português brasileiro`

    const userMessage = `Dados do scan de pele:
- Skin Score: ${scanResult.skin_score}
- Tipo de pele detectado: ${scanResult.skin_type_detected}
- Principais preocupações: ${scanResult.top_concerns?.join(', ')}
- Métricas: hidratação ${scanResult.metrics?.hydration?.score}/100, oleosidade ${scanResult.metrics?.oiliness?.score}/100, acne ${scanResult.metrics?.acne?.score}/100, manchas ${scanResult.metrics?.dark_spots?.score}/100, textura ${scanResult.metrics?.texture?.score}/100

${onboardingData ? `Dados do perfil:
- Tipo de pele declarado: ${onboardingData.skin_type || 'não informado'}
- Preocupações declaradas: ${onboardingData.concerns?.join(', ') || 'não informadas'}
- Protetor solar: ${onboardingData.sunscreen || 'não informado'}
- Frequência atual de cuidados: ${onboardingData.frequency || 'não informada'}` : ''}`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
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
    console.error('Erro na generate-protocol:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})