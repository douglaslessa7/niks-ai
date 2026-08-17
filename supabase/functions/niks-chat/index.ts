import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildContext } from './context.ts'
import { NIKS_SYSTEM_PROMPT, buildContextPack } from './prompt.ts'
import { geminiModel } from './model.ts'
import { detectEvolutionIntent } from './safety.ts'
import { extractAndSave } from './memory.ts'
import { checkForSuggestion, checkApprovalIntent } from './protocol-actions.ts'
import { verifyJWT } from '../_shared/jwt.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Marcadores do bloco estruturado que a NIKS emite ao propor alteração de protocolo.
// O bloco é cortado do stream antes de chegar ao cliente (a usuária nunca o vê).
const PATCH_OPEN = '[[PROTOCOL_PATCH]]'
const PATCH_CLOSE = '[[/PROTOCOL_PATCH]]'

// Maior sufixo de `buf` que é prefixo de `marker` — hold-back p/ marcador partido entre chunks.
function markerOverlap(buf: string, marker: string): number {
  const max = Math.min(buf.length, marker.length - 1)
  for (let k = max; k > 0; k--) if (buf.endsWith(marker.slice(0, k))) return k
  return 0
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// verifyJWT foi extraído para ../_shared/jwt.ts (fonte única, reusado pelo approve endpoint).

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Lê e bufferiza o body completo ANTES de qualquer chamada de rede de saída.
  // Requests com imagens (base64 grande) deixam o stream de entrada aberto enquanto
  // a Edge Function faz chamadas de saída (auth.getUser), o que causa o Deno runtime
  // a receber uma página HTML de erro do proxy em vez da resposta JSON do auth.
  let rawBody = ''
  try {
    rawBody = await req.text()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Bad request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.slice(7)
    const jwtPayload = await verifyJWT(token)
    if (!jwtPayload?.sub) {
      console.error('niks-chat: JWT verification failed')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const userId = jwtPayload.sub

    const body = JSON.parse(rawBody)
    const {
      conversationId,
      message,
      clientMessageId,
      images,
      supportsProtocolCard,
    } = body as {
      conversationId?: string
      message?: string
      clientMessageId?: string
      images?: Array<{ base64: string; mimeType: string }>
      supportsProtocolCard?: boolean
    }

    if (!conversationId || (!message && (!images || images.length === 0))) {
      return new Response(
        JSON.stringify({ error: 'conversationId e message são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Verificar que a conversa pertence ao usuário autenticado
    const { data: conv } = await supabase
      .from('coach_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!conv) {
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Salvar mensagem do usuário e buscar contexto em paralelo
    const isEvolutionQuery = detectEvolutionIntent(message)
    const [saveResult, context] = await Promise.all([
      supabase.from('coach_messages').insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'user',
        content: message || '',
        image_url: imageUrlJson ?? null,
        client_message_id: clientMessageId ?? null,
      }),
      buildContext(supabase, userId, conversationId, isEvolutionQuery),
    ])

    if (saveResult.error) {
      console.error('Erro ao salvar mensagem do usuário:', saveResult.error)
    }

    // Montar context pack e iniciar stream
    const contextPack = buildContextPack(context, message, (images?.length ?? 0) > 0, supportsProtocolCard === true)
    const geminiStream = await geminiModel.stream(
      NIKS_SYSTEM_PROMPT,
      contextPack,
      images
    )

    // Intercepta chunks inline (sem tee) e CORTA o bloco [[PROTOCOL_PATCH]]…[[/PROTOCOL_PATCH]]
    // do stream — a usuária nunca vê o marcador. Resistente a marcador partido entre chunks
    // via hold-back por overlap. Captura os blocos (array) para o checkForSuggestion.
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let holdBuffer = ''
    let mode: 'normal' | 'suppress' = 'normal'
    let visibleText = ''
    let curBlock = ''
    const blocks: string[] = []

    let resolveResult!: (r: { visible: string; blocks: string[] }) => void
    const resultPromise = new Promise<{ visible: string; blocks: string[] }>(res => { resolveResult = res })

    const emit = (controller: TransformStreamDefaultController<Uint8Array>, s: string) => {
      if (!s) return
      visibleText += s
      controller.enqueue(encoder.encode(s))
    }

    const process = (controller: TransformStreamDefaultController<Uint8Array>, isFinal: boolean) => {
      while (true) {
        if (mode === 'normal') {
          const openIdx = holdBuffer.indexOf(PATCH_OPEN)
          if (openIdx !== -1) {
            emit(controller, holdBuffer.slice(0, openIdx))
            holdBuffer = holdBuffer.slice(openIdx + PATCH_OPEN.length)
            mode = 'suppress'
            continue
          }
          if (isFinal) {
            // Stream terminou: descarta um marcador de abertura pela metade em vez de vazá-lo.
            const keep = markerOverlap(holdBuffer, PATCH_OPEN)
            emit(controller, holdBuffer.slice(0, holdBuffer.length - keep))
            holdBuffer = ''
            break
          }
          const keep = markerOverlap(holdBuffer, PATCH_OPEN)
          emit(controller, holdBuffer.slice(0, holdBuffer.length - keep))
          holdBuffer = holdBuffer.slice(holdBuffer.length - keep)
          break
        } else {
          const closeIdx = holdBuffer.indexOf(PATCH_CLOSE)
          if (closeIdx !== -1) {
            curBlock += holdBuffer.slice(0, closeIdx)
            blocks.push(curBlock)
            curBlock = ''
            holdBuffer = holdBuffer.slice(closeIdx + PATCH_CLOSE.length)
            mode = 'normal'
            continue
          }
          if (isFinal) {
            // Abriu e nunca fechou (modelo cortado / conexão caiu): descarta e LOGA.
            console.warn('PROTOCOL_REFUSED', JSON.stringify({ scope: 'stream', reason: 'block-unterminated', userId, conversationId }))
            curBlock = ''
            holdBuffer = ''
            break
          }
          const keep = markerOverlap(holdBuffer, PATCH_CLOSE)
          curBlock += holdBuffer.slice(0, holdBuffer.length - keep)
          holdBuffer = holdBuffer.slice(holdBuffer.length - keep)
          break
        }
      }
    }

    const interceptor = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        holdBuffer += decoder.decode(chunk, { stream: true })
        process(controller, false)
      },
      flush(controller) {
        holdBuffer += decoder.decode()
        process(controller, true)
        resolveResult({ visible: visibleText, blocks })
      },
    })

    // Conecta o stream do Gemini ao interceptor; erros resolvem com o parcial coletado
    geminiStream.pipeTo(interceptor.writable).catch(err => {
      // Expected when client disconnects (XHR timeout) while stream is active — not a bug
      console.warn('niks-chat: pipe (client disconnected)', err?.message ?? err)
      resolveResult({ visible: visibleText, blocks })
    })

    // Operações pós-stream — não bloqueiam a resposta ao cliente
    EdgeRuntime.waitUntil((async () => {
      const { visible, blocks: capturedBlocks } = await resultPromise
      const cleanText = visible.replace(/\s+$/, '')

      await supabase.from('coach_messages').insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'assistant',
        content: cleanText,
      })

      await extractAndSave(supabase, userId, message, cleanText)
      if (context.pendingSuggestion) {
        // Cliente novo (card): a aprovação é pelo botão → NÃO roda a aprovação por texto.
        // Cliente antigo (sem a flag): comportamento atual preservado integralmente.
        if (supportsProtocolCard !== true) {
          await checkApprovalIntent(supabase, userId, message, context.pendingSuggestion)
        }
      } else {
        await checkForSuggestion(supabase, userId, conversationId, cleanText, capturedBlocks)
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
