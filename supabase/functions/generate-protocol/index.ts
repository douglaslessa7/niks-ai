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
    const { baseProtocol, scanResult, onboardingData } = await req.json()

    if (!scanResult) {
      return new Response(JSON.stringify({ error: 'scanResult é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!baseProtocol) {
      return new Response(JSON.stringify({ error: 'baseProtocol é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const systemPrompt = `Você é um dermatologista especializado em skincare para o mercado brasileiro.
Você receberá um PROTOCOLO BASE para o tipo de pele do usuário e os RESULTADOS de um scan de pele com métricas individuais.

Sua tarefa é AJUSTAR o protocolo base conforme as métricas, NÃO criar do zero.

Ajustes permitidos:
- Trocar o ativo/ingrediente de um passo se as métricas indicarem (ex: se acne > 70, priorizar ácido salicílico)
- Adicionar no MÁXIMO 1 passo extra se necessário
- Remover 1 passo se desnecessário para esse perfil
- Ajustar as instruções com base nos concerns específicos
- Sugerir product_suggestions com produtos brasileiros reais (farmácias: Drogasil, Droga Raia, Ultrafarma, Panvel)

Ajustes NÃO permitidos:
- Mudar a ORDEM dos passos base (limpeza sempre primeiro, protetor solar sempre último de manhã)
- Remover limpeza, hidratante ou protetor solar
- Ultrapassar 5 passos pela manhã ou 5 à noite
- Inventar categorias de produto que não existem no template

Retorne APENAS um JSON válido, sem texto, sem markdown.
O JSON deve manter a mesma estrutura dos passos:
{
  "morning": [{ "id": number, "name": string, "ingredient": string, "instruction": string, "color": string hex, "waitTime": string|null, "product_suggestions": [string] }],
  "night": [mesma estrutura],
  "introduction_warnings": string|null,
  "expected_timeline": { "two_weeks": string, "one_month": string, "three_months": string }
}

Nunca use a palavra diagnóstico. Nunca use emojis. Responda em português brasileiro.`

    const userMessage = `PROTOCOLO BASE:
${JSON.stringify(baseProtocol, null, 2)}

RESULTADOS DO SCAN DE PELE:
- Skin Score: ${scanResult.skin_score}
- Tipo de pele detectado: ${scanResult.skin_type_detected}
- Principais preocupações: ${scanResult.pontos_fracos?.join(', ')}
- Métricas: acne ${scanResult.acne?.score}/100

${onboardingData ? `DADOS DO PERFIL:
- Tipo de pele declarado: ${onboardingData.skin_type || 'não informado'}
- Preocupações declaradas: ${onboardingData.concerns?.join(', ') || 'não informadas'}
- Protetor solar: ${onboardingData.sunscreen || 'não informado'}
- Frequência atual de cuidados: ${onboardingData.frequency || 'não informada'}` : ''}`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
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
