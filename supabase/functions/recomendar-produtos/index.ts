// recomendar-produtos
// Gera UMA vez (no primeiro scan) uma recomendação de produtos reais organizada por
// passo da rotina, e nunca regenera. Auto-guardada: se já existe linha para o user,
// retorna a existente. Fluxo: busca perfil + scan + protocolo no banco → classifica
// cada passo em uma categoria de produto (mesma lógica da tela Rotina) → filtro SQL
// de elegibilidade (generoso) com corte duro de alérgenos → camada de IA escolhe 1–3
// por passo, marca o principal e escreve a copy pt-BR → salva o JSON e retorna.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ─────────────────────────────────────────────────────────────────────────────
// Classificação de passo → categoria de produto
// `classifyStep` é portado VERBATIM de app/(app)/protocolo.tsx (não reinventar):
// a categoria exibida na recomendação tem que bater com a que a tela Rotina mostra.
// ─────────────────────────────────────────────────────────────────────────────
type IconName = 'sun' | 'moon' | 'drop' | 'cleanser' | 'sparkle' | 'flask' | 'shield'

function classifyStep(name: string, ingredient: string): { category: string; icon: IconName } {
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

// Label do classifyStep (+ ícone p/ desambiguar Limpeza) → categoria da tabela produtos.
// 'Cuidado' (fallback = passo não reconhecido) retorna null → o passo é OMITIDO (na dúvida, omite).
function categoriaProduto(label: string, icon: IconName): string | null {
  switch (label) {
    case 'Proteção':    return 'protetor_solar'
    case 'Limpeza':     return icon === 'drop' ? 'limpeza_oleosa' : 'limpeza'
    case 'Tônico':      return 'tonico'
    case 'Hidratação':  return 'hidratante'
    case 'Finalização': return 'oclusivo'
    case 'Tratamento':  return 'serum'
    case 'Barreira':    return 'serum' // reparo de barreira = sérum de ativos
    case 'Cuidado':     return null    // não reconhecido → omitir o passo
    default:            return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapas PT → código (perfil da usuária → vocabulário da tabela produtos)
// ─────────────────────────────────────────────────────────────────────────────
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Mapa 1 — concerns do onboarding (rótulos PT) → código produtos.concerns.
// 'Olheiras' e 'Outro' não têm código → ignorados graciosamente.
const CONCERN_LABEL_TO_CODE: Record<string, string> = {
  'acne/espinhas': 'acne',
  'manchas': 'manchas',
  'cravos': 'cravos',
  'oleosidade': 'oleosidade',
  'rugas': 'rugas',
  'poros dilatados': 'poros',
  'ressecamento': 'ressecamento',
  'textura irregular': 'textura',
}

// Mapa 2 — tipo de pele (label capitalizado) → código produtos.tipos_pele.
const SKIN_TYPE_TO_CODE: Record<string, string> = {
  'oleosa': 'oleosa', 'seca': 'seca', 'mista': 'mista', 'normal': 'normal',
}

// Mapa 4 — keyword em allergy_description → código alergeno. NA DÚVIDA, CORTA
// (segurança > completude): se qualquer keyword casar, o produto com esse alérgeno é removido.
// 'acido' genérico foi propositalmente removido de aha_bha p/ não cortar ácido hialurônico.
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  fragrancia:       ['fragr', 'perfum', 'aroma'],
  aha_bha:          ['aha', 'bha', 'salicilico', 'glicolico', 'mandelico', 'lactico', 'latico', 'ferulico', 'esfoliante', 'peeling'],
  oleos_essenciais: ['oleo essencial', 'oleos essenciais', 'essential oil'],
  vitamina_c:       ['vitamina c', 'vit c', 'ascorbico'],
  centella:         ['centella', 'cica', 'gotu kola'],
  alcool:           ['alcool', 'alcohol'],
  niacinamida_alta: ['niacinamida', 'niacin', 'vitamina b3'],
  propolis:         ['propolis', 'propole'],
  retinoides:       ['retino', 'tretinoina', 'retinal', 'adapaleno', 'vitamina a'],
}

function allergenCutCodes(allergyDescription: string | null | undefined): string[] {
  if (!allergyDescription) return []
  const t = norm(allergyDescription)
  const cut = new Set<string>()
  for (const [code, kws] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) cut.add(code)
  }
  return [...cut]
}

// Enriquecimento pelo scan (skin_scans.full_result) → códigos produtos.concerns
// (cobre vermelhidao_rosacea / barreira_comprometida / cicatrizes que o onboarding não captura).
function scanConcernCodes(scan: any): string[] {
  if (!scan || typeof scan !== 'object') return []
  const c = new Set<string>()
  if (scan.rosacea?.present === true) c.add('vermelhidao_rosacea')
  if (scan.barrier_status && scan.barrier_status !== 'integra') c.add('barreira_comprometida')
  if (scan.cicatrizes?.present === true) c.add('cicatrizes')
  if (scan.pigmentacao?.present === true) c.add('manchas')
  if (scan.acne?.present === true) c.add('acne')
  if (scan.envelhecimento?.present === true) c.add('rugas')
  if (scan.skin_hydration === 'desidratada') c.add('ressecamento')
  const brilho = norm(scan.brilho_sebaceo?.intensity ?? '')
  if (brilho.includes('alta') || brilho.includes('moderada') || brilho.includes('intens')) c.add('oleosidade')
  const poros = norm(scan.textura_poros?.pore_visibility ?? '')
  if (poros.includes('dilatad') || poros.includes('visiv') || poros.includes('alto') || poros.includes('alta')) c.add('poros')
  const textura = norm(scan.textura_poros?.texture ?? '')
  if (textura.includes('irregular') || textura.includes('aspera') || textura.includes('rugos')) c.add('textura')
  return [...c]
}

function resolveSkinTypeCode(tipoPele: string | null | undefined, scan: any): string | null {
  const direct = SKIN_TYPE_TO_CODE[norm(tipoPele ?? '')]
  if (direct) return direct
  // 'Não sei' (ou vazio) → cai no que o scan detectou.
  const seb = norm(scan?.skin_type_sebaceous ?? '')
  if (SKIN_TYPE_TO_CODE[seb]) return SKIN_TYPE_TO_CODE[seb]
  const det = norm(scan?.skin_type_detected ?? '')
  for (const code of Object.keys(SKIN_TYPE_TO_CODE)) {
    if (det.includes(code)) return code
  }
  return null // indefinido → sem gate de tipo de pele (generoso)
}

// Ativo-alvo de um passo de TRATAMENTO (só aplicado quando classifyStep = 'Tratamento').
// Detector ORDENADO sobre name+ingredient. Retorna:
//   kind 'eye'     → passo de olhos/olheiras (sem produto de olhos no catálogo) → OMITIR em silêncio
//   kind 'unknown' → tratamento com ativo que não temos (BPO, bakuchiol, thiamidol, clindamicina) → sem_produto
//   kind 'known'   → ativo reconhecido; `codes` = ativos_principais que satisfazem o gate.
//                    AHA é CLASSE (mandélico/glicólico/láctico/aha/pha se substituem). BHA e azelaico são EXATOS.
type Target = { kind: 'eye' | 'unknown' | 'known'; label?: string; codes?: string[] }
function detectTargetActive(name: string, ingredient: string): Target {
  const t = norm(`${name} ${ingredient}`)
  const has = (...ks: string[]) => ks.some((k) => t.includes(k))
  // Olhos / olheiras → omitir silenciosamente (regra de olheiras).
  if (has('olheira', 'periocular', 'area dos olhos', 'contorno dos olhos', 'para os olhos', 'para olhos')) return { kind: 'eye' }
  // Bakuchiol: NUNCA vira retinoide (retinol é contraindicado em gestante) → sem produto.
  if (has('bakuchiol')) return { kind: 'unknown', label: 'bakuchiol' }
  // Retinoides → retinol (único do catálogo).
  if (has('retinol', 'retinal', 'retinaldeido', 'tretinoina', 'retinoide', 'adapaleno', ' hpr', 'hidroxipinacolona')) return { kind: 'known', label: 'retinoide', codes: ['retinol'] }
  // Azelaico — EXATO (não entra na classe AHA).
  if (has('azelaico', 'azelaic')) return { kind: 'known', label: 'azelaico', codes: ['acido_azelaico'] }
  // BHA / salicílico — EXATO (não vaza para AHA).
  if (has('salicilico', ' bha', 'betaidroxi', ' lha')) return { kind: 'known', label: 'bha', codes: ['acido_salicilico'] }
  // AHA — CLASSE: mandélico/glicólico/láctico/aha/pha satisfazem uns aos outros.
  if (has('mandelico', 'glicolico', 'lactico', 'latico', ' aha', ' pha', 'esfoliante quimico', 'esfoliacao quimica')) return { kind: 'known', label: 'aha', codes: ['acido_mandelico', 'acido_glicolico', 'aha', 'pha'] }
  // Tranexâmico — EXATO.
  if (has('tranexamico')) return { kind: 'known', label: 'tranexamico', codes: ['acido_tranexamico'] }
  // Niacinamida (pega 'niacinamide' EN também).
  if (has('niacinamid')) return { kind: 'known', label: 'niacinamida', codes: ['niacinamida'] }
  // Peptídeos.
  if (has('peptide', 'peptideo')) return { kind: 'known', label: 'peptideos', codes: ['peptideos'] }
  // Calmante / centella / pantenol.
  if (has('centella', 'cica ', 'pantenol', 'calmante', 'madecassoside')) return { kind: 'known', label: 'centella', codes: ['centella'] }
  // PDRN.
  if (has('pdrn')) return { kind: 'known', label: 'pdrn', codes: ['pdrn'] }
  // Mucina de caracol.
  if (has('mucina', 'snail', 'caracol')) return { kind: 'known', label: 'mucina', codes: ['mucina_de_caracol'] }
  // Ácido hialurônico (sérum de hidratação).
  if (has('hialuronico', 'hialuronato')) return { kind: 'known', label: 'hialuronico', codes: ['acido_hialuronico'] }
  // Vitamina C / antioxidante — POR ÚLTIMO ('antioxidante' é amplo; ativos específicos vêm antes).
  if (has('vitamina c', 'vit c', 'ascorb', 'antioxidante')) return { kind: 'known', label: 'vitamina_c', codes: ['vitamina_c'] }
  // Tratamento com ativo que não mapeamos (peróxido de benzoíla, thiamidol, clindamicina...).
  return { kind: 'unknown' }
}

const SEM_PRODUTO_MSG = 'Ainda não temos um produto no catálogo para este passo.'

// Copy mínima determinística a partir dos dados do produto — usada SEMPRE que a IA
// não devolver copy. NUNCA salvar string vazia (regra dura).
const ativoLegivel = (a: string) => (a ?? '').replace(/_/g, ' ').replace(/\bacido\b/g, 'ácido')
function synthCopy(p: any): string {
  if (!p) return 'Boa opção para a sua rotina.'
  const ativo = Array.isArray(p.ativos_principais) && p.ativos_principais[0] ? ativoLegivel(p.ativos_principais[0]) : ''
  const para = (p.ideal_para || '').trim()
  let s = ativo ? `${p.marca} com ${ativo}` : `${p.marca} ${p.nome}`
  if (para) s += ` — ${para}`
  s = s.trim()
  s = s.charAt(0).toUpperCase() + s.slice(1)
  return s.length > 160 ? s.slice(0, 159).trimEnd() + '…' : s
}

// PREFERÊNCIA de intenção do passo (nudge de ranqueamento, NUNCA corte). Genérico p/
// qualquer categoria — usado para desempatar passos-irmãos da mesma categoria staple
// (ex.: "Hidratante Leve" vs "Hidratante com Ceramidas"). Retorna códigos de
// ativos_principais preferidos + se o passo pede textura leve.
function stepIntent(name: string, ingredient: string): { codes: string[]; light: boolean } {
  const t = norm(`${name} ${ingredient}`)
  const codes = new Set<string>()
  const add = (cond: boolean, ...cs: string[]) => { if (cond) cs.forEach((c) => codes.add(c)) }
  add(t.includes('ceramida'), 'ceramidas')
  add(t.includes('hialuron'), 'acido_hialuronico')
  add(t.includes('niacinamid'), 'niacinamida')
  add(t.includes('salicilico') || t.includes(' bha'), 'acido_salicilico')
  add(t.includes('glicolico'), 'acido_glicolico', 'aha')
  add(t.includes('mandelico'), 'acido_mandelico', 'aha')
  add(t.includes(' aha') || t.includes(' pha'), 'aha', 'pha')
  add(t.includes('centella') || t.includes('cica ') || t.includes('pantenol') || t.includes('calmante') || t.includes('madecass'), 'centella', 'pantenol')
  add(t.includes('propolis'), 'propolis')
  add(t.includes('mucina') || t.includes('snail') || t.includes('caracol'), 'mucina_de_caracol')
  add(t.includes('tea tree') || t.includes('melaleuca'), 'tea_tree')
  add(t.includes('esqualano') || t.includes('squalane'), 'esqualano')
  add(t.includes('vaselina') || t.includes('petrolato'), 'petrolato')
  const light = t.includes('leve') || t.includes('gel') || t.includes('oil-free') || t.includes('oil free') ||
    t.includes('oilfree') || t.includes('matte') || t.includes('fluido') || t.includes('aquoso') || t.includes('livre de oleo')
  return { codes: [...codes], light }
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI (mesmo padrão do generate-protocol: gpt-4.1-mini, json_object, retry 3x)
// ─────────────────────────────────────────────────────────────────────────────
async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<any> {
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        max_completion_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      lastErr = new Error(`OpenAI ${res.status}: ${body}`)
      if ((res.status === 500 || res.status === 503) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      throw lastErr
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content ?? ''
    const start = content.indexOf('{')
    const end = content.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('OpenAI: resposta sem JSON')
    return JSON.parse(content.slice(start, end + 1))
  }
  throw lastErr ?? new Error('OpenAI: falha desconhecida')
}

// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user_id, scan_id } = await req.json().catch(() => ({}))
    if (!user_id) return json({ error: 'user_id é obrigatório' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Guarda "gerar uma vez" ────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('recomendacoes_produtos')
      .select('recomendacao, scan_id, created_at')
      .eq('user_id', user_id)
      .maybeSingle()
    if (existing) {
      return json({ recomendacao: existing.recomendacao, cached: true })
    }

    // ── Busca perfil + scan + protocolo (todos já persistidos no disparo) ─────
    const { data: user } = await supabase
      .from('users')
      .select('tipo_pele, concerns, allergy_type, allergy_description, pregnancy_status, skincare_routine_description, objetivo')
      .eq('id', user_id)
      .maybeSingle()
    if (!user) return json({ error: 'usuária não encontrada' }, 404)

    let scanQuery = supabase.from('skin_scans').select('id, full_result').eq('user_id', user_id)
    scanQuery = scan_id ? scanQuery.eq('id', scan_id) : scanQuery.order('created_at', { ascending: false }).limit(1)
    const { data: scanRows } = await scanQuery
    const scanRow = Array.isArray(scanRows) ? scanRows[0] : scanRows
    const scan = scanRow?.full_result ?? null
    const resolvedScanId = scanRow?.id ?? scan_id ?? null

    let protoQuery = supabase
      .from('protocolos')
      .select('rotina_am, rotina_pm, skin_scan_id, updated_at')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false })
      .limit(1)
    const { data: protoRows } = await protoQuery
    const proto = Array.isArray(protoRows) ? protoRows[0] : protoRows
    if (!proto) return json({ error: 'protocolo ainda não disponível' }, 409)

    // ── Perfil normalizado ───────────────────────────────────────────────────
    const skinTypeCode = resolveSkinTypeCode(user.tipo_pele, scan)
    const onboardingConcerns = (user.concerns ?? [])
      .map((l: string) => CONCERN_LABEL_TO_CODE[norm(l)])
      .filter(Boolean)
    const concernCodes = [...new Set<string>([...onboardingConcerns, ...scanConcernCodes(scan)])]
    const cutCodes = allergenCutCodes(user.allergy_description)
    const isSensitive = user.allergy_type === 'sensitive'
    const isPregnant = user.pregnancy_status === 'pregnant' || user.pregnancy_status === 'breastfeeding'

    // ── Passos únicos do protocolo (AM+PM), dedupe por nome ───────────────────
    type Step = { name: string; ingredient: string; categoria: string; label: string; periodos: Set<string> }
    const stepsByName = new Map<string, Step>()
    const collect = (arr: any[], periodo: 'am' | 'pm') => {
      for (const raw of arr ?? []) {
        const name = (raw?.name ?? '').trim()
        const ingredient = (raw?.ingredient ?? '').trim()
        if (!name) continue
        const { category, icon } = classifyStep(name, ingredient)
        const cat = categoriaProduto(category, icon)
        if (!cat) continue // 'Cuidado' / não reconhecido → omite o passo
        const key = norm(name)
        const found = stepsByName.get(key)
        if (found) { found.periodos.add(periodo); continue }
        stepsByName.set(key, { name, ingredient, categoria: cat, label: category, periodos: new Set([periodo]) })
      }
    }
    collect(proto.rotina_am, 'am')
    collect(proto.rotina_pm, 'pm')
    const steps = [...stepsByName.values()]

    // ── Filtro SQL de elegibilidade (generoso) + corte de alérgeno + GATE de ativo ──
    const overlaps = (a: string[] | null | undefined, b: string[]) =>
      Array.isArray(a) && a.some((x) => b.includes(x))

    const isLight = (p: any) => {
      const i = norm(p.intensidade ?? '')
      return i.includes('suave') || i.includes('leve')
    }
    // Ranqueia por: PREFERÊNCIA de intenção do passo (nudge, opcional) → overlap de concern
    // (generoso: prioriza, não filtra) → favorece sensível. A preferência é só ordenação.
    const rank = (arr: any[], pref?: { codes: string[]; light: boolean }) => arr
      .map((p) => ({
        p,
        prefHit: pref ? ((overlaps(p.ativos_principais, pref.codes) ? 2 : 0) + (pref.light && isLight(p) ? 1 : 0)) : 0,
        concernHits: (p.concerns ?? []).filter((c: string) => concernCodes.includes(c)).length,
        sens: isSensitive && p.indicado_pele_sensivel ? 1 : 0,
      }))
      .sort((a, b) => (b.prefHit - a.prefHit) || (b.concernHits - a.concernHits) || (b.sens - a.sens))
      .map((x) => x.p)

    // Pool elegível de uma categoria; `gateCodes` exige ativo-alvo (só Tratamento);
    // `pref` reordena por intenção do passo (staples com passos-irmãos).
    const poolFor = async (categoria: string, gateCodes?: string[], pref?: { codes: string[]; light: boolean }) => {
      let q = supabase
        .from('produtos')
        .select('id, marca, nome, categoria, ativos_principais, tipos_pele, concerns, alergenos, ideal_para, intensidade, indicado_pele_sensivel, seguro_gestante, porque_e_especial')
        .eq('ativo', true)
        .eq('categoria', categoria)
      if (skinTypeCode) q = q.contains('tipos_pele', [skinTypeCode]) // gate suave: quase todos listam 3–4 tipos
      if (isPregnant) q = q.eq('seguro_gestante', true)
      const { data: prods } = await q
      let elig = (prods ?? []).filter((p) => !overlaps(p.alergenos, cutCodes)) // corte DURO de alérgeno
      if (gateCodes) elig = elig.filter((p) => overlaps(p.ativos_principais, gateCodes)) // GATE de ingrediente
      return rank(elig, pref)
    }

    // Resolve cada passo → 'ia' (vai pra IA), 'sem_produto' (mensagem honesta) ou omitido (nem entra).
    type Resolved =
      | { kind: 'ia'; step: Step; produtos: any[]; iaIndex: number }
      | { kind: 'sem_produto'; step: Step; ingrediente_alvo: string }
    const resolved: Resolved[] = []
    let iaCounter = 0
    // Quantos passos caem em cada categoria de produto (p/ decidir se há passos-irmãos).
    const catCount = new Map<string, number>()
    for (const s of steps) catCount.set(s.categoria, (catCount.get(s.categoria) ?? 0) + 1)

    for (const step of steps) {
      const pref = stepIntent(step.name, step.ingredient) // preferência de intenção (nudge)
      if (step.label === 'Tratamento') {
        // Só passos de Tratamento são gateados por ingrediente.
        const target = detectTargetActive(step.name, step.ingredient)
        if (target.kind === 'eye') continue // olhos/olheiras → omite em silêncio
        if (target.kind === 'unknown') { resolved.push({ kind: 'sem_produto', step, ingrediente_alvo: step.ingredient }); continue }
        const elig = await poolFor(step.categoria, target.codes, pref) // gate pelo ativo-alvo
        // Ativo-alvo conhecido e nada casou (não existe ou tudo cortado por alergia/gestante) → sem_produto honesto.
        if (elig.length === 0) { resolved.push({ kind: 'sem_produto', step, ingrediente_alvo: step.ingredient }); continue }
        resolved.push({ kind: 'ia', step, produtos: elig, iaIndex: iaCounter++ })
      } else {
        // Staples (limpeza/tonico/hidratante/oclusivo/protetor) e 'Barreira' → SEM gate.
        // Nudge por intenção só quando há passos-irmãos na mesma categoria (desempate).
        const sibling = (catCount.get(step.categoria) ?? 0) > 1
        const elig = await poolFor(step.categoria, undefined, sibling ? pref : undefined)
        if (elig.length === 0) continue // lacuna estrutural → omite em silêncio (sem mensagem, NUNCA sem_produto em staple)
        resolved.push({ kind: 'ia', step, produtos: elig, iaIndex: iaCounter++ })
      }
    }

    const iaSteps = resolved.filter((r): r is Extract<Resolved, { kind: 'ia' }> => r.kind === 'ia')

    if (resolved.length === 0) {
      // Nada a recomendar: salva vazio (mantém a guarda de "gerar uma vez") e retorna.
      await supabase.from('recomendacoes_produtos')
        .upsert({ user_id, scan_id: resolvedScanId, recomendacao: [] }, { onConflict: 'user_id', ignoreDuplicates: true })
        .select().maybeSingle()
      return json({ recomendacao: [], empty: true })
    }

    // ── Camada de IA: escolhe 1–3 por passo, marca principal, escreve copy ────
    const systemPrompt = `Você é uma dermatologista consultora brasileira. Sua tarefa é montar a lista de produtos recomendados para a usuária, passo a passo, escolhendo APENAS dentro do conjunto de produtos elegíveis que já passaram por um filtro de segurança. Toda saída em português brasileiro.

REGRAS INVIOLÁVEIS:
1. Para cada passo, escolha de 1 a 3 produtos SOMENTE da lista "produtos_elegiveis" daquele passo. NUNCA invente produto nem use um id que não esteja na lista. Use exatamente o "produto_id" fornecido.
2. Marque EXATAMENTE 1 produto como principal (o melhor para ela naquele passo). Os demais são alternativas.
3. Traga de 1 a 3 produtos por passo. Quando o pool tiver alternativas genuinamente boas e DISTINTAS entre si, PREFIRA trazer 2 ou 3 (1 principal + 1–2 alternativas) para a usuária ter opções na tela. Não force: se só houver 1 produto realmente adequado, traga 1 — e jamais inclua um produto ruim ou redundante só para chegar a 3.
4. NÃO recomende um produto que a usuária já disse usar (ver "ja_usa"). Compare por marca e nome.
5. Incompatibilidade: dentro de um mesmo passo, não coloque um produto com GHK-Cu / cobre (ex.: linhas "PDRN", "Medicube") junto de vitamina C ou de ácidos/AHA/BHA. Se o passo é de vitamina C ou ácido, evite produtos de cobre/GHK-Cu.
6. Se a usuária é sensível, prefira produtos com "indicado_pele_sensivel": true e intensidade suave.
7. "copy": uma frase curta (máx ~18 palavras), pessoal, em pt-BR, dizendo por que ESTE produto combina com ELA — cite o tipo de pele, um concern real dela ou um ativo. Nada genérico. Não repita a copy entre produtos.

Responda SOMENTE com JSON no formato:
{ "passos": [ { "index": <número do passo>, "produtos": [ { "produto_id": "<uuid>", "principal": true|false, "copy": "<frase>" } ] } ] }`

    const perfil = {
      tipo_pele: skinTypeCode ?? 'indefinido',
      concerns: concernCodes,
      sensivel: isSensitive,
      gestante_ou_lactante: isPregnant,
      alergia_descricao: user.allergy_description ?? null,
      ja_usa: user.skincare_routine_description ?? null,
      objetivo: user.objetivo ?? null,
    }
    const passosInput = iaSteps.map((e) => ({
      index: e.iaIndex,
      passo: e.step.name,
      categoria: e.step.label,
      ingrediente_alvo: e.step.ingredient,
      produtos_elegiveis: e.produtos.map((p: any) => ({
        produto_id: p.id,
        marca: p.marca,
        nome: p.nome,
        ativos: p.ativos_principais,
        trata: p.concerns,
        intensidade: p.intensidade,
        sensivel_ok: p.indicado_pele_sensivel,
        ideal_para: p.ideal_para,
      })),
    }))
    // Nos passos de tratamento o pool já vem pré-filtrado pelo ativo que o passo pede;
    // basta escolher e ranquear dentro dele.
    const userPrompt = `PERFIL DA USUÁRIA:\n${JSON.stringify(perfil, null, 2)}\n\nPASSOS E PRODUTOS ELEGÍVEIS (já compatíveis com o ativo que cada passo pede):\n${JSON.stringify(passosInput, null, 2)}`

    // Só chama a IA se houver passos com produto. (Pode haver só passos sem_produto.)
    const aiOut = iaSteps.length > 0 ? await callOpenAI(systemPrompt, userPrompt) : { passos: [] }

    // ── Validação: só ids elegíveis, exatamente 1 principal, 1–3 por passo ───
    const aiByIndex = new Map<number, any>()
    for (const p of (aiOut?.passos ?? [])) {
      if (typeof p?.index === 'number') aiByIndex.set(p.index, p)
    }

    // Monta na ORDEM original dos passos; sem_produto vira entrada honesta (sem IA).
    const recomendacao: any[] = []
    const byId = (pool: any[], id: string) => pool.find((p) => p.id === id)
    // Principais já usados por categoria de produto → desempate entre passos-irmãos.
    const usedPrincipalByCat = new Map<string, Set<string>>()

    for (const r of resolved) {
      const periodo = [...r.step.periodos].sort().join('+') // 'am' | 'pm' | 'am+pm'
      if (r.kind === 'sem_produto') {
        recomendacao.push({
          categoria: r.step.label,
          passo: r.step.name,
          periodo,
          ingrediente_alvo: r.ingrediente_alvo,
          produtos: [],
          sem_produto: true,
          motivo: SEM_PRODUTO_MSG,
        })
        continue
      }
      const cat = r.step.categoria
      const used = usedPrincipalByCat.get(cat) ?? new Set<string>()
      const eligibleIds = new Set(r.produtos.map((p: any) => p.id))
      let list = (aiByIndex.get(r.iaIndex)?.produtos ?? [])
        .filter((x: any) => eligibleIds.has(x?.produto_id))
        .slice(0, 3)
        .map((x: any) => ({
          produto_id: x.produto_id,
          principal: x.principal === true,
          copy: typeof x.copy === 'string' ? x.copy.trim() : '',
        }))

      // Fallback: IA não retornou nada válido → usa o 1º elegível (já ranqueado por
      // intenção/gate/concern; nos Tratamentos já é o ingrediente certo).
      if (list.length === 0) list = [{ produto_id: r.produtos[0].id, principal: true, copy: '' }]

      // Garante EXATAMENTE 1 principal.
      if (list.filter((x: any) => x.principal).length !== 1) {
        list.forEach((x: any, idx: number) => { x.principal = idx === 0 })
      }

      // Desempate entre passos-irmãos da mesma categoria: se o principal já foi usado
      // por um passo anterior, troca pelo melhor elegível ainda não usado (o pool já vem
      // ranqueado pela intenção deste passo). Só troca se houver alternativa distinta.
      const principal = list.find((x: any) => x.principal)!
      if (used.has(principal.produto_id)) {
        const alt = r.produtos.find((p: any) => !used.has(p.id) && !list.some((x: any) => x.produto_id === p.id))
        if (alt) {
          const others = list
            .filter((x: any) => x.produto_id !== principal.produto_id && x.produto_id !== alt.id)
            .map((x: any) => ({ ...x, principal: false }))
          list = [{ produto_id: alt.id, principal: true, copy: '' }, ...others]
        }
      }

      // Copy NUNCA vazia: se a IA não deu copy (ou trocamos o produto), sintetiza dos dados.
      list = list.map((x: any) => (x.copy && x.copy.length > 0)
        ? x
        : { ...x, copy: synthCopy(byId(r.produtos, x.produto_id)) })

      used.add(list.find((x: any) => x.principal)!.produto_id)
      usedPrincipalByCat.set(cat, used)

      recomendacao.push({
        categoria: r.step.label,           // rótulo de exibição (bate com a tela Rotina)
        passo: r.step.name,                // nome do passo (desambigua passos de mesma categoria)
        periodo,
        produtos: list,
      })
    }

    // ── Salva (on conflict user_id do nothing) e retorna ─────────────────────
    const { data: inserted } = await supabase
      .from('recomendacoes_produtos')
      .upsert({ user_id, scan_id: resolvedScanId, recomendacao }, { onConflict: 'user_id', ignoreDuplicates: true })
      .select('recomendacao')
      .maybeSingle()

    // Corrida: se outra chamada inseriu primeiro, `inserted` vem null → lê a existente.
    if (!inserted) {
      const { data: row } = await supabase
        .from('recomendacoes_produtos')
        .select('recomendacao')
        .eq('user_id', user_id)
        .maybeSingle()
      return json({ recomendacao: row?.recomendacao ?? recomendacao, cached: true })
    }

    return json({ recomendacao: inserted.recomendacao })
  } catch (err) {
    console.error('[recomendar-produtos] erro:', err)
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
