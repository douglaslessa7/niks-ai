// Conversa de acompanhamento da espinha. A resposta é gerada inteira e conferida antes de ir
// para a tela: as travas não funcionariam em texto que já apareceu. O app recebe texto puro
// (o mesmo formato que o chat lê do `niks-chat`).
import { analisar } from './roteador.ts'
import { montarContexto } from './context.ts'
import { ESPINHA_CONVERSA_SYSTEM_PROMPT, montarTextoConversa, type Historico } from './prompt_conversa.ts'
import {
  emGestacao, inicioDoDiaBrasilia, LIMITE_MENSAGENS_POR_DIA, produtosPermitidos, produtosVetados, sanearConversa, TEXTO_SEGURO, type Memoria,
} from './regras.ts'

// deno-lint-ignore no-explicit-any
type Supabase = any
type Imagem = { base64: string; mimeType: string }

const BUCKET = 'coach-images'
const UM_ANO = 365 * 24 * 60 * 60
const MAX_FOTOS_NOVAS = 5 // o que o chat deixa anexar; só as 2 últimas vão para a IA
const FOTOS_PARA_IA = 2
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_HISTORICO = 30

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

export async function guardarFoto(supabase: Supabase, userId: string, base64: string, sufixo: string): Promise<string | null> {
  const path = `${userId}/${Date.now()}_${sufixo}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes(base64), { contentType: 'image/jpeg' })
  if (error) { console.error('sos-espinha: falha ao guardar a foto', error.message); return null }
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, UM_ANO)
  return data?.signedUrl ?? null
}

const fotosDe = (imageUrl: string | null): string[] => {
  if (!imageUrl) return []
  try {
    const v = JSON.parse(imageUrl)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

async function baixar(url: string): Promise<Imagem | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const buf = new Uint8Array(await r.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return { base64: btoa(bin), mimeType: 'image/jpeg' }
  } catch { return null }
}

export type RespostaHttp = { status: number; texto?: string; json?: unknown }

export async function responderConversa(supabase: Supabase, userId: string, corpo: {
  conversationId?: string; message?: string; clientMessageId?: string; images?: Array<{ base64?: string; mimeType?: string }>
}): Promise<RespostaHttp> {
  const { conversationId } = corpo
  const mensagem = String(corpo.message ?? '').slice(0, 2000)
  const novas = (Array.isArray(corpo.images) ? corpo.images : [])
    .filter((i) => i?.base64 && i.base64.length <= 6_000_000)
    .slice(0, MAX_FOTOS_NOVAS)
    .map((i) => ({ base64: i.base64!, mimeType: TIPOS.has(String(i.mimeType)) ? i.mimeType! : 'image/jpeg' }))
  if (!conversationId || (!mensagem.trim() && novas.length === 0)) return { status: 400, json: { error: 'Pedido inválido' } }

  const { data: acomp } = await supabase.from('espinha_acompanhamentos').select('analise_em')
    .eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle()
  if (!acomp) return { status: 404, json: { error: 'Conversa não encontrada' } }

  const agora = new Date()
  const { count } = await supabase.from('coach_messages').select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId).eq('role', 'user').gte('created_at', inicioDoDiaBrasilia(agora))
  if ((count ?? 0) >= LIMITE_MENSAGENS_POR_DIA) return { status: 429, json: { error: 'limite' } }

  const urls = (await Promise.all(novas.map((f, i) => guardarFoto(supabase, userId, f.base64, `sos${i}`)))).filter(Boolean) as string[]
  const { data: anteriores } = await supabase.from('coach_messages').select('role, content, image_url, created_at')
    .eq('conversation_id', conversationId).order('created_at', { ascending: true })
  const todas: Historico = anteriores ?? []

  await supabase.from('coach_messages').insert({
    conversation_id: conversationId, user_id: userId, role: 'user', content: mensagem,
    image_url: urls.length ? JSON.stringify(urls) : null, client_message_id: corpo.clientMessageId ?? null,
  })
  await supabase.rpc('espinha_registrar_mensagem', { p_user: userId, p_conversa: conversationId, p_tem_foto: novas.length > 0, p_agora: agora.toISOString() })

  const ctx = await montarContexto(supabase, userId)
  // O que ela contou nesta conversa também liga a trava de gestação.
  const doChat: Memoria[] = [...todas.filter((m) => m.role === 'user').map((m) => m.content), mensagem].map((value) => ({ type: 'pregnancy_status', value }))
  const memorias = [...ctx.memorias, ...doChat]
  const gestacao = emGestacao(ctx.perfil, memorias)
  const permitidos = produtosPermitidos(ctx.produtos, ctx.perfil, memorias)
  const vetados = produtosVetados(ctx.produtos, ctx.perfil, memorias)

  // Fotos antigas só quando há foto nova para comparar: uma pergunta em texto não paga por elas.
  let imagens: Imagem[] = []
  if (novas.length > 0) {
    const antigas = todas.flatMap((m) => fotosDe(m.image_url))
    const escolhidas = [...new Set([antigas[0], antigas[antigas.length - 1]].filter(Boolean))] as string[]
    const baixadas = (await Promise.all(escolhidas.map(baixar))).filter(Boolean) as Imagem[]
    imagens = [...baixadas, ...novas.slice(-FOTOS_PARA_IA)]
  }

  const base = montarTextoConversa({
    ctx: { ...ctx, memorias }, gestacao, permitidos, vetados, analiseEm: acomp.analise_em,
    historico: todas.slice(-MAX_HISTORICO), mensagem, temFotoNova: novas.length > 0, fotosEnviadas: imagens.length, agora,
  })

  const chamar = async (texto: string) => {
    const { result, registrarCusto } = await analisar({
      supabase, userId, systemPrompt: ESPINHA_CONVERSA_SYSTEM_PROMPT, texto, imagens, funcao: 'sos-espinha-chat',
    })
    EdgeRuntime.waitUntil(registrarCusto())
    return result
  }

  const primeira = await chamar(base)
  if (!primeira) return { status: 500, json: { error: 'Erro ao responder' } }
  let final = sanearConversa(primeira, vetados, gestacao)
  if (!final) {
    const segunda = await chamar(`${base}\n\n<Correcao>Sua resposta anterior indicou algo proibido para ela. Responda de novo sem indicar produto vetado, nem retinoide ou hidroquinona se houver gestação.</Correcao>`)
    final = segunda ? sanearConversa(segunda, vetados, gestacao) : null
  }
  const texto = final?.texto ?? TEXTO_SEGURO

  await supabase.from('coach_messages').insert({ conversation_id: conversationId, user_id: userId, role: 'assistant', content: texto })
  if (final?.resolvida) await supabase.rpc('espinha_marcar_resolvida', { p_user: userId, p_conversa: conversationId, p_agora: new Date().toISOString() })
  return { status: 200, texto }
}
