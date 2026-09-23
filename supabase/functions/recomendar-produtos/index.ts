// recomendar-produtos
// Gera UMA vez (no primeiro scan) uma recomendação de produtos reais organizada por
// passo da rotina, e nunca regenera. Auto-guardada: se já existe linha para o user,
// retorna a existente. Fluxo: busca perfil + scan + protocolo no banco → classifica
// cada passo em uma categoria de produto (mesma lógica da tela Rotina) → **tenta
// preencher o passo com o que ela TEM EM CASA (Minha Coleção)** → o que sobrar vai
// para o filtro SQL de elegibilidade (generoso) com corte duro de alérgenos →
// camada de IA escolhe 1–3 por passo, marca o principal e escreve a copy pt-BR →
// salva o JSON e retorna.
//
// ⚠️ A ESTRUTURA da rotina (quais passos existem, ordem, manhã/noite) é do
// `generate-protocol`, não daqui. Esta função decide só QUAL PRODUTO ocupa cada
// passo — e é por isso que ela pode ser re-rodada (`regenerate: true`) quando a
// Coleção muda, sem reescrever a rotina (que precisa ficar estável ~30 dias).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CAMADA1_SEGURANCA_E_COMPATIBILIDADE, clampCompatibilidade } from '../_shared/compatibilidade.ts'

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

// ── Passo de ÁREA DOS OLHOS ──────────────────────────────────────────────────
// Passos de olhos morriam em TRÊS caminhos distintos, todos silenciosos menos o 3º:
//   1. label 'Tratamento'  → detectTargetActive kind:'eye' → `continue`
//   2. label 'Cuidado'     → categoriaProduto devolve null
//   3. label 'Hidratação'  → virava 'hidratante' e recomendava CREME FACIAL para os olhos
// `isOlhos` resolve os três num ponto só, porque não depende do label.
//
// Vocabulário: as MESMAS keywords do branch 'eye' de detectTargetActive (fonte única).
// Exige expressão POSICIONAL composta — a palavra 'olhos' sozinha NÃO casa, senão
// "Demaquilante para os olhos" arrastaria passos que não são tratamento periocular.
// `norm` (definido logo abaixo) cobre caixa E acento: "Área dos Olhos", "área dos olhos"
// e "ÁREA DOS OLHOS" casam igual. Chamado só em runtime, então a ordem não é problema.
const OLHOS_KEYWORDS = [
  'olheira', 'periocular', 'area dos olhos', 'contorno dos olhos', 'para os olhos', 'para olhos',
]
function isOlhos(name: string, ingredient: string): boolean {
  const t = norm(`${name} ${ingredient}`)
  return OLHOS_KEYWORDS.some((k) => t.includes(k))
}
// Só estes labels podem virar 'olhos' — são exatamente os três caminhos acima.
// Limpeza/Proteção/Tônico/Finalização/Barreira ficam de fora DE PROPÓSITO: é o que
// mantém "Demaquilante para os olhos" como limpeza (recebe demaquilante, não creme de olhos).
const OLHOS_LABELS = new Set(['Tratamento', 'Cuidado', 'Hidratação'])
//
// RANQUEAMENTO — dívida conhecida: ~75 das ~225 ocorrências de passo de olhos no banco
// pedem CAFEÍNA ("Cafeína + Niacinamida", "Cafeína + Peptídeos"), e só 4 dos 15 produtos
// da categoria têm `cafeina` em ativos_principais. O `stepIntent` não conhece 'cafeina',
// então o nudge de ordenação cai em niacinamida (7 produtos) e peptideos (6) — aceitável,
// mas não é o que o passo pede. Ensinar 'cafeina' ao stepIntent ficou FORA deste bloco de
// propósito: stepIntent é caminho compartilhado por TODAS as categorias, e mexer nele
// mudaria o ranqueamento de passos que não são de olhos.

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

// ─────────────────────────────────────────────────────────────────────────────
// MINHA COLEÇÃO — o que a usuária JÁ TEM EM CASA entra antes do catálogo.
//
// Regra da feature: se ela tem um produto compatível para o passo, o passo é dela;
// o catálogo só preenche o que falta ou o que não serve. Um passo preenchido pela
// Coleção nem chega à camada de IA (não faz sentido escolher produto do mercado
// para um passo que já está resolvido — e economiza tokens).
// ─────────────────────────────────────────────────────────────────────────────

// Veredito que tira o produto da rotina — gêmeo de `VEREDITO_INCOMPATIVEL` em
// `lib/colecao.ts`. `com_ressalva` continua elegível (ranqueia abaixo de `pode_usar`
// pela compatibilidade, que é numérica). Mudou aqui, mude lá.
const VEREDITO_INCOMPATIVEL = 'evitaria'

type ItemColecao = {
  id: string
  produto_nome: string | null
  produto_marca: string | null
  categoria: string | null
  ativos_detectados: string[] | null
  compatibilidade: number | null
  veredito: string | null
  image_path: string | null
  resultado: Record<string, unknown> | null
}

// Categoria do item da Coleção → vocabulário da tabela `produtos`.
// A `analisar-produto` devolve `produto.categoria` em TEXTO LIVRE ("hidratante
// facial", "protetor solar FPS 50", "sérum de vitamina C"), então reusamos o
// `classifyStep` — o mesmo classificador dos passos — em cima de categoria + nome
// + ativos. Assim o item e o passo são medidos com a MESMA régua; se um dia o
// classificador mudar, os dois lados mudam juntos.
const CATEGORIAS_CATALOGO = new Set([
  'limpeza', 'limpeza_oleosa', 'tonico', 'serum', 'hidratante', 'oclusivo',
  'protetor_solar', 'esfoliante', 'olhos', 'tratamento_local', 'tratamento_noturno',
])

function categoriaDoItem(item: ItemColecao): string | null {
  // Atalho: quando a análise já devolveu a categoria no vocabulário do catálogo
  // ("hidratante", "protetor_solar"), não precisa passar pelo classificador.
  const direta = (item.categoria ?? '').trim().toLowerCase()
  if (CATEGORIAS_CATALOGO.has(direta)) return direta

  const texto = [item.categoria ?? '', item.produto_nome ?? '', (item.ativos_detectados ?? []).join(' ')]
    .join(' ')
    .trim()
  if (!texto) return null
  const { category, icon } = classifyStep(texto, '')
  if (OLHOS_LABELS.has(category) && isOlhos(texto, '')) return 'olhos'
  return categoriaProduto(category, icon)
}

