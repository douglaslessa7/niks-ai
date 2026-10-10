// Camada ÚNICA de escrita de protocolo do Coach. Importada por
// niks-chat/protocol-actions.ts e approve-coach-protocol-change/index.ts.
// Filosofia: o que não estiver dentro do contrato NÃO é gravado. Funções puras
// (sem DB); os callers fazem I/O e logam com userId/suggestionId.

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type IconName = 'sun' | 'moon' | 'drop' | 'cleanser' | 'sparkle' | 'flask' | 'shield'

export type ProtocolStep = {
  id?: number
  name: string
  ingredient: string
  instruction?: string
  steps?: string[]
  color?: string
  waitTime?: string | null
  origem?: string
  [key: string]: unknown
}

// Um passo de uma proposta (passo único ou cada passo de 'replace_period').
export type PassoProposto = {
  step_name: string
  ingredient: string
  instruction: string | null
  schedule_days: string[] | null
}

export type ProposedChanges = {
  // replace_period (out/2026): troca a rotina INTEIRA de um período pela lista `steps`,
  // na ordem — cada passo separado (antes a IA espremia vários produtos num passo só).
  action: 'add' | 'remove' | 'replace' | 'replace_period'
  period: 'am' | 'pm'
  step_name: string
  ingredient: string
  instruction: string | null
  schedule_days: string[] | null
  replaces: string | null
  // Código do passo que sai (remove/replace) — `_rowId` da Minha rotina. Quando vem,
  // manda sobre a busca por ativo/categoria (que errava o período).
  target_id?: string | null
  steps?: PassoProposto[]
}

// ── norm / classifyStep / detectTargetActive — FONTE ÚNICA (das duas functions do Coach) ──
// Portados de app/(app)/protocolo.tsx e recomendar-produtos/index.ts. NOTA: o
// recomendar-produtos mantém a própria cópia por ora (decisão de escopo) — a
// centralização geral fica para uma tarefa dedicada.
const norm = (s: string) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

export function classifyStep(name: string, ingredient: string): { category: string; icon: IconName } {
  const t = `${name} ${ingredient}`.toLowerCase()
  const has = (...ks: string[]) => ks.some((k) => t.includes(k))
  if (has('protetor solar', 'protetor', 'fps', 'filtro solar', 'spf')) return { category: 'Proteção', icon: 'sun' }
  if (has('limpeza', 'cleanser', 'sabonete', 'espuma de limp', 'demaquilante', 'água micelar', 'agua micelar')) {
    const oleoso = has('óleo', 'oleo', 'balm', 'bálsamo', 'balsamo', 'oil')
    return { category: 'Limpeza', icon: oleoso ? 'drop' : 'cleanser' }
  }
  if (has('tônico', 'tonico', 'essência', 'essencia', 'tônica', 'tonica')) return { category: 'Tônico', icon: 'drop' }
  if (has('barreira')) return { category: 'Barreira', icon: 'shield' }
  if (has('hidratante', 'ceramida', 'emoliente', 'gel-creme', 'gel creme', 'creme hidratante', 'hidrata')) {
    return { category: 'Hidratação', icon: 'flask' }
  }
  if (has('oclusivo', 'esqualano', 'óleo facial', 'oleo facial', 'vaselina')) return { category: 'Finalização', icon: 'drop' }
  if (has('sérum', 'serum', 'ácido', 'acido', 'retinol', 'retinoide', 'retinal', 'tretinoína', 'tretinoina',
          'vitamina c', 'niacinamida', 'azelaico', 'peptíde', 'peptide', 'antioxidante', 'aha', 'bha', 'tratamento')) {
    if (has('reparador', 'ceramida')) return { category: 'Tratamento', icon: 'flask' }
    return { category: 'Tratamento', icon: 'sparkle' }
  }
  return { category: 'Cuidado', icon: 'sparkle' }
}

