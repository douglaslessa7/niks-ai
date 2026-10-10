// ─────────────────────────────────────────────────────────────────────────────
// montar-rotina-com-produtos — "Pronto, montar minha rotina" (plano da Rotina).
// UMA chamada de IA com as imagens de até 7 produtos que ela tem em casa + os dados da
// pele + a rotina ideal: diz, por produto, se identificou, se serve e por quê, e monta
// a rotina dela com os que servem (manhã/noite, ordem, dias) + o que falta da ideal.
//
// DOIS modos (JWT da usuária; o user_id vem do token, nunca do corpo):
//
// • LOTE (Fase 6 — o que o app usa): { caminhos: string[], tem_rotulo: boolean[] }
//   Os caminhos são as imagens combinadas no bucket `rotina-lotes`
//   ({user_id}/{lote_id}/{n}.jpg; ao lado, {n}-frente.jpg = só a frente). Confere o
//   teto (1 lote por dia, fuso de Brasília; lote com erro não conta → 429), cria a
//   linha em `rotina_lotes` ('processando') e responde NA HORA { lote_id } (202). Em
//   segundo plano (EdgeRuntime.waitUntil): IA → conferência → cada produto
//   IDENTIFICADO vira um produto escaneado (`product_scans`, foto da frente no bucket
//   product-scans) e entra na estante (`colecao_produtos`; se já está lá — mesma marca
//   e nome —, reaproveita) → grava `resultado` (com o `colecao_item_id` de cada
//   produto) → TROCA A MINHA ROTINA pela montada, automaticamente (função do banco
//   `aplicar_lote_rotina`; rotina montada vazia não apaga a atual) → 'pronto' → push →
//   recortes sem fundo (por último: não atrasam o aviso). Falhou → 'erro' + push.
//
// • DIRETO (Fase 0, testes): { produtos: [{ base64, mimeType?, tem_rotulo }] }
//   Responde o resultado na hora e não grava nada.
//
// Saída da IA: o JSON do prompt (produtos — com `uso` {diario, dias} — / rotina — cada
//   passo com `dias`, null = todo dia — / fora_da_rotina / faltam / cobre_tudo),
//   depois da conferência determinística abaixo.
// ─────────────────────────────────────────────────────────────────────────────
import { verifyJWT } from '../_shared/jwt.ts'
import { createSupabaseClient, buildContext } from '../analisar-produto/context.ts'
import { buildContextPack } from '../analisar-produto/prompt.ts'
import { MONTAR_ROTINA_SYSTEM_PROMPT } from './prompt.ts'
import { ensureScanCutout, norm, sameBrand, sameName } from '../_shared/scanCutout.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const MAX_PRODUTOS = 7
const MAX_BASE64 = 3_000_000 // ~2,2 MB por imagem — a de 1024×1536 em JPEG 85 fica bem abaixo
const MODELO = 'gpt-5.4-mini'

function extractJSON(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('Nenhum objeto JSON na resposta do modelo')
  return JSON.parse(text.slice(start, end + 1))
}

// Frequência: só as abreviações do app, na ordem da semana, sem repetição. Vazio ou os
// 7 dias = todo dia (null). Aceita variações da IA ("seg", "Sab", "segunda").
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
function normalizarDias(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const chave = (x: unknown) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 3)
  const pedidos = new Set(v.map(chave))
  const ok = DIAS.filter((d) => pedidos.has(chave(d)))
  return ok.length && ok.length < 7 ? ok : null
}

