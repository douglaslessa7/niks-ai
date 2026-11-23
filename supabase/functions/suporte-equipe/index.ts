import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Suporte dentro do app — o lado da EQUIPE. Quem chama é o SERVIDOR do NIKSfy (projeto
// Supabase separado), depois de conferir o login da equipe lá; o navegador do NIKSfy
// nunca fala com este projeto e nunca vê este segredo nem a service role do app.
//
// Trava: header x-suporte-secret = secret SUPORTE_EQUIPE_SECRET (o mesmo valor fica
// como secret do NIKSfy). verify_jwt = false no config.toml.
// Tabelas/RPCs: migration 20261025120000_create_suporte.sql.
//
// Corpo: { acao, ... }
//   contador                                   → { nao_lidas, conversas_com_nao_lidas }
//   listar_conversas { filtro?, limite?, antes? } → { conversas }
//   ler_conversa     { user_id, limite?, antes? } → { usuaria, mensagens } (ordem cronológica)
//   marcar_lida      { user_id }                 → { marcadas }
//   responder        { user_id, texto, equipe_nome? } → { mensagem, push }
//   faq_listar                                 → { faq } (inclusive inativas)
//   faq_salvar       { id?, pergunta, resposta, ordem?, ativo? } → { item }
//   faq_apagar       { id }                     → { ok }
// Secrets: SUPORTE_EQUIPE_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const MAX_TEXTO = 2000
const PUSH_TITULO = 'A equipe NIKS te respondeu'
const PUSH_CORPO = 'Toque para ver a resposta.' // nunca o texto da resposta (tela bloqueada)
// Inglês (etapa 3 da tradução): só para quem tem `users.idioma = 'en'`.
const PUSH_TITULO_EN = 'The NIKS team replied to you'
const PUSH_CORPO_EN = 'Tap to see the reply.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

// Comparação em tempo constante (não vaza, pelo tempo de resposta, quantos caracteres batem).
function mesmoSegredo(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

const limitar = (v: unknown, padrao: number, max: number) =>
  Math.min(Math.max(Number.isInteger(v) ? (v as number) : padrao, 1), max)

const textoValido = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max

async function enviarPush(to: string | null | undefined, body: string, data: Record<string, unknown>, title = PUSH_TITULO) {
  if (!to || to === 'simulator-token') return false
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
    body: JSON.stringify([{ to, title, body, sound: 'default', data }]),
  }).catch(() => null)
  if (!res?.ok) return false
  // A Expo responde 200 mesmo com token inválido — o resultado real vem no ticket.
  const ticket = await res.json().catch(() => null)
  return ticket?.data?.[0]?.status === 'ok'
}

