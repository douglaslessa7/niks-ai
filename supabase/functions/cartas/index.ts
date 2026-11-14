import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT } from '../_shared/jwt.ts'

// Sistema de cartas do NIKS — o SORTEIO é feito aqui (no banco, via funções SQL com
// service role), nunca no app. Ver migrations 20261101120000…150000, o motor
// (20261102120000) e os NIKS Points (20261103120000/130000).
//
// Entrada (POST, JSON) — sempre com o JWT da usuária; o user_id vem do token:
//   { acao: 'estado', historico?: [{dia,am,pm}], pendentes?: [{periodo, quando}] }
//       → sobe o histórico do celular UMA vez, aplica os NIKS Points retroativos (uma vez),
//         registra rotinas da fila offline e devolve sequência, cartas a raspar, poderes,
//         a cota do dia, os pontos/nível, a tabela de níveis e a Carta de volta (se saiu).
//   { acao: 'concluir_rotina', periodo: 'am'|'pm' }
//       → sequência + a carta da rotina (+ Carta extra) + rara dos marcos 7/14/30.
//   { acao: 'carta', id }      → conteúdo de uma carta dela (para a tela de raspar).
//   { acao: 'raspar', id }     → marca raspada, sorteia os NIKS Points e aplica o Poder.
//   { acao: 'nivel_visto', nivel } → ela viu a celebração do nível (subida ou retroativo).
//
// REGRAS NOVAS (v2, migration 20261112120000): o app novo manda `regras: 2` em toda
// chamada. A conta passa às regras novas (de vez) e usa as funções *_v2: 1 carta por dia
// (só a de hoje para raspar), pontos sem carta, Pontos em dobro/Proteção, Carta de volta.
// Sem `regras` (o app da loja), tudo segue EXATAMENTE como antes.
//   { acao: 'regras', regras: 2 } → só marca a conta (o app chama logo depois do cadastro,
//       antes de salvar o scan: o gatilho do scan já toma o caminho novo).
//   { acao: 'concluir_rotina', periodo, regras: 2 } → { sequencia, carta | null, pontos | null }
//   { acao: 'raspar', id, regras: 2 } → carta de outro dia: { vencida: true }
// Saída: 200 JSON · 400 entrada inválida · 401 sem JWT válido · 404 carta não é dela.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const arteUrl = (path: string | null) => (path ? `${SUPABASE_URL}/storage/v1/object/public/cartas/${path}` : null)

// Fila offline: só aceita conclusões das últimas 48 h e não do futuro (2 min de folga).
const JANELA_FILA_MS = 48 * 3600 * 1000
const FOLGA_MS = 2 * 60 * 1000

// deno-lint-ignore no-explicit-any
type Supa = any

async function detalhes(supabase: Supa, userId: string, ids: string[]) {
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('cartas_usuario')
    .select('id, origem, dia, ganha_em, raspada_em, conteudo, pontos, carta:cartas_catalogo(id, codigo, familia, subtipo, serie, nome, raridade, arte_path, texto, efeito)')
    .eq('user_id', userId)
    .in('id', ids)
  if (error) throw error
  const ordem = new Map(ids.map((id, i) => [id, i]))
  return (data ?? [])
    .map((c: any) => ({ ...c, carta: c.carta ? { ...c.carta, arte_url: arteUrl(c.carta.arte_path) } : null }))
    .sort((a: any, b: any) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0))
}