// Conferência determinística: o prompt manda, mas a regra de segurança não pode
// depender só dele. Produto não identificado ou "evitaria" NUNCA fica na rotina; todo
// produto identificado fora da rotina aparece em fora_da_rotina.
function conferir(r: any, total: number): any {
  // Frequência de cada produto normalizada: { diario, dias } coerentes entre si.
  const produtos: any[] = (Array.isArray(r?.produtos) ? r.produtos : []).map((p: any) => {
    if (p?.identificado !== true) return { ...p, uso: null }
    const dias = p?.uso?.diario === true ? null : normalizarDias(p?.uso?.dias)
    return { ...p, uso: { diario: !dias, dias } }
  })
  const porIndice = new Map(produtos.map((p) => [Number(p?.indice), p]))
  const serve = (i: number) => {
    const p = porIndice.get(i)
    return !!p && p.identificado === true && (p.veredito === 'pode_usar' || p.veredito === 'com_ressalva')
  }
  const rotina = { am: [] as any[], pm: [] as any[] }
  const removidos = new Set<number>()
  for (const per of ['am', 'pm'] as const) {
    for (const s of Array.isArray(r?.rotina?.[per]) ? r.rotina[per] : []) {
      const i = Number(s?.produto_indice)
      if (!serve(i)) { removidos.add(i); continue }
      // O passo nasce com os dias do produto (os do próprio passo, se o produto não disse).
      const dias = porIndice.get(i)?.uso?.dias ?? normalizarDias(s?.dias)
      rotina[per].push({ ...s, dias })
    }
  }
  const naRotina = new Set([...rotina.am, ...rotina.pm].map((s) => Number(s.produto_indice)))
  const fora: any[] = Array.isArray(r?.fora_da_rotina) ? r.fora_da_rotina.filter((f: any) => !naRotina.has(Number(f?.produto_indice))) : []
  const jaFora = new Set(fora.map((f) => Number(f.produto_indice)))
  for (let i = 1; i <= total; i++) {
    const p = porIndice.get(i)
    if (!naRotina.has(i) && !jaFora.has(i) && p?.identificado === true) {
      fora.push({ produto_indice: i, motivo: p.motivo ?? 'Ficou fora da rotina.' })
    }
  }
  if (removidos.size) console.warn('MONTAR_ROTINA_CONFERENCIA removeu da rotina:', [...removidos])
  return { ...r, produtos, rotina, fora_da_rotina: fora }
}

// Chamada à IA (com 2 novas tentativas em 500/503) + conferência. Lança em falha.
async function analisar(context: any, produtos: { base64: string; mimeType?: string; tem_rotulo: boolean }[]) {
  // Mesmo formato de blocos do analisar-produto; aqui o protocolo é a rotina IDEAL.
  const pack = buildContextPack(context)
    .replace('<CurrentProtocol>', '<IdealRoutine>')
    .replace('</CurrentProtocol>', '</IdealRoutine>')

  const userContent: any[] = [{
    type: 'text',
    text: `${pack}\n\nSão ${produtos.length} produtos, na ordem abaixo. Analise cada um e monte a rotina segundo o contexto acima.`,
  }]
  produtos.forEach((p, i) => {
    userContent.push({
      type: 'text',
      text: `Produto ${i + 1} — ${p.tem_rotulo ? 'frente em cima, rótulo de ingredientes embaixo' : 'só a frente (ela pulou a foto do rótulo)'}:`,
    })
    userContent.push({
      type: 'image_url',
      // Detalhe ALTO: sem isso o modelo pode ler a imagem reduzida e perder o rótulo.
      image_url: { url: `data:${p.mimeType || 'image/jpeg'};base64,${p.base64}`, detail: 'high' },
    })
  })

  const t0 = Date.now()
  let data: any = null
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
      body: JSON.stringify({
        model: MODELO,
        // Teto de SAÍDA inclui o raciocínio; 7 produtos + rotina pedem folga (lição do
        // analyze-skin: teto curto devolve o JSON cortado, sem erro). NÃO baixar.
        max_completion_tokens: 16000,
        // Raciocínio LIGADO: sem ele (padrão do modelo = 0 tokens de raciocínio) a 1ª
        // versão leu bem os rótulos mas julgou mal — cortou 6 de 7 produtos, inclusive o
        // único protetor. "low" manteve o julgamento com ~1/4 do tempo do "medium".
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: MONTAR_ROTINA_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    })
    data = await res.json()
    if ((res.status === 500 || res.status === 503) && tentativa < 3) {
      await new Promise((r) => setTimeout(r, 3000))
      continue
    }
    break
  }
  const ms = Date.now() - t0

  const texto = data?.choices?.[0]?.message?.content
  if (!texto) throw new Error(`OpenAI sem resposta: ${JSON.stringify(data).slice(0, 300)}`)
  const resultado = conferir(extractJSON(texto), produtos.length)
  return { resultado, medicao: { modelo: MODELO, ms, usage: data.usage, finish_reason: data.choices[0].finish_reason } }
}

