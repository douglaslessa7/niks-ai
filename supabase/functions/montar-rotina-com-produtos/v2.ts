// ─────────────────────────────────────────────────────────────────────────────
// montar-rotina-com-produtos — LOTE no MOTOR NOVO (19/nov/2026).
// Quem passa por aqui: a chave `motor_config.lote_v2` (função SQL `usa_lote_v2`).
//
// A IA só IDENTIFICA e LÊ; quem decide é o código (`_shared/motor/casa.ts`):
//   1. cada foto → Haiku lê marca, nome, categoria, FPS e % impressos na frente
//      (`identificarParaRotina`, mesma conta de custos do scan de produto);
//   2. lista de ingredientes, nesta ordem:
//      a. RÓTULO fotografado (o app da loja, 1.62, pede a foto do rótulo): Sonnet transcreve
//         (`transcreverRotulo`, o mesmo do scan) e a lista vai para a tabela como 'rotulo';
//      b. tabela `produtos_ingredientes`;
//      c. produto sem linha na tabela → busca na internet (mesma regra do scan:
//         `reservar_busca`, teto do dia), esperando até 50 s;
//   3. rotina ideal do motor novo (refeita se a salva for do motor antigo; montada pelo perfil
//      quando a conta não tem rotina ideal nem scan — 22/nov/2026) → plano;
//   4. `decidirCasa`: o produto de casa que faz o mesmo papel entra; senão o do catálogo
//      ("Quero comprar"); quem fica de fora sai com o motivo;
//   5. grava: produto escaneado + estante (status 'tenho', motivo), resultado do lote e a
//      Minha rotina inteira (`aplicar_lote_rotina_v2`, com cópia da rotina anterior).
// `decidirLoteV2` faz 1–4 (com `salvar: false` não grava nem a rotina ideal: teste).
// Erro ANTES de gravar (1–4) → `AntesDeGravar`: o index volta para o lote antigo.
// ─────────────────────────────────────────────────────────────────────────────
// deno-lint-ignore-file no-explicit-any
import { ATIVOS, type AtivoId } from '../_shared/motor/ativos.ts'
import { carregarCatalogo, filtrosDaPele, temProdutoPara } from '../_shared/motor/catalogo.ts'
import { corrigirRotina, normalizar, planoEfetivo, type Passo } from '../_shared/motor/conferencia.ts'
import { planoComCasa } from '../_shared/motor/adotar.ts'
import { memoriasAtivas } from '../_shared/motor/gerar.ts'
import { perfilMotor } from '../_shared/motor/perfil.ts'
import { montarPlano } from '../_shared/motor/plano.ts'
import { garantirRotinaV2, onboardingDaLinha, passosComAtivo } from '../_shared/motor/recomendar.ts'
import { decidirCasa, montarFicha, type ContextoCasa, type FichaCasa } from '../_shared/motor/casa.ts'
import { passosDaMinhaRotina, resultadoDoLote } from '../_shared/motor/lote.ts'
import {
  buscarEmSegundoPlano, concentracoesDaLinha, gravar, identificarParaRotina, procurarNaTabela, transcreverRotulo,
  type IdentificacaoRotina,
} from '../analisar-produto/ingredientes.ts'
import { norm, sameBrand, sameName } from '../_shared/scanCutout.ts'
import { motivoEn, resultadoEn, type Idioma } from './en.ts'

export class AntesDeGravar extends Error {}

const ESPERA_BUSCA_MS = 50_000
const SEM_LISTA = 'Não achamos a lista de ingredientes dele, então essa análise é menos exata.'

type Baixar = (path: string) => Promise<Uint8Array | null>
type Log = (m: string, c?: Record<string, unknown>) => void

const comTempo = <T>(p: Promise<T>, ms: number, reserva: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(reserva), ms))])

export interface ListaUsada { fonte: string; origem: 'rotulo_lido' | 'tabela' | 'busca'; correspondencia: string | null; itens: number }

