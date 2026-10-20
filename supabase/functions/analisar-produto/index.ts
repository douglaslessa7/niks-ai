import { createSupabaseClient, buildContext } from './context.ts'
import { ANALISAR_PRODUTO_SYSTEM_PROMPT, buildContextPack } from './prompt.ts'
import { ensureScanCutout } from '../_shared/scanCutout.ts'
import { analisar } from './roteador.ts'

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

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
function normalizarDias(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const chave = (x: unknown) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 3)
  const pedidos = new Set(v.map(chave))
  const ok = DIAS.filter((d) => pedidos.has(chave(d)))
  return ok.length && ok.length < 7 ? ok : null
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
    const { images, clientScanId, productName } = body as {
      images?: Array<{ base64: string; mimeType: string }>
      clientScanId?: string
      // Título da página de onde o produto foi compartilhado (feature "Compartilhar
      // com o NIKS"). Opcional: a câmera não manda. Não muda o schema de saída.
      productName?: string
    }
    const productNameHint = typeof productName === 'string'
      ? productName.replace(/\s+/g, ' ').trim().slice(0, 200)
      : ''

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

    // Mensagem do usuário = context pack + instrução final + as fotos (produto e, se
    // houver, ingredientes) — o roteador monta no formato de cada modelo.
    const texto = `${contextPack}\n\nAnalise o produto na(s) foto(s) segundo o contexto acima.` +
      (productNameHint
        ? `\n\nContexto extra (não verificado — título da página de onde a usuária compartilhou o produto): "${productNameHint}".\n` +
          `Regras para esse título:\n` +
          `- Ele só pode ajudar a identificar \`produto.nome\` e \`produto.marca\`. Se a foto contradizer o título, vale a foto.\n` +
          `- \`produto.ativos_detectados\` vem SOMENTE do que estiver legível na foto (rótulo ou lista de ingredientes). Nunca inclua um ativo porque ele aparece no título ou porque o título sugere a fórmula. Se nenhum ativo estiver legível na foto, retorne \`ativos_detectados\` vazio.\n` +
          `- O título não aumenta a \`confianca\`: ela continua calibrada só pelo que a foto mostra.`
        : '')
    const imagens = images
      .filter((img) => img?.base64)
      .map((img) => ({ base64: img.base64, mimeType: img.mimeType || 'image/jpeg' }))

    // Claude Sonnet 5.5 com o gpt-5.4-mini como reserva (roteador.ts). O custo vai para
    // `ia_custos` em segundo plano, sem atrasar a resposta.
    const { result, registrarCusto } = await analisar({
      supabase, userId, systemPrompt: ANALISAR_PRODUTO_SYSTEM_PROMPT, texto, imagens,
    })
    EdgeRuntime.waitUntil(registrarCusto())

    if (!result) {
      return new Response(
        JSON.stringify({ error: 'Erro interno ao analisar o produto' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Frequência da sugestão de rotina: só as abreviações do app, na ordem da semana;
    // vazio ou os 7 dias = uso diário (null). Fora de adicionar/substituir, sempre null.
    if (result?.decisao_rotina && typeof result.decisao_rotina === 'object') {
      const tipo = result.decisao_rotina.tipo
      result.decisao_rotina.dias = tipo === 'adicionar' || tipo === 'substituir'
        ? normalizarDias(result.decisao_rotina.dias)
        : null
      // Códigos de passo: só os da Minha rotina dela que foram para o contexto.
      const validos = new Set(
        [...(((context.protocol as any)?.rotina_am ?? []) as any[]), ...(((context.protocol as any)?.rotina_pm ?? []) as any[])]
          .map((s: any) => s?._rowId).filter(Boolean),
      )
      for (const k of ['depois_do_passo_id', 'substitui_passo_id']) {
        const v = result.decisao_rotina[k]
        result.decisao_rotina[k] = typeof v === 'string' && validos.has(v) ? v : null
      }
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

    // Recorte SEM FUNDO da foto (Fase 3), em segundo plano — não atrasa a resposta.
    // Catálogo → reuso da mesma usuária → BiRefNet (`_shared/scanCutout.ts`). O app
    // mostra a foto original na hora e troca pela recortada quando o status vira 'ok'
    // (ou mantém a original se falhar / demorar). Scan reaproveitado (idempotência) que
    // já tem recorte não refaz nada.
    if (scanId) {
      const id = scanId
      await supabase.from('product_scans').update({ recorte_status: 'pendente' }).eq('id', id).is('recorte_status', null)
      EdgeRuntime.waitUntil(
        ensureScanCutout(supabase, id).catch((e) => console.error('analisar-produto: recorte falhou', id, e)),
      )
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
