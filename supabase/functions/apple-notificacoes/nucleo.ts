// apple-notificacoes — núcleo (sem banco nem rede: tudo injetado, para testar).
//
// 1. REPASSA o corpo cru, intacto, para a URL do Superwall. Repasse sem sucesso → 500, e a
//    Apple tenta de novo (o Superwall e o nosso banco não perdem evento).
// 2. Verifica a assinatura da Apple (cadeia até a Apple Root CA G3) antes de usar o conteúdo.
// 3. Registra a notificação. CONSUMPTION_REQUEST vira um pedido em `apple_pedidos_reembolso`
//    (se não der para gravar → 500, a Apple manda de novo). REFUND / REFUND_DECLINED /
//    REFUND_REVERSED marcam o desfecho do pedido da mesma transação.
// 4. Decide a resposta (`decidir`): só responde quando a chave libera, a conta é conhecida,
//    ela aceitou os Termos (cadastro da 1.64, `users.termos_aceitos_em`; a seção 4 cobre o
//    envio à Apple) ANTES do pedido e o serviço foi entregue. Resposta: entregue, recusar,
//    amostra grátis, consentiu. Sem porcentagem consumida (decisão de 19/nov/2026).
// deno-lint-ignore-file no-explicit-any
import type { AmbienteApple, CorpoConsumo } from '../_shared/appleApi.ts'

export type ChaveResposta = 'desligado' | 'sandbox' | 'ligado'
export type Decisao =
  | 'pendente' | 'desligado' | 'sem_conta' | 'sem_consentimento' | 'nao_entregue'
  | 'respondido' | 'tentar_de_novo' | 'erro'

/** Pode ser decidido de novo enquanto o prazo de 12 h não acaba (a chave pode ligar, a conta pode ser ligada). */
export const REDECIDIR: Decisao[] = ['pendente', 'desligado', 'sem_conta', 'tentar_de_novo']
export const PRAZO_MS = 12 * 3600_000
export const BUNDLE_ID = 'br.com.niksai.app'

export interface Uso {
  dias_conta: number | null
  scans: number
  rotinas_geradas: number
  rotinas_feitas: number
  msgs_chat: number
  scans_produto: number
}

export interface Contexto {
  chave: ChaveResposta
  ambiente: AmbienteApple
  userId: string | null
  /** `users.termos_aceitos_em`: aceite dos Termos no cadastro. */
  termosAceitosEm: Date | null
  recebidoEm: Date
  uso: Uso | null
}

export const CORPO_PADRAO: CorpoConsumo = {
  customerConsented: true,
  deliveryStatus: 'DELIVERED',
  refundPreference: 'DECLINE',
  sampleContentProvided: true, // a análise grátis vem antes do paywall
}

export function decidir(c: Contexto): { decisao: Decisao; corpo: CorpoConsumo | null } {
  if (c.chave === 'desligado' || (c.chave === 'sandbox' && c.ambiente !== 'SANDBOX')) return { decisao: 'desligado', corpo: null }
  if (!c.userId) return { decisao: 'sem_conta', corpo: null }
  // A Apple só aceita resposta de quem consentiu: aceite dos Termos ANTES do pedido; sem ele, não respondemos.
  if (!c.termosAceitosEm || c.termosAceitosEm.getTime() > c.recebidoEm.getTime()) return { decisao: 'sem_consentimento', corpo: null }
  // Nada entregue (sem análise e sem rotina): recusar seria falso — não respondemos.
  if (!c.uso || (c.uso.rotinas_geradas <= 0 && c.uso.scans <= 0)) return { decisao: 'nao_entregue', corpo: null }
  return { decisao: 'pendente', corpo: { ...CORPO_PADRAO } }
}

/** Resultado da chamada à Apple → decisão gravada. 202 = recebida. */
export function decisaoDaResposta(status: number): Decisao {
  if (status === 202 || status === 200) return 'respondido'
  if (status === 0 || status === 401 || status === 429 || status >= 500) return 'tentar_de_novo'
  return 'erro' // 400, 404…: não adianta repetir
}

