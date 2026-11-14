// SOS espinha (nov/2026). Sem `acao`: recebe a foto e devolve o que fazer agora, com os produtos
// que ela já tem. Análise válida cria a conversa de acompanhamento, com a foto e a análise, como
// as outras fotos do chat; foto ruim não guarda nada. Se guardar falhar, a análise chega mesmo
// assim, só sem conversa (`conversation_id: null`).
// `acao`: 'mensagem' (conversa), 'convite' (o que mostrar ao abrir o app), 'convite_visto'.
import { travaAssinatura } from '../_shared/assinatura.ts'
import { verifyJWT } from '../_shared/jwt.ts'
import { analisar } from './roteador.ts'
import { analisesDeHoje, createSupabaseClient, montarContexto } from './context.ts'
import { SOS_ESPINHA_SYSTEM_PROMPT, montarTexto } from './prompt.ts'
import { emGestacao, inicioDoDiaBrasilia, LIMITE_POR_DIA, produtosPermitidos, sanearResposta, textoDaAnalise } from './regras.ts'
import { guardarFoto, responderConversa } from './conversa.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Uma foto de 768 px fica bem abaixo disso; o teto só barra envio fora do normal.
const MAX_BASE64 = 6_000_000
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Corpo inteiro antes de qualquer chamada de saída (mesmo motivo do analisar-produto).
  let rawBody = ''
  try {
    rawBody = await req.text()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }

  try {
    const auth = req.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const jwt = await verifyJWT(auth.slice(7))
    if (!jwt?.sub) return json({ error: 'Unauthorized' }, 401)
    const userId = jwt.sub
    const bloqueio = await travaAssinatura(userId, 'sos-espinha')
    if (bloqueio) return bloqueio

    const corpo = JSON.parse(rawBody)
    const { image } = corpo as { image?: { base64?: string; mimeType?: string } }

    if (corpo.acao === 'convite') {
      const { data, error } = await createSupabaseClient().rpc('espinha_avaliar', { p_user: userId })
      if (error) { console.error('sos-espinha: convite', error.message); return json({ convite: null }) }
      return json({ convite: data?.[0] ?? null })
    }
    if (corpo.acao === 'convite_visto') {
      if (typeof corpo.conversationId !== 'string') return json({ error: 'Pedido inválido' }, 400)
      await createSupabaseClient().rpc('espinha_convite_visto', { p_user: userId, p_conversa: corpo.conversationId })
      return json({ ok: true })
    }
    if (corpo.acao === 'mensagem') {
      const r = await responderConversa(createSupabaseClient(), userId, corpo)
      if (r.texto !== undefined) return new Response(r.texto, { headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
      return json(r.json, r.status)
    }

    if (!image?.base64 || image.base64.length > MAX_BASE64) return json({ error: 'Foto inválida' }, 400)
    const imagens = [{ base64: image.base64, mimeType: TIPOS.has(String(image.mimeType)) ? image.mimeType! : 'image/jpeg' }]

    const supabase = createSupabaseClient()
    const agora = new Date()
    // Conta de teste (20261207, tabela `contas_teste`): sem o limite de análises do dia.
    if (await analisesDeHoje(supabase, userId, inicioDoDiaBrasilia(agora)) >= LIMITE_POR_DIA) {
      const { data: teste } = await supabase.rpc('eh_conta_teste', { p_uid: userId })
      if (teste !== true) return json({ error: 'limite' }, 429)
    }

    const ctx = await montarContexto(supabase, userId)
    const permitidos = produtosPermitidos(ctx.produtos, ctx.perfil, ctx.memorias)

    const { result, registrarCusto } = await analisar({
      supabase, userId, systemPrompt: SOS_ESPINHA_SYSTEM_PROMPT, texto: montarTexto(ctx, permitidos, agora), imagens,
    })
    EdgeRuntime.waitUntil(registrarCusto())

    const resposta = result ? sanearResposta(result, permitidos, emGestacao(ctx.perfil, ctx.memorias)) : null
    if (!resposta) return json({ error: 'Erro ao analisar' }, 500)
    if (resposta.status !== 'ok') return json(resposta)

    let conversationId: string | null = null
    try {
      const url = await guardarFoto(supabase, userId, imagens[0].base64, 'sos')
      const { data, error } = await supabase.rpc('espinha_criar', {
        p_user: userId, p_foto: url ? JSON.stringify([url]) : null, p_analise: resposta, p_texto: textoDaAnalise(resposta), p_agora: agora.toISOString(),
      })
      if (error) throw error
      conversationId = data ?? null
    } catch (e) {
      console.error('sos-espinha: falha ao criar a conversa', (e as Error)?.message ?? e)
    }
    return json({ ...resposta, conversation_id: conversationId })
  } catch (e) {
    // Nunca logar o corpo: ele contém a foto.
    console.error('sos-espinha: erro não tratado', (e as Error)?.message ?? e)
    return json({ error: 'Erro interno' }, 500)
  }
})
