import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT } from '../_shared/jwt.ts'
import { moderarImagem } from '../_shared/moderacao.ts'

// Grupos do NIKS (fase 3, design NiksGrupoV2). Tudo passa por aqui: o banco não tem
// política para o app (migration 20261106120000). Sempre com o JWT da usuária; o
// user_id vem do token. Fotos (check-in e banner) no bucket privado `grupos`, pasta
// {user_id}/ — sobem por URL assinada de upload e são lidas por URL assinada (1 h),
// geradas aqui só depois das funções SQL conferirem que ela é integrante.
//
//   { acao: 'meus_grupos' }                          → cards de "Seus grupos" (80s)
//   { acao: 'grupo', grupo_id }                      → tela do grupo (80a)
//   { acao: 'mural', grupo_id, antes? }              → check-ins (fotos assinadas)
//   { acao: 'ranking', grupo_id, periodo }           → semana | mes | ano | geral (80f/80g)
//   { acao: 'jornada', grupo_id }                    → níveis individuais (80i)
//   { acao: 'perfil', mes? 'AAAA-MM-01' }            → aba Grupos (80q/80r)
//   { acao: 'upload_url', tipo: 'checkin'|'banner' } → URL assinada de upload
//   { acao: 'criar', nome, descricao?, banner?, banner_path? }       (80u)
//   { acao: 'convite', grupo_id }                    → { token, codigo, link }
//   { acao: 'validar_convite', token } / { acao: 'entrar', token }
//   { acao: 'validar_codigo', codigo }               → SEM login: { valido, nome, convidou, cheio }
//   { acao: 'entrar_codigo', codigo }                → como `entrar`; o tipo é decidido no banco
//   { acao: 'convidada_status' }                     → SEM login: { ligada }
//   { acao: 'estado' }                               → { estado: assinante | convidada | sem_acesso }
//   { acao: 'sair', grupo_id } / { acao: 'remover', grupo_id, user_id }
//   { acao: 'bloquear', user_id, bloquear? } / { acao: 'denunciar', tipo, grupo_id, user_id?, checkin_id?, compartilhamento_id?, motivo? }
//   { acao: 'produto_compartilhado', grupo_id, compartilhamento_id } → produto sem a nota de quem escaneou
//   { acao: 'moderar_perfil', base64 }               → filtro da foto de perfil, antes de subir
//   { acao: 'denuncias' } / { acao: 'revisar_denuncia', denuncia_id, decisao } → só moderadoras
//   { acao: 'checkin', foto_path, rotina: 'am'|'pm', grupos: [ids], hora_exibida?, titulo?, descricao? }
//   { acao: 'compartilhar', product_scan_id, grupos: [ids] }  → produto no mural (80o)
// Saída: 200 JSON ({ok:false, motivo} quando a regra recusa) · 400 entrada · 401 JWT · 404 não é do grupo.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const BUCKET = 'grupos'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/

// deno-lint-ignore no-explicit-any
type Supa = any

function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Troca os caminhos do bucket por URLs assinadas (um pedido só para a lista toda).
async function assinar(supabase: Supa, paths: (string | null | undefined)[], bucket = BUCKET): Promise<Map<string, string>> {
  const unicos = [...new Set(paths.filter((p): p is string => !!p))]
  const mapa = new Map<string, string>()
  if (!unicos.length) return mapa
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unicos, 3600)
  for (const d of data ?? []) if (d.signedUrl && d.path) mapa.set(d.path, d.signedUrl)
  return mapa
}

// deno-lint-ignore no-explicit-any
async function comBanner(supabase: Supa, grupos: any[]) {
  const urls = await assinar(supabase, grupos.map((g) => g?.banner_path))
  return grupos.map((g) => (g ? { ...g, banner_url: g.banner_path ? urls.get(g.banner_path) ?? null : null } : g))
}

// Roda depois da resposta (Supabase Edge Runtime); fora dele, só não espera.
function emSegundoPlano(p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
  else p.catch(() => {})
}

