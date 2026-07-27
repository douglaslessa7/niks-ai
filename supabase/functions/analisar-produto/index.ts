import { createSupabaseClient, buildContext } from './context.ts'
import { ANALISAR_PRODUTO_SYSTEM_PROMPT, buildContextPack } from './prompt.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STORAGE_BUCKET = 'product-scans'

// ── Verificação de JWT LOCAL (sem rede) — copiada verbatim do niks-chat ──────
// Suporta HS256 (legacy via NIKS_JWT_SECRET) e ES256/RS256 (novas JWT Signing
// Keys via SUPABASE_JWKS). O userId sempre vem do token verificado, nunca do body.
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

    console.error('analisar-produto: verifyJWT — alg não suportado:', alg,
      '| jwksKeys:', jwksKeys.length, '| hasLegacySecret:', !!NIKS_JWT_SECRET)
    return null
  } catch (e) {
    console.error('analisar-produto: verifyJWT exception:', e)
    return null
  }
}

// Parse defensivo: localiza o primeiro `{` e o último `}` para tolerar qualquer
// preâmbulo/markdown que o modelo eventualmente adicione.
function extractJSON(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Nenhum objeto JSON encontrado na resposta do modelo')
  }
  return JSON.parse(text.slice(start, end + 1))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Lê e bufferiza o body completo ANTES de qualquer chamada de rede de saída.
  // Requests com imagens (base64 grande) deixam o stream de entrada aberto enquanto
  // a função faz chamadas de saída (Storage, OpenAI), o que faz o proxy retornar
  // HTML de erro em vez de JSON e vira um 401 falso. A verificação de JWT é local
  // (sem rede): parse do body → verifyJWT → só depois upload/OpenAI.
  let rawBody = ''
  try {
    rawBody = await req.text()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Bad request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const token = authHeader.slice(7)
    const jwtPayload = await verifyJWT(token)
    if (!jwtPayload?.sub) {
      console.error('analisar-produto: JWT verification failed')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const userId = jwtPayload.sub

    const body = JSON.parse(rawBody)
    const { images, clientScanId } = body as {
      images?: Array<{ base64: string; mimeType: string }>
      clientScanId?: string
    }

    // Validação: sem nenhuma imagem → 400. images[0] é o PRODUTO (obrigatório).
    if (!Array.isArray(images) || images.length === 0 || !images[0]?.base64) {
      return new Response(
        JSON.stringify({ error: 'É necessária ao menos a foto do produto (images[0])' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createSupabaseClient()

    // Monta o context pack a partir do banco (service role, pelo userId do JWT).
    const context = await buildContext(supabase, userId)
    const contextPack = buildContextPack(context)
    const skinScanId = (context.lastScan?.id as string | undefined) ?? null

    // Mensagem do usuário = context pack + instrução final + as partes de imagem.
    // Ambas as fotos vão ao modelo (produto e, se houver, ingredientes); mesmo
    // formato de visão do analyze-skin (image_url com data URL base64).
    const userContent: any[] = [
      {
        type: 'text',
        text: `${contextPack}\n\nAnalise o produto na(s) foto(s) segundo o contexto acima.`,
      },
    ]
    for (const img of images) {
      if (!img?.base64) continue
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` },
      })
    }

    // Chamada de visão à OpenAI — mesmos parâmetros do analyze-skin (família GPT-5:
    // max_completion_tokens, NUNCA max_tokens), retry 3x em HTTP 500/503, sem stream.
    const openaiUrl = 'https://api.openai.com/v1/chat/completions'
    const openaiKey = Deno.env.get('OPENAI_API_KEY')

    let data: any = null
    let lastError = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch(openaiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5.4-mini',
          max_completion_tokens: 4096,
          stream: false,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: ANALISAR_PRODUTO_SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        }),
      })

      data = await response.json()
      const isUnavailable = !response.ok && (response.status === 503 || response.status === 500)
      if (isUnavailable) {
        lastError = JSON.stringify(data)
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 3000))
          continue
        }
      }
      break
    }

    if (!data?.choices || data.choices.length === 0) {
      console.error('analisar-produto: OpenAI sem choices. Resposta:', JSON.stringify(data), lastError)
      return new Response(
        JSON.stringify({ error: 'Erro interno ao analisar o produto' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const rawText = data.choices[0].message.content
    let result: any
    try {
      result = extractJSON(rawText)
    } catch (e) {
      console.error('analisar-produto: falha ao parsear JSON do modelo:', e, '| raw:', rawText)
      return new Response(
        JSON.stringify({ error: 'Erro interno ao analisar o produto' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // status "precisa_foto" → NÃO persiste nada. Só devolve o JSON pro app.
    if (result?.status === 'precisa_foto') {
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // status "ok" → upload da foto do produto + insert em product_scans.
    // A persistência é envolvida em try/catch: se falhar, ainda devolvemos a
    // análise pro app (a usuária não pode perder o resultado por falha de escrita).
    let scanId: string | null = null
    try {
      // Idempotência: se clientScanId veio e já existe linha, reutiliza-a (não
      // re-sobe imagem nem re-insere). O índice único de product_scans é PARCIAL
      // (WHERE client_scan_id IS NOT NULL), que o PostgREST não consegue usar como
      // arbiter de ON CONFLICT — então a idempotência é feita com select-antes +
      // fallback em 23505 (colisão de corrida), equivalente e mais robusto.
      if (clientScanId) {
        const { data: existing } = await supabase
          .from('product_scans')
          .select('id')
          .eq('user_id', userId)
          .eq('client_scan_id', clientScanId)
          .maybeSingle()
        if (existing?.id) scanId = existing.id
      }

      if (!scanId) {
        // Upload da images[0] (produto) para o bucket privado. image_path guarda a
        // chave DENTRO do bucket (bucket implícito = product-scans); a leitura no
        // app é via supabase.storage.from('product-scans').createSignedUrl(image_path).
        const bytes = Uint8Array.from(atob(images[0].base64), c => c.charCodeAt(0))
        const imagePath = `${userId}/${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(imagePath, bytes, { contentType: images[0].mimeType || 'image/jpeg' })
        if (uploadError) {
          console.error('analisar-produto: falha no upload da imagem', uploadError)
        }

        const { data: inserted, error: insertError } = await supabase
          .from('product_scans')
          .insert({
            user_id: userId,
            skin_scan_id: skinScanId,
            image_path: imagePath,
            produto_nome: result?.produto?.nome ?? null,
            produto_marca: result?.produto?.marca ?? null,
            resultado: result,
            client_scan_id: clientScanId ?? null,
          })
          .select('id')
          .single()

        if (insertError) {
          // 23505 = colisão de corrida no índice único parcial de client_scan_id;
          // re-seleciona a linha vencedora para manter idempotência.
          if (insertError.code === '23505' && clientScanId) {
            const { data: raced } = await supabase
              .from('product_scans')
              .select('id')
              .eq('user_id', userId)
              .eq('client_scan_id', clientScanId)
              .maybeSingle()
            scanId = raced?.id ?? null
          } else {
            throw insertError
          }
        } else {
          scanId = inserted?.id ?? null
        }
      }
    } catch (persistErr) {
      console.error('analisar-produto: falha ao persistir product_scan', persistErr)
      // Segue e devolve o resultado mesmo assim.
    }

    // Resposta ao app: análise + scan_id no topo (id da linha salva, ou null se
    // a persistência falhou).
    return new Response(JSON.stringify({ scan_id: scanId, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('analisar-produto: erro não tratado', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