export type ActiveTarget = { kind: 'eye' | 'unknown' | 'known'; label?: string; codes?: string[]; molecule?: string }
export function detectTargetActive(name: string, ingredient: string): ActiveTarget {
  const t = norm(`${name} ${ingredient}`)
  const has = (...ks: string[]) => ks.some((k) => t.includes(k))
  // Aditivo (não muda kind/label/codes): devolve a keyword específica que casou, para
  // checagem molécula-a-molécula no generate-protocol. O Coach lê só kind/label/codes e ignora este campo.
  const hit = (...ks: string[]) => { const k = ks.find((x) => t.includes(x)); return k ? k.trim() : undefined }
  if (has('olheira', 'periocular', 'area dos olhos', 'contorno dos olhos', 'para os olhos', 'para olhos')) return { kind: 'eye' }
  if (has('bakuchiol')) return { kind: 'unknown', label: 'bakuchiol' }
  if (has('retinol', 'retinal', 'retinaldeido', 'tretinoina', 'retinoide', 'adapaleno', ' hpr', 'hidroxipinacolona')) return { kind: 'known', label: 'retinoide', codes: ['retinol'], molecule: hit('retinol', 'retinal', 'retinaldeido', 'tretinoina', 'retinoide', 'adapaleno', ' hpr', 'hidroxipinacolona') }
  if (has('azelaico', 'azelaic')) return { kind: 'known', label: 'azelaico', codes: ['acido_azelaico'], molecule: hit('azelaico', 'azelaic') }
  if (has('salicilico', ' bha', 'betaidroxi', ' lha')) return { kind: 'known', label: 'bha', codes: ['acido_salicilico'], molecule: hit('salicilico', ' bha', 'betaidroxi', ' lha') }
  if (has('mandelico', 'glicolico', 'lactico', 'latico', ' aha', ' pha', 'esfoliante quimico', 'esfoliacao quimica')) return { kind: 'known', label: 'aha', codes: ['acido_mandelico', 'acido_glicolico', 'aha', 'pha'], molecule: hit('mandelico', 'glicolico', 'lactico', 'latico', ' aha', ' pha', 'esfoliante quimico', 'esfoliacao quimica') }
  if (has('tranexamico')) return { kind: 'known', label: 'tranexamico', codes: ['acido_tranexamico'], molecule: hit('tranexamico') }
  if (has('niacinamid')) return { kind: 'known', label: 'niacinamida', codes: ['niacinamida'], molecule: hit('niacinamid') }
  if (has('peptide', 'peptideo')) return { kind: 'known', label: 'peptideos', codes: ['peptideos'], molecule: hit('peptide', 'peptideo') }
  if (has('centella', 'cica ', 'pantenol', 'calmante', 'madecassoside')) return { kind: 'known', label: 'centella', codes: ['centella'], molecule: hit('centella', 'cica ', 'pantenol', 'calmante', 'madecassoside') }
  if (has('pdrn')) return { kind: 'known', label: 'pdrn', codes: ['pdrn'], molecule: hit('pdrn') }
  if (has('mucina', 'snail', 'caracol')) return { kind: 'known', label: 'mucina', codes: ['mucina_de_caracol'], molecule: hit('mucina', 'snail', 'caracol') }
  if (has('hialuronico', 'hialuronato')) return { kind: 'known', label: 'hialuronico', codes: ['acido_hialuronico'], molecule: hit('hialuronico', 'hialuronato') }
  if (has('vitamina c', 'vit c', 'ascorb', 'antioxidante')) return { kind: 'known', label: 'vitamina_c', codes: ['vitamina_c'], molecule: hit('vitamina c', 'vit c', 'ascorb', 'antioxidante') }
  return { kind: 'unknown' }
}