// Push "Ana fez check-in 📸" (fase 3 · 3.4): a lista vem do banco (já sem quem bloqueou a
// autora, sem token e sem repetir), em lotes de 100 para a Expo.
async function avisarCheckin(supabase: Supa, checkinId: string) {
  try {
    const { data, error } = await supabase.rpc('destinatarias_checkin', { p_checkin: checkinId })
    if (error) throw error
    // deno-lint-ignore no-explicit-any
    const msgs = (data ?? []).map((d: any) => ({
      to: d.push_token, title: d.grupo_nome, body: `${d.autora} fez check-in 📸`, sound: 'default',
      data: { type: 'grupo_checkin', grupo_id: d.grupo_id },
    }))
    for (let i = 0; i < msgs.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(msgs.slice(i, i + 100)),
      })
    }
  } catch (e) {
    console.error('[grupos] aviso de check-in:', (e as Error).message)
  }
}

// Filtro automático (Fase 2): recusa ou indisponibilidade impedem a publicação.
async function filtrarArquivo(supabase: Supa, bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 120)
  if (error || !data?.signedUrl) return { liberada: false as const, motivo: 'filtro_indisponivel' as const }
  return moderarImagem(data.signedUrl)
}

const recusaDoFiltro = (r: { motivo?: string; categoria?: string }) =>
  json({ ok: false, motivo: r.motivo, categoria: r.categoria })

async function avisarModeradoras(supabase: Supa) {
  try {
    const { data } = await supabase.rpc('tokens_moderadores')
    const tokens = (data ?? []) as string[]
    if (!tokens.length) return
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map((to) => ({
        to, sound: 'default', title: 'NIKS: nova denúncia', body: 'Toque para revisar. Prazo de 24 horas.', data: { type: 'denuncia' },
      }))),
    })
  } catch (e) {
    console.error('[grupos] aviso de denúncia:', (e as Error).message)
  }
}

// Limite de tentativas de código, por janela de 10 minutos (Parte B, Fase 1).
const CODIGO_MAX = 20
const LIMITE_POR_IP = 30
const LIMITE_POR_CONTA = 20

