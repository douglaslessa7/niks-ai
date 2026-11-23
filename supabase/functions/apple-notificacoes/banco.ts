// apple-notificacoes — banco (service role) e o passo "decidir e responder" de um pedido.
// deno-lint-ignore-file no-explicit-any
import { credenciaisDoAmbiente, enviarConsumo, type AmbienteApple } from '../_shared/appleApi.ts'
import { decidir, decisaoDaResposta, PRAZO_MS, REDECIDIR, type ChaveResposta, type Deps } from './nucleo.ts'

export function depsDoBanco(db: any): Omit<Deps, 'repassar' | 'lerJws' | 'emSegundoPlano'> {
  return {
    registrarNotificacao: async (n) => {
      const { error } = await db.from('apple_notificacoes').insert(n)
      if (error) throw new Error(error.message)
    },
    gravarPedido: async (p) => {
      const { error } = await db.from('apple_pedidos_reembolso').upsert(p, { onConflict: 'notification_uuid', ignoreDuplicates: true })
      if (error) console.error('APPLE_NOTIF pedido', error.message)
      return !error
    },
    marcarDesfecho: async (transacao, original, resultado, em) => {
      // O pedido mais recente da mesma transação, ainda sem desfecho.
      let q = db.from('apple_pedidos_reembolso').select('notification_uuid').is('resultado_apple', null)
        .order('recebido_em', { ascending: false }).limit(1)
      q = transacao ? q.eq('transaction_id', transacao) : q.eq('original_transaction_id', original)
      const { data } = await q
      const alvo = data?.[0]?.notification_uuid
      if (alvo) await db.from('apple_pedidos_reembolso').update({ resultado_apple: resultado, resultado_em: em.toISOString() }).eq('notification_uuid', alvo)
    },
  }
}

async function chave(db: any): Promise<ChaveResposta> {
  const { data } = await db.from('apple_reembolso_config').select('responder').eq('id', 1).maybeSingle()
  return (['desligado', 'sandbox', 'ligado'].includes(data?.responder) ? data.responder : 'desligado') as ChaveResposta
}

/** Dona da compra: pela transação original (assinaturas_loja); senão pelo appAccountToken, se for uma conta. */
async function donaDaCompra(db: any, original: string | null, token: string | null): Promise<string | null> {
  if (original) {
    const { data } = await db.from('assinaturas_loja').select('user_id').eq('original_transaction_id', original).maybeSingle()
    if (data?.user_id) return data.user_id
  }
  if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    const { data } = await db.from('users').select('id').eq('id', token).maybeSingle()
    if (data?.id) return data.id
  }
  return null
}

/** Decide e (se for o caso) responde UM pedido. Idempotente: pedido respondido não é tocado. */
export async function processarPedido(db: any, uuid: string, agora = new Date()): Promise<string> {
  const { data: p } = await db.from('apple_pedidos_reembolso').select('*').eq('notification_uuid', uuid).maybeSingle()
  if (!p) return 'nao_achado'
  if (!REDECIDIR.includes(p.decisao)) return p.decisao
  const recebidoEm = new Date(p.recebido_em)
  if (agora.getTime() - recebidoEm.getTime() > PRAZO_MS) return 'fora_do_prazo'

  const userId = await donaDaCompra(db, p.original_transaction_id, p.app_account_token)
  const [{ data: u }, { data: uso }] = await Promise.all([
    userId ? db.from('users').select('termos_aceitos_em').eq('id', userId).maybeSingle() : Promise.resolve({ data: null }),
    userId ? db.rpc('apple_uso_da_conta', { p_uid: userId, p_ate: p.recebido_em }) : Promise.resolve({ data: null }),
  ])
  const d = decidir({
    chave: await chave(db), ambiente: p.ambiente as AmbienteApple, userId,
    termosAceitosEm: u?.termos_aceitos_em ? new Date(u.termos_aceitos_em) : null,
    recebidoEm, uso: uso ?? null,
  })
  const base = { user_id: userId, uso: uso ?? null, tentativas: (p.tentativas ?? 0) + (d.corpo ? 1 : 0), atualizado_em: agora.toISOString() }
  if (!d.corpo) {
    await db.from('apple_pedidos_reembolso').update({ ...base, decisao: d.decisao }).eq('notification_uuid', uuid)
    return d.decisao
  }

  const cred = credenciaisDoAmbiente()
  let status = 0
  let texto = 'sem credenciais da Apple nos segredos'
  if (cred && p.transaction_id) {
    try {
      const r = await enviarConsumo(cred, p.ambiente as AmbienteApple, p.transaction_id, d.corpo)
      status = r.status
      texto = r.texto
    } catch (e) { texto = String((e as Error)?.message ?? e).slice(0, 500) }
  }
  const decisao = decisaoDaResposta(status)
  await db.from('apple_pedidos_reembolso').update({
    ...base, decisao, enviado: d.corpo, http_status: status || null, resposta: texto || null,
    respondido_em: decisao === 'respondido' ? agora.toISOString() : null,
  }).eq('notification_uuid', uuid)
  console.log('APPLE_REEMBOLSO', JSON.stringify({ uuid, decisao, status, ambiente: p.ambiente }))
  return decisao
}

/** Tarefa agendada: decide de novo/repete os pedidos ainda dentro do prazo de 12 h. */
export async function processarPendentes(db: any, agora = new Date()): Promise<Record<string, number>> {
  const desde = new Date(agora.getTime() - PRAZO_MS).toISOString()
  const { data } = await db.from('apple_pedidos_reembolso').select('notification_uuid')
    .in('decisao', REDECIDIR).gte('recebido_em', desde).order('recebido_em').limit(50)
  const conta: Record<string, number> = {}
  for (const r of data ?? []) {
    const d = await processarPedido(db, r.notification_uuid, agora)
    conta[d] = (conta[d] ?? 0) + 1
  }
  return conta
}