// ── Política ──────────────────────────────────────────────────────────────────
export const PROTECTED_CATEGORIES = ['Limpeza', 'Hidratação', 'Proteção']
export const AM_FORBIDDEN_ACTIVES = ['retinoide', 'aha'] // BHA é seguro AM (alinha com generate-protocol)
// Ativos fortes que NÃO podem tomar o lugar de um passo protegido num replace (Cond. 2).
// Inclui BHA de propósito — aqui o risco é "retinoide/ácido vira o hidratante", não a
// cronobiologia AM. É lista distinta da AM_FORBIDDEN_ACTIVES.
const STRONG_ACTIVES = ['retinoide', 'aha', 'bha']
const VALID_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
// Normalizado (sem acento, minúsculo) → forma canônica. Deixa "Sáb"/"sab"/"SAB" virar "Sab".
const CANON_DAY_BY_NORM: Record<string, string> = Object.fromEntries(VALID_DAYS.map((d) => [norm(d), d]))

const CATEGORY_RANK: Record<string, number> = {
  'Limpeza': 10, 'Tônico': 20, 'Tratamento': 30, 'Barreira': 40,
  'Cuidado': 45, 'Hidratação': 50, 'Finalização': 60, 'Proteção': 70,
}
const ACTIVE_SUBRANK: Record<string, number> = {
  vitamina_c: 0, niacinamida: 2, azelaico: 3, centella: 3, tranexamico: 3,
  peptideos: 4, hialuronico: 4, mucina: 4, bha: 5, aha: 6, retinoide: 8,
}
const COLOR_BY_ACTIVE: Record<string, string> = {
  retinoide: '#F3E8FF', aha: '#E8EFF9', bha: '#E8EFF9', azelaico: '#FDE8E8',
  niacinamida: '#E8F5E9', vitamina_c: '#FFF9E6', peptideos: '#EDE8FD',
  centella: '#E8F5F0', hialuronico: '#E8F5E9',
}
const COLOR_BY_CATEGORY: Record<string, string> = {
  'Limpeza': '#E8F4FD', 'Tônico': '#E8F8F0', 'Hidratação': '#FCE8E8',
  'Proteção': '#FFF3CD', 'Finalização': '#F5F0E8', 'Barreira': '#E8F5F0',
  'Tratamento': '#E8F5E9', 'Cuidado': '#E8F5E9',
}

// ── Log estruturado (mensurável) ──────────────────────────────────────────────
export function logRefusal(scope: string, reason: string, ctx: Record<string, unknown>): void {
  console.warn('PROTOCOL_REFUSED', JSON.stringify({ scope, reason, ...ctx }))
}

// Vários produtos espremidos num passo só ("Água micelar…, Creme…, Protetor…"): partes
// separadas por vírgula/+/; que caem em 2+ categorias diferentes. Um passo = um produto.
export function pareceVariosProdutos(texto: string): boolean {
  const partes = String(texto ?? '').split(/,|\+|;/).map((x) => x.trim()).filter(Boolean)
  if (partes.length < 2) return false
  const cats = new Set(partes.map((x) => classifyStep(x, '').category).filter((c) => c !== 'Cuidado'))
  return cats.size >= 2
}

function validarDias(v: unknown): { ok: true; value: string[] | null } | { ok: false } {
  if (v == null) return { ok: true, value: null }
  if (!Array.isArray(v)) return { ok: false }
  const canon: string[] = []
  for (const d of v) {
    const c = CANON_DAY_BY_NORM[norm(String(d))]
    if (!c) return { ok: false } // dia inexistente: recusa mantida
    canon.push(c)
  }
  return { ok: true, value: canon.length ? canon : null }
}

function validarPasso(r: Record<string, unknown>): { ok: true; value: PassoProposto } | { ok: false; reason: string } {
  const step_name = typeof r.step_name === 'string' ? r.step_name.trim() : ''
  if (!step_name) return { ok: false, reason: 'missing-step_name' }
  const ingredient = typeof r.ingredient === 'string' ? r.ingredient.trim() : ''
  if (!ingredient) return { ok: false, reason: 'missing-ingredient' }
  if (pareceVariosProdutos(ingredient) || pareceVariosProdutos(step_name)) return { ok: false, reason: 'multiple-products-in-one-step' }
  const dias = validarDias(r.schedule_days)
  if (!dias.ok) return { ok: false, reason: 'invalid-schedule_days' }
  const instruction = typeof r.instruction === 'string' && r.instruction.trim() ? r.instruction.trim() : null
  return { ok: true, value: { step_name, ingredient, instruction, schedule_days: dias.value } }
}