serve(async (req) => {
  const esperado = Deno.env.get('SUPORTE_EQUIPE_SECRET')
  const recebido = req.headers.get('x-suporte-secret') ?? ''
  if (!esperado || !mesmoSegredo(recebido, esperado)) return json({ error: 'Unauthorized' }, 401)
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.acao !== 'string') return json({ error: 'acao obrigatória' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const userId = body.user_id
  const precisaUser = ['ler_conversa', 'marcar_lida', 'responder'].includes(body.acao)
  if (precisaUser && (typeof userId !== 'string' || !UUID_RE.test(userId))) {
    return json({ error: 'user_id inválido' }, 400)
  }

  try {
    switch (body.acao) {
      case 'contador': {
        const { data, error } = await supabase.rpc('suporte_contador')
        if (error) throw error
        return json(data)
      }

      case 'listar_conversas': {
        const { data, error } = await supabase.rpc('suporte_conversas', {
          p_filtro: body.filtro === 'nao_lidas' ? 'nao_lidas' : 'todas',
          p_limite: limitar(body.limite, 30, 100),
          p_antes: typeof body.antes === 'string' ? body.antes : null,
        })
        if (error) throw error
        return json({ conversas: data ?? [] })
      }

      case 'ler_conversa': {
        const { data: usuaria } = await supabase.from('users')
          .select('id, nome, email, push_token').eq('id', userId).maybeSingle()
        if (!usuaria) return json({ error: 'usuária não encontrada' }, 404)

        let q = supabase.from('suporte_mensagens')
          .select('id, autor, tipo, texto, criado_em, lida_em, app_versao, app_build, plataforma, equipe_nome, notificado_em')
          .eq('user_id', userId)
          .order('criado_em', { ascending: false })
          .limit(limitar(body.limite, 50, 200))
        if (typeof body.antes === 'string') q = q.lt('criado_em', body.antes)
        const { data: msgs, error } = await q
        if (error) throw error

        // Versão do app no ÚLTIMO envio dela (pode não estar nesta página).
        const { data: ultimoEnvio } = await supabase.from('suporte_mensagens')
          .select('app_versao, app_build, plataforma, criado_em')
          .eq('user_id', userId).eq('autor', 'usuaria')
          .order('criado_em', { ascending: false }).limit(1).maybeSingle()

        return json({
          usuaria: {
            user_id: usuaria.id,
            nome: usuaria.nome,
            email: usuaria.email,
            recebe_push: !!usuaria.push_token && usuaria.push_token !== 'simulator-token',
            app_versao: ultimoEnvio?.app_versao ?? null,
            app_build: ultimoEnvio?.app_build ?? null,
            plataforma: ultimoEnvio?.plataforma ?? null,
          },
          mensagens: (msgs ?? []).reverse(),
        })
      }

      case 'marcar_lida': {
        const { data, error } = await supabase.from('suporte_mensagens')
          .update({ lida_em: new Date().toISOString() })
          .eq('user_id', userId).eq('autor', 'usuaria').is('lida_em', null)
          .select('id')
        if (error) throw error
        return json({ marcadas: data?.length ?? 0 })
      }

      case 'responder': {
        if (!textoValido(body.texto, MAX_TEXTO)) return json({ error: `texto entre 1 e ${MAX_TEXTO} caracteres` }, 400)
        const texto = body.texto.trim()
        const equipeNome = typeof body.equipe_nome === 'string' ? body.equipe_nome.trim().slice(0, 60) || null : null

        const { data: usuaria } = await supabase.from('users')
          .select('id, push_token').eq('id', userId).maybeSingle()
        if (!usuaria) return json({ error: 'usuária não encontrada' }, 404)

        const { data: msg, error } = await supabase.from('suporte_mensagens')
          .insert({ user_id: userId, autor: 'equipe', texto, equipe_nome: equipeNome })
          .select('id, autor, texto, criado_em, equipe_nome')
          .single()
        if (error) throw error

        // Quem respondeu leu o que veio antes.
        await supabase.from('suporte_mensagens')
          .update({ lida_em: new Date().toISOString() })
          .eq('user_id', userId).eq('autor', 'usuaria').is('lida_em', null)

        // Idioma à parte e tolerante: sem a coluna (antes da migration) ou com erro, português.
        const idioma = await supabase.from('users').select('idioma').eq('id', userId).maybeSingle()
          .then((r) => (r.error ? null : (r.data as { idioma?: string | null } | null)?.idioma ?? null), () => null)
        const push = idioma === 'en'
          ? await enviarPush(usuaria.push_token, PUSH_CORPO_EN, { type: 'suporte_resposta', mensagem_id: msg.id }, PUSH_TITULO_EN)
          : await enviarPush(usuaria.push_token, PUSH_CORPO, { type: 'suporte_resposta', mensagem_id: msg.id })
        if (push) {
          await supabase.from('suporte_mensagens').update({ notificado_em: new Date().toISOString() }).eq('id', msg.id)
        }
        console.log(`suporte-equipe: resposta user=${userId} msg=${msg.id} push=${push}`)
        return json({ mensagem: msg, push })
      }

      case 'faq_listar': {
        const { data, error } = await supabase.from('suporte_faq')
          .select('*').order('ordem').order('criado_em')
        if (error) throw error
        return json({ faq: data ?? [] })
      }

      case 'faq_salvar': {
        if (!textoValido(body.pergunta, 300)) return json({ error: 'pergunta entre 1 e 300 caracteres' }, 400)
        if (!textoValido(body.resposta, 4000)) return json({ error: 'resposta entre 1 e 4000 caracteres' }, 400)
        const campos = {
          pergunta: body.pergunta.trim(),
          resposta: body.resposta.trim(),
          ordem: Number.isInteger(body.ordem) ? body.ordem : 0,
          ativo: body.ativo !== false,
          atualizado_em: new Date().toISOString(),
        }
        if (body.id !== undefined && (typeof body.id !== 'string' || !UUID_RE.test(body.id))) {
          return json({ error: 'id inválido' }, 400)
        }
        const { data, error } = body.id
          ? await supabase.from('suporte_faq').update(campos).eq('id', body.id).select().maybeSingle()
          : await supabase.from('suporte_faq').insert(campos).select().single()
        if (error) throw error
        if (!data) return json({ error: 'item não encontrado' }, 404)
        return json({ item: data })
      }

      case 'faq_apagar': {
        if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) return json({ error: 'id inválido' }, 400)
        const { error } = await supabase.from('suporte_faq').delete().eq('id', body.id)
        if (error) throw error
        return json({ ok: true })
      }

      default:
        return json({ error: `acao desconhecida: ${body.acao}` }, 400)
    }
  } catch (e) {
    console.error(`suporte-equipe: erro acao=${body.acao}`, e)
    return json({ error: 'erro interno' }, 500)
  }
})