/** Identificação + lista de ingredientes de UM produto. null = não identificado. */
async function identificar(
  supabase: any, userId: string, base64: string, indice: number, temRotulo: boolean, log: Log,
) {
  const imagem = { base64, mimeType: 'image/jpeg' }
  const id: IdentificacaoRotina | null = await identificarParaRotina(supabase, userId, imagem, 'montar-rotina-identificar')
  if (!id) return null

  let lista: ListaUsada | null = null
  let inci: string[] | null = null
  let conc: { ingrediente: string; valor: string }[] = []
  let buscou = false
  let rotuloLido: { inci: string[]; concentracoes: any[]; marca: string | null; nome: string | null } | null = null

  // a. Rótulo fotografado: vale mais que qualquer lista guardada.
  if (temRotulo) {
    rotuloLido = await transcreverRotulo(supabase, userId, [imagem], 'ingredientes-rotulo').catch(() => null)
    if (rotuloLido) {
      inci = rotuloLido.inci
      conc = rotuloLido.concentracoes ?? []
      lista = { fonte: 'rotulo', origem: 'rotulo_lido', correspondencia: null, itens: inci.length }
    }
  }
  // b–c. Tabela; sem linha → busca na internet.
  if (!inci) {
    let t = await procurarNaTabela(supabase, id.marca, id.nome).catch(() => null)
    let veioDaBusca = false
    if (t && !t.achada && !t.temLinha) {
      buscou = true
      const r = await comTempo(buscarEmSegundoPlano(supabase, userId, id.marca, id.nome, 'ingredientes-busca').catch(() => null), ESPERA_BUSCA_MS, null)
      log('BUSCA', { indice, reservou: (r as any)?.reservou ?? null, gravou: (r as any)?.gravou ?? null })
      t = await procurarNaTabela(supabase, id.marca, id.nome).catch(() => t)
      veioDaBusca = !!t?.achada
    }
    const a = t?.achada ?? null
    if (a) {
      inci = a.linha.inci
      conc = await concentracoesDaLinha(supabase, a.linha.chave).catch(() => [])
      lista = { fonte: a.linha.fonte ?? '?', origem: veioDaBusca ? 'busca' : 'tabela', correspondencia: a.correspondencia, itens: inci?.length ?? 0 }
    }
  }
  return {
    id, lista, buscou, rotuloLido,
    entrada: {
      indice, nome: id.nome, marca: id.marca, categoria: id.categoria, fps: id.fps, corpo: id.corpo,
      inci, concentracoes: [...id.concentracoes, ...conc],
    },
  }
}

