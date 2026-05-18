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

// Suporte a HS256 (legacy) e ES256/RS256 (novas JWT Signing Keys do Supabase)
const NIKS_JWT_SECRET = Deno.env.get('NIKS_JWT_SECRET') ?? ''
const SUPABASE_JWKS_RAW = Deno.env.get('SUPABASE_JWKS') ?? ''

let jwksKeys: any[] = []
try {
  if (SUPABASE_JWKS_RAW) {
    const parsed = JSON.parse(SUPABASE_JWKS_RAW)
    jwksKeys = parsed.keys ?? []
  }
} catch { /* JWKS parse failed */ }

const decode = (b64url: string) =>
  atob(b64url.replace(/-/g, '+').replace(/_/g, '/'))

async function verifyJWT(token: string): Promise<{ sub: string } | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, sigB64] = parts
    const header  = JSON.parse(decode(headerB64))
    const payload = JSON.parse(decode(payloadB64))

    if (!payload.sub) return null
    if (payload.exp && payload.exp * 1000 < Date.now()) return null

    const alg  = header.alg ?? 'HS256'
    const sig  = Uint8Array.from(decode(sigB64), c => c.charCodeAt(0))
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)

    // ── HS256 (legacy JWT secret) ──────────────────────────────────────────
    if (alg === 'HS256' && NIKS_JWT_SECRET) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(NIKS_JWT_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      )
      const valid = await crypto.subtle.verify('HMAC', key, sig, data)
      return valid ? payload : null
    }

    // ── ES256 / RS256 (novas JWT Signing Keys — usa SUPABASE_JWKS) ─────────
    if ((alg === 'ES256' || alg === 'RS256') && jwksKeys.length > 0) {
      const kid = header.kid
      const jwk = jwksKeys.find((k: any) => !kid || k.kid === kid) ?? jwksKeys[0]

      const importAlg = alg === 'RS256'
        ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
        : { name: 'ECDSA', namedCurve: 'P-256' }

      const verifyAlg = alg === 'RS256'
        ? { name: 'RSASSA-PKCS1-v1_5' }
        : { name: 'ECDSA', hash: { name: 'SHA-256' } }

      const key   = await crypto.subtle.importKey('jwk', jwk, importAlg, false, ['verify'])
      const valid = await crypto.subtle.verify(verifyAlg, key, sig, data)
      return valid ? payload : null
    }

    console.error('niks-chat: verifyJWT — alg não suportado:', alg,
      '| jwksKeys:', jwksKeys.length, '| hasLegacySecret:', !!NIKS_JWT_SECRET)
    return null
  } catch (e) {
    console.error('niks-chat: verifyJWT exception:', e)
    return null
  }
}

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
      buildContext(supabase, userId, isEvolutionQuery),
    ])

    if (saveResult.error) {
      console.error('Erro ao salvar mensagem do usuário:', saveResult.error)
    }

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
      // Expected when client disconnects (XHR timeout) while stream is active — not a bug
      console.warn('niks-chat: pipe (client disconnected)', err?.message ?? err)
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
