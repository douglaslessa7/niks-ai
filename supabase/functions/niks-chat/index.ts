import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildContext } from './context.ts'
import { NIKS_SYSTEM_PROMPT, buildContextPack } from './prompt.ts'
import { geminiModel } from './model.ts'
import { detectEvolutionIntent } from './safety.ts'
import { extractAndSave } from './memory.ts'
import { checkApprovalIntent, extractJSON } from './protocol-actions.ts'
import { ferramentaProposta, registrarProposta, motivoSimples, descreverProposta, type ResultadoProposta } from './proposta.ts'
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
      rotinaV2,
    } = body as {
      conversationId?: string
      message?: string
      clientMessageId?: string
      images?: Array<{ base64: string; mimeType: string }>
      supportsProtocolCard?: boolean
      // App novo (out/2026): recebe o id da sugestão no fim do stream, mostra o card fixo
      // e entende "trocar a rotina inteira de um período" (replace_period).
      rotinaV2?: boolean
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
    const v2 = rotinaV2 === true
    const contextPack = buildContextPack(context, message, (images?.length ?? 0) > 0, supportsProtocolCard === true, v2)
    const { stream: geminiStream, ferramentas } = await geminiModel.stream(
      NIKS_SYSTEM_PROMPT,
      contextPack,
      images,
      ferramentaProposta(v2),
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
      // No fim da resposta, ANTES de fechar o stream: registra a proposta (ferramenta; ou o
      // bloco antigo, se o modelo ainda escrever um) e corrige o texto visível:
      //  · proposta registrada + app antigo → garante a frase-gatilho (o app antigo só
      //    procura o card quando a vê);
      //  · proposta registrada + texto vazio → linha padrão (nunca balão em branco);
      //  · proposta recusada → conta a verdade, em linguagem simples;
      //  · nada e texto vazio → "me perdi" (nunca balão em branco).
      // App novo recebe, por último, `[[SUGESTAO:<id>]]` (fora do texto salvo).
      async flush(controller) {
        holdBuffer += decoder.decode()
        process(controller, true)
        let resultado: ResultadoProposta | null = null
        let propostaRaw: unknown = null
        try {
          const chamadas = await ferramentas
          const ch = chamadas.find((c) => c.name === 'propor_mudanca_rotina')
          let raw: unknown = null
          if (ch) raw = JSON.parse(ch.arguments || '{}')
          else if (blocks.length === 1) raw = JSON.parse(extractJSON(blocks[0]))
          propostaRaw = raw
          if (raw) {
            resultado = await registrarProposta(supabase, userId, conversationId, raw, {
              periodoInteiro: v2,
              pregnancyStatus: ((context.profile as Record<string, unknown> | null)?.pregnancy_status as string) ?? null,
            })
          }
        } catch (e) {
          console.error('niks-chat: proposta falhou', e)
        }
        const temTexto = !!visibleText.trim()
        const lower = visibleText.toLowerCase()
        if (resultado?.ok) {
          const frase = resultado.action === 'remove' ? 'Posso remover isso do seu protocolo?' : 'Posso incluir isso no seu protocolo?'
          // Chamou a ferramenta sem escrever nada: descreve a proposta (ela precisa saber o que aprova).
          if (!temTexto) emit(controller, descreverProposta(propostaRaw))
          if (!v2 && !lower.includes(frase.toLowerCase())) emit(controller, `\n\n${frase}`)
          else if (v2 && !temTexto) emit(controller, '\n\nConfere no cartão abaixo e toca em Aprovar se estiver tudo certo.')
        } else if (resultado && !resultado.ok) {
          emit(controller, `${temTexto ? '\n\n' : ''}Não consegui preparar essa mudança: ${motivoSimples(resultado.reason, resultado.period)}. Me conta de novo o que você quer mudar?`)
        } else if (!temTexto) {
          emit(controller, 'Me perdi aqui. Pode repetir, por favor?')
        }
        if (resultado?.ok && v2) controller.enqueue(encoder.encode(`\n[[SUGESTAO:${resultado.id}]]`))
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
      // A proposta já foi registrada no fim do stream (flush). Aprovação por TEXTO só no
      // cliente sem card, e só de uma sugestão FRESCA (até 30 min) — uma pendente antiga
      // (ex.: da manhã) não pode ser aprovada por um "pode" sobre outra coisa (noite).
      const ps = context.pendingSuggestion as Record<string, unknown> | null
      const fresca = !!ps?.created_at && Date.now() - Date.parse(String(ps.created_at)) < 30 * 60 * 1000
      if (ps && fresca && supportsProtocolCard !== true) {
        await checkApprovalIntent(supabase, userId, message, context.pendingSuggestion)
      }
      void capturedBlocks
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
