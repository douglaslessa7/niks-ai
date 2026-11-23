import { assertEquals, assert } from 'jsr:@std/assert@1'
import { escolherProdutos, fortesDaRotina, passosVazios, type FiltrosPele, type ItemCasa, type ProdutoCatalogo } from './produtos.ts'
import type { Passo } from './conferencia.ts'

let n = 0
const prod = (categoria: string, ativos: string[], extra: Partial<ProdutoCatalogo> = {}): ProdutoCatalogo => ({
  id: `p${++n}`, marca: 'M', nome: `P${n}`, categoria, ativos_principais: ativos, tipos_pele: ['oleosa', 'mista'],
  concerns: [], alergenos: [], intensidade: 'moderado', indicado_pele_sensivel: false, seguro_gestante: true,
  faixa_preco: 1, ...extra,
})
const passo = (name: string, ingredient: string): Passo => ({ name, ingredient })
const filtros = (f: Partial<FiltrosPele> = {}): FiltrosPele => ({
  tipoPele: 'oleosa', gravida: false, sensivel: false, alergenosCortados: [], alergiaAtivos: [],
  proibidos: [], fortesPermitidos: ['salicilico'], orcamento: null, concernsCodigos: [], ...f,
})

const limpezaSal = prod('limpeza', ['acido_salicilico'])
const limpezaSuave = prod('limpeza', ['ceramidas'])
const serumSal = prod('serum', ['acido_salicilico', 'niacinamida'], { concerns: ['cravos'] })
const esfolSal = prod('esfoliante', ['acido_salicilico'], { faixa_preco: 1 })
const serumSalCaro = prod('serum', ['acido_salicilico'], { faixa_preco: 3, concerns: ['cravos'] })
const hidrAha = prod('hidratante', ['acido_glicolico'])
const hidr = prod('hidratante', ['ceramidas'])
const fps = prod('protetor_solar', ['filtros_uv'])
const retinolNoturno = prod('tratamento_noturno', ['retinol'])
const catalogo = [limpezaSal, limpezaSuave, serumSal, esfolSal, serumSalCaro, hidrAha, hidr, fps, retinolNoturno]

const rotina = (ativoPm: 'salicilico' | 'retinoide' = 'salicilico') => [
  { passo: passo('Gel de Limpeza Suave', 'Gel de Limpeza'), periodo: 'am' as const, ativo: null },
  { passo: passo('Hidratante', 'Hidratante leve'), periodo: 'am' as const, ativo: null },
  { passo: passo('Protetor Solar', 'Protetor Solar FPS 50'), periodo: 'am' as const, ativo: null },
  { passo: passo('Gel de Limpeza Suave', 'Gel de Limpeza'), periodo: 'pm' as const, ativo: null },
  { passo: passo(ativoPm === 'salicilico' ? 'Sérum de Ácido Salicílico' : 'Sérum de Retinol', 'x'), periodo: 'pm' as const, ativo: ativoPm },
  { passo: passo('Hidratante', 'Hidratante leve'), periodo: 'pm' as const, ativo: null },
]

Deno.test('nenhum passo vazio; tratamento pega produto com o ativo e a dor dela', () => {
  const r = escolherProdutos(rotina(), catalogo, [], filtros({ concernsCodigos: ['cravos'] }))
  assertEquals(passosVazios(r.escolhas), [])
  const sal = r.escolhas.find((e) => e.ativo === 'salicilico')!
  assertEquals(sal.principal?.id, serumSal.id)
})

Deno.test('básico com forte FORA do plano é evitado (hidratante com AHA não entra)', () => {
  const r = escolherProdutos(rotina(), catalogo, [], filtros())
  assert(r.escolhas.every((e) => e.principal?.id !== hidrAha.id))
  assertEquals(fortesDaRotina(r.escolhas), ['salicilico'])
})

Deno.test('mesmo ativo em dois passos conta uma vez (sabonete com salicílico + sérum)', () => {
  const r = escolherProdutos(rotina(), [limpezaSal, serumSal, hidr, fps], [], filtros())
  assertEquals(fortesDaRotina(r.escolhas), ['salicilico'])
})

Deno.test('retinoide é achado em tratamento_noturno (categoria órfã antes)', () => {
  const r = escolherProdutos(rotina('retinoide'), catalogo, [], filtros({ fortesPermitidos: ['retinoide'] }))
  assertEquals(r.escolhas.find((e) => e.ativo === 'retinoide')!.principal?.id, retinolNoturno.id)
})

Deno.test('orçamento: prefere o que cabe; nada cabe → o mais barato que serve, com aviso', () => {
  const r1 = escolherProdutos(rotina(), [limpezaSuave, serumSalCaro, esfolSal, hidr, fps], [], filtros({ orcamento: 1, concernsCodigos: ['cravos'] }))
  // Dor tratada vem antes do orçamento: o caro trata cravos, o barato não.
  assertEquals(r1.escolhas.find((e) => e.ativo === 'salicilico')!.principal?.id, serumSalCaro.id)
  assertEquals(r1.avisos.length, 1)
  const r2 = escolherProdutos(rotina(), [limpezaSuave, serumSalCaro, esfolSal, hidr, fps], [], filtros({ orcamento: 1 }))
  assertEquals(r2.escolhas.find((e) => e.ativo === 'salicilico')!.principal?.id, esfolSal.id)
  assertEquals(r2.avisos, [])
})