// Regras novas: os pontos retroativos (uma vez por conta) entram ANTES da marca — depois
// dela as rotinas novas não têm carta 'rotina:am|pm' e contariam de novo nessa conta.
async function marcarV2(supabase: Supa, userId: string, appPontos = false) {
  {
    const { error } = await supabase.rpc('aplicar_pontos_retro', { p_uid: userId })
    if (error) throw error
  }
  const { error } = await supabase.rpc('marcar_regras_v2', { p_uid: userId })
  if (error) throw error
  // `regras: 3` (1.62 (2)+, migration 20261208120000): o app entende o modo pontos — a conta
  // entra nele (NIKS Points na comemoração, carta só de poder). Uma vez por conta.
  if (appPontos) {
    const { error: e3 } = await supabase.rpc('marcar_app_pontos', { p_uid: userId })
    if (e3) throw e3
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const jwtPayload = await verifyJWT(authHeader.slice(7))
  if (!jwtPayload?.sub) return json({ error: 'Unauthorized' }, 401)
  const userId = jwtPayload.sub

  const body = await req.json().catch(() => ({}))
  const acao = String(body?.acao ?? '')
  // 2 = regras novas; 3 = regras novas + o app entende o modo pontos (1.62 (2)+).
  const v2 = Number(body?.regras) >= 2
  const appPontos = Number(body?.regras) >= 3
  const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  try {
    if (acao === 'estado') {
      // 1. Histórico do celular (uma vez por usuária; a função SQL ignora as seguintes).
      if (Array.isArray(body?.historico)) {
        const { error } = await supabase.rpc('sincronizar_historico', { p_uid: userId, p_dias: body.historico.slice(0, 400) })
        if (error) throw error
      }
      // 2. NIKS Points retroativos (uma vez por conta; depois do histórico, que conta nele).
      {
        const { error } = await supabase.rpc('aplicar_pontos_retro', { p_uid: userId })
        if (error) throw error
      }
      if (v2) await marcarV2(supabase, userId, appPontos)
      // 3. Rotinas feitas sem internet.
      const novas: string[] = []
      if (Array.isArray(body?.pendentes)) {
        const agora = Date.now()
        for (const p of body.pendentes.slice(0, 4)) {
          const periodo = p?.periodo === 'pm' ? 'pm' : p?.periodo === 'am' ? 'am' : null
          const quando = Date.parse(String(p?.quando ?? ''))
          if (!periodo || !Number.isFinite(quando) || quando > agora + FOLGA_MS || quando < agora - JANELA_FILA_MS) continue
          const { data, error } = await supabase.rpc(v2 ? 'concluir_rotina_v2' : 'concluir_rotina',
            { p_uid: userId, p_periodo: periodo, p_quando: new Date(quando).toISOString() })
          if (error) throw error
          if (v2) { if (data?.carta) novas.push(data.carta as string) }
          else novas.push(...((data?.cartas ?? []) as string[]))
        }
      }
      const { data, error } = await supabase.rpc(v2 ? 'estado_cartas_v2' : 'estado_cartas', { p_uid: userId })
      if (error) throw error
      return json({ ...data, cartas_novas: novas })
    }

    if (acao === 'concluir_rotina') {
      const periodo = body?.periodo === 'pm' ? 'pm' : body?.periodo === 'am' ? 'am' : null
      if (!periodo) return json({ error: 'periodo inválido' }, 400)
      if (v2) {
        await marcarV2(supabase, userId, appPontos)
        const { data, error } = await supabase.rpc('concluir_rotina_v2', { p_uid: userId, p_periodo: periodo })
        if (error) throw error
        const [carta] = data?.carta ? await detalhes(supabase, userId, [data.carta]) : []
        return json({ sequencia: data.sequencia, carta: carta ?? null, pontos: data.pontos ?? null })
      }
      const { data, error } = await supabase.rpc('concluir_rotina', { p_uid: userId, p_periodo: periodo })
      if (error) throw error
      return json({ sequencia: data.sequencia, cartas: await detalhes(supabase, userId, data.cartas ?? []) })
    }

    if (acao === 'carta' || acao === 'raspar') {
      const id = String(body?.id ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'id inválido' }, 400)
      const [carta] = await detalhes(supabase, userId, [id])
      if (!carta) return json({ error: 'Carta não encontrada' }, 404)
      if (acao === 'carta') return json({ carta })
      const { data, error } = await supabase.rpc(v2 ? 'raspar_carta_v2' : 'raspar_carta', { p_uid: userId, p_id: id })
      if (error) throw error
      if (v2 && data?.vencida) return json({ carta, vencida: true })
      return json({
        carta: { ...carta, raspada_em: carta.raspada_em ?? new Date().toISOString(), pontos: data?.pontos?.ganhos ?? carta.pontos ?? null },
        poder: data?.poder ?? null,
        pontos: data?.pontos ?? null,
      })
    }

    if (acao === 'regras') {
      if (!v2) return json({ error: 'regras inválidas' }, 400)
      await marcarV2(supabase, userId, appPontos)
      return json({ ok: true, regras: appPontos ? 3 : 2 })
    }

    // Desafios do primeiro acesso (08/nov/2026, migration 20261113120000): o progresso sai dos
    // dados reais (scan de produto, estante, rotina com produtos, skincare); cada desafio paga
    // pontos uma vez (`ganhos`) e, concluídos os 4, uma carta RARA por conta, fora da regra de
    // 1 por dia. `marcar: 'guia'` grava que ela começou os desafios. Só nas regras novas.
    if (acao === 'missoes') {
      if (!v2) return json({ error: 'regras inválidas' }, 400)
      await marcarV2(supabase, userId, appPontos)
      const marcar = body?.marcar
      if (marcar === 'guia') {
        const { error } = await supabase.rpc('missoes_marcar', { p_uid: userId, p_o: marcar })
        if (error) throw error
      }
      const { data, error } = await supabase.rpc('missoes_estado', { p_uid: userId })
      if (error) throw error
      const [carta] = data?.carta?.id ? await detalhes(supabase, userId, [data.carta.id]) : []
      return json({ ...data, carta: carta ?? null })
    }

    // Boas-vindas pós-pagamento (07/nov/2026, migration 20261114120000): depois do
    // cadastro, +100 NIKS Points (Nível 2), sequência de 1 dia. Uma vez por conta, só conta
    // nova; repetir não faz nada (`{ ok: false, motivo }`).
    if (acao === 'boas_vindas') {
      if (!v2) return json({ error: 'regras inválidas' }, 400)
      await marcarV2(supabase, userId, appPontos)
      const { data, error } = await supabase.rpc('boas_vindas', { p_uid: userId })
      if (error) throw error
      return json(data)
    }

    if (acao === 'nivel_visto') {
      const nivel = Number(body?.nivel)
      if (!Number.isInteger(nivel) || nivel < 1) return json({ error: 'nivel inválido' }, 400)
      const { data, error } = await supabase.rpc('marcar_nivel_visto', { p_uid: userId, p_nivel: nivel })
      if (error) throw error
      return json(data)
    }

    return json({ error: 'acao inválida' }, 400)
  } catch (e) {
    console.error('[cartas]', acao, e)
    return json({ error: 'Falha ao processar as cartas' }, 500)
  }
})
