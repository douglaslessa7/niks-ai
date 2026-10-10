// ─────────────────────────────────────────────────────────────────────────────
// Proposta de mudança de rotina pelo chat (out/2026) — substitui o bloco escondido
// [[PROTOCOL_PATCH]] no texto (que o gpt-5.4-mini parou de emitir: "phrase-without-block")
// por uma FERRAMENTA oficial da IA (`propor_mudanca_rotina`).
//
// `registrarProposta` roda ANTES de a resposta terminar de chegar ao app, então o card
// aparece na hora (sem a corrida de 4 s de antes). Ela:
//   1. valida (validateProposal) e testa se a mudança DARIA CERTO na rotina atual
//      (applyProposal em seco) — proposta que falharia na aprovação nem vira card;
//   2. trava de gravidez: nada de retinoide para grávida/amamentando/tentando;
//   3. a proposta nova SUBSTITUI a pendente anterior (status 'superseded') — a conversa
//      nunca trava esperando uma sugestão que ela não vê;
//   4. grava em coach_protocol_suggestions e devolve o id.
// Falhou → devolve o motivo em linguagem simples (o chat conta a verdade a ela).
// ─────────────────────────────────────────────────────────────────────────────
import { validateProposal, applyProposal, detectTargetActive, logRefusal, type ProposedChanges } from '../_shared/protocol-write.ts'
import { temMinhaRotina, lerMinhaRotina } from '../_shared/minha-rotina.ts'

const PASSO_SCHEMA = {
  type: 'object',
  properties: {
    step_name: { type: 'string', description: 'Nome curto do passo (tipo do produto + benefício, até 5 palavras), sem concentração. Ex.: "Sérum de Retinol".' },
    ingredient: { type: 'string', description: 'UM produto: [tipo do produto] + [ativo principal + concentração]. Nunca vários produtos no mesmo passo. Sem os dias.' },
    instruction: { type: 'string', description: 'Como usar (1–2 frases), o mesmo que você explicou no texto.' },
    schedule_days: { type: ['array', 'null'], items: { type: 'string', enum: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'] }, description: 'Dias da semana quando NÃO é diário; null quando é todo dia.' },
  },
  required: ['step_name', 'ingredient', 'instruction', 'schedule_days'],
}

/** A ferramenta. `periodoInteiro` (app novo) libera trocar a rotina inteira de um período. */
export function ferramentaProposta(periodoInteiro: boolean) {
  const acoes = periodoInteiro ? ['add', 'remove', 'replace', 'replace_period'] : ['add', 'remove', 'replace']
  return [{
    type: 'function',
    function: {
      name: 'propor_mudanca_rotina',
      description: 'Registra UMA proposta de mudança na rotina dela, que aparece num cartão com Aprovar/Recusar. NÃO chame no primeiro pedido dela: primeiro responda em texto com a sua opinião clínica sobre o pedido. Se você recomenda NÃO fazer, explique e termine com "Quer que eu tire/inclua/troque mesmo assim?" — sem chamar a ferramenta. Chame só quando ela já ouviu a sua opinião e confirmou (ex.: "sim", "pode", "quero mesmo assim"), ou quando ela aceitou uma proposta sua. Nunca diga que a rotina foi alterada: ela muda só quando ela tocar em Aprovar.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Texto do cartão: fala DIRETO com ela, em segunda pessoa ("você"), 1 frase curta (até ~15 palavras). Ex.: "Você pediu para tirar a vitamina C da manhã." Nunca em terceira pessoa ("a usuária…").' },
          action: {
            type: 'string', enum: acoes,
            description: periodoInteiro
              ? 'add = incluir UM passo; remove = tirar UM passo; replace = trocar UM passo por outro; replace_period = trocar a rotina INTEIRA de um período pela lista `steps` (quando ela pede para reorganizar a manhã ou a noite toda).'
              : 'add = incluir UM passo; remove = tirar UM passo; replace = trocar UM passo por outro.',
          },
          period: { type: 'string', enum: ['am', 'pm'], description: 'am = manhã, pm = noite. O período do PEDIDO dela.' },
          step_name: { type: 'string', description: 'add/remove/replace: o passo (o que entra; em remove, o que sai). Vazio em replace_period.' },
          ingredient: { type: 'string', description: 'add/replace: UM produto ([tipo] + [ativo + concentração]); remove: o passo que sai. Vazio em replace_period.' },
          instruction: { type: 'string', description: 'add/replace: como usar. Vazio nos outros.' },
          schedule_days: PASSO_SCHEMA.properties.schedule_days,
          replaces: { type: ['string', 'null'], description: 'replace: o passo que sai (nome). Senão null.' },
          target_id: { type: ['string', 'null'], description: 'remove/replace: o [passo_id] do passo que sai, quando <CurrentProtocol> mostra os códigos. Senão null.' },
          ...(periodoInteiro ? { steps: { type: ['array', 'null'], items: PASSO_SCHEMA, description: 'replace_period: a rotina nova do período, NA ORDEM, um produto por passo. Null nos outros.' } } : {}),
        },
        required: ['reason', 'action', 'period'],
      },
    },
  }]
}

const SEM_RETINOIDE = ['pregnant', 'breastfeeding', 'trying']

