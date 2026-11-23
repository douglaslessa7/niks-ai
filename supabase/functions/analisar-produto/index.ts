import { travaAssinatura } from '../_shared/assinatura.ts'
import { createSupabaseClient, buildContext } from './context.ts'
import { ANALISAR_PRODUTO_SYSTEM_PROMPT, buildContextPack } from './prompt.ts'
import { ensureScanCutout } from '../_shared/scanCutout.ts'
import { analisar } from './roteador.ts'
import { conferirResultado } from './conferir.ts'
import { INSTRUCAO_EN, idiomaDoCorpo } from './idioma.ts'
import { aplicarOrigem, blocoDaLista, buscarEmSegundoPlano, gravar, identificar, procurarNaTabela, transcreverRotulo } from './ingredientes.ts'

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

// ── Resultado fixo por conta (tabela `scan_resultados_fixos`) ─────────────────
// Falha na busca ou regex inválida → segue o fluxo normal (nunca quebra o scan).
type ResultadoFixo = {
  id: string; rotulo: string; marca_regex: string; texto_regex: string
  nome_excluir_regex: string | null; resultado: Record<string, unknown>
}

async function buscarResultadosFixos(supabase: ReturnType<typeof createSupabaseClient>, userId: string): Promise<ResultadoFixo[]> {
  try {
    const { data, error } = await supabase
      .from('scan_resultados_fixos')
      .select('id, rotulo, marca_regex, texto_regex, nome_excluir_regex, resultado')
      .eq('user_id', userId)
      .eq('ativo', true)
    if (error) { console.error('analisar-produto: scan_resultados_fixos', error); return [] }
    return (data ?? []) as ResultadoFixo[]
  } catch (e) {
    console.error('analisar-produto: scan_resultados_fixos', e)
    return []
  }
}