// Guarda só o hash do IP, com sal, e por no máximo 1 dia.
async function chaveDoIp(req: Request): Promise<string> {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sem-ip'
  const dados = new TextEncoder().encode(`${ip}:${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', dados))
  return `ip:${Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

async function rpc(supabase: Supa, fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => ({}))
  const acao = String(body?.acao ?? '')
  const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Única ação sem login: a tela de código do onboarding vem antes da conta.
  if (acao === 'validar_codigo') {
    try {
      const codigo = String(body?.codigo ?? '')
      if (codigo.length > CODIGO_MAX) return json({ valido: false })
      const permitido = await rpc(supabase, 'codigo_tentativa', { p_chave: await chaveDoIp(req), p_limite: LIMITE_POR_IP })
      if (!permitido) return json({ valido: false, motivo: 'limite' })
      return json(await rpc(supabase, 'validar_codigo', { p_codigo: codigo }))
    } catch (e) {
      console.error('[grupos]', acao, (e as Error).message)
      return json({ error: 'Erro interno' }, 500)
    }
  }

  // Sem login: o onboarding decide se mostra a tela de código.
  if (acao === 'convidada_status') {
    const { data } = await supabase.from('grupos_config').select('convidada_ligada, versao_minima').eq('id', 1).maybeSingle()
    return json({ ligada: data?.convidada_ligada === true, versao_minima: data?.versao_minima ?? null })
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const jwtPayload = await verifyJWT(authHeader.slice(7))
  if (!jwtPayload?.sub) return json({ error: 'Unauthorized' }, 401)
  const uid = jwtPayload.sub

  const gid = typeof body?.grupo_id === 'string' && UUID.test(body.grupo_id) ? body.grupo_id : null
  const precisaGrupo = ['grupo', 'mural', 'ranking', 'jornada', 'convite', 'sair', 'remover', 'denunciar', 'produto_compartilhado']
  if (precisaGrupo.includes(acao) && !gid) return json({ error: 'grupo_id inválido' }, 400)

  try {
    switch (acao) {
      case 'meus_grupos':
        return json({ grupos: await comBanner(supabase, (await rpc(supabase, 'meus_grupos', { p_uid: uid })) ?? []) })

      case 'grupo': {
        const g = await rpc(supabase, 'grupo_detalhe', { p_uid: uid, p_grupo: gid })
        if (!g) return json({ error: 'Grupo não encontrado' }, 404)
        return json({ grupo: (await comBanner(supabase, [g]))[0] })
      }

      case 'mural': {
        const antes = typeof body?.antes === 'string' && !Number.isNaN(Date.parse(body.antes)) ? body.antes : null
        const itens = await rpc(supabase, 'mural_grupo', { p_uid: uid, p_grupo: gid, p_antes: antes, p_limite: 30 })
        if (itens === null) return json({ error: 'Grupo não encontrado' }, 404)
        // Check-in: bucket `grupos`; produto compartilhado: a foto do scan (`product-scans`).
        // deno-lint-ignore no-explicit-any
        const doBucket = (b: string) => itens.filter((i: any) => i.foto_bucket === b).map((i: any) => i.foto_path)
        const [urlsG, urlsP] = await Promise.all([assinar(supabase, doBucket(BUCKET)), assinar(supabase, doBucket('product-scans'), 'product-scans')])
        return json({
          // deno-lint-ignore no-explicit-any
          itens: itens.map(({ foto_path, foto_bucket, ...i }: any) => ({
            ...i, foto_url: (foto_bucket === 'product-scans' ? urlsP : urlsG).get(foto_path) ?? null,
          })),
        })
      }

      case 'ranking': {
        const periodo = ['semana', 'mes', 'ano', 'geral'].includes(body?.periodo) ? body.periodo : 'semana'
        const lista = await rpc(supabase, 'ranking_grupo', { p_uid: uid, p_grupo: gid, p_periodo: periodo })
        if (lista === null) return json({ error: 'Grupo não encontrado' }, 404)
        return json({ periodo, lista })
      }

      case 'jornada': {
        const lista = await rpc(supabase, 'jornada_grupo', { p_uid: uid, p_grupo: gid })
        if (lista === null) return json({ error: 'Grupo não encontrado' }, 404)
        const { data: est } = await supabase.rpc('estado_cartas', { p_uid: uid })
        return json({ lista, niveis: est?.niveis ?? null, icone: est?.icone ?? null })
      }

      case 'perfil': {
        const mes = typeof body?.mes === 'string' && /^\d{4}-\d{2}-01$/.test(body.mes) ? body.mes : new Date().toISOString().slice(0, 8) + '01'
        const p = await rpc(supabase, 'perfil_grupos', { p_uid: uid, p_mes: mes })
        // deno-lint-ignore no-explicit-any
        const urls = await assinar(supabase, (p?.dias ?? []).map((d: any) => d.foto_path))
        // deno-lint-ignore no-explicit-any
        return json({ perfil: { ...p, dias: (p?.dias ?? []).map(({ foto_path, ...d }: any) => ({ ...d, foto_url: urls.get(foto_path) ?? null })) } })
      }

      case 'upload_url': {
        const tipo = body?.tipo === 'banner' ? 'banner' : 'checkin'
        const path = `${uid}/${tipo}-${crypto.randomUUID()}.jpg`
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
        if (error) throw error
        return json({ path, token: data.token, signedUrl: data.signedUrl })
      }

      case 'criar': {
        const bannerPath = typeof body?.banner_path === 'string' ? body.banner_path : null
        if (bannerPath) {
          if (!bannerPath.startsWith(`${uid}/`)) return json({ ok: false, motivo: 'banner' })
          const filtro = await filtrarArquivo(supabase, BUCKET, bannerPath)
          if (!filtro.liberada) return recusaDoFiltro(filtro)
        }
        const r = await rpc(supabase, 'criar_grupo', {
          p_uid: uid, p_nome: String(body?.nome ?? ''), p_descricao: typeof body?.descricao === 'string' ? body.descricao : null,
          p_banner: typeof body?.banner === 'string' ? body.banner.slice(0, 20) : null, p_banner_path: bannerPath,
        })
        return json(r)
      }

      case 'convite': {
        const r = await rpc(supabase, 'convite_do_grupo', { p_uid: uid, p_grupo: gid, p_token_novo: novoToken() })
        if (!r?.ok) return json(r)
        return json({ ...r, link: `${SUPABASE_URL}/functions/v1/convite?t=${r.token}` })
      }

      case 'validar_convite': {
        const token = String(body?.token ?? '')
        if (!TOKEN.test(token)) return json({ valido: false })
        const v = await rpc(supabase, 'validar_convite', { p_token: token })
        return json(v?.valido ? (await comBanner(supabase, [v]))[0] : { valido: false })
      }

      case 'entrar': {
        const token = String(body?.token ?? '')
        if (!TOKEN.test(token)) return json({ ok: false, motivo: 'convite_invalido' })
        return json(await rpc(supabase, 'entrar_grupo', { p_uid: uid, p_token: token }))
      }

      case 'entrar_codigo': {
        const codigo = String(body?.codigo ?? '')
        if (codigo.length > CODIGO_MAX) return json({ ok: false, motivo: 'convite_invalido' })
        const permitido = await rpc(supabase, 'codigo_tentativa', { p_chave: `conta:${uid}`, p_limite: LIMITE_POR_CONTA })
        if (!permitido) return json({ ok: false, motivo: 'limite' })
        return json(await rpc(supabase, 'entrar_grupo_codigo', { p_uid: uid, p_codigo: codigo }))
      }

      case 'estado':
        return json({ estado: await rpc(supabase, 'estado_acesso', { p_uid: uid }) })

      case 'sair':
        return json(await rpc(supabase, 'sair_grupo', { p_uid: uid, p_grupo: gid }))

      case 'remover': {
        if (!UUID.test(String(body?.user_id ?? ''))) return json({ error: 'user_id inválido' }, 400)
        return json(await rpc(supabase, 'remover_integrante', { p_uid: uid, p_grupo: gid, p_alvo: body.user_id }))
      }

      case 'bloquear': {
        if (!UUID.test(String(body?.user_id ?? ''))) return json({ error: 'user_id inválido' }, 400)
        return json(await rpc(supabase, 'bloquear', { p_uid: uid, p_alvo: body.user_id, p_bloquear: body?.bloquear !== false }))
      }

      case 'denunciar': {
        const tipo = body?.tipo === 'foto' ? 'foto' : body?.tipo === 'integrante' ? 'integrante' : null
        if (!tipo) return json({ error: 'tipo inválido' }, 400)
        const alvo = UUID.test(String(body?.user_id ?? '')) ? body.user_id : null
        const checkin = UUID.test(String(body?.checkin_id ?? '')) ? body.checkin_id : null
        const comp = UUID.test(String(body?.compartilhamento_id ?? '')) ? body.compartilhamento_id : null
        const r = await rpc(supabase, 'denunciar', {
          p_uid: uid, p_tipo: tipo, p_grupo: gid, p_alvo: alvo, p_checkin: checkin, p_compartilhamento: comp,
          p_motivo: typeof body?.motivo === 'string' ? body.motivo : null,
        })
        if (r?.ok && !r.ja_denunciou) emSegundoPlano(avisarModeradoras(supabase))
        return json(r)
      }

      case 'checkin': {
        const path = String(body?.foto_path ?? '')
        if (!path.startsWith(`${uid}/checkin-`) || !path.endsWith('.jpg')) return json({ ok: false, motivo: 'foto' })
        // A foto tem que existir de verdade (subiu pela URL assinada).
        const nome = path.slice(uid.length + 1)
        const { data: achados } = await supabase.storage.from(BUCKET).list(uid, { search: nome, limit: 1 })
        if (!achados?.some((o: { name: string }) => o.name === nome)) return json({ ok: false, motivo: 'foto' })
        const filtro = await filtrarArquivo(supabase, BUCKET, path)
        if (!filtro.liberada) return recusaDoFiltro(filtro)
        const grupos = Array.isArray(body?.grupos) ? body.grupos.filter((g: unknown) => typeof g === 'string' && UUID.test(g)).slice(0, 50) : []
        const hora = typeof body?.hora_exibida === 'string' && !Number.isNaN(Date.parse(body.hora_exibida)) ? body.hora_exibida : null
        const r = await rpc(supabase, 'publicar_checkin', {
          p_uid: uid, p_foto_path: path, p_rotina: body?.rotina === 'pm' ? 'pm' : 'am', p_grupos: grupos, p_hora_exibida: hora,
          p_titulo: typeof body?.titulo === 'string' ? body.titulo.slice(0, 60) : null,
          p_descricao: typeof body?.descricao === 'string' ? body.descricao.slice(0, 280) : null,
        })
        // "Ana fez check-in 📸" para as outras — depois da resposta, sem atrasá-la.
        if (r?.ok && r.checkin_id) emSegundoPlano(avisarCheckin(supabase, r.checkin_id))
        return json(r)
      }

      case 'compartilhar': {
        const scan = String(body?.product_scan_id ?? '')
        if (!UUID.test(scan)) return json({ error: 'product_scan_id inválido' }, 400)
        const { data: foto } = await supabase.from('product_scans').select('image_path').eq('id', scan).eq('user_id', uid).maybeSingle()
        if (foto?.image_path) {
          const filtro = await filtrarArquivo(supabase, 'product-scans', foto.image_path)
          if (!filtro.liberada) return recusaDoFiltro(filtro)
        }
        const grupos = Array.isArray(body?.grupos) ? body.grupos.filter((g: unknown) => typeof g === 'string' && UUID.test(g)).slice(0, 50) : []
        return json(await rpc(supabase, 'compartilhar_produto', { p_uid: uid, p_scan: scan, p_grupos: grupos }))
      }

      case 'produto_compartilhado': {
        if (!UUID.test(String(body?.compartilhamento_id ?? ''))) return json({ error: 'compartilhamento_id inválido' }, 400)
        const r = await rpc(supabase, 'produto_compartilhado', { p_uid: uid, p_grupo: gid, p_compartilhamento: body.compartilhamento_id })
        if (!r?.ok) return json(r)
        const urls = await assinar(supabase, [r.foto_path], 'product-scans')
        return json({ ok: true, resultado: r.resultado, foto_url: urls.get(r.foto_path) ?? null })
      }

      case 'moderar_perfil': {
        const b = typeof body?.base64 === 'string' ? body.base64 : ''
        if (!b || b.length > 4_000_000) return json({ error: 'foto inválida' }, 400)
        const filtro = await moderarImagem(`data:image/jpeg;base64,${b}`)
        return filtro.liberada ? json({ ok: true }) : recusaDoFiltro(filtro)
      }

      case 'denuncias': {
        const lista = await rpc(supabase, 'denuncias_abertas', { p_mod: uid })
        if (lista === null) return json({ ok: false, motivo: 'sem_permissao' })
        // deno-lint-ignore no-explicit-any
        const itens = lista as any[]
        const urls = new Map<string, string>()
        for (const bucket of ['grupos', 'product-scans']) {
          const assinadas = await assinar(supabase, itens.filter((d) => d.foto_bucket === bucket).map((d) => d.foto_path), bucket)
          for (const [k, v] of assinadas) urls.set(`${bucket}:${k}`, v)
        }
        return json({ ok: true, denuncias: itens.map((d) => ({ ...d, foto_url: urls.get(`${d.foto_bucket}:${d.foto_path}`) ?? null })) })
      }

      case 'revisar_denuncia': {
        if (!UUID.test(String(body?.denuncia_id ?? ''))) return json({ error: 'denuncia_id inválido' }, 400)
        return json(await rpc(supabase, 'revisar_denuncia', { p_mod: uid, p_denuncia: body.denuncia_id, p_acao: String(body?.decisao ?? '') }))
      }

      default:
        return json({ error: 'acao inválida' }, 400)
    }
  } catch (e) {
    console.error('[grupos]', acao, (e as Error).message)
    return json({ error: 'Erro interno' }, 500)
  }
})