// Ativos em texto livre da IA ("ácido salicílico 2%", "Niacinamide") → códigos do
// vocabulário de `produtos.ativos_principais`. Devolve TODOS os que casarem (um
// produto tem vários), ao contrário do `detectTargetActive`, que para no primeiro.
function codigosDeAtivos(ativos: string[] | null | undefined): string[] {
  // `_` vira espaço: a mesma função atende texto livre da IA ("ácido salicílico
  // 2%") e códigos já prontos do catálogo ("acido_salicilico", "vitamina_c") —
  // sem isso, `vitamina_c` não casaria com a keyword "vitamina c".
  const t = norm((ativos ?? []).join(' | ')).replace(/_/g, ' ')
  if (!t) return []
  const has = (...ks: string[]) => ks.some((k) => t.includes(k))
  const out = new Set<string>()
  if (has('retinol', 'retinal', 'retinaldeido', 'tretinoina', 'retinoide', 'adapaleno', 'hidroxipinacolona')) out.add('retinol')
  if (has('azelaico', 'azelaic')) out.add('acido_azelaico')
  if (has('salicilico', 'bha', 'betaidroxi', 'lha')) out.add('acido_salicilico')
  if (has('mandelico')) { out.add('acido_mandelico'); out.add('aha') }
  if (has('glicolico')) { out.add('acido_glicolico'); out.add('aha') }
  if (has('lactico', 'latico', 'aha')) out.add('aha')
  if (has('pha', 'gluconolactona')) out.add('pha')
  if (has('tranexamico')) out.add('acido_tranexamico')
  if (has('niacinamid')) out.add('niacinamida')
  if (has('peptide', 'peptideo')) out.add('peptideos')
  if (has('centella', 'cica', 'madecassoside')) out.add('centella')
  if (has('pantenol')) out.add('pantenol')
  if (has('pdrn')) out.add('pdrn')
  if (has('mucina', 'snail', 'caracol')) out.add('mucina_de_caracol')
  if (has('hialuronico', 'hialuronato')) out.add('acido_hialuronico')
  if (has('ceramida')) out.add('ceramidas')
  if (has('esqualano', 'squalane')) out.add('esqualano')
  if (has('propolis')) out.add('propolis')
  if (has('vitamina c', 'vit c', 'ascorb')) out.add('vitamina_c')
  return [...out]
}

// Família clínica de um conjunto de ativos — para as travas abaixo. Mesma ideia do
// `detectTargetActive` de `_shared/protocol-write.ts` (retinoide, AHA e BHA são as
// famílias que não podem dobrar nem aparecer de manhã).
function familiasDeAtivos(codes: string[]): string[] {
  const f = new Set<string>()
  if (codes.includes('retinol')) f.add('retinoide')
  if (codes.includes('acido_mandelico') || codes.includes('acido_glicolico') || codes.includes('aha') || codes.includes('pha')) f.add('aha')
  if (codes.includes('acido_salicilico')) f.add('bha')
  if (codes.includes('vitamina_c')) f.add('vitamina_c')
  if (codes.includes('niacinamida')) f.add('niacinamida')
  if (codes.includes('acido_azelaico')) f.add('azelaico')
  return [...f]
}

// Famílias que NUNCA podem ocupar um passo da MANHÃ, nem por produto de casa.
// Mesma trava clínica de `_shared/protocol-write.ts` (retinoide/AHA de manhã):
// o passo da IA pode ser um hidratante da manhã e o creme que ela tem em casa
// conter retinol — o passo não muda, mas o produto entraria fotossensibilizando
// a pele. A trava é sobre o PRODUTO, não sobre o passo.
const FAMILIAS_PROIBIDAS_AM = new Set(['retinoide', 'aha'])

// ─────────────────────────────────────────────────────────────────────────────
// COMPATIBILIDADE dos produtos recomendados (0–100)
//
// ⚠️ A régua é a MESMA da `analisar-produto` — importada de
// `_shared/compatibilidade.ts`, não reescrita aqui. Os dois números aparecem lado
// a lado na rotina (o do produto que ela tem em casa e o do recomendado) e a
// usuária decide comparando; réguas diferentes com a mesma cara mentiriam.
// A única diferença é a ENTRADA: lá é a foto do produto, aqui é a ficha do catálogo.
//
// ⚠️ UMA chamada em lote para todos os produtos, não uma por produto: o context
// pack e a rubrica são reenviados uma vez só (~2,7k tokens no total, contra ~61k
// se fosse produto a produto).
//
// ⚠️ Chamada SEPARADA da que escolhe os produtos, de propósito. O prompt clínico é
// explícito que o número não pode justificar a decisão de rotina; juntar seleção e
// pontuação no mesmo pedido convidaria o modelo a alinhar as duas coisas.
// ─────────────────────────────────────────────────────────────────────────────

/** Ids de produtos recomendados que ainda não têm nota. Vazio → nenhuma chamada. */
function produtosSemNota(recomendacao: any[]): string[] {
  const ids = new Set<string>()
  for (const passo of recomendacao ?? []) {
    for (const p of passo?.produtos ?? []) {
      if (p?.produto_id && typeof p.compatibilidade !== 'number') ids.add(p.produto_id)
    }
  }
  return [...ids]
}

/** Contexto clínico da usuária — os mesmos campos que a `analisar-produto` manda. */
function buildContextoClinico(user: any, scan: any): string {
  const fr = scan ?? {}
  const prio = (fr.prioridade_clinica ?? {}) as Record<string, unknown>
  const contra = Array.isArray(fr.contraindicacoes) ? fr.contraindicacoes.join(', ') : ''
  const cond = [
    fr.acne?.present ? 'acne' : '',
    fr.pigmentacao?.present ? 'pigmentacao' : '',
    fr.rosacea?.present ? 'rosácea' : '',
    fr.envelhecimento?.present ? 'envelhecimento' : '',
  ].filter(Boolean).join(', ')
  return `<UserProfile>
  <SkinType>${user?.tipo_pele ?? ''}</SkinType>
  <Phototype>${fr.skin_phototype ? `Fitzpatrick ${fr.skin_phototype}` : ''}</Phototype>
  <Concerns>${Array.isArray(user?.concerns) ? user.concerns.join(', ') : ''}</Concerns>
  <Allergies>${user?.allergy_type ?? ''} — ${user?.allergy_description ?? ''}</Allergies>
  <PregnancyStatus>${user?.pregnancy_status ?? ''}</PregnancyStatus>
</UserProfile>
<LatestSkinScan>
  <SkinTypeDetected>${fr.skin_type_detected ?? ''}</SkinTypeDetected>
  <BarrierStatus>${fr.barrier_status ?? ''}</BarrierStatus>
  <ClinicalPriority>${prio.primaria ?? ''}</ClinicalPriority>
  <Contraindications>${contra}</Contraindications>
  <Conditions>${cond}</Conditions>
</LatestSkinScan>`
}

/**
 * Pontua os produtos e grava as notas na linha da recomendação.
 * Roda DEPOIS da resposta (via `waitUntil`) — nunca segura a tela.
 * Falha aqui é silenciosa por design: a recomendação já está salva e válida, só
 * fica sem nota (a tela simplesmente não desenha a barra).
 */
