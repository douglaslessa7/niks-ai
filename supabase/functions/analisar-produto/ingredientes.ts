// Tabela de ingredientes no scan de produto (nov/2026).
// 1) Haiku identifica marca/nome na foto (em paralelo com o contexto).
// 2) O código procura a lista na tabela `produtos_ingredientes` (só status 'ok').
// 3) A lista vai para a IA DEPOIS da marca de cache (textoExtra), com a origem.
// 4) Rótulo lido num scan → transcrição (Sonnet) gravada na tabela, em segundo plano.
// 5) Produto sem linha → busca na internet em segundo plano (Haiku + conferências do código),
//    só se `reservar_busca` liberar (busca ligada em ingredientes_config + teto do dia).
// Qualquer falha aqui só faz o scan seguir como antes (sem lista).
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import { contasDisponiveis } from '../_shared/anthropic-contas.ts'
import { chaveProduto, conferirLista, escolherLinha, origemLegivel, tipoDaFonte, type LinhaTabela } from '../_shared/ingredientes.ts'

// deno-lint-ignore no-explicit-any
type Supabase = any
type Imagem = { base64: string; mimeType: string }

const HAIKU = 'claude-haiku-5-5'
const SONNET = 'claude-sonnet-5-5'
const PRECO: Record<string, { i: number; o: number; r: number; w: number }> = {
  [HAIKU]: { i: 0.10, o: 0.50, r: 0.01, w: 0.125 },
  [SONNET]: { i: 2, o: 10, r: 0.10, w: 2.5 },
}
const POR_BUSCA = 0.01
const TEMPO_IDENTIFICAR_MS = 6000

export interface Identificacao { marca: string | null; nome: string | null; tem_lista: boolean; ms: number }
export interface ListaAchada { linha: LinhaTabela; correspondencia: 'exata' | 'provavel'; chave: string }

const IDENT = `Você identifica produtos de skincare pela foto. Leia a marca e o nome do produto como estão na embalagem (sem tamanho/volume). Diga também se alguma foto mostra a lista de ingredientes (INCI/composição) completa e legível. Responda só no formato pedido.`
const SCHEMA_IDENT = {
  type: 'object', additionalProperties: false, required: ['marca', 'nome', 'tem_lista_ingredientes'],
  properties: { marca: { type: ['string', 'null'] }, nome: { type: ['string', 'null'] }, tem_lista_ingredientes: { type: 'boolean' } },
}
const TRANSC = `Você transcreve a lista de ingredientes (INCI / composição) impressa na embalagem da foto.
Regras: copie exatamente, na ordem, um ingrediente por item; não corrija, não traduza, não complete. Palavra ilegível → "?". Se a foto não mostra uma lista de ingredientes legível (só a frente, só o modo de uso, lista cortada pela metade), inci = null.
Concentrações só se estiverem impressas (ex.: "Niacinamide 10%"). Leia também marca e nome como estão na embalagem (sem tamanho).`
const SCHEMA_TRANSC = {
  type: 'object', additionalProperties: false, required: ['marca', 'nome', 'inci', 'concentracoes', 'lista_completa'],
  properties: {
    marca: { type: ['string', 'null'] }, nome: { type: ['string', 'null'] },
    inci: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
    concentracoes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ingrediente', 'valor'], properties: { ingrediente: { type: 'string' }, valor: { type: 'string' } } } },
    lista_completa: { type: 'boolean' },
  },
}
const BUSCA = `Você encontra a lista COMPLETA de ingredientes (INCI) de um produto de skincare vendido no Brasil.
- Faça 1 busca. Depois LEIA (web_fetch) a página mais confiável dos resultados e copie a lista de lá; os trechos da busca não bastam. Leia no máximo 2 páginas.
- Ordem de preferência: site oficial da marca no Brasil; site oficial global; bases de INCI (incidecoder.com, skinsort.com, cosdna.com). Loja só se não houver outra.
- Só aceite a lista do MESMO produto: mesmo nome, mesma variação (FPS, cor, %). Produto parecido ou outro da linha → encontrado = false.
- Copie os nomes INCI como estão na página (em inglês/latim), na ordem, sem traduzir, inventar ou completar. Lista parcial → encontrado = false.
- "fonte_url": copie EXATAMENTE a URL da página que você leu com web_fetch.
- "nome_na_fonte": o nome do produto como aparece na página.
- "pais_versao": de que país é a fórmula da página ("Brasil", "EUA", "Coreia", ... ou "não indicado").
- Se a página mostra mais de uma fórmula, use a mais recente e diga qual em "observacao".
Ao terminar, responda SÓ com um JSON, sem texto antes ou depois:
{"encontrado": true|false, "inci": ["..."], "concentracoes": [{"ingrediente": "...", "valor": "..."}], "fonte_url": "...", "fonte_tipo": "site_oficial"|"base_inci"|"loja", "nome_na_fonte": "...", "pais_versao": "...", "observacao": "..."}`

