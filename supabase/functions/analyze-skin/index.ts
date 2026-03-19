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

    const systemPrompt = `Você é um especialista em dermatologia estética com 20 anos de experiência clínica.

INSTRUÇÕES OBRIGATÓRIAS — siga nesta ordem:

ETAPA 1 — ANÁLISE VISUAL (faça isso internamente antes de qualquer número):
Examine a imagem pixel a pixel e identifique com precisão:
a) Qualidade da imagem: está clara o suficiente para análise? Se não, skin_score deve ser baixo (20-35) e explique nos insights
b) Tom de pele: claro, médio, escuro, uniforme ou com variações
c) Acne: existe? Onde exatamente (testa, nariz, queixo, bochechas)? Quantos pontos visíveis?
d) Oleosidade: há brilho visível? Em qual região?
e) Manchas: hiperpigmentação, vermelhidão, olheiras?
f) Textura: poros visíveis, rugosidade, irregularidades?
g) Linhas finas ou sinais de envelhecimento?

ETAPA 2 — CALIBRAÇÃO DO SCORE:
O skin_score DEVE refletir o que você viu. Use estas referências obrigatórias:
- Imagem escura/ilegível onde não dá para ver a pele → 20 a 35
- Acne intensa (muitos pontos, inflamação) → 30 a 50
- Acne moderada + oleosidade alta → 45 a 60
- Acne leve + alguns problemas → 55 a 68
- Pele razoável com poucos problemas → 65 a 75
- Pele boa, hidratada, uniforme → 76 a 88
- Pele excelente, sem problemas visíveis → 89 a 97
Nunca dê o mesmo score para rostos diferentes. Cada rosto é único.

ETAPA 3 — RETORNE o JSON abaixo. Sem texto antes ou depois, sem markdown:
{
  "skin_score": <número inteiro baseado estritamente na ETAPA 2>,
  "skin_type_detected": <"seca" | "oleosa" | "mista" | "normal">,
  "headline": <frase curta e direta sobre o que você realmente viu, ex: "Pele com oleosidade na zona T e boa textura nas bochechas">,
  "acne": {
    "score": <0 = sem nenhuma acne visível, 100 = acne intensa em toda a face>,
    "label": <"Limpa" | "Leve" | "Moderada" | "Intensa">,
    "insight": <descreva o que você viu especificamente: localização, intensidade, tipo>
  },
  "skin_age": <estimativa em anos da aparência da pele — baseada em linhas, textura, firmeza>,
  "pontos_fortes": [<aspecto positivo específico que você observou>, <outro aspecto positivo específico>],
  "pontos_fracos": [<problema específico com localização>, <outro problema específico>, <terceiro problema>],
  "disclaimer": "Esta é uma análise estética por IA, não substitui consulta dermatológica."
}

REGRAS FINAIS:
- skin_type_detected: apenas "seca", "oleosa", "mista" ou "normal" — nunca "sensível"
- pontos_fortes e pontos_fracos DEVEM mencionar regiões reais do rosto que você viu
- headline deve descrever a pele desta pessoa, não uma frase genérica motivacional
- Nunca use a palavra "diagnóstico"
- Responda em português brasileiro`

    const userMessage = skinProfile
      ? `Analise o rosto nesta foto seguindo as etapas do sistema. Contexto declarado pelo usuário: tipo de pele: ${skinProfile.skin_type || 'não informado'}, preocupações: ${skinProfile.concerns?.join(', ') || 'não informadas'}. Use o contexto apenas como referência secundária — o que importa é o que você vê na imagem.`
      : 'Analise o rosto nesta foto seguindo as etapas do sistema e retorne o JSON.'

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: userMessage },
          ],
        }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
    })

    const data = await response.json()
    const rawText = data.candidates[0].content.parts[0].text

    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Resposta da IA não contém JSON válido')
    }
    const result = JSON.parse(jsonMatch[0])

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
