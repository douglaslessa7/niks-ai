// Motor da rotina v2 — resultado do lote "Montar minha rotina com o que eu tenho" (puro).
//
// Formato de `rotina_lotes.resultado` que o app da loja (1.62) já lê:
//   produtos[] (por índice do lote), rotina {am, pm} (SÓ os passos com produto dela),
//   fora_da_rotina[], faltam[] ("Para completar" — aqui com o produto do catálogo), cobre_tudo.
// Campos novos (1.63): rotina_completa {am, pm} com TODOS os passos na ordem (casa,
// catálogo ou sem produto), faltam[].produto, produtos[].lista_ingredientes, motor = 'v2'.

import { ATIVOS } from './ativos.ts'
import { diasDoPasso } from './conferencia.ts'
import { ehCorteDeSeguranca, nomeDoProduto, type CategoriaCasa, type DecisaoPasso, type FichaCasa, type ResultadoCasa } from './casa.ts'

const CATEGORIA_TEXTO: Record<CategoriaCasa, string | null> = {
  limpeza: 'limpeza', limpeza_oleosa: 'óleo de limpeza', micelar: 'água micelar', tonico: 'tônico',
  serum: 'sérum', esfoliante: 'esfoliante', tratamento: 'tratamento', olhos: 'olhos',
  hidratante: 'hidratante', oclusivo: 'oclusivo', protetor: 'protetor solar', mascara: 'máscara', outro: null,
}

const FORTE_AVISO = ['reacao', 'memoria', 'gravidez']

export interface ProdutoCatalogoResumo { id: string; marca: string; nome: string; categoria: string; imagem_url?: string | null }

function resumo(p: DecisaoPasso['principal']): ProdutoCatalogoResumo | null {
  if (!p) return null
  return { id: p.id, marca: p.marca, nome: p.nome, categoria: p.categoria, imagem_url: (p as { imagem_url?: string | null }).imagem_url ?? null }
}

/** `resultado` do lote. `total` = quantos produtos ela fotografou (os não identificados não têm ficha). */
export function resultadoDoLote(r: ResultadoCasa, fichas: FichaCasa[], total: number) {
  const porIndice = new Map(fichas.map((f) => [f.indice, f]))
  const foraPorIndice = new Map(r.fora.map((x) => [x.ficha.indice, x.motivo]))
  const naRotina = r.passos.filter((d) => d.casa)

  const produtos = []
  for (let i = 1; i <= total; i++) {
    const f = porIndice.get(i)
    if (!f) {
      produtos.push({
        indice: i, identificado: false, nome: null, marca: null, categoria: null, leu_rotulo: false,
        ingredientes_lidos: [], precisao: 'baixa', ativos_detectados: [], veredito: null, compatibilidade: null,
        nivel_aviso: 'nenhum', motivo: null, avisos: [], uso: null,
      })
      continue
    }
    const m = foraPorIndice.get(i) ?? null
    const seg = ehCorteDeSeguranca(m)
    const passo = naRotina.find((d) => d.casa!.indice === i)
    const dias = passo ? diasDoPasso(passo.passo) : null
    produtos.push({
      indice: i, identificado: true, nome: f.nome, marca: f.marca, categoria: CATEGORIA_TEXTO[f.categoria],
      leu_rotulo: f.temLista, lista_ingredientes: f.temLista, ingredientes_lidos: [],
      precisao: f.temLista ? 'alta' : 'baixa',
      ativos_detectados: f.papel.map((a) => ATIVOS[a].nome),
      veredito: seg ? 'evitaria' : 'pode_usar',
      compatibilidade: m?.tipo === 'medicamento' ? null : seg ? 25 : 80,
      nivel_aviso: seg ? (FORTE_AVISO.includes(m!.tipo) ? 'forte' : 'leve') : 'nenhum',
      motivo: m?.texto ?? null,
      motivo_tipo: m?.tipo ?? null,
      avisos: [],
      uso: { diario: !dias, dias },
    })
  }

  const linha = (d: DecisaoPasso) => ({ produto_indice: d.casa!.indice, passo: d.passo.name, instrucao: d.passo.instruction ?? '', dias: diasDoPasso(d.passo) })
  const completo = (d: DecisaoPasso) => ({
    passo: d.passo.name, instrucao: d.passo.instruction ?? '', dias: diasDoPasso(d.passo), extra: !!d.extra,
    produto_indice: d.casa?.indice ?? null,
    produto_catalogo: d.casa ? null : resumo(d.principal),
    sem_produto: d.semProduto ?? null,
  })
  const faltam = r.passos.filter((d) => !d.casa && !d.extra).map((d) => ({
    passo_ideal: d.passo.name,
    periodo: d.periodo,
    por_que: d.principal ? `Sugestão: ${nomeDoProduto(d.principal)}.` : (d.semProduto ?? ''),
    produto: resumo(d.principal),
  }))

  return {
    motor: 'v2',
    produtos,
    rotina: {
      am: r.passos.filter((d) => d.periodo === 'am' && d.casa).map(linha),
      pm: r.passos.filter((d) => d.periodo === 'pm' && d.casa).map(linha),
    },
    rotina_completa: {
      am: r.passos.filter((d) => d.periodo === 'am').map(completo),
      pm: r.passos.filter((d) => d.periodo === 'pm').map(completo),
    },
    fora_da_rotina: r.fora.map((x) => ({ produto_indice: x.ficha.indice, motivo: x.motivo.texto })),
    faltam,
    cobre_tudo: faltam.length === 0,
    conferencia: r.conferencia,
  }
}

/** Passos para `montar_minha_rotina_v2` (via `aplicar_lote_rotina_v2`): a rotina inteira, já com produto. */
export function passosDaMinhaRotina(r: ResultadoCasa, colecaoDe: (indice: number) => string | null) {
  const indice = { am: 0, pm: 0 }
  return r.passos.map((d) => {
    const i = d.extra ? null : indice[d.periodo]++
    const col = d.casa ? colecaoDe(d.casa.indice) : null
    return {
      periodo: d.periodo,
      nome: d.passo.name,
      ingrediente: d.passo.ingredient,
      instrucao: d.passo.instruction ?? null,
      como_usar: Array.isArray(d.passo.steps) ? d.passo.steps : null,
      tempo_espera: d.passo.waitTime ?? null,
      cor: d.passo.color ?? null,
      dias: diasDoPasso(d.passo),
      passo_ideal: i == null ? null : { periodo: d.periodo, indice: i, id: d.passo.id ?? null, nome: d.passo.name },
      produto: col ? { colecao_id: col } : d.principal ? { produto_id: d.principal.id } : null,
    }
  })
}