const custo = (modelo: string, us: any) => {
  const p = PRECO[modelo]
  return ((us?.input_tokens ?? 0) * p.i + (us?.output_tokens ?? 0) * p.o + (us?.cache_read_input_tokens ?? 0) * p.r + (us?.cache_creation_input_tokens ?? 0) * p.w) / 1e6
    + (us?.server_tool_use?.web_search_requests ?? 0) * POR_BUSCA
}

async function cliente(supabase: Supabase): Promise<{ client: Anthropic; conta: number } | null> {
  const { contas } = await contasDisponiveis(supabase)
  if (!contas.length) return null
  return { client: new Anthropic({ apiKey: contas[0].apiKey, maxRetries: 0 }), conta: contas[0].id }
}

async function registrar(supabase: Supabase, funcao: string, userId: string, modelo: string, us: any, ms: number, conta: number) {
  try {
    await supabase.from('ia_custos').insert({
      funcao, user_id: userId, provedor: 'anthropic', modelo, esforco: 'low',
      input_tokens: us?.input_tokens ?? 0, cache_write_tokens: us?.cache_creation_input_tokens ?? 0, cache_read_tokens: us?.cache_read_input_tokens ?? 0,
      output_tokens: us?.output_tokens ?? 0, custo_usd: Number(custo(modelo, us).toFixed(6)), duracao_ms: ms, anthropic_conta: conta,
    })
  } catch (e) { console.error('ingredientes: custo', e) }
}

const imgBloco = (img: Imagem) => ({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/jpeg', data: img.base64 } })
const textoDe = (msg: any) => (msg?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
const jsonDe = (t: string) => { try { return JSON.parse(t) } catch { const m = t.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null } catch { return null } } }

/** 1) Haiku identifica o produto (≈ 2–3 s). Falha ou demora → null (scan segue sem lista). */
export async function identificar(supabase: Supabase, userId: string, imagens: Imagem[], funcaoCusto: string): Promise<Identificacao | null> {
  const t0 = Date.now()
  try {
    const c = await cliente(supabase)
    if (!c) return null
    const msg: any = await c.client.messages.create({
      model: HAIKU, max_tokens: 400, thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_IDENT } },
      system: IDENT, messages: [{ role: 'user', content: [...imagens.slice(0, 2).map(imgBloco), { type: 'text', text: 'Identifique o produto.' }] }],
    } as any, { timeout: TEMPO_IDENTIFICAR_MS })
    const ms = Date.now() - t0
    EdgeRuntime.waitUntil(registrar(supabase, funcaoCusto, userId, HAIKU, msg.usage, ms, c.conta))
    const s = jsonDe(textoDe(msg))
    if (!s) return null
    return { marca: s.marca ?? null, nome: s.nome ?? null, tem_lista: !!s.tem_lista_ingredientes, ms }
  } catch (e) {
    console.error('ingredientes: identificar', (e as Error)?.message ?? e)
    return null
  }
}

/** 2) Procura a lista na tabela (só status 'ok'), pela chave ou pelo nome mais parecido da mesma marca. */
export async function procurarNaTabela(supabase: Supabase, marca: string | null, nome: string | null): Promise<{ achada: ListaAchada | null; temLinha: boolean; chave: string; marca_norm: string; nome_norm: string }> {
  const k = chaveProduto(marca, nome)
  if (!marca || !nome || !k.marca_norm || !k.nome_norm) return { achada: null, temLinha: true, ...k }
  const { data, error } = await supabase.from('produtos_ingredientes')
    .select('chave, marca, nome, nome_norm, nomes_alternativos, inci, fonte, fonte_url, confianca, status, versao_na_fonte, nome_na_fonte:conferencias->>nome_na_fonte')
    .eq('marca_norm', k.marca_norm).limit(400)
  if (error) { console.error('ingredientes: tabela', error.message); return { achada: null, temLinha: true, ...k } }
  const linhas = (data ?? []) as LinhaTabela[]
  const temLinha = linhas.some((l) => l.chave === k.chave)
  const ok = linhas.filter((l) => l.status === 'ok' && Array.isArray(l.inci) && l.inci.length >= 5)
  const e = escolherLinha(nome, ok, k.chave)
  return { achada: e ? { ...e, chave: k.chave } : null, temLinha, ...k }
}