Deno.test('produto de casa entra primeiro; dois de casa com azelaico → um fica de fora com motivo', () => {
  const casa: ItemCasa[] = [
    { colecaoId: 'c1', produtoId: null, nome: 'Azelan', marca: 'X', categoria: 'Sérum', ativos: ['azelaico'], alergenos: [], seguroGestante: null },
    { colecaoId: 'c2', produtoId: null, nome: 'Azelaic 10', marca: 'Y', categoria: 'Sérum', ativos: ['azelaico'], alergenos: [], seguroGestante: null },
  ]
  const passos = [{ passo: passo('Sérum de Ácido Azelaico', 'Azelaico 10%'), periodo: 'pm' as const, ativo: 'azelaico' as const }]
  const r = escolherProdutos(passos, [prod('serum', ['acido_azelaico'])], casa, filtros())
  assertEquals(r.escolhas[0].casa?.colecaoId, 'c1')
  assertEquals(r.casaFora.map((x) => x.colecaoId), ['c2'])
  assert(r.casaFora[0].motivo.includes('ácido azelaico'))
})

Deno.test('gestante: produto sem seguro_gestante nunca entra', () => {
  const inseguro = prod('serum', ['acido_salicilico'], { seguro_gestante: false, concerns: ['cravos'] })
  const r = escolherProdutos(rotina(), [inseguro, esfolSal, limpezaSuave, hidr, fps], [], filtros({ gravida: true, concernsCodigos: ['cravos'] }))
  assertEquals(r.escolhas.find((e) => e.ativo === 'salicilico')!.principal?.id, esfolSal.id)
})

Deno.test('passo "Gel de Limpeza" não recebe óleo de limpeza (só se não houver gel)', () => {
  const oleo = prod('limpeza_oleosa', [], { concerns: ['cravos', 'acne'] })
  const gel = prod('limpeza', [])
  const passos = [{ passo: passo('Gel de Limpeza Suave', 'Gel'), periodo: 'am' as const, ativo: null }]
  assertEquals(escolherProdutos(passos, [oleo, gel], [], filtros({ concernsCodigos: ['cravos'] })).escolhas[0].principal?.id, gel.id)
  assertEquals(escolherProdutos(passos, [oleo], [], filtros()).escolhas[0].principal?.id, oleo.id)
})

Deno.test('água micelar não vira o sabonete quando o passo é gel', () => {
  const micelar = prod('limpeza', [], { nome: 'Água Micelar AM-01', concerns: ['cravos'] })
  const gel = prod('limpeza', [], { nome: 'Gel de Limpeza' })
  const passos = [{ passo: passo('Gel de Limpeza Suave', 'Gel'), periodo: 'am' as const, ativo: null }]
  assertEquals(escolherProdutos(passos, [micelar, gel], [], filtros({ concernsCodigos: ['cravos'] })).escolhas[0].principal?.id, gel.id)
})

Deno.test('salicílico de verdade: betaína salicilato nunca para acne; sem acne, só se não houver outro', () => {
  const betaina = prod('serum', ['betaine_salicylate', 'niacinamida'], { concerns: ['acne'] })
  const real = prod('serum', ['acido_salicilico'], { faixa_preco: 2 })
  const passos = [{ passo: passo('Sérum de Ácido Salicílico', 'x'), periodo: 'pm' as const, ativo: 'salicilico' as const }]
  assertEquals(escolherProdutos(passos, [betaina, real], [], filtros({ concernsCodigos: ['acne'] })).escolhas[0].principal?.id, real.id)
  assertEquals(escolherProdutos(passos, [betaina], [], filtros({ concernsCodigos: ['acne'] })).escolhas[0].principal, null)
  assertEquals(escolherProdutos(passos, [betaina], [], filtros({ concernsCodigos: ['cravos'] })).escolhas[0].principal?.id, betaina.id)
})

Deno.test('olheiras: só produto de olhos com cafeína', () => {
  const niac = prod('serum', ['niacinamida'])
  const olhosSem = prod('olhos', ['peptideos', 'niacinamida'])
  const olhosCaf = prod('olhos', ['cafeina', 'acido_hialuronico'])
  const passos = [{ passo: passo('Creme para a Área dos Olhos', 'Creme com Cafeína'), periodo: 'am' as const, ativo: 'cafeina' as const }]
  assertEquals(escolherProdutos(passos, [niac, olhosSem, olhosCaf], [], filtros()).escolhas[0].principal?.id, olhosCaf.id)
})