const semAcento = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function encontrarResultadoFixo(fixos: ResultadoFixo[], result: any, hint: string): ResultadoFixo | null {
  if (!fixos.length || !result) return null
  const p = result.produto ?? {}
  const marca = semAcento(`${p.marca ?? ''} ${hint}`)
  const nome = semAcento(p.nome)
  const texto = semAcento([
    p.nome, p.categoria, ...(Array.isArray(p.ativos_detectados) ? p.ativos_detectados : []),
    result.o_que_faz, result.mensagem, hint,
  ].filter(Boolean).join(' '))
  for (const f of fixos) {
    try {
      if (!new RegExp(f.marca_regex, 'i').test(marca)) continue
      if (!new RegExp(f.texto_regex, 'i').test(texto)) continue
      if (f.nome_excluir_regex && new RegExp(f.nome_excluir_regex, 'i').test(nome)) continue
      return f
    } catch (e) {
      console.error('analisar-produto: regex inválida em scan_resultados_fixos', f.id, e)
    }
  }
  return null
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
    const bloqueio = await travaAssinatura(userId, 'analisar-produto')
    if (bloqueio) return bloqueio

    const body = JSON.parse(rawBody)
    // Idioma da resposta (etapa 3): sem o campo = português, como sempre.
    const idioma = idiomaDoCorpo(body)
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

    const imagens = images
      .filter((img) => img?.base64)
      .map((img) => ({ base64: img.base64, mimeType: img.mimeType || 'image/jpeg' }))

    // Monta o context pack a partir do banco (service role, pelo userId do JWT). Em paralelo, o
    // Haiku identifica o produto para procurar a lista de ingredientes na tabela (nov/2026).
    const t0 = Date.now()
    const [context, ident] = await Promise.all([
      buildContext(supabase, userId),
      identificar(supabase, userId, imagens, 'analisar-produto-identificar'),
    ])
    const tabela = ident?.marca && ident?.nome
      ? await procurarNaTabela(supabase, ident.marca, ident.nome).catch((e) => { console.error('ingredientes: tabela', e); return null })
      : null
    const achada = tabela?.achada ?? null
    console.log('analisar-produto: INGREDIENTES', userId, JSON.stringify({ ident, chave: tabela?.chave, achada: achada ? { chave: achada.linha.chave, fonte: achada.linha.fonte, corr: achada.correspondencia } : null, ms: Date.now() - t0 }))
    const contextPack = buildContextPack(context)
    const skinScanId = (context.lastScan?.id as string | undefined) ?? null

    // Mensagem do usuário = context pack + instrução final + as fotos (produto e, se
    // houver, ingredientes) — o roteador monta no formato de cada modelo.
    // Cache (nov/2026): `texto` é igual entre os scans da mesma usuária (contexto + instrução) e
    // leva a marca de cache no roteador; o título da página, que muda a cada scan, vai à parte em
    // `textoExtra`. Juntos (texto + textoExtra) são exatamente o texto de antes.
    const texto = `${contextPack}\n\nAnalise o produto na(s) foto(s) segundo o contexto acima.`
    const textoExtra = (productNameHint
        ? `\n\nContexto extra (não verificado — título da página de onde a usuária compartilhou o produto): "${productNameHint}".\n` +
          `Regras para esse título:\n` +
          `- Ele só pode ajudar a identificar \`produto.nome\` e \`produto.marca\`. Se a foto contradizer o título, vale a foto.\n` +
          `- \`produto.ativos_detectados\` vem SOMENTE do que estiver legível na foto (rótulo ou lista de ingredientes). Nunca inclua um ativo porque ele aparece no título ou porque o título sugere a fórmula. Se nenhum ativo estiver legível na foto, retorne \`ativos_detectados\` vazio.\n` +
          `- O título não aumenta a \`confianca\`: ela continua calibrada só pelo que a foto mostra.`
        : '') + (achada ? blocoDaLista(achada) : '') + (idioma === 'en' ? INSTRUCAO_EN : '')

    // Claude Sonnet 5.5 com o gpt-5.4-mini como reserva (roteador.ts). O custo vai para
    // `ia_custos` em segundo plano, sem atrasar a resposta.
    // Resultados fixos desta conta (tabela `scan_resultados_fixos`), buscados em
    // paralelo com a IA para não somar tempo.
    const fixosPromise = buscarResultadosFixos(supabase, userId)
    const analise = await analisar({
      supabase, userId, systemPrompt: ANALISAR_PRODUTO_SYSTEM_PROMPT, texto, textoExtra, imagens,
    })
    const { registrarCusto } = analise
    let result = analise.result
    EdgeRuntime.waitUntil(registrarCusto())

    // A IA só identificou o produto: se bater com um resultado fixo ATIVO da conta,
    // a resposta vira o texto pronto (o mesmo em toda foto). Ver a migration.
    const fixo = encontrarResultadoFixo(await fixosPromise, result, productNameHint)
    if (fixo) {
      console.log('analisar-produto: resultado fixo aplicado', fixo.id, fixo.rotulo, userId)
      result = structuredClone(fixo.resultado)
    }

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

    // Conferência no código (nov/2026): segurança e faixa da nota (só a pele dela) e as regras
    // do motor na decisão de rotina. Resultado fixo da conta não passa por aqui (é texto pronto).
    if (!fixo) {
      try {
        const origem = aplicarOrigem(result, achada, ident, idioma)
        if (origem.length) console.log('analisar-produto: INGREDIENTES_ORIGEM', userId, origem.join(' | '))
        const conf = conferirResultado(result, context, idioma)
        if (conf.mudancas.length) console.log('analisar-produto: CONFERENCIA', userId, conf.mudancas.join(' | '))
        result = conf.result
      } catch (e) {
        console.error('analisar-produto: CONFERENCIA_FALHOU', e) // a análise segue como a IA mandou
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

    // Tabela de ingredientes, em segundo plano (não atrasa a resposta):
    // - foto com a lista legível e análise "alta" → transcreve e grava como rótulo (vence as outras);
    // - produto sem linha na tabela → busca na internet, se `reservar_busca` liberar.
    if (!fixo && result?.status === 'ok') {
      const marca = result?.produto?.marca ?? ident?.marca
      const nome = result?.produto?.nome ?? ident?.nome
      const jaTemRotulo = achada?.correspondencia === 'exata' && achada.linha.fonte === 'rotulo'
      if (marca && nome && ident?.tem_lista && result.confianca === 'alta' && !jaTemRotulo) {
        EdgeRuntime.waitUntil((async () => {
          const r = await transcreverRotulo(supabase, userId, imagens, 'ingredientes-rotulo')
          if (r) await gravar(supabase, marca, nome, { inci: r.inci, fonte: 'rotulo', fonte_scan: scanId, confianca: 'alta', concentracoes: r.concentracoes, conferencias: { nome_na_foto: `${r.marca ?? ''} | ${r.nome ?? ''}` } })
        })().catch((e) => console.error('ingredientes: rotulo', e)))
      } else if (ident?.marca && ident?.nome && tabela && !tabela.temLinha && !achada) {
        EdgeRuntime.waitUntil(buscarEmSegundoPlano(supabase, userId, ident.marca, ident.nome, 'ingredientes-busca').catch((e) => console.error('ingredientes: busca', e)))
      }
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