/** 3) Bloco que vai depois da marca de cache. */
export function blocoDaLista(a: ListaAchada): string {
  const l = a.linha
  const rotulo = l.fonte === 'rotulo'
  return `\n\n<IngredientesConhecidos produto="${l.marca} — ${l.nome}" correspondencia="${a.correspondencia}">\n${(l.inci ?? []).join(', ')}\n</IngredientesConhecidos>\n` +
    `Regras desta lista (guardada pelo NIKS, não lida nesta foto):\n` +
    `- Use-a só se a foto for desse MESMO produto (mesmo nome e variação: FPS, %, cor). Outro produto ou outra variação → ignore a lista e analise como se ela não existisse.\n` +
    `- Inclua no MESMO objeto JSON da resposta (no nível de cima, junto de "status") a chave "lista_conhecida_confere": true se usou a lista, false se ignorou. Nunca escreva um segundo objeto JSON nem texto depois do JSON.\n` +
    `- Se a foto também mostra a lista de ingredientes legível, vale a da foto.\n` +
    `- Não diga em nenhum texto (nota, explicação, avisos) de onde veio essa lista (site, base, rótulo de outro scan): o app acrescenta a origem numa linha própria.\n` +
    (rotulo
      ? `- Esta lista veio de um rótulo lido: pode tratá-la como lista lida (confianca "alta").\n`
      : `- Esta lista veio da internet: confianca continua "media". Analise pelos ingredientes dela (não pela formulação de memória), sem cravar concentração que ela não informe.\n`)
}

// Inglês (etapa 3): a mesma origem do `origemLegivel` (_shared/ingredientes.ts), traduzida.
function origemLegivelEn(l: Pick<LinhaTabela, 'fonte' | 'fonte_url'>): string {
  const pt = origemLegivel(l)
  if (l.fonte === 'rotulo') return 'label read in another scan of this product'
  if (l.fonte === 'site_oficial') return pt.replace(/^site da marca/, 'brand website')
  if (l.fonte === 'base_inci') return pt.replace(/^base de INCI/, 'INCI database')
  return pt === 'internet' ? 'the web' : pt
}

/** Depois da IA: confiança coerente com a origem da lista, origem para o app (1.63) e para a nota. */
export function aplicarOrigem(result: any, a: ListaAchada | null, ident: Identificacao | null, idioma: 'pt' | 'en' = 'pt'): string[] {
  const mud: string[] = []
  if (!result || typeof result !== 'object') return mud
  const usou = !!a && result.lista_conhecida_confere === true
  delete result.lista_conhecida_confere
  if (!usou || !a) return mud
  const l = a.linha
  const origemTexto = idioma === 'en' ? origemLegivelEn(l) : origemLegivel(l)
  result.ingredientes_fonte = { tipo: l.fonte, origem: origemTexto, url: l.fonte_url, confianca: l.confianca, correspondencia: a.correspondencia }
  if (l.fonte !== 'rotulo' && !ident?.tem_lista && result.confianca === 'alta') {
    result.confianca = 'media'; mud.push('confianca alta→media (lista da internet)')
  }
  if (result.confianca === 'media') {
    const linha = idioma === 'en' ? `Ingredient list: ${origemTexto}.` : `Lista de ingredientes: ${origemLegivel(l)}.`
    if (!String(result.nota ?? '').includes(linha)) result.nota = result.nota ? `${result.nota}\n\n${linha}` : linha
  }
  return mud
}