// ── Rule 1 — validação de schema em runtime ───────────────────────────────────
export function validateProposal(raw: unknown):
  | { ok: true; value: ProposedChanges }
  | { ok: false; reason: string } {
  if (raw === null || typeof raw !== 'object') return { ok: false, reason: 'not-an-object' }
  const r = raw as Record<string, unknown>

  const action = r.action
  if (action !== 'add' && action !== 'remove' && action !== 'replace' && action !== 'replace_period') {
    return { ok: false, reason: `invalid-action:${String(action)}` }
  }
  const period = r.period
  if (period !== 'am' && period !== 'pm') {
    return { ok: false, reason: `invalid-period:${String(period)}` }
  }
  const target_id = typeof r.target_id === 'string' && r.target_id.trim() ? r.target_id.trim() : null

  // Rotina inteira do período: lista de 1 a 10 passos, cada um validado.
  if (action === 'replace_period') {
    if (!Array.isArray(r.steps) || r.steps.length < 1 || r.steps.length > 10) return { ok: false, reason: 'invalid-steps' }
    const steps: PassoProposto[] = []
    for (const x of r.steps) {
      if (!x || typeof x !== 'object') return { ok: false, reason: 'invalid-steps' }
      const v = validarPasso(x as Record<string, unknown>)
      if (!v.ok) return { ok: false, reason: `step-${v.reason}` }
      steps.push(v.value)
    }
    return { ok: true, value: {
      action, period, steps, target_id: null,
      step_name: '', ingredient: '', instruction: null, schedule_days: null, replaces: null,
    } }
  }

  const step_name = typeof r.step_name === 'string' ? r.step_name.trim() : ''
  if (!step_name) return { ok: false, reason: 'missing-step_name' }
  // Remoção: o passo que sai já está identificado (nome e/ou código) — o ingrediente é opcional.
  const ingredient = (typeof r.ingredient === 'string' ? r.ingredient.trim() : '') || (action === 'remove' ? step_name : '')
  if (!ingredient) return { ok: false, reason: 'missing-ingredient' }
  if (action !== 'remove' && (pareceVariosProdutos(ingredient) || pareceVariosProdutos(step_name))) {
    return { ok: false, reason: 'multiple-products-in-one-step' }
  }

  let schedule_days: string[] | null = null
  if (r.schedule_days != null) {
    if (!Array.isArray(r.schedule_days)) return { ok: false, reason: 'invalid-schedule_days' }
    const canon: string[] = []
    for (const d of r.schedule_days) {
      const c = CANON_DAY_BY_NORM[norm(String(d))]
      if (!c) return { ok: false, reason: 'invalid-schedule_days' } // dia inexistente: recusa mantida
      canon.push(c)
    }
    schedule_days = canon.length ? canon : null
  }
  const instruction = typeof r.instruction === 'string' && r.instruction.trim() ? r.instruction.trim() : null
  const replaces = typeof r.replaces === 'string' && r.replaces.trim() ? r.replaces.trim() : null

  return { ok: true, value: { action, period, step_name, ingredient, instruction, schedule_days, replaces, target_id } }
}

/** Tira os campos internos (`_rowId`, `_raw`…) antes de gravar em `protocolos`. */
export function semCamposInternos(steps: ProtocolStep[]): ProtocolStep[] {
  return steps.map((st) => Object.fromEntries(Object.entries(st).filter(([k]) => !k.startsWith('_'))) as ProtocolStep)
}

// ── Helpers de item ───────────────────────────────────────────────────────────
function nextId(steps: ProtocolStep[]): number {
  return steps.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0) + 1
}