/** 1–4: identifica, acha as listas, monta o plano e decide. `salvar: false` = não grava a rotina ideal. */
export async function decidirLoteV2(
  supabase: any, userId: string, imagens: Uint8Array[], temRotulo: boolean[],
  dep: { paraBase64: (b: Uint8Array) => string },
  op: {
    salvar: boolean; log: Log
    /** SÓ TESTE (função temporária, nunca em produção): ignora scan e rotina ideal da conta
     *  e lê o perfil (`users`) de `perfilDe` — simula a conta sem base, sem gravar nada. */
    teste?: { semBase?: boolean; perfilDe?: string }
  },
) {
  const t0 = Date.now()
  const idents = await Promise.all(imagens.map((b, i) => identificar(supabase, userId, dep.paraBase64(b), i + 1, !!temRotulo[i], op.log)))
  const fichas: FichaCasa[] = idents.filter((x): x is NonNullable<typeof x> => !!x).map((x) => montarFicha(x.entrada))
  op.log('IDENTIFICADOS', {
    total: imagens.length, identificados: fichas.length, rotulos: idents.filter((x) => x?.lista?.origem === 'rotulo_lido').length,
    com_lista: idents.filter((x) => x?.lista).length, buscas: idents.filter((x) => x?.buscou).length, ms: Date.now() - t0,
  })

  const [{ data: u }, { data: scans }, memorias, catalogo] = await Promise.all([
    supabase.from('users').select('*').eq('id', op.teste?.perfilDe ?? userId).maybeSingle(),
    supabase.from('skin_scans').select('id, full_result').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
    memoriasAtivas(supabase, userId),
    carregarCatalogo(supabase),
  ])
  if (!u) throw new Error('usuária não encontrada')
  const scanRow = !op.teste?.semBase && Array.isArray(scans) ? scans[0] : null
  const scan = scanRow?.full_result ?? null
  const onboarding = onboardingDaLinha(u, scan)
  const { data: protos } = await supabase.from('protocolos').select('id, rotina_am, rotina_pm, dicas')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(1)
  let proto = !op.teste?.semBase && Array.isArray(protos) ? protos[0] : null
  if (scan) {
    proto = await garantirRotinaV2(supabase, userId, proto ?? {}, scan, scanRow?.id ?? null, onboarding, op.log, op.salvar)
  } else if (!proto) {
    // 22/nov/2026 (OK do produto): conta sem rotina ideal e sem scan (ex.: "Entrar" com Google e
    // direto no lote) → o motor novo monta primeiro a rotina ideal com o perfil que existir (sem
    // dores = o padrão do motor) e o lote segue pelo caminho novo. Antes: voltava ao lote antigo.
    // Se a geração falhar, o erro sobe como antes (AntesDeGravar → lote antigo).
    op.log('ROTINA_SEM_SCAN', { dores: onboarding.concerns.length, tipo_pele: onboarding.skin_type ?? null })
    proto = await garantirRotinaV2(supabase, userId, {}, null, null, onboarding, op.log, op.salvar)
  }

  const perfil = perfilMotor(scan, onboarding, memorias)
  const opPlano = { temProduto: temProdutoPara(catalogo, filtrosDaPele(perfil, onboarding, scan, null)) }
  // 22/nov/2026 (OK do produto): adota o ativo forte que ela JÁ TEM em casa (`motor/adotar.ts`)
  // quando ele trata uma dor marcada no lugar de outro ativo da mesma dor — com toda a segurança.
  const filtrosBase = filtrosDaPele(perfil, onboarding, scan, montarPlano(perfil, opPlano))
  const ad = planoComCasa(perfil, opPlano, fichas, {
    perfil, filtros: filtrosBase, alergiaDescricao: onboarding.allergy_description ?? null, memorias,
  })
  const plano = ad.plano
  let rotina = { morning: (proto.rotina_am ?? []) as Passo[], night: (proto.rotina_pm ?? []) as Passo[] }
  if (ad.adotados.length) {
    // A rotina ideal passa a ter o passo do ativo adotado (pelo código, sem IA) e é salva como a
    // mais recente — a Minha rotina e a ideal ficam iguais (OK do produto).
    const nova = normalizar(corrigirRotina({ ...rotina }, plano), plano)
    rotina = { morning: nova.morning ?? [], night: nova.night ?? [] }
    op.log('ADOTOU', {
      adotados: ad.adotados.map((x) => ({ ativo: x.ativo, produto: x.indice, no_lugar_de: x.substituiu })),
      plano: plano.ativos.map((e) => e.ativo),
    })
    if (op.salvar) {
      const { data: novo, error } = await supabase.from('protocolos').insert({
        user_id: userId, skin_scan_id: scanRow?.id ?? null, rotina_am: rotina.morning, rotina_pm: rotina.night,
        dicas: proto.dicas ?? null, updated_at: new Date().toISOString(),
      }).select('id').single()
      if (error) throw new Error(`rotina ideal com o ativo adotado: ${error.message}`)
      op.log('ROTINA_IDEAL_ADOTADA', { antiga: proto.id ?? null, nova: novo.id })
    }
  }
  const efetivo = planoEfetivo(rotina, plano)
  const filtros = filtrosDaPele(perfil, onboarding, scan, plano)
  filtros.fortesPermitidos = [...efetivo].filter((a) => ATIVOS[a].forte)
  filtros.ativosDoPlano = [...efetivo]
  const ctx: ContextoCasa = {
    perfil, plano, filtros, alergiaDescricao: onboarding.allergy_description ?? null, memorias,
    fortesPermitidos: filtros.fortesPermitidos, ativosDoPlano: [...efetivo] as AtivoId[],
  }
  const decisao = decidirCasa(passosComAtivo(rotina, efetivo), fichas, catalogo, filtros, ctx)
  op.log('DECISAO', {
    na_rotina: decisao.passos.filter((d) => d.casa).map((d) => `${d.periodo}:${d.passo.name}=${d.casa!.indice}`),
    fora: decisao.fora.map((x) => `${x.ficha.indice}:${x.motivo.tipo}`), conferencia: decisao.conferencia,
  })
  return { idents, fichas, decisao, plano, ms: Date.now() - t0 }
}