Deno.test('orçamento 3: sem teto, a fórmula mais completa para as dores dela', () => {
  const simples = prod('serum', ['acido_azelaico'], { faixa_preco: 1, concerns: ['manchas'] })
  const completo = prod('serum', ['acido_azelaico', 'niacinamida', 'acido_tranexamico'], { faixa_preco: 2, concerns: ['manchas'] })
  const passos = [{ passo: passo('Sérum de Azelaico', 'x'), periodo: 'am' as const, ativo: 'azelaico' as const }]
  const f3 = filtros({ orcamento: 3, concernsCodigos: ['manchas'], ativosDasDores: ['azelaico', 'niacinamida', 'tranexamico'] })
  assertEquals(escolherProdutos(passos, [simples, completo], [], f3).escolhas[0].principal?.id, completo.id)
  const f1 = filtros({ orcamento: 1, concernsCodigos: ['manchas'], ativosDasDores: ['azelaico', 'niacinamida', 'tranexamico'] })
  assertEquals(escolherProdutos(passos, [simples, completo], [], f1).escolhas[0].principal?.id, simples.id)
})

Deno.test('passo de azelaico não recebe produto que traz salicílico; e o mesmo produto não vai em dois tratamentos', () => {
  const az = prod('serum', ['acido_azelaico', 'acido_salicilico'], { concerns: ['manchas', 'acne'] }) // tipo Effaclar A.Z.
  const azPuro = prod('serum', ['acido_azelaico'])
  const salPuro = prod('serum', ['acido_salicilico'])
  const passos = [
    { passo: passo('Sérum de Azelaico', 'Azelaico 10%'), periodo: 'am' as const, ativo: 'azelaico' as const },
    { passo: passo('Sérum de Salicílico', 'Salicílico 2%'), periodo: 'pm' as const, ativo: 'salicilico' as const },
  ]
  const r = escolherProdutos(passos, [az, azPuro, salPuro], [], filtros({ concernsCodigos: ['manchas', 'acne'] }))
  assertEquals(r.escolhas[0].principal?.id, azPuro.id)
  // O A.Z. serve no salicílico (o azelaico dele não é forte), mas só uma vez na rotina.
  const ids = r.escolhas.map((e) => e.principal?.id)
  assertEquals(new Set(ids).size, ids.length)
})

Deno.test('passo de salicílico não recebe produto que traz azelaico quando o azelaico já é passo do plano', () => {
  const az = prod('serum', ['acido_azelaico', 'acido_salicilico'], { concerns: ['acne'] })
  const salPuro = prod('serum', ['acido_salicilico'])
  const passos = [{ passo: passo('Sérum de Salicílico', 'Salicílico 2%'), periodo: 'pm' as const, ativo: 'salicilico' as const }]
  const f = filtros({ concernsCodigos: ['acne'], ativosDoPlano: ['salicilico', 'azelaico'] })
  assertEquals(escolherProdutos(passos, [az, salPuro], [], f).escolhas[0].principal?.id, salPuro.id)
  // Sem azelaico no plano, o A.Z. pode entrar.
  assertEquals(escolherProdutos(passos, [az, salPuro], [], filtros({ concernsCodigos: ['acne'], ativosDoPlano: ['salicilico'] })).escolhas[0].principal?.id, az.id)
})

Deno.test('pele sensível: indicado_pele_sensivel é filtro; sem nenhum, entra o melhor que sobrou', () => {
  const comCor = prod('protetor_solar', ['filtros_uv'], { concerns: ['manchas'], indicado_pele_sensivel: false })
  const sens = prod('protetor_solar', ['filtros_uv'], { indicado_pele_sensivel: true })
  const passos = [{ passo: passo('Protetor Solar', 'Protetor Solar FPS 50'), periodo: 'am' as const, ativo: null }]
  assertEquals(escolherProdutos(passos, [comCor, sens], [], filtros({ sensivel: true, concernsCodigos: ['manchas'] })).escolhas[0].principal?.id, sens.id)
  assertEquals(escolherProdutos(passos, [comCor], [], filtros({ sensivel: true, concernsCodigos: ['manchas'] })).escolhas[0].principal?.id, comCor.id)
})

Deno.test('o produto bate com o ativo do passo: "Sérum de Niacinamida" não recebe um sérum de azelaico que tem niacinamida', () => {
  const az = prod('serum', ['acido_azelaico', 'niacinamida'], { nome: 'Azelaic Acid 16 Calming Serum', concerns: ['manchas', 'oleosidade'] })
  const niac = prod('serum', ['niacinamida'], { nome: 'Niacinamide 10 Serum' })
  const semNome = prod('serum', ['niacinamida', 'zinco'], { nome: 'Sérum Antioleosidade' })
  const passos = [{ passo: passo('Sérum de Niacinamida', 'Sérum de Niacinamida 5%'), periodo: 'am' as const, ativo: 'niacinamida' as const }]
  const f = filtros({ concernsCodigos: ['manchas', 'oleosidade'] })
  assertEquals(escolherProdutos(passos, [az, niac], [], f).escolhas[0].principal?.id, niac.id)
  assertEquals(escolherProdutos(passos, [az, semNome], [], f).escolhas[0].principal?.id, semNome.id)
  assertEquals(escolherProdutos(passos, [az], [], f).escolhas[0].principal, null)
})