export function buildIngredientWithDays(ingredient: string, days?: string[] | null): string {
  const base = ingredient.trim()
  if (!days || days.length === 0) return base
  if (/\([^)]*\)\s*$/.test(base)) return base // já tem sufixo entre parênteses
  return `${base} (${days.join('/')})`
}

function makeCoachStep(changes: PassoProposto, id: number): ProtocolStep {
  const ingredient = buildIngredientWithDays(changes.ingredient, changes.schedule_days)
  const { category } = classifyStep(changes.step_name, ingredient)
  const active = detectTargetActive(changes.step_name, ingredient)
  const color =
    (active.kind === 'known' && active.label && COLOR_BY_ACTIVE[active.label]) ||
    COLOR_BY_CATEGORY[category] || '#E8F5E9'
  return {
    id,
    name: changes.step_name,
    ingredient,
    instruction: changes.instruction || 'Aplique conforme orientação da NIKS.',
    steps: [],
    color,
    waitTime: null,
    origem: 'coach',
    // Para quem grava na Minha rotina: ingrediente e dias SEM o sufixo "(Seg/Qua)".
    _raw: { ingredient: changes.ingredient, schedule_days: changes.schedule_days },
  }
}

function rankOf(step: ProtocolStep): number {
  const name = String(step.name ?? '')
  const ing = String(step.ingredient ?? '')
  const { category } = classifyStep(name, ing)
  let rank = CATEGORY_RANK[category] ?? 45
  if (category === 'Tratamento') {
    const a = detectTargetActive(name, ing)
    const sub = a.kind === 'known' && a.label && ACTIVE_SUBRANK[a.label] != null ? ACTIVE_SUBRANK[a.label] : 5
    rank += sub / 100
  }
  return rank
}

// Rule 5 — insere na posição clínica (após o último passo de rank <=), nunca no fim cru.
function insertClinically(steps: ProtocolStep[], step: ProtocolStep): ProtocolStep[] {
  const r = rankOf(step)
  let idx = 0
  for (let i = 0; i < steps.length; i++) if (rankOf(steps[i]) <= r) idx = i + 1
  return [...steps.slice(0, idx), step, ...steps.slice(idx)]
}

function assemble(
  periodKey: 'am' | 'pm', nextPeriod: ProtocolStep[],
  am: ProtocolStep[], pm: ProtocolStep[],
) {
  return periodKey === 'am'
    ? { rotina_am: nextPeriod, rotina_pm: pm }
    : { rotina_am: am, rotina_pm: nextPeriod }
}