// ── Modo LOTE ────────────────────────────────────────────────────────────────
const BUCKET_LOTES = 'rotina-lotes'

/** 00:00 de hoje no fuso de Brasília (UTC−3, sem horário de verão), em ISO. */
function inicioDoDiaBrasilia(agora = new Date()): string {
  const br = new Date(agora.getTime() - 3 * 3600_000)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3)).toISOString()
}

function paraBase64(bytes: Uint8Array): string {
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH))
  return btoa(bin)
}

async function baixar(supabase: any, path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(BUCKET_LOTES).download(path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

async function enviarPush(supabase: any, userId: string, title: string, body: string, data: Record<string, unknown>) {
  const { data: u } = await supabase.from('users').select('push_token').eq('id', userId).maybeSingle()
  const to = u?.push_token
  if (!to || to === 'simulator-token') return false
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
    body: JSON.stringify([{ to, title, body, sound: 'default', data }]),
  }).catch(() => null)
  return !!res?.ok
}

// O que o app lê de um produto escaneado (formato do analisar-produto, ver
// components/product/ProductAnalysis.tsx) a partir do que o lote disse do produto.
function resultadoDoScan(p: any) {
  return {
    status: 'ok',
    origem: 'montar_rotina',
    produto: {
      nome: p.nome ?? null, marca: p.marca ?? null, categoria: p.categoria ?? null,
      ativos_detectados: Array.isArray(p.ativos_detectados) ? p.ativos_detectados : [],
    },
    confianca: p.precisao === 'baixa' ? 'media' : 'alta',
    nota: p.leu_rotulo ? null : 'Sem a lista de ingredientes, essa análise é menos exata.',
    veredito: p.veredito ?? null,
    compatibilidade: typeof p.compatibilidade === 'number' ? Math.round(p.compatibilidade) : null,
    resumo: p.motivo ?? null,
    explicacao: null,
    avisos: Array.isArray(p.avisos) ? p.avisos : [],
    uso: p.uso ?? null,
  }
}

/**
 * Cada produto IDENTIFICADO → produto escaneado + item da estante. Já na estante (mesma
 * marca e nome) → reaproveita, sem duplicar. Devolve os scans novos (para o recorte).
 * Não identificado → nada (a tela mostra a mensagem combinada).
 */
