import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SKIN_IMPROVEMENT_PROMPT = `This is a real portrait photo of a person. Do not change this person in any way. Keep their exact face, skin tone, facial structure, eyes, nose, mouth, hair, eyebrows, expression, head position, background, lighting, and clothing 100% identical.

The ONLY changes allowed: reduce the visibility of acne, pimples, and active breakouts on the skin. Slightly smooth skin texture where there is roughness. Lightly reduce redness and uneven skin tone. These changes must be so subtle that the photo still looks like an unedited real photograph — not retouched, not filtered, not AI-generated.

This must look like the exact same photo taken on a better skin day. The person must be completely recognizable and identical.`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image } = await req.json()

    if (!image) {
      return new Response(
        JSON.stringify({ error: 'Missing image field' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Converte base64 para Blob
    const base64Data = image.includes(',') ? image.split(',')[1] : image
    const binaryStr = atob(base64Data)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    const imageBlob = new Blob([bytes], { type: 'image/jpeg' })
    const imageFile = new File([imageBlob], 'skin.jpg', { type: 'image/jpeg' })

    // Monta FormData para OpenAI
    // `quality: medium` = equilíbrio velocidade/fidelidade — 'high' (padrão) chega a
    // levar 1-2 min por geração e é o que fazia a tela travar. Ajuste aqui se precisar.
    const formData = new FormData()
    formData.append('model', 'gpt-image-2')
    formData.append('image', imageFile)
    formData.append('prompt', SKIN_IMPROVEMENT_PROMPT)
    formData.append('n', '1')
    formData.append('size', '1024x1024')
    formData.append('quality', 'medium')

    // Chama OpenAI Images Edit — com timeout de 90s para nunca ficar pendurado pra sempre
    // (a OpenAI às vezes congestiona; sem isto a função — e a tela — travavam sem limite).
    const openaiController = new AbortController()
    const openaiTimeout = setTimeout(() => openaiController.abort(), 90_000)
    let openaiResponse: Response
    try {
      openaiResponse = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        },
        body: formData,
        signal: openaiController.signal,
      })
    } catch (fetchErr) {
      const aborted = (fetchErr as Error)?.name === 'AbortError'
      console.error(aborted ? 'OpenAI timed out after 90s' : 'OpenAI fetch failed:', fetchErr)
      return new Response(
        JSON.stringify({ error: aborted ? 'Image generation timed out' : 'Image generation failed' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } finally {
      clearTimeout(openaiTimeout)
    }

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenAI error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Image generation failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const openaiData = await openaiResponse.json()
    const generatedB64 = openaiData?.data?.[0]?.b64_json

    if (!generatedB64) {
      return new Response(
        JSON.stringify({ error: 'No image returned from OpenAI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Converte imagem gerada para Uint8Array para upload
    const generatedBinary = atob(generatedB64)
    const generatedBytes = new Uint8Array(generatedBinary.length)
    for (let i = 0; i < generatedBinary.length; i++) {
      generatedBytes[i] = generatedBinary.charCodeAt(i)
    }

    // Faz upload para Supabase Storage
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const fileName = `preview_${Date.now()}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('skin-previews')
      .upload(fileName, generatedBytes, {
        contentType: 'image/jpeg',
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return new Response(
        JSON.stringify({ error: 'Failed to store preview image' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: urlData } = supabase.storage
      .from('skin-previews')
      .getPublicUrl(fileName)

    return new Response(
      JSON.stringify({ preview_url: urlData.publicUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