// ── Rules 2,3,4,5,6,7 + proteção — o coração da camada ────────────────────────
export function applyProposal(
  current: { rotina_am: ProtocolStep[]; rotina_pm: ProtocolStep[] },
  changes: ProposedChanges,
): { ok: true; next: { rotina_am: ProtocolStep[]; rotina_pm: ProtocolStep[] } } | { ok: false; reason: string } {
  const am = Array.isArray(current.rotina_am) ? [...current.rotina_am] : []
  const pm = Array.isArray(current.rotina_pm) ? [...current.rotina_pm] : []
  const period = changes.period === 'am' ? am : pm
  const newActive = detectTargetActive(changes.step_name, changes.ingredient)

  // Rule 2 — trava clínica AM (add/replace): retinoide/AHA nunca de manhã.
  if ((changes.action === 'add' || changes.action === 'replace') &&
      changes.period === 'am' &&
      newActive.kind === 'known' && newActive.label && AM_FORBIDDEN_ACTIVES.includes(newActive.label)) {
    return { ok: false, reason: `clinical-am-forbidden:${newActive.label}` }
  }

  // ── REPLACE_PERIOD ── a rotina inteira do período vira a lista, cada passo separado.
  if (changes.action === 'replace_period') {
    const lista = changes.steps ?? []
    const novos = lista.map((p, i) => makeCoachStep(p, i + 1))
    // Mesmas travas, sobre a lista inteira.
    const vistos = new Set<string>()
    for (const st of novos) {
      const a = detectTargetActive(String(st.name), String(st.ingredient))
      if (changes.period === 'am' && a.kind === 'known' && a.label && AM_FORBIDDEN_ACTIVES.includes(a.label)) {
        return { ok: false, reason: `clinical-am-forbidden:${a.label}` }
      }
      if (a.kind === 'known' && a.label) {
        if (vistos.has(a.label)) return { ok: false, reason: `period-duplicate:${a.label}` }
        vistos.add(a.label)
      }
    }
    // Limpeza / hidratação / protetor que o período tinha não podem sumir.
    const catsNovas = new Set(novos.map((st) => classifyStep(String(st.name), String(st.ingredient)).category))
    for (const st of period) {
      const c = classifyStep(String(st.name ?? ''), String(st.ingredient ?? '')).category
      if (PROTECTED_CATEGORIES.includes(c) && !catsNovas.has(c)) return { ok: false, reason: `period-missing-protected:${c}` }
    }
    // De manhã, o protetor é sempre o último.
    const ordenados = changes.period === 'am'
      ? [...novos.filter((st) => classifyStep(String(st.name), String(st.ingredient)).category !== 'Proteção'),
         ...novos.filter((st) => classifyStep(String(st.name), String(st.ingredient)).category === 'Proteção')]
      : novos
    return { ok: true, next: assemble(changes.period, ordenados, am, pm) }
  }

  // ── Alvo por CÓDIGO (remove/replace) ── manda sobre a busca por ativo/categoria.
  if ((changes.action === 'remove' || changes.action === 'replace') && changes.target_id) {
    const outro = changes.period === 'am' ? pm : am
    const target = period.find((st) => st._rowId === changes.target_id)
    if (!target) {
      if (outro.some((st) => st._rowId === changes.target_id)) return { ok: false, reason: 'target-other-period' }
    } else {
      const cat = classifyStep(String(target.name ?? ''), String(target.ingredient ?? '')).category
      if (PROTECTED_CATEGORIES.includes(cat)) {
        if (changes.action === 'remove') return { ok: false, reason: `protected-step:${cat}` }
        const newCat = classifyStep(changes.step_name, changes.ingredient).category
        if (newCat !== cat) return { ok: false, reason: `protected-replace-category-mismatch:${cat}->${newCat}` }
        if (newActive.kind === 'known' && newActive.label && STRONG_ACTIVES.includes(newActive.label)) {
          return { ok: false, reason: `protected-replace-strong-active:${newActive.label}` }
        }
      }
      const sem = period.filter((st) => st !== target)
      if (changes.action === 'remove') return { ok: true, next: assemble(changes.period, sem, am, pm) }
      if (newActive.kind === 'known' && newActive.label && sem.some((st) => {
        const a = detectTargetActive(String(st.name ?? ''), String(st.ingredient ?? ''))
        return a.kind === 'known' && a.label === newActive.label
      })) return { ok: false, reason: `replace-would-duplicate:${newActive.label}` }
      const step = makeCoachStep(changes, nextId(period))
      return { ok: true, next: assemble(changes.period, insertClinically(sem, step), am, pm) }
    }
  }

  // ── ADD ──
  if (changes.action === 'add') {
    // Rule 6 — dedup: mesmo ativo conhecido já no período → recusa (a op certa é replace).
    if (newActive.kind === 'known' && newActive.label) {
      const dup = period.some((s) => {
        const a = detectTargetActive(String(s.name ?? ''), String(s.ingredient ?? ''))
        return a.kind === 'known' && a.label === newActive.label
      })
      if (dup) return { ok: false, reason: `add-duplicate:${newActive.label}` }
    }
    const step = makeCoachStep(changes, nextId(period))               // Rule 4 (item completo) + Rule 3 (id)
    return { ok: true, next: assemble(changes.period, insertClinically(period, step), am, pm) } // Rule 5 + 7
  }

  // ── REMOVE / REPLACE ── (por id, resolvido semanticamente — nunca substring; Rule 3)
  const refName = changes.action === 'replace' && changes.replaces ? changes.replaces : changes.step_name
  const refIng = changes.action === 'replace' && changes.replaces ? changes.replaces : changes.ingredient
  const refCat = classifyStep(refName, refIng).category

  // Proteção de limpeza/hidratante/protetor. `remove` NUNCA toca nesses três.
  // `replace` é permitido num passo protegido SÓ como troca de MESMA categoria e SEM
  // ativo forte — senão a rotina ficaria sem hidratante/limpeza/protetor, ou um
  // retinoide diário tomaria o lugar do hidratante (classifyStep vê "hidratante"
  // antes de "tratamento", então "Sérum de Retinol com Ceramidas" cai em Hidratação —
  // por isso a Cond. 2 é obrigatória: não confiar só na categoria).
  if (PROTECTED_CATEGORIES.includes(refCat)) {
    if (changes.action === 'remove') return { ok: false, reason: `protected-step:${refCat}` }

    // Cond. 1 — o que entra tem de ser da mesma categoria do que sai.
    const newCat = classifyStep(changes.step_name, changes.ingredient).category
    if (newCat !== refCat) {
      return { ok: false, reason: `protected-replace-category-mismatch:${refCat}->${newCat}` }
    }
    // Cond. 2 — o que entra não pode ser ativo forte (retinoide/AHA/BHA).
    if (newActive.kind === 'known' && newActive.label && STRONG_ACTIVES.includes(newActive.label)) {
      return { ok: false, reason: `protected-replace-strong-active:${newActive.label}` }
    }
    // Passo protegido não tem ativo reconhecível → resolve o alvo pela CATEGORIA.
    const catMatches = period.filter(
      (s) => classifyStep(String(s.name ?? ''), String(s.ingredient ?? '')).category === refCat,
    )
    if (catMatches.length === 0) return { ok: false, reason: `target-not-found:${refCat}` }
    if (catMatches.length > 1) return { ok: false, reason: `target-ambiguous:${refCat}` }
    const target = catMatches[0]
    const step = makeCoachStep(changes, nextId(period))
    return { ok: true, next: assemble(changes.period, insertClinically(period.filter((s) => s !== target), step), am, pm) }
  }

  const targetActive = detectTargetActive(refName, refIng)
  if (targetActive.kind !== 'known' || !targetActive.label) return { ok: false, reason: 'target-active-unrecognized' }

  const matches = period.filter((s) => {
    if (classifyStep(String(s.name ?? ''), String(s.ingredient ?? '')).category !== 'Tratamento') return false
    const a = detectTargetActive(String(s.name ?? ''), String(s.ingredient ?? ''))
    return a.kind === 'known' && a.label === targetActive.label
  })
  if (matches.length === 0) return { ok: false, reason: `target-not-found:${targetActive.label}` }
  if (matches.length > 1) return { ok: false, reason: `target-ambiguous:${targetActive.label}` }
  const target = matches[0]

  if (changes.action === 'remove') {
    const nextPeriod = period.filter((s) => s !== target)
    return { ok: true, next: assemble(changes.period, nextPeriod, am, pm) }
  }

  // REPLACE — Rule 6 de verdade: tira o alvo, coloca o novo na posição clínica.
  const withoutTarget = period.filter((s) => s !== target)
  if (newActive.kind === 'known' && newActive.label) {
    const collide = withoutTarget.some((s) => {
      const a = detectTargetActive(String(s.name ?? ''), String(s.ingredient ?? ''))
      return a.kind === 'known' && a.label === newActive.label
    })
    if (collide) return { ok: false, reason: `replace-would-duplicate:${newActive.label}` }
  }
  const step = makeCoachStep(changes, nextId(period))
  return { ok: true, next: assemble(changes.period, insertClinically(withoutTarget, step), am, pm) }
}