/**
 * DESCARTAR E PROMOVER — rede de segurança da pontuação.
 *
 * Produto reprovado pela régua (`evitaria`) NUNCA fica recomendado. O corte
 * determinístico do `poolFor` mata a causa estrutural (barreira/rosácea) ANTES da
 * seleção; isto apara o resíduo que a ficha não deixa afirmar (concentração de
 * niacinamida, forma da vitamina C).
 *
 * ⚠️ SEM chamada de IA nova: principal e alternativas do passo já foram pontuados
 * no mesmo lote, então promover é escolha local. Trocar pelo "próximo do pool"
 * exigiria repontuar — iterativo e de custo imprevisível.
 *
 * Devolve `true` se mexeu no passo.
 */
function aplicarCorteClinicoNoPasso(passo: any, cortes: CortesClinicos): boolean {
  // Produto reprovado pela régua NUNCA fica recomendado. Rede de segurança do
  // resíduo que o corte determinístico não alcança (concentração de
  // niacinamida, forma da vitamina C): o corte do `poolFor` mata a causa
  // estrutural antes da seleção, isto apara o que escapou.
  // ⚠️ SEM chamada nova: os produtos do passo (principal E alternativas) já
  // foram pontuados no mesmo lote, então promover é escolha local. Trocar pelo
  // "próximo do pool" exigiria repontuar — iterativo e de custo imprevisível.
  // ⚠️ Vale inclusive para passo `fixado`: segurança clínica não é negociável
  // nem pela escolha dela (é a mesma regra da revalidação no `poolFor`).
  const lista: any[] = passo.produtos ?? []
  if (lista.length === 0) return false
  // Num passo `fixado`, o principal ATUAL é a escolha dela — guardar o id antes
  // de mexer na lista é o que permite saber, depois, se ela sobreviveu.
  const idEscolhidoPorEla = passo.fixado
    ? (lista.find((x: any) => x?.principal) ?? lista[0])?.produto_id
    : null

  const sobreviventes = lista.filter((x: any) => !reprovadoPelaNota(x))
  if (sobreviventes.length === lista.length) return false // ninguém reprovado

  if (sobreviventes.length === 0) {
    // Nenhum sobrou → estado vazio clínico, a MESMA copy do corte determinístico.
    const copia = copiaEstadoVazioClinico(cortes)
    passo.produtos = []
    passo.sem_produto = true
    passo.motivo_clinico = true
    passo.titulo = copia.titulo
    passo.motivo = copia.motivo
    delete passo.fixado
    return true
  }

  const escolhaDelaSobreviveu = idEscolhidoPorEla != null
    && sobreviventes.some((x: any) => x?.produto_id === idEscolhidoPorEla)

  if (escolhaDelaSobreviveu) {
    // Ela escolheu e o produto passou: continua principal. ⚠️ NÃO reordenar por
    // nota aqui — rebaixar a escolha dela porque uma alternativa pontuou mais
    // seria a IA trocando por baixo, exatamente o que `fixado` existe pra impedir.
    sobreviventes.forEach((x: any) => { x.principal = x?.produto_id === idEscolhidoPorEla })
  } else {
    // Promove o de MAIOR compatibilidade entre os que sobraram. A copy dele já
    // foi escrita pela IA de seleção — nada precisa ser gerado de novo.
    sobreviventes.sort((a: any, b: any) => (b?.compatibilidade ?? 0) - (a?.compatibilidade ?? 0))
    sobreviventes.forEach((x: any, i: number) => { x.principal = i === 0 })
    // A escolha dela caiu no corte clínico → o passo deixa de ser "fixado" NESTA
    // recomendação. A linha em `rotina_produto_fixado` permanece: se o produto
    // voltar a ser elegível numa geração futura, ele volta a ser o dela.
    if (passo.fixado) delete passo.fixado
  }
  passo.produtos = sobreviventes
  return true
}

/**
 * Produto reprovado pela régua clínica. Chaveia pelo VEREDITO (a decisão primária,
 * e a MESMA constante que tira um produto da Coleção da rotina), com `< 40` como
 * rede para linha sem veredito — 40 é o piso de `com_ressalva`, ou seja, tudo que
 * está abaixo é `evitaria`. Sem nota nenhuma → não reprova (produto ainda não
 * pontuado não pode sumir da tela por isso).
 */
function reprovadoPelaNota(p: any): boolean {
  if (p?.veredito) return String(p.veredito) === VEREDITO_INCOMPATIVEL
  if (typeof p?.compatibilidade === 'number') return p.compatibilidade < 40
  return false
}