export async function processarLoteV2(
  supabase: any, userId: string, loteId: string, caminhos: string[], temRotulo: boolean[],
  dep: { baixar: Baixar; paraBase64: (b: Uint8Array) => string },
  idioma: Idioma = 'pt',
): Promise<{ scansNovos: string[]; passos: number }> {
  const en = idioma === 'en'
  const t0 = Date.now()
  const log: Log = (motivo, ctx = {}) => console.log('LOTE_V2', JSON.stringify({ motivo, userId, loteId, ...ctx }))

  // ── 1–4: nada é gravado (só custos e a tabela de ingredientes, como no scan) ──
  let d: Awaited<ReturnType<typeof decidirLoteV2>>
  try {
    const imagens = await Promise.all(caminhos.map((c) => dep.baixar(c)))
    if (imagens.some((b) => !b)) throw new Error('imagem do lote não encontrada no bucket')
    d = await decidirLoteV2(supabase, userId, imagens as Uint8Array[], temRotulo, dep, { salvar: true, log })
  } catch (e) {
    throw new AntesDeGravar(String((e as Error)?.message ?? e))
  }
  const { idents, fichas, decisao } = d

  // ── 5. Grava ──
  const motivoDe = new Map(decisao.fora.map((x) => [x.ficha.indice, x.motivo]))
  const resultado: any = resultadoDoLote(decisao, fichas, caminhos.length)
  // Inglês (etapa 3): os textos do motor para ela, depois de prontos (o português não passa aqui).
  if (en) resultadoEn(resultado)
  const { data: estante } = await supabase.from('colecao_produtos').select('id, nome, marca').eq('user_id', userId)
  const lista = (estante ?? []) as { id: string; nome: string | null; marca: string | null }[]
  const colecao = new Map<number, string>()
  const scansNovos: string[] = []

  for (const f of fichas) {
    const p = resultado.produtos.find((x: any) => x.indice === f.indice)
    const motivoPt = motivoDe.get(f.indice)?.texto ?? null
    const motivo = en ? motivoEn(motivoPt) : motivoPt
    const ja = lista.find((c) => sameBrand(norm(c.marca), norm(f.marca)) && sameName(norm(c.nome), norm(f.nome)))
    if (ja) {
      // Já estava na estante (até como "Quero comprar"): agora ela tem.
      await supabase.from('colecao_produtos').update({ status: 'tenho', motivo_fora_rotina: motivo }).eq('id', ja.id).eq('user_id', userId)
      colecao.set(f.indice, ja.id)
      p.colecao_item_id = ja.id
      continue
    }
    const base = caminhos[f.indice - 1]
    const bytes = (await dep.baixar(base.replace(/\.jpg$/, '-frente.jpg'))) ?? (await dep.baixar(base))
    if (!bytes) continue
    const imagePath = `${userId}/${Date.now()}-${f.indice}.jpg`
    const up = await supabase.storage.from('product-scans').upload(imagePath, bytes, { contentType: 'image/jpeg' })
    if (up.error) { console.warn('LOTE_V2: upload da foto falhou', f.indice, up.error.message); continue }
    const naRotina = decisao.passos.find((x) => x.casa?.indice === f.indice)
    const { data: scan, error: e1 } = await supabase.from('product_scans').insert({
      user_id: userId, image_path: imagePath, produto_nome: f.nome, produto_marca: f.marca,
      client_scan_id: `lote:${loteId}:${f.indice}`,
      resultado: {
        status: 'ok', origem: 'montar_rotina', motor: 'v2',
        produto: { nome: f.nome, marca: f.marca, categoria: p.categoria, ativos_detectados: p.ativos_detectados },
        confianca: f.temLista ? 'alta' : 'media',
        nota: f.temLista ? null : en ? motivoEn(SEM_LISTA) : SEM_LISTA,
        veredito: p.veredito, compatibilidade: p.compatibilidade,
        resumo: naRotina ? (en ? `Added to your routine in "${naRotina.passo.name}".` : `Entrou na sua rotina em "${naRotina.passo.name}".`) : motivo,
        explicacao: null, avisos: [], uso: p.uso,
      },
    }).select('id').single()
    if (e1 || !scan) { console.warn('LOTE_V2: product_scans falhou', f.indice, e1?.message); continue }
    const { data: item, error: e2 } = await supabase.from('colecao_produtos').insert({
      user_id: userId, origem: 'scan', product_scan_id: scan.id, imagem_url: imagePath, status: 'tenho',
      nome: f.nome, marca: f.marca, categoria: p.categoria, compatibilidade: p.compatibilidade, motivo_fora_rotina: motivo,
    }).select('id').single()
    if (e2 || !item) { console.warn('LOTE_V2: estante falhou', f.indice, e2?.message); continue }
    colecao.set(f.indice, item.id)
    p.colecao_item_id = item.id
    p.product_scan_id = scan.id
    scansNovos.push(scan.id)
    lista.push({ id: item.id, nome: f.nome, marca: f.marca })

    // Rótulo lido → tabela de ingredientes (como no scan de produto: vence as outras fontes).
    const x = idents.find((y) => y?.entrada.indice === f.indice)
    if (x?.rotuloLido) {
      await gravar(supabase, f.marca, f.nome, {
        inci: x.rotuloLido.inci, fonte: 'rotulo', fonte_scan: scan.id, confianca: 'alta', concentracoes: x.rotuloLido.concentracoes,
        conferencias: { nome_na_foto: `${x.rotuloLido.marca ?? ''} | ${x.rotuloLido.nome ?? ''}` },
      }).catch((e) => console.warn('LOTE_V2: gravar rótulo', e))
    }
  }

  const listas = Object.fromEntries(idents.filter(Boolean).map((x) => [x!.entrada.indice, x!.lista]))
  const { error: eRes } = await supabase.from('rotina_lotes')
    .update({ resultado: { ...resultado, _medicao: { motor: 'v2', ms: Date.now() - t0, listas } } }).eq('id', loteId)
  if (eRes) throw new Error(`gravar resultado: ${eRes.message}`)

  const passos = passosDaMinhaRotina(decisao, (i) => colecao.get(i) ?? null)
  const { data: n, error: eApl } = await supabase.rpc('aplicar_lote_rotina_v2', { p_lote: loteId, p_passos: passos })
  if (eApl) throw new Error(`aplicar rotina: ${eApl.message}`)
  await supabase.from('rotina_lotes').update({ status: 'pronto', concluido_em: new Date().toISOString() }).eq('id', loteId)
  log('PRONTO', { passos: n, ms: Date.now() - t0 })
  return { scansNovos, passos: n ?? 0 }
}