/** Motivo técnico → frase simples para a usuária. */
export function motivoSimples(reason: string, period: 'am' | 'pm'): string {
  const quando = period === 'am' ? 'da manhã' : 'da noite'
  if (reason.startsWith('protected-step') || reason.startsWith('period-missing-protected')) return 'limpeza, hidratante e protetor não podem sair da rotina'
  if (reason.startsWith('protected-replace')) return 'esse passo só pode ser trocado por outro do mesmo tipo, sem ácido ou retinoide'
  if (reason.startsWith('clinical-am-forbidden')) return 'esse ativo não pode ser usado de manhã'
  if (reason.startsWith('add-duplicate') || reason.startsWith('replace-would-duplicate') || reason.startsWith('period-duplicate')) return `já tem um passo com esse ativo na rotina ${quando}`
  if (reason.startsWith('target-other-period')) return `esse passo não está na rotina ${quando}`
  if (reason.startsWith('target-')) return `não achei esse passo na rotina ${quando}`
  if (reason.includes('multiple-products')) return 'cada passo precisa ser um produto só'
  if (reason.startsWith('pregnancy')) return 'esse ativo não é indicado na gestação, amamentação ou tentante'
  if (reason.startsWith('period-only-new-app')) return 'trocar a rotina inteira de uma vez só funciona na versão nova do app'
  return 'ela não passou nas checagens de segurança'
}

/** Uma linha que descreve a proposta (quando a IA chama a ferramenta sem escrever texto). */
export function descreverProposta(raw: unknown): string {
  const pc = (raw ?? {}) as Record<string, any>
  const quando = pc.period === 'am' ? 'da manhã' : 'da noite'
  if (pc.action === 'replace_period' && Array.isArray(pc.steps)) {
    return `Preparei sua rotina ${quando} nova, passo a passo: ${pc.steps.map((x: any, i: number) => `${i + 1}. ${x.step_name}`).join(' · ')}.`
  }
  const item = [pc.step_name, pc.ingredient && pc.ingredient !== pc.step_name ? `(${pc.ingredient})` : ''].filter(Boolean).join(' ')
  if (pc.action === 'remove') return `Preparei para você: tirar ${item} da sua rotina ${quando}.`
  if (pc.action === 'replace') return `Preparei para você: trocar ${pc.replaces ? `${pc.replaces} por ` : ''}${item} na sua rotina ${quando}.`
  return `Preparei para você: incluir ${item} na sua rotina ${quando}.`
}

export type ResultadoProposta =
  | { ok: true; id: string; action: ProposedChanges['action']; period: 'am' | 'pm' }
  | { ok: false; reason: string; period: 'am' | 'pm' }

export async function registrarProposta(
  supabase: any, userId: string, conversationId: string, raw: unknown,
  opts: { periodoInteiro: boolean; pregnancyStatus: string | null },
): Promise<ResultadoProposta> {
  const periodoRaw = (raw as any)?.period === 'am' ? 'am' : 'pm'
  const validation = validateProposal(raw)
  if (!validation.ok) {
    logRefusal('create', validation.reason, { userId, conversationId, payload: raw })
    return { ok: false, reason: validation.reason, period: periodoRaw }
  }
  const changes = validation.value
  if (changes.action === 'replace_period' && !opts.periodoInteiro) {
    logRefusal('create', 'period-only-new-app', { userId, conversationId })
    return { ok: false, reason: 'period-only-new-app', period: changes.period }
  }

  // Trava de gravidez (o mesmo critério da rotina ideal e da Minha rotina).
  if (SEM_RETINOIDE.includes(opts.pregnancyStatus ?? '') && changes.action !== 'remove') {
    const passos = changes.action === 'replace_period' ? (changes.steps ?? []) : [changes]
    if (passos.some((p) => detectTargetActive(p.step_name, p.ingredient).label === 'retinoide')) {
      logRefusal('create', 'pregnancy-retinoid', { userId, conversationId, payload: changes })
      return { ok: false, reason: 'pregnancy-retinoid', period: changes.period }
    }
  }

  // Ensaio: a mudança daria certo na rotina de agora? (Minha rotina, ou a ideal.)
  let atual: { rotina_am: any[]; rotina_pm: any[] }
  if (await temMinhaRotina(supabase, userId)) {
    atual = await lerMinhaRotina(supabase, userId)
  } else {
    const { data: p } = await supabase.from('protocolos').select('rotina_am, rotina_pm')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    atual = { rotina_am: p?.rotina_am ?? [], rotina_pm: p?.rotina_pm ?? [] }
  }
  const ensaio = applyProposal(atual as any, changes)
  if (!ensaio.ok) {
    logRefusal('create', ensaio.reason, { userId, conversationId, payload: changes })
    return { ok: false, reason: ensaio.reason, period: changes.period }
  }

  // A nova substitui qualquer pendente dela (de qualquer conversa).
  const { data: subst, error: eSub } = await supabase.from('coach_protocol_suggestions')
    .update({ status: 'superseded' }).eq('user_id', userId).eq('status', 'pending').select('id')
  if (eSub) console.error('PROTOCOL_SUPERSEDE_FAILED', JSON.stringify({ userId, error: eSub.message }))
  else console.log('PROTOCOL_SUPERSEDED', JSON.stringify({ userId, ids: (subst ?? []).map((x: any) => x.id) }))

  const { data, error } = await supabase.from('coach_protocol_suggestions').insert({
    user_id: userId,
    conversation_id: conversationId,
    reason: typeof (raw as any)?.reason === 'string' ? (raw as any).reason : '',
    proposed_changes: changes,
    status: 'pending',
  }).select('id').single()
  if (error || !data) {
    console.error('PROTOCOL_SUGGESTION_INSERT_FAILED', JSON.stringify({ userId, conversationId, error: error?.message }))
    return { ok: false, reason: 'insert-failed', period: changes.period }
  }
  return { ok: true, id: data.id, action: changes.action, period: changes.period }
}