/** 4) Transcreve o rótulo da foto (Sonnet). Devolve a linha a gravar, ou null. */
export async function transcreverRotulo(supabase: Supabase, userId: string, imagens: Imagem[], funcaoCusto: string): Promise<{ marca: string | null; nome: string | null; inci: string[]; concentracoes: any[] } | null> {
  const t0 = Date.now()
  const c = await cliente(supabase)
  if (!c) return null
  const msg: any = await c.client.messages.create({
    model: SONNET, max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_TRANSC } },
    system: TRANSC, messages: [{ role: 'user', content: [...imagens.slice(0, 2).map(imgBloco), { type: 'text', text: 'Transcreva a lista de ingredientes.' }] }],
  } as any)
  await registrar(supabase, funcaoCusto, userId, SONNET, msg.usage, Date.now() - t0, c.conta)
  const s = jsonDe(textoDe(msg))
  if (!s?.inci?.length || !s.lista_completa || s.inci.length < 5 || s.inci.some((i: string) => i.includes('?'))) return null
  return { marca: s.marca ?? null, nome: s.nome ?? null, inci: s.inci, concentracoes: s.concentracoes ?? [] }
}

/** 5) Busca na internet + conferências. Não grava: devolve o que gravaria. */
export async function buscarNaInternet(supabase: Supabase, userId: string, marca: string, nome: string, funcaoCusto: string) {
  const t0 = Date.now()
  const c = await cliente(supabase)
  if (!c) return null
  const msg: any = await c.client.messages.create({
    model: HAIKU, max_tokens: 6000, output_config: { effort: 'low' },
    tools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 1 },
      { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 2 },
    ],
    system: BUSCA, messages: [{ role: 'user', content: `Produto: ${marca} — ${nome}` }],
  } as any)
  await registrar(supabase, funcaoCusto, userId, HAIKU, msg.usage, Date.now() - t0, c.conta)
  const urlsLidas = (msg.content ?? []).filter((b: any) => b.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_result').map((b: any) => b.content.url)
  const s = jsonDe(textoDe(msg))
  if (!s?.encontrado || !Array.isArray(s.inci) || !s.inci.length) return { inci: null, fonte: null, fonte_url: null, passou: false, conferencias: { observacao: s?.observacao ?? null }, ms: Date.now() - t0 }
  const { passou, conferencias } = conferirLista({ marca, nome, ...s }, urlsLidas, [])
  return {
    inci: s.inci as string[], fonte: tipoDaFonte(s.fonte_url, marca), fonte_url: s.fonte_url ?? null, versao: s.pais_versao ?? null,
    concentracoes: s.concentracoes ?? [], passou, conferencias: { ...conferencias, passou, nome_na_fonte: s.nome_na_fonte ?? null, observacao: s.observacao ?? null },
    ms: Date.now() - t0,
  }
}

/** Grava na tabela (service role). Linha da busca que não passou fica 'revisar'. */
export async function gravar(supabase: Supabase, marca: string, nome: string, l: { inci: string[] | null; fonte: string | null; fonte_url?: string | null; fonte_scan?: string | null; confianca: string | null; concentracoes?: any[]; versao?: string | null; conferencias?: any; revisar?: boolean }) {
  const k = chaveProduto(marca, nome)
  const { data, error } = await supabase.rpc('gravar_ingredientes', {
    p_chave: k.chave, p_marca: marca, p_nome: nome, p_marca_norm: k.marca_norm, p_nome_norm: k.nome_norm,
    p_inci: l.inci, p_fonte: l.fonte, p_fonte_url: l.fonte_url ?? null, p_fonte_scan: l.fonte_scan ?? null,
    p_confianca: l.confianca, p_concentracoes: l.concentracoes ?? [], p_versao: l.versao ?? null, p_conferencias: l.conferencias ?? {},
  })
  if (error) { console.error('ingredientes: gravar', error.message); return null }
  if (l.revisar && ['criada', 'preenchida', 'atualizada'].includes(data)) await supabase.from('produtos_ingredientes').update({ status: 'revisar' }).eq('chave', k.chave)
  return data as string
}

/** Busca em segundo plano no 1º scan de um produto sem linha (só se reservar_busca liberar). */
export async function buscarEmSegundoPlano(supabase: Supabase, userId: string, marca: string, nome: string, funcaoCusto: string) {
  const k = chaveProduto(marca, nome)
  const { data: pode, error } = await supabase.rpc('reservar_busca', { p_chave: k.chave, p_marca: marca, p_nome: nome, p_marca_norm: k.marca_norm, p_nome_norm: k.nome_norm })
  if (error || !pode) return { reservou: false }
  const r = await buscarNaInternet(supabase, userId, marca, nome, funcaoCusto)
  if (!r) return { reservou: true, gravou: null }
  const gravou = await gravar(supabase, marca, nome, { ...r, confianca: r.inci ? 'media' : null, revisar: !r.passou })
  return { reservou: true, gravou }
}