const DESFECHO: Record<string, string> = { REFUND: 'concedido', REFUND_DECLINED: 'negado', REFUND_REVERSED: 'revertido' }

/** Lê sem verificar (só para escolher a URL do repasse; nada aqui é confiável). */
export function ambienteSemVerificar(raw: string): AmbienteApple | null {
  try {
    const p = JSON.parse(atob(JSON.parse(raw).signedPayload.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return p?.data?.environment === 'Sandbox' ? 'SANDBOX' : p?.data?.environment === 'Production' ? 'PRODUCTION' : null
  } catch { return null }
}

export interface Deps {
  repassar: (raw: string, ambiente: AmbienteApple | null) => Promise<{ status: number; ms: number }>
  lerJws: (jws: string) => Promise<Record<string, any> | null>
  registrarNotificacao: (n: Record<string, unknown>) => Promise<void>
  /** Grava o pedido (não duplica pelo notificationUUID). false = não conseguiu gravar. */
  gravarPedido: (p: Record<string, unknown>) => Promise<boolean>
  marcarDesfecho: (transacao: string | null, original: string | null, resultado: string, em: Date) => Promise<void>
  /** Depois de responder à Apple (200): decidir/enviar o pedido em segundo plano. */
  emSegundoPlano: (notificationUUID: string) => void
  agora?: () => Date
}

/** Trata uma notificação da Apple. Devolve o status HTTP para a Apple. */
export async function receber(raw: string, d: Deps): Promise<number> {
  const agora = d.agora?.() ?? new Date()
  const rep = await d.repassar(raw, ambienteSemVerificar(raw))
  const repasseOk = rep.status >= 200 && rep.status < 300

  let jws: string | null = null
  try { jws = JSON.parse(raw)?.signedPayload ?? null } catch { /* corpo inválido */ }
  const n = jws ? await d.lerJws(jws) : null
  const dados = n?.data ?? {}
  const tx = dados.signedTransactionInfo ? await d.lerJws(dados.signedTransactionInfo) : null
  const valida = !!n && dados.bundleId === BUNDLE_ID && (!dados.signedTransactionInfo || (!!tx && tx.bundleId === BUNDLE_ID))
  const ambiente: AmbienteApple | null = dados.environment === 'Sandbox' ? 'SANDBOX' : dados.environment === 'Production' ? 'PRODUCTION' : null

  await d.registrarNotificacao({
    notification_uuid: n?.notificationUUID ?? null, tipo: n?.notificationType ?? null, subtipo: n?.subtype ?? null,
    ambiente, assinatura_ok: valida, repasse_http: rep.status, repasse_ms: rep.ms,
    original_transaction_id: tx?.originalTransactionId ?? null, recebido_em: agora.toISOString(),
  }).catch((e) => console.error('APPLE_NOTIF registrar', e))

  // O Superwall precisa receber: sem repasse, a Apple tem que tentar de novo.
  if (!repasseOk) return 500
  if (!valida || !n) return 200 // não é da Apple (ou não é do NIKS): já repassado, não usamos

  if (n.notificationType === 'CONSUMPTION_REQUEST' && tx) {
    const ok = await d.gravarPedido({
      notification_uuid: n.notificationUUID, ambiente, recebido_em: agora.toISOString(),
      transaction_id: tx.transactionId ?? null, original_transaction_id: tx.originalTransactionId ?? null,
      app_account_token: tx.appAccountToken ?? null, produto: tx.productId ?? null,
      motivo: dados.consumptionRequestReason ?? null, decisao: 'pendente',
    })
    if (!ok) return 500 // a Apple manda de novo; o Superwall recebe repetido (idempotente pelo UUID)
    d.emSegundoPlano(n.notificationUUID)
  } else if (DESFECHO[n.notificationType] && tx) {
    await d.marcarDesfecho(tx.transactionId ?? null, tx.originalTransactionId ?? null, DESFECHO[n.notificationType], agora)
      .catch((e) => console.error('APPLE_NOTIF desfecho', e))
  }
  return 200
}