async function pontuarEGravar(supabase: any, user_id: string, contexto: string, ids: string[], cortes: CortesClinicos): Promise<void> {
  try {
    const { data: prods } = await supabase
      .from('produtos')
      .select('id, marca, nome, categoria, ativos_principais, intensidade, indicado_pele_sensivel, seguro_gestante, ideal_para')
      .in('id', ids)
    if (!prods || prods.length === 0) return

    const sistema = `Você é uma dermatologista brasileira avaliando a COMPATIBILIDADE de produtos com a pele de UMA usuária.

Você recebe o perfil clínico dela e uma lista de produtos. Para CADA produto, decida o \`veredito\` e derive a \`compatibilidade\` exatamente pela régua abaixo.

⚠️ Escopo: aqui você avalia SOMENTE a Camada 1 (o produto cabe na pele dela?). NÃO existe decisão de rotina nesta tarefa — ignore qualquer conclusão sobre adicionar/substituir/manter; as menções à "Camada 2" no texto abaixo servem só para delimitar o que o veredito NÃO é.

⚠️ A entrada aqui é a FICHA do produto no catálogo (ativos principais, sem concentração), não uma foto do rótulo. Avalie pelo que a ficha afirma; não invente concentração nem ativo que não esteja listado.

${CAMADA1_SEGURANCA_E_COMPATIBILIDADE}

Responda SOMENTE com JSON:
{ "produtos": [ { "produto_id": "<uuid>", "veredito": "pode_usar|com_ressalva|evitaria", "compatibilidade": <inteiro 0-100> } ] }
Um item para CADA produto recebido, com o "produto_id" exatamente como veio.`

    const fichas = prods.map((p: any) => ({
      produto_id: p.id, marca: p.marca, nome: p.nome, categoria: p.categoria,
      ativos: p.ativos_principais, intensidade: p.intensidade,
      indicado_pele_sensivel: p.indicado_pele_sensivel, seguro_gestante: p.seguro_gestante,
      ideal_para: p.ideal_para,
    }))
    const userPrompt = `PERFIL CLÍNICO DA USUÁRIA:\n${contexto}\n\nPRODUTOS A AVALIAR:\n${JSON.stringify(fichas, null, 2)}`

    // MESMO modelo da `analisar-produto`: rubrica igual em modelo diferente calibra
    // diferente, e é a comparabilidade lado a lado que esta feature existe para
    // proteger. ⚠️ Teto alto porque é modelo de raciocínio (os tokens de raciocínio
    // contam no `max_completion_tokens` — foi o que truncou a analyze-skin em 4096).
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        max_completion_tokens: 8192,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    if (!res.ok) {
      console.error('[recomendar-produtos] pontuação HTTP', res.status, (await res.text()).slice(0, 300))
      return
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content ?? ''
    const s = content.indexOf('{'), e = content.lastIndexOf('}')
    if (s === -1 || e === -1) return
    const parsed = JSON.parse(content.slice(s, e + 1))

    const notas = new Map<string, { veredito: string; compatibilidade: number }>()
    const idsValidos = new Set(prods.map((p: any) => p.id))
    for (const item of parsed?.produtos ?? []) {
      if (!idsValidos.has(item?.produto_id)) continue // nunca aceitar id inventado
      const compat = clampCompatibilidade(item?.veredito, item?.compatibilidade)
      if (compat === null) continue
      notas.set(item.produto_id, { veredito: String(item.veredito), compatibilidade: compat })
    }
    if (notas.size === 0) return

    // Relê ANTES de gravar: entre a resposta e agora a linha pode ter sido reescrita
    // (ela fixou um produto, por exemplo). Mesclar sobre o que está lá evita
    // sobrescrever uma recomendação mais nova com a que tínhamos em mãos.
    const { data: atual } = await supabase
      .from('recomendacoes_produtos')
      .select('recomendacao')
      .eq('user_id', user_id)
      .maybeSingle()
    const rec = Array.isArray(atual?.recomendacao) ? atual!.recomendacao : null
    if (!rec) return

    let mudou = false
    for (const passo of rec) {
      // `em_casa` tem regra própria (produto DELA incompatível fica na Coleção,
      // marcado, fora da rotina) e não passa por aqui.
      if (passo?.em_casa) continue

      for (const p of passo?.produtos ?? []) {
        const nota = notas.get(p?.produto_id)
        if (!nota) continue
        p.compatibilidade = nota.compatibilidade
        p.veredito = nota.veredito
        mudou = true
      }

      if (aplicarCorteClinicoNoPasso(passo, cortes)) mudou = true
    }
    if (!mudou) return

    const { error } = await supabase
      .from('recomendacoes_produtos')
      .update({ recomendacao: rec })
      .eq('user_id', user_id)
    if (error) console.error('[recomendar-produtos] gravação das notas falhou:', error)
    else console.log(`[recomendar-produtos] ${notas.size} produto(s) pontuado(s)`)
  } catch (e) {
    console.error('[recomendar-produtos] pontuação falhou (recomendação segue sem nota):', e)
  }
}

const SEM_PRODUTO_MSG = 'Ainda não temos um produto no catálogo para este passo.'

// ─────────────────────────────────────────────────────────────────────────────
// CORTES DUROS CLÍNICOS no pool do catálogo (barreira e rosácea)
//
// ⚠️ O BURACO QUE ISTO FECHA. A régua clínica (`_shared/compatibilidade.ts`) tem
// QUATRO cortes duros: alérgeno, gravidez, **barreira comprometida** e **rosácea**.
// O filtro SQL conhecia só dois (alérgeno e gestante) — barreira e rosácea eram
// lidas por `scanConcernCodes` apenas para RANQUEAR, nunca para EXCLUIR. Resultado
// medido em produção: "Some By Mi AHA-BHA-PHA Clear Foam" recomendado com
// compatibilidade 25% (faixa `evitaria`) — o filtro aprovava, a régua reprovava, e
// o produto ficava na tela. Cortar aqui mata a causa ANTES da seleção, sem custo
// de IA e sem latência.
//
// ⚠️ O que este corte NÃO alcança, de propósito (fica para a rede de segurança da
// pontuação — ver `aplicarCorteClinico`):
//   • "niacinamida >5%" → o catálogo não guarda concentração;
//   • "vitamina C L-AA puro" → o código é só `vitamina_c`, sem distinguir L-AA de
//     derivados (SAP/MAP), que a régua PERMITE. Cortar tudo tiraria produto válido;
//   • "esfoliante físico" → a categoria `esfoliante` sequer é recomendada hoje
//     (`categoriaProduto` só devolve as 7 antigas).
// Sub-cortar aqui é a escolha certa: o que escapa é pego pela nota depois.
//
// ⚠️ `levemente_comprometida` NÃO corta — a régua fala em "comprometida/severamente
// comprometida". Não endurecer sem mexer no texto compartilhado.
// ⚠️ NÃO se aplica à Minha Coleção: produto dela já foi avaliado por FOTO, com estes
// mesmos cortes, e o veredito guardado é que decide (ver `escolherDaColecao`).
// ─────────────────────────────────────────────────────────────────────────────
type CortesClinicos = { barreira: boolean; rosacea: boolean }

// ── Copy do estado vazio CLÍNICO ─────────────────────────────────────────────
// ⚠️ Tom: informar sem alarmar. "Nenhuma limpeza serve pra você" assusta e soa
// como veredito sobre a pele dela; o recado certo é sobre o MOMENTO ("sua barreira
// está em recuperação, melhor não usar ácido agora").
// ⚠️ NÃO prometer que o produto volta sozinho quando a pele melhorar — a rotina é
// congelada de propósito e isso NÃO acontece (ver "CONSEQUÊNCIA CONHECIDA" no
// README). Por isso o convite é o chat, que é o caminho real de reavaliação.
// ⚠️ O convite ao chat existe SÓ nas variantes com causa nomeada (barreira,
// rosácea, as duas). Na residual ele fica de fora de propósito: repetido nas
// quatro vira ruído, e ali a NIKS não tem alternativa concreta a oferecer — o
// convite soaria vazio.
function copiaEstadoVazioClinico(c: CortesClinicos): { titulo: string; motivo: string } {
  if (c.barreira && c.rosacea) {
    return {
      titulo: 'Sua pele pede um intervalo aqui',
      motivo: 'Sua barreira está em recuperação e sua pele mostra sinais de rosácea. Ácido, esfoliante e fragrância agora atrapalhariam os dois, então deixei este passo de fora por enquanto. Me chama no chat que a gente vê uma alternativa suave.',
    }
  }
  if (c.barreira) {
    return {
      titulo: 'Sua barreira está em recuperação',
      motivo: 'Enquanto ela se refaz, ácido e esfoliante atrasam o processo em vez de ajudar — melhor não usar agora. Deixei este passo de fora por enquanto; quando ela estiver firme, me chama no chat que eu ajusto.',
    }
  }
  if (c.rosacea) {
    return {
      titulo: 'Sua pele está mais reativa agora',
      motivo: 'Com sinais de rosácea, ácido e fragrância costumam acender a vermelhidão — melhor evitar neste passo por enquanto. Me chama no chat se quiser uma alternativa suave.',
    }
  }
  return {
    titulo: 'Nada que eu recomende aqui agora',
    motivo: 'Não encontrei um produto que combine com a sua pele neste momento. Prefiro não indicar nada a indicar algo que pode irritar.',
  }
}

function cortesClinicosDoScan(scan: any): CortesClinicos {
  const b = norm(scan?.barrier_status ?? '')
  return {
    barreira: b === 'comprometida' || b === 'severamente comprometida' || b === 'severamente_comprometida',
    rosacea: scan?.rosacea?.present === true,
  }
}

/** O produto bate em algum corte duro clínico? (só o que a ficha permite afirmar) */
function reprovadoPorCorteClinico(p: any, cortes: CortesClinicos): boolean {
  if (!cortes.barreira && !cortes.rosacea) return false
  const fams = familiasDeAtivos(codigosDeAtivos(p?.ativos_principais))
  const alerg: string[] = Array.isArray(p?.alergenos) ? p.alergenos : []
  // O catálogo já marca fragrância e álcool como alérgeno — é daí que sai esta parte
  // do corte, sem precisar de campo novo.
  const fragranciaOuAlcool = alerg.includes('fragrancia') || alerg.includes('alcool')
  const esfoliante = fams.includes('aha') || fams.includes('bha')

  if (cortes.barreira && (esfoliante || fams.includes('retinoide') || fragranciaOuAlcool)) return true
  if (cortes.rosacea && (esfoliante || fragranciaOuAlcool)) return true
  return false
}

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

// Copy do passo preenchido pela Coleção. Determinística (não gasta IA — o passo
// nem vai para a camada de IA) e nunca vazia, como a `synthCopy` do catálogo.
// Prefere a frase que a análise já escreveu PARA ELA sobre aquele produto.
function synthCopyEmCasa(item: ItemColecao): string {
  const r = (item.resultado ?? {}) as Record<string, unknown>
  const daAnalise = [r.resultado_esperado_para_voce, r.resumo]
    .find((x) => typeof x === 'string' && (x as string).trim().length > 0) as string | undefined
  if (daAnalise) {
    const s = daAnalise.trim()
    return s.length > 160 ? s.slice(0, 159).trimEnd() + '…' : s
  }
  const compat = typeof item.compatibilidade === 'number' ? ` ${item.compatibilidade}% compatível com a sua pele.` : ''
  return `Você já tem esse em casa e ele serve pra este passo.${compat}`.trim()
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
    const { user_id, scan_id, regenerate, preservar_catalogo } = await req.json().catch(() => ({}))
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
    // `regenerate` (regeneração no 1º scan in-app): pula o guard e sobrescreve a linha,
    // para as recomendações baterem com o protocolo novo. Muda a regra "gera uma vez" —
    // intencional: recomendação apontando para passo que não existe mais é pior que uma nova.
    if (existing && !regenerate) {
      return json({ recomendacao: existing.recomendacao, cached: true })
    }

    // ── Preservação do que já estava escolhido ────────────────────────────────
    // `preservar_catalogo` é usado quando a MINHA COLEÇÃO muda (ela adicionou ou
    // removeu um produto seu): a regra é "só o produto do passo muda, nunca a
    // rotina inteira". Sem isso, `regenerate: true` re-roda a camada de IA para
    // TODOS os passos, e como o modelo não é determinístico, adicionar um produto
    // trocaria em silêncio os recomendados de passos que não têm nada a ver.
    // Com a preservação, passos intocados mantêm exatamente o que já tinham — e,
    // se nada sobrar para a IA escolher, a chamada ao modelo nem acontece.
    const anterior = new Map<string, any>()
    if (preservar_catalogo && Array.isArray(existing?.recomendacao)) {
      for (const p of existing!.recomendacao as any[]) {
        if (p?.passo) anterior.set(`${norm(p.passo)}|${p.periodo ?? ''}`, p)
      }
    }

    // ── Busca perfil + scan + protocolo (todos já persistidos no disparo) ─────
    const { data: user } = await supabase
      .from('users')
      .select('tipo_pele, concerns, allergy_type, allergy_description, pregnancy_status, skincare_routine_description')
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

    // ── Minha Coleção: o que ela TEM EM CASA e pode ocupar um passo ───────────
    // Só itens identificados e não reprovados pela própria análise. Ordenados por
    // compatibilidade desc: quando dois produtos de casa servem ao mesmo passo,
    // entra o de maior compatibilidade (regra da spec; a decisão é da IA, ela não escolhe).
    const { data: colecaoRows } = await supabase
      .from('colecao_produtos')
      .select('id, produto_nome, produto_marca, categoria, ativos_detectados, compatibilidade, veredito, image_path, resultado')
      .eq('user_id', user_id)
      .eq('status', 'identificado')
      .neq('veredito', VEREDITO_INCOMPATIVEL)
      .order('compatibilidade', { ascending: false, nullsFirst: false })
    const colecao = (colecaoRows ?? []) as ItemColecao[]

    // ── Produtos FIXADOS pela usuária ────────────────────────────────────────
    // Botão "Adicionar à minha rotina" (detalhe de um recomendado ou de uma
    // alternativa). ⚠️ A ESCOLHA DELA GANHA DE TUDO: é consultada ANTES da Coleção,
    // então um produto de casa compatível que apareça depois para o mesmo passo
    // NÃO derruba o que ela escolheu. A IA não troca por baixo.
    const { data: fixadosRows } = await supabase
      .from('rotina_produto_fixado')
      .select('passo_key, produto_id')
      .eq('user_id', user_id)
    const fixados = new Map<string, string>()
    for (const f of fixadosRows ?? []) {
      if (f?.passo_key && f?.produto_id) fixados.set(f.passo_key, f.produto_id)
    }

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
        // Olhos resolve ANTES do mapa de categorias e cobre os três caminhos de uma vez.
        // `category` (o label) NÃO muda: é ele que a tela exibe e tem que bater com a Rotina.
        const cat = (OLHOS_LABELS.has(category) && isOlhos(name, ingredient))
          ? 'olhos'
          : categoriaProduto(category, icon)
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

    const cortesClinicos = cortesClinicosDoScan(scan)

    // Pool elegível de uma categoria; `gateCodes` exige ativo-alvo (só Tratamento);
    // `pref` reordena por intenção do passo (staples com passos-irmãos).
    // ⚠️ Devolve TAMBÉM `cortadosPorClinica`: é o que distingue "não temos produto
    // nesta categoria" (lacuna de catálogo → omite em silêncio, regra antiga) de
    // "tínhamos, mas nenhum é seguro pra ela agora" (→ estado vazio CLÍNICO, que a
    // usuária precisa ver). Sem esse número os dois casos seriam indistinguíveis.
    type Pool = { elegiveis: any[]; cortadosPorClinica: number }
    const poolFor = async (categoria: string, gateCodes?: string[], pref?: { codes: string[]; light: boolean }): Promise<Pool> => {
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
      // Corte DURO clínico (barreira/rosácea) — o que fecha o buraco que deixava
      // produto da faixa `evitaria` chegar à tela. Contado antes/depois.
      const antes = elig.length
      elig = elig.filter((p) => !reprovadoPorCorteClinico(p, cortesClinicos))
      return { elegiveis: rank(elig, pref), cortadosPorClinica: antes - elig.length }
    }

    // Resolve cada passo → 'em_casa' (produto da Coleção), 'ia' (vai pra IA),
    // 'sem_produto' (mensagem honesta) ou omitido (nem entra).
    type Resolved =
      | { kind: 'fixado'; step: Step; produto: any; pool: any[]; anteriores: any[] }
      | { kind: 'em_casa'; step: Step; item: ItemColecao }
      | { kind: 'preservado'; step: Step; entry: any }
      | { kind: 'ia'; step: Step; produtos: any[]; iaIndex: number }
      | { kind: 'sem_produto'; step: Step; ingrediente_alvo: string }
      // Tínhamos produto na categoria, mas o corte clínico tirou todos. Diferente
      // do `sem_produto` (lacuna de catálogo): a causa é a pele dela, não o acervo.
      | { kind: 'sem_produto_clinico'; step: Step }
    const resolved: Resolved[] = []
    let iaCounter = 0
    // Quantos passos caem em cada categoria de produto (p/ decidir se há passos-irmãos).
    const catCount = new Map<string, number>()
    for (const s of steps) catCount.set(s.categoria, (catCount.get(s.categoria) ?? 0) + 1)

    // ── Casamento passo ← Minha Coleção ──────────────────────────────────────
    // Um item de casa só ocupa um passo. `usadosDaColecao` impede que o mesmo
    // hidratante preencha dois passos-irmãos; `familiasPorPeriodo` impede dois
    // produtos de casa com a MESMA família forte (retinoide/AHA/BHA) no mesmo
    // período — a trava clínica de `_shared/protocol-write.ts` aplicada ao produto.
    const usadosDaColecao = new Set<string>()
    const familiasPorPeriodo = new Map<string, Set<string>>()
    const FAMILIAS_EXCLUSIVAS = new Set(['retinoide', 'aha', 'bha'])

    const escolherDaColecao = (step: Step): ItemColecao | null => {
      for (const item of colecao) {
        if (usadosDaColecao.has(item.id)) continue
        if (categoriaDoItem(item) !== step.categoria) continue

        const codes = codigosDeAtivos(item.ativos_detectados)
        const fams = familiasDeAtivos(codes)

        // Gestante/lactante: nada de retinoide, nem o que ela já tem em casa.
        if (isPregnant && fams.includes('retinoide')) continue

        // Corte de alérgeno pelo que dá para LER nos ativos detectados. A análise
        // da `analisar-produto` já conhecia as alergias dela (o context pack carrega
        // o perfil), então isto é cinto-e-suspensório sobre o veredito — e só
        // alcança alérgeno que apareça como ativo (fragrância/álcool não aparecem).
        if (cutCodes.includes('retinoides') && fams.includes('retinoide')) continue
        if (cutCodes.includes('aha_bha') && (fams.includes('aha') || fams.includes('bha'))) continue
        if (cutCodes.includes('vitamina_c') && fams.includes('vitamina_c')) continue
        if (cutCodes.includes('niacinamida_alta') && fams.includes('niacinamida')) continue
        if (cutCodes.includes('centella') && codes.includes('centella')) continue
        if (cutCodes.includes('propolis') && codes.includes('propolis')) continue

        // Trava clínica: retinoide/AHA não ocupam passo de MANHÃ. O passo pode ser
        // um hidratante da manhã e o creme dela conter retinol — o passo não muda,
        // mas o produto entraria fotossensibilizando a pele.
        const periodos = [...step.periodos]
        if (periodos.includes('am') && fams.some((f) => FAMILIAS_PROIBIDAS_AM.has(f))) continue

        // Não dobrar a mesma família forte no mesmo período.
        const fortes = fams.filter((f) => FAMILIAS_EXCLUSIVAS.has(f))
        if (fortes.some((f) => periodos.some((p) => familiasPorPeriodo.get(p)?.has(f)))) continue

        // Passo de TRATAMENTO exige o ativo que o passo pede (mesmo gate do catálogo:
        // o passo de vitamina C não pode ser preenchido pelo azelaico que ela tem).
        if (step.label === 'Tratamento' && step.categoria !== 'olhos') {
          const target = detectTargetActive(step.name, step.ingredient)
          if (target.kind !== 'known') continue
          if (!(target.codes ?? []).some((c) => codes.includes(c))) continue
        }

        usadosDaColecao.add(item.id)
        for (const p of periodos) {
          const set = familiasPorPeriodo.get(p) ?? new Set<string>()
          fortes.forEach((f) => set.add(f))
          familiasPorPeriodo.set(p, set)
        }
        return item
      }
      return null
    }

    for (const step of steps) {
      const passoKey = norm(step.name)

      // 1º) A ESCOLHA DELA. Vem antes da Coleção e do catálogo: se ela fixou um
      // produto neste passo, é ele — e continua sendo, mesmo que um produto de casa
      // compatível apareça depois. A IA não troca por baixo.
      // ⚠️ Ainda assim o fixado é REVALIDADO contra o pool elegível (categoria,
      // gestante, alérgeno e, em Tratamento, o ativo-alvo): ele foi escolhido dentro
      // das regras de então, mas o perfil dela pode ter mudado (gravidez, alergia
      // nova) ou o produto pode ter saído do catálogo. Não passando, o passo cai no
      // fluxo normal — segurança clínica não é negociável nem pela escolha dela.
      const fixadoId = fixados.get(passoKey)
      if (fixadoId) {
        const alvo = step.label === 'Tratamento' && step.categoria !== 'olhos'
          ? detectTargetActive(step.name, step.ingredient)
          : null
        const gate = alvo?.kind === 'known' ? alvo.codes : undefined
        // Passo de Tratamento com ativo que não mapeamos: sem pool para validar,
        // então o fixado não é aplicado (cai no fluxo normal, que já trata o caso).
        if (!(alvo && alvo.kind !== 'known')) {
          const pool = (await poolFor(step.categoria, gate)).elegiveis
          const escolhido = pool.find((p: any) => p.id === fixadoId)
          if (escolhido) {
            const prevEntry = anterior.get(`${passoKey}|${[...step.periodos].sort().join('+')}`)
            resolved.push({
              kind: 'fixado', step, produto: escolhido, pool,
              anteriores: Array.isArray(prevEntry?.produtos) ? prevEntry.produtos : [],
            })
            continue
          }
          console.warn(`[recomendar-produtos] fixado ${fixadoId} não é mais elegível no passo "${step.name}" — caindo no fluxo normal`)
        }
      }

      // 2º) A Coleção vem ANTES do catálogo: se ela já tem algo compatível para este
      // passo, o passo é dela e nem vai para a camada de IA — o catálogo existe
      // para o que falta ou não serve.
      const emCasa = colecao.length > 0 ? escolherDaColecao(step) : null
      if (emCasa) { resolved.push({ kind: 'em_casa', step, item: emCasa }); continue }

      // Passo que já tinha escolha do catálogo e não foi tocado pela Coleção:
      // mantém o que estava. (Só quando `preservar_catalogo` foi pedido.)
      if (anterior.size > 0) {
        const periodoAtual = [...step.periodos].sort().join('+')
        const prev = anterior.get(`${norm(step.name)}|${periodoAtual}`)
        // Só preserva entrada de CATÁLOGO com produto de verdade: `sem_produto` e
        // `em_casa` antigos precisam ser recalculados (o catálogo pode ter mudado,
        // e um `em_casa` antigo pode ser justamente o produto que ela removeu).
        if (prev && !prev.sem_produto && !prev.em_casa && Array.isArray(prev.produtos) && prev.produtos.length > 0) {
          resolved.push({ kind: 'preservado', step, entry: prev })
          continue
        }
      }

      const pref = stepIntent(step.name, step.ingredient) // preferência de intenção (nudge)
      // `olhos` é STAPLE (sem gate), mesmo classificando como 'Tratamento': o gate existe
      // para o colapso de escolha num pool de 70 séruns; com 15 produtos numa categoria
      // própria ele só produziria pool vazio (aha/bha/tranexamico/azelaico = 0 produtos),
      // e pool vazio em Tratamento vira card `sem_produto` VISÍVEL — pior que o silêncio.
      if (step.label === 'Tratamento' && step.categoria !== 'olhos') {
        // Só passos de Tratamento são gateados por ingrediente.
        const target = detectTargetActive(step.name, step.ingredient)
        // Inalcançável desde que 'olhos' virou staple (as keywords de isOlhos cobrem as
        // deste branch). Mantido como rede: se os dois vocabulários divergirem, o passo
        // volta a ser omitido em silêncio em vez de cair no pool errado.
        if (target.kind === 'eye') continue
        if (target.kind === 'unknown') { resolved.push({ kind: 'sem_produto', step, ingrediente_alvo: step.ingredient }); continue }
        const pool = await poolFor(step.categoria, target.codes, pref) // gate pelo ativo-alvo
        // Ativo-alvo conhecido e nada casou → sem_produto honesto. Se o que zerou o
        // pool foi o CORTE CLÍNICO, a mensagem é outra (ver `motivoClinico`).
        if (pool.elegiveis.length === 0) {
          resolved.push(pool.cortadosPorClinica > 0
            ? { kind: 'sem_produto_clinico', step }
            : { kind: 'sem_produto', step, ingrediente_alvo: step.ingredient })
          continue
        }
        resolved.push({ kind: 'ia', step, produtos: pool.elegiveis, iaIndex: iaCounter++ })
      } else {
        // Staples (limpeza/tonico/hidratante/oclusivo/protetor) e 'Barreira' → SEM gate.
        // Nudge por intenção só quando há passos-irmãos na mesma categoria (desempate).
        const sibling = (catCount.get(step.categoria) ?? 0) > 1
        const pool = await poolFor(step.categoria, undefined, sibling ? pref : undefined)
        if (pool.elegiveis.length === 0) {
          // ⚠️ AQUI A INVARIANTE ANTIGA FOI QUEBRADA DE PROPÓSITO. A regra era
          // "staple NUNCA vira sem_produto, omite em silêncio" — e ela continua
          // valendo para LACUNA DE CATÁLOGO (problema nosso, que não informa nada
          // a ela). Mas quando quem esvaziou o pool foi o CORTE CLÍNICO, a causa é
          // sobre a PELE dela e ela precisa ver: sumir com o passo de limpeza sem
          // dizer nada, com a barreira comprometida, esconde justamente o recado
          // que importa ("não use ácido agora").
          if (pool.cortadosPorClinica > 0) resolved.push({ kind: 'sem_produto_clinico', step })
          continue
        }
        resolved.push({ kind: 'ia', step, produtos: pool.elegiveis, iaIndex: iaCounter++ })
      }
    }

    const iaSteps = resolved.filter((r): r is Extract<Resolved, { kind: 'ia' }> => r.kind === 'ia')

    if (resolved.length === 0) {
      // Nada a recomendar: salva vazio (mantém a guarda de "gerar uma vez") e retorna.
      await supabase.from('recomendacoes_produtos')
        .upsert({ user_id, scan_id: resolvedScanId, recomendacao: [] }, { onConflict: 'user_id', ignoreDuplicates: !regenerate })
        .select().maybeSingle()
      return json({ recomendacao: [], empty: true })
    }

    // ── Camada de IA: escolhe 1–3 por passo, marca principal, escreve copy ────
    const systemPrompt = `Você é uma dermatologista consultora brasileira. Sua tarefa é montar a lista de produtos recomendados para a usuária, passo a passo, escolhendo APENAS dentro do conjunto de produtos elegíveis que já passaram por um filtro de segurança. Toda saída em português brasileiro.

REGRAS INVIOLÁVEIS:
1. Para cada passo, escolha de 1 a 3 produtos SOMENTE da lista "produtos_elegiveis" daquele passo. NUNCA invente produto nem use um id que não esteja na lista. Use exatamente o "produto_id" fornecido.
2. Marque EXATAMENTE 1 produto como principal (o melhor para ela naquele passo). Os demais são alternativas.
3. Traga de 1 a 3 produtos por passo. Quando o pool tiver alternativas genuinamente boas e DISTINTAS entre si, PREFIRA trazer 2 ou 3 (1 principal + 1–2 alternativas) para a usuária ter opções na tela. Não force: se só houver 1 produto realmente adequado, traga 1 — e jamais inclua um produto ruim ou redundante só para chegar a 3.
4. NÃO recomende um produto que a usuária já disse usar (ver "ja_usa") nem um que ela JÁ TEM EM CASA (ver "ja_tem_em_casa"). Compare por marca e nome.
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
      // Minha Coleção: o que ela JÁ TEM EM CASA. Os passos que esses produtos
      // preenchem nem chegam aqui, mas a lista vai junto para a regra 4 ("não
      // recomende produto que ela já tem") valer nos passos restantes — senão o
      // catálogo sugeriria comprar de novo um creme que está na pia dela.
      ja_tem_em_casa: colecao
        .map((c) => [c.produto_marca, c.produto_nome].filter(Boolean).join(' '))
        .filter((s) => s.length > 0),
    }
    const passosInput = iaSteps.map((e) => ({
      index: e.iaIndex,
      passo: e.step.name,
      // Rótulo p/ a IA. Em olhos, `label` seria 'Hidratação'/'Tratamento' e induziria copy
      // de produto facial ("ótimo hidratante para você") sobre um creme de olhos.
      // NÃO afeta o JSON salvo nem a tela: a exibição continua vindo de `step.label`.
      categoria: e.step.categoria === 'olhos' ? 'Olhos' : e.step.label,
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

      // Passo com o produto que ELA escolheu ("Adicionar à minha rotina"). Não
      // passa pela camada de IA: a escolha é dela, não há o que decidir.
      // `fixado: true` vai no JSON para a tela saber que aquele passo é escolha
      // dela (o botão do detalhe nasce em "Na sua rotina") e para a Rotina mostrar
      // a foto do produto no lugar do ícone do passo.
      if (r.kind === 'fixado') {
        const p = r.produto
        // Alternativas: as que já estavam no passo (preservando a copy que a IA
        // escreveu) ou, na falta delas, o topo do pool elegível — assim o card
        // continua oferecendo opções em vez de virar um item solto.
        const outras = (r.anteriores.length > 0
          ? r.anteriores.filter((x: any) => x?.produto_id && x.produto_id !== p.id)
          : r.pool.filter((q: any) => q.id !== p.id).slice(0, 2)
            .map((q: any) => ({ produto_id: q.id, principal: false, copy: synthCopy(q) }))
        ).slice(0, 2).map((x: any) => ({ ...x, principal: false }))

        const copyAnterior = r.anteriores.find((x: any) => x?.produto_id === p.id)?.copy
        recomendacao.push({
          categoria: r.step.label,
          passo: r.step.name,
          periodo,
          fixado: true,
          produtos: [
            { produto_id: p.id, principal: true, copy: (copyAnterior || '').trim() || synthCopy(p) },
            ...outras,
          ],
        })
        // Registra o principal para os passos-irmãos não escolherem o mesmo produto.
        const catFix = r.step.categoria
        const usedFix = usedPrincipalByCat.get(catFix) ?? new Set<string>()
        usedFix.add(p.id)
        usedPrincipalByCat.set(catFix, usedFix)
        continue
      }

      // Passo preenchido pelo que ela JÁ TEM EM CASA. `produtos: []` de propósito:
      // o passo está resolvido, o catálogo não entra (nem como alternativa) — é a
      // regra "recomenda do mercado só o que falta ou não serve". O app resolve
      // nome/marca/foto por `em_casa` (a foto é `image_path` no bucket privado
      // `product-scans`, assinada na leitura), não pela tabela `produtos`.
      if (r.kind === 'em_casa') {
        const it = r.item
        recomendacao.push({
          categoria: r.step.label,
          passo: r.step.name,
          periodo,
          em_casa: {
            colecao_id: it.id,
            nome: it.produto_nome,
            marca: it.produto_marca,
            // Foto: sempre a que ELA tirou (bucket privado `product-scans`,
            // assinada na leitura) — todo item da Coleção entrou por um scan dela.
            image_path: it.image_path,
            compatibilidade: it.compatibilidade,
            veredito: it.veredito,
            copy: synthCopyEmCasa(it),
          },
          produtos: [],
        })
        continue
      }

      // Escolha anterior do catálogo, mantida intacta (ver `preservar_catalogo`).
      if (r.kind === 'preservado') {
        recomendacao.push({ ...r.entry, categoria: r.step.label, passo: r.step.name, periodo })
        // Registra o principal preservado: sem isto, um passo-irmão recalculado
        // poderia escolher exatamente o mesmo produto que o passo preservado usa.
        const catPrev = r.step.categoria
        const usedPrev = usedPrincipalByCat.get(catPrev) ?? new Set<string>()
        const principalPrev = (r.entry.produtos ?? []).find((x: any) => x?.principal)?.produto_id
          ?? (r.entry.produtos ?? [])[0]?.produto_id
        if (principalPrev) { usedPrev.add(principalPrev); usedPrincipalByCat.set(catPrev, usedPrev) }
        continue
      }

      // Estado vazio CLÍNICO: tínhamos produto na categoria, mas nenhum é seguro
      // pra ela agora. `sem_produto: true` para a tela já saber desenhar um card
      // vazio; `motivo_clinico` distingue da lacuna de catálogo (copy e título são
      // outros, e este vale inclusive para staple).
      if (r.kind === 'sem_produto_clinico') {
        const copia = copiaEstadoVazioClinico(cortesClinicos)
        recomendacao.push({
          categoria: r.step.label,
          passo: r.step.name,
          periodo,
          produtos: [],
          sem_produto: true,
          motivo_clinico: true,
          titulo: copia.titulo,
          motivo: copia.motivo,
        })
        continue
      }

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
      .upsert({ user_id, scan_id: resolvedScanId, recomendacao }, { onConflict: 'user_id', ignoreDuplicates: !regenerate })
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

    // ── Compatibilidade: responde AGORA, pontua DEPOIS ───────────────────────
    // A nota de cada produto recomendado é uma 2ª chamada de IA (~5–15 s). Rodá-la
    // antes de responder deixaria a usuária legada esperando ainda mais no estado
    // "Montando sua recomendação", que já é lento. Com `waitUntil` (mesmo padrão do
    // pós-stream do niks-chat) a tela recebe a recomendação assim que ela existe e
    // as notas entram na linha em seguida — a tela as pega no refetch.
    // ⚠️ Só pontua o que NÃO tem nota. Com `preservar_catalogo`, passo intocado
    // mantém produto E nota → o caminho de "Adicionar à minha rotina" normalmente
    // não dispara nenhuma chamada.
    const contextoClinico = buildContextoClinico(user, scan)
    const semNota = produtosSemNota(recomendacao)
    if (semNota.length > 0) {
      const tarefa = pontuarEGravar(supabase, user_id, contextoClinico, semNota, cortesClinicos)
      // `EdgeRuntime` não é tipado no Deno do Supabase; o cast segue o uso do niks-chat.
      const rt = (globalThis as any).EdgeRuntime
      if (rt?.waitUntil) rt.waitUntil(tarefa)
      else void tarefa // ambiente sem waitUntil: roda solto, sem segurar a resposta
    }

    return json({ recomendacao: inserted.recomendacao })
  } catch (err) {
    console.error('[recomendar-produtos] erro:', err)
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