// ── Montar minha rotina (lote, motor v2 — 19/nov/2026) ──────────────────────────────
// Mesma identificação do scan (Haiku, só a FRENTE), com a categoria numa lista fechada e o
// que estiver IMPRESSO na frente (FPS, porcentagens). A decisão é do código (_shared/motor/casa.ts).
const IDENT_ROTINA = `Você identifica um produto de skincare pela foto da FRENTE da embalagem.
- marca e nome: como estão escritos na embalagem (sem tamanho/volume). Se não dá para ler a marca OU o nome com segurança, devolva null nos dois.
- categoria: escolha UMA da lista. "limpeza" = gel, espuma, sabonete ou SOLUÇÃO de limpeza (se a embalagem diz "limpeza", é limpeza); "limpeza_oleosa" = óleo ou bálsamo de limpeza; "micelar" = água micelar ou demaquilante líquido; "hidratante" = hidratante, gel-creme e creme reparador/cicatrizante (ex.: Cicaplast, Cicabio, Bepantol); "oclusivo" = pomada/bálsamo reparador espesso; "tratamento" = secativo, gel antiacne ou tratamento com ácido; "outro" = não é de rosto ou não dá para saber.
- fps: só se estiver impresso (ex.: "FPS 50" → 50); senão null.
- concentracoes: só as porcentagens IMPRESSAS na frente (ex.: "Niacinamida 10%"); nunca de memória.
- corpo: true se o produto é para o corpo (não para o rosto).`
const SCHEMA_IDENT_ROTINA = {
  type: 'object', additionalProperties: false, required: ['marca', 'nome', 'categoria', 'fps', 'concentracoes', 'corpo'],
  properties: {
    marca: { type: ['string', 'null'] }, nome: { type: ['string', 'null'] },
    categoria: { type: 'string', enum: ['limpeza', 'limpeza_oleosa', 'micelar', 'tonico', 'serum', 'esfoliante', 'tratamento', 'olhos', 'hidratante', 'oclusivo', 'protetor', 'mascara', 'outro'] },
    fps: { type: ['number', 'null'] },
    concentracoes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ingrediente', 'valor'], properties: { ingrediente: { type: 'string' }, valor: { type: 'string' } } } },
    corpo: { type: 'boolean' },
  },
}
export interface IdentificacaoRotina { marca: string; nome: string; categoria: string; fps: number | null; concentracoes: { ingrediente: string; valor: string }[]; corpo: boolean }

/** Identifica UM produto do lote. null = não identificado (ou falha da IA). */
export async function identificarParaRotina(supabase: Supabase, userId: string, imagem: Imagem, funcaoCusto: string): Promise<IdentificacaoRotina | null> {
  const t0 = Date.now()
  try {
    const c = await cliente(supabase)
    if (!c) return null
    const msg: any = await c.client.messages.create({
      model: HAIKU, max_tokens: 600, thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_IDENT_ROTINA } },
      system: IDENT_ROTINA, messages: [{ role: 'user', content: [imgBloco(imagem), { type: 'text', text: 'Identifique o produto.' }] }],
    } as any, { timeout: 20000 })
    await registrar(supabase, funcaoCusto, userId, HAIKU, msg.usage, Date.now() - t0, c.conta)
    const s = jsonDe(textoDe(msg))
    if (!s?.marca || !s?.nome) return null
    return {
      marca: String(s.marca), nome: String(s.nome), categoria: String(s.categoria ?? 'outro'),
      fps: typeof s.fps === 'number' ? s.fps : null,
      concentracoes: Array.isArray(s.concentracoes) ? s.concentracoes : [],
      corpo: s.corpo === true,
    }
  } catch (e) {
    console.error('ingredientes: identificar (rotina)', (e as Error)?.message ?? e)
    return null
  }
}

/** Concentrações guardadas na tabela para esta linha. */
export async function concentracoesDaLinha(supabase: Supabase, chave: string): Promise<{ ingrediente: string; valor: string }[]> {
  const { data } = await supabase.from('produtos_ingredientes').select('concentracoes').eq('chave', chave).maybeSingle()
  return Array.isArray(data?.concentracoes) ? data.concentracoes : []
}
