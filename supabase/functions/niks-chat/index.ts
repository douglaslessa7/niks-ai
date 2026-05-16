import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildContext } from './context.ts'
import { NIKS_SYSTEM_PROMPT, buildContextPack } from './prompt.ts'
import { geminiModel } from './model.ts'
import { detectEvolutionIntent } from './safety.ts'
import { extractAndSave } from './memory.ts'
import { checkForSuggestion, checkApprovalIntent } from './protocol-actions.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const userId = user.id

    const body = await req.json()
    const {
      conversationId,
      message,
      clientMessageId,
      images,
    } = body as {
      conversationId?: string
      message?: string
      clientMessageId?: string
      images?: Array<{ base64: string; mimeType: string }>
    }

    if (!conversationId || (!message && (!images || images.length === 0))) {
      return new Response(
        JSON.stringify({ error: 'conversationId e message são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Upload de imagens, se houver
    const imageUrls: string[] = []
    if (images && images.length > 0) {
      for (const img of images) {
        try {
          const bytes = Uint8Array.from(atob(img.base64), c => c.charCodeAt(0))
          const path = `${userId}/${Date.now()}_${imageUrls.length}.jpg`
          const { error } = await supabase.storage
            .from('coach-images')
            .upload(path, bytes, { contentType: img.mimeType })
          if (!error) {
            const { data: signed } = await supabase.storage
              .from('coach-images')
              .createSignedUrl(path, 31536000)
            if (signed?.signedUrl) imageUrls.push(signed.signedUrl)
          } else {
            console.error('niks-chat: image upload failed', error)
          }
        } catch (err) {
          console.error('niks-chat: image processing failed', err)
        }
      }
    }

    const imageUrlJson = imageUrls.length > 0 ? JSON.stringify(imageUrls) : null

    // Salvar mensagem do usuário
    const { error: saveError } = await supabase
      .from('coach_messages')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'user',
        content: message || '',
        image_url: imageUrlJson ?? null,
        client_message_id: clientMessageId ?? null,
      })

    if (saveError) {
      console.error('Erro ao salvar mensagem do usuário:', saveError)
    }

    // Detectar intenção e buscar contexto
    const isEvolutionQuery = detectEvolutionIntent(message)
    const context = await buildContext(supabase, userId, isEvolutionQuery)

    // Montar context pack e iniciar stream
    const contextPack = buildContextPack(context, message, (images?.length ?? 0) > 0)
    const geminiStream = await geminiModel.stream(
      NIKS_SYSTEM_PROMPT,
      contextPack,
      images
    )

    // Intercepta chunks inline (sem tee) — evita backpressure acoplado entre dois leitores
    const decoder = new TextDecoder()
    let collectedText = ''
    let resolveFullResponse!: (text: string) => void
    const fullResponsePromise = new Promise<string>(res => { resolveFullResponse = res })

    const interceptor = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        collectedText += decoder.decode(chunk, { stream: true })
        controller.enqueue(chunk)
      },
      flush() {
        // Flush any remaining bytes from the decoder, then resolve
        collectedText += decoder.decode()
        resolveFullResponse(collectedText)
      },
    })

    // Conecta o stream do Gemini ao interceptor; erros resolvem com o texto parcial coletado
    geminiStream.pipeTo(interceptor.writable).catch(err => {
      console.error('niks-chat: pipe error', err)
      resolveFullResponse(collectedText)
    })

    // Operações pós-stream — não bloqueiam a resposta ao cliente
    EdgeRuntime.waitUntil((async () => {
      const fullResponse = await fullResponsePromise

      await supabase.from('coach_messages').insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'assistant',
        content: fullResponse,
      })

      await extractAndSave(supabase, userId, message, fullResponse)
      if (context.pendingSuggestion) {
        await checkApprovalIntent(supabase, userId, message, context.pendingSuggestion)
      } else {
        await checkForSuggestion(supabase, userId, conversationId, fullResponse)
      }
    })())

    return new Response(interceptor.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('niks-chat: erro não tratado', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