async function paraEstante(supabase: any, userId: string, loteId: string, caminhos: string[], r: any): Promise<string[]> {
  const { data: estante } = await supabase
    .from('colecao_produtos').select('id, nome, marca').eq('user_id', userId)
  const scansNovos: string[] = []
  for (const p of r.produtos as any[]) {
    if (p?.identificado !== true) continue
    const i = Number(p.indice)
    const ja = (estante ?? []).find((c: any) =>
      sameBrand(norm(c.marca), norm(p.marca)) && sameName(norm(c.nome), norm(p.nome)))
    if (ja) { p.colecao_item_id = ja.id; continue }

    // Foto do produto: só a frente ({n}-frente.jpg); sem ela, a combinada.
    const base = caminhos[i - 1]
    const bytes = (await baixar(supabase, base.replace(/\.jpg$/, '-frente.jpg'))) ?? (await baixar(supabase, base))
    if (!bytes) continue
    const imagePath = `${userId}/${Date.now()}-${i}.jpg`
    const up = await supabase.storage.from('product-scans').upload(imagePath, bytes, { contentType: 'image/jpeg' })
    if (up.error) { console.warn('montar-rotina: upload da foto falhou', i, up.error.message); continue }

    const { data: scan, error: e1 } = await supabase.from('product_scans').insert({
      user_id: userId,
      image_path: imagePath,
      produto_nome: p.nome ?? null,
      produto_marca: p.marca ?? null,
      resultado: resultadoDoScan(p),
      client_scan_id: `lote:${loteId}:${i}`,
    }).select('id').single()
    if (e1 || !scan) { console.warn('montar-rotina: product_scans falhou', i, e1?.message); continue }

    const { data: item, error: e2 } = await supabase.from('colecao_produtos').insert({
      user_id: userId, origem: 'scan', product_scan_id: scan.id, imagem_url: imagePath,
      nome: p.nome ?? null, marca: p.marca ?? null, categoria: p.categoria ?? null,
      compatibilidade: typeof p.compatibilidade === 'number' ? Math.round(p.compatibilidade) : null,
    }).select('id').single()
    if (e2 || !item) { console.warn('montar-rotina: estante falhou', i, e2?.message); continue }
    p.colecao_item_id = item.id
    p.product_scan_id = scan.id
    scansNovos.push(scan.id)
    ;(estante ?? []).push({ id: item.id, nome: p.nome, marca: p.marca })
  }
  return scansNovos
}

async function processarLote(supabase: any, userId: string, loteId: string, caminhos: string[], temRotulo: boolean[]) {
  try {
    const imagens = await Promise.all(caminhos.map((c) => baixar(supabase, c)))
    if (imagens.some((b) => !b)) throw new Error('imagem do lote não encontrada no bucket')
    const context = await buildContext(supabase, userId, { rotina: 'ideal' })
    const { resultado, medicao } = await analisar(context, imagens.map((b, i) => ({
      base64: paraBase64(b!), mimeType: 'image/jpeg', tem_rotulo: !!temRotulo[i],
    })))
    const scansNovos = await paraEstante(supabase, userId, loteId, caminhos, resultado)

    // Grava o resultado, troca a Minha rotina pela montada (automático — decisão de
    // 09/10; rotina vazia não apaga a atual) e SÓ ENTÃO marca 'pronto'.
    const { error: eRes } = await supabase.from('rotina_lotes')
      .update({ resultado: { ...resultado, _medicao: medicao } }).eq('id', loteId)
    if (eRes) throw new Error(`gravar resultado: ${eRes.message}`)
    const { data: passos, error: eApl } = await supabase.rpc('aplicar_lote_rotina', { p_lote: loteId })
    if (eApl) throw new Error(`aplicar rotina: ${eApl.message}`)
    await supabase.from('rotina_lotes').update({ status: 'pronto', concluido_em: new Date().toISOString() }).eq('id', loteId)
    console.log('MONTAR_ROTINA_LOTE', JSON.stringify({ userId, loteId, produtos: caminhos.length, passos, ...medicao }))

    if (await enviarPush(supabase, userId, 'Sua rotina está pronta ✨', 'Montei uma rotina com os produtos que você tem. Toque para ver.', { type: 'rotina_lote', lote_id: loteId })) {
      await supabase.from('rotina_lotes').update({ notificado_em: new Date().toISOString() }).eq('id', loteId)
    }

    // Recortes sem fundo por último, um de cada vez (não atrasam o aviso). Se o tempo
    // da função acabar no meio, o app pede os que faltarem (recorte_status ainda null).
    for (const scanId of scansNovos) {
      await supabase.from('product_scans').update({ recorte_status: 'pendente' }).eq('id', scanId).is('recorte_status', null)
      const r = await ensureScanCutout(supabase, scanId).catch(() => ({ status: 'falhou' }))
      // O item da estante sai do "carregando" (com recorte ou com a foto).
      await supabase.from('colecao_produtos').update({ recorte_status: r.status === 'ok' ? 'ok' : 'falhou' }).eq('product_scan_id', scanId)
    }
  } catch (e) {
    console.error('montar-rotina-com-produtos: lote falhou', loteId, e)
    await supabase.from('rotina_lotes').update({
      status: 'erro', erro: String((e as Error)?.message ?? e).slice(0, 500), concluido_em: new Date().toISOString(),
    }).eq('id', loteId)
    if (await enviarPush(supabase, userId, 'Não deu para montar sua rotina', 'Suas fotos estão guardadas. Toque para tentar de novo.', { type: 'rotina_lote', lote_id: loteId })) {
      await supabase.from('rotina_lotes').update({ notificado_em: new Date().toISOString() }).eq('id', loteId)
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const jwt = await verifyJWT(authHeader.slice(7))
    if (!jwt?.sub) return json({ error: 'Unauthorized' }, 401)
    const userId = jwt.sub
    const body = await req.json().catch(() => null)
    const supabase = createSupabaseClient()

    // ── LOTE ──
    if (Array.isArray(body?.caminhos)) {
      const caminhos: string[] = body.caminhos
      const temRotulo: boolean[] = Array.isArray(body?.tem_rotulo) ? body.tem_rotulo.map(Boolean) : []
      if (caminhos.length < 1 || caminhos.length > MAX_PRODUTOS || temRotulo.length !== caminhos.length) {
        return json({ error: `Envie de 1 a ${MAX_PRODUTOS} produtos` }, 400)
      }
      // Só a pasta DELA, e só as imagens combinadas ({lote}/{n}.jpg).
      if (!caminhos.every((c) => typeof c === 'string' && c.startsWith(`${userId}/`) && /^[^/]+\/[^/]+\/\d+\.jpg$/.test(c))) {
        return json({ error: 'Caminho de imagem inválido' }, 400)
      }
      // Teto: 1 lote por dia (erro não conta).
      const { count } = await supabase.from('rotina_lotes').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).neq('status', 'erro').gte('criado_em', inicioDoDiaBrasilia())
      if ((count ?? 0) >= 1) return json({ error: 'Você já montou uma rotina hoje.' }, 429)

      const { data: lote, error } = await supabase.from('rotina_lotes')
        .insert({ user_id: userId, caminhos, tem_rotulo: temRotulo }).select('id').single()
      if (error || !lote) {
        console.error('montar-rotina-com-produtos: criar lote falhou', error)
        return json({ error: 'Erro ao montar a rotina' }, 500)
      }
      EdgeRuntime.waitUntil(processarLote(supabase, userId, lote.id, caminhos, temRotulo))
      return json({ lote_id: lote.id }, 202)
    }

    // ── DIRETO (testes) ──
    const produtos = Array.isArray(body?.produtos) ? body.produtos : []
    if (produtos.length < 1 || produtos.length > MAX_PRODUTOS) {
      return json({ error: `Envie de 1 a ${MAX_PRODUTOS} produtos` }, 400)
    }
    for (const p of produtos) {
      if (typeof p?.base64 !== 'string' || !p.base64 || p.base64.length > MAX_BASE64) {
        return json({ error: 'Imagem de produto ausente ou grande demais' }, 400)
      }
    }
    const context = await buildContext(supabase, userId, { rotina: 'ideal' })
    const { resultado, medicao } = await analisar(context, produtos)
    console.log('MONTAR_ROTINA_MEDICAO', JSON.stringify({ userId, produtos: produtos.length, ...medicao }))
    return json({ ...resultado, _medicao: medicao })
  } catch (e) {
    console.error('montar-rotina-com-produtos: erro', e)
    return json({ error: 'Erro ao montar a rotina' }, 500)
  }
})
