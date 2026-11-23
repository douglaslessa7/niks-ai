import { assert, assertEquals } from 'jsr:@std/assert@1'
import { decidirCasa, duplicatas, montarFicha, type ContextoCasa, type EntradaFicha, type PassoLote } from './casa.ts'
import { resultadoDoLote, passosDaMinhaRotina } from './lote.ts'
import type { Passo } from './conferencia.ts'
import type { PerfilMotor, Plano } from './plano.ts'
import type { FiltrosPele, ProdutoCatalogo } from './produtos.ts'
import type { AtivoId } from './ativos.ts'

let n = 0
const prod = (categoria: string, ativos: string[], extra: Partial<ProdutoCatalogo> = {}): ProdutoCatalogo => ({
  id: `c${++n}`, marca: 'Catálogo', nome: `Produto ${n}`, categoria, ativos_principais: ativos, tipos_pele: null,
  concerns: [], alergenos: [], intensidade: null, indicado_pele_sensivel: false, seguro_gestante: true, faixa_preco: 1, ...extra,
})
const catalogo = [
  prod('limpeza', ['ceramidas']), prod('hidratante', ['ceramidas']), prod('protetor_solar', ['filtros_uv']),
  prod('serum', ['acido_salicilico'], { nome: 'Sérum Salicílico' }), prod('tratamento_noturno', ['retinol'], { nome: 'Retinol' }),
  prod('serum', ['acido_azelaico'], { nome: 'Azelaico 10' }), prod('serum', ['niacinamida'], { nome: 'Niacinamida 10' }),
]

const p = (name: string, ingredient = name, dias: string[] | null = null): Passo => ({ name, ingredient, dias })
type Rot = PassoLote[]
const rotina = (pm: { nome: string; ativo: AtivoId; dias?: string[] }[] = [{ nome: 'Sérum de Ácido Salicílico', ativo: 'salicilico', dias: ['Seg', 'Qua', 'Sex'] }]): Rot => [
  { passo: p('Gel de Limpeza Suave'), periodo: 'am', ativo: null },
  { passo: p('Hidratante'), periodo: 'am', ativo: null },
  { passo: p('Protetor Solar', 'Protetor Solar FPS 50'), periodo: 'am', ativo: null },
  { passo: p('Gel de Limpeza Suave'), periodo: 'pm', ativo: null },
  ...pm.map((x) => ({ passo: p(x.nome, x.nome, x.dias ?? null), periodo: 'pm' as const, ativo: x.ativo })),
  { passo: p('Hidratante'), periodo: 'pm', ativo: null },
]

const perfil = (x: Partial<PerfilMotor> = {}): PerfilMotor => ({
  marcadas: ['Cravos'], doScan: [], gravida: false, isotretinoina: false, barreiraComprometida: false, rosacea: false, alergiaCorta: [], ...x,
})
const plano = (ativos: AtivoId[] = ['salicilico'], x: Partial<Plano> = {}): Plano => ({
  ativos: ativos.map((a, i) => ({ ativo: a, dores: [i === 0 ? 'Cravos' : 'Manchas'], alternativas: [] })),
  avisos: [], marcadas: ['Cravos'], proibidos: {}, limiteFortes: 2, soBasicos: false, avisosGerais: [], ...x,
})
const filtros = (x: Partial<FiltrosPele> = {}): FiltrosPele => ({
  tipoPele: null, gravida: false, sensivel: false, alergenosCortados: [], alergiaAtivos: [], proibidos: [],
  fortesPermitidos: ['salicilico'], orcamento: null, concernsCodigos: ['cravos'], ...x,
})
const ctx = (x: Partial<ContextoCasa> = {}, ativos: AtivoId[] = ['salicilico']): ContextoCasa => ({
  perfil: perfil(), plano: plano(ativos), filtros: filtros(), alergiaDescricao: null, memorias: [],
  fortesPermitidos: ativos.filter((a) => ['salicilico', 'aha', 'retinoide', 'peroxido', 'vitc_pura'].includes(a)),
  ativosDoPlano: ativos, ...x,
})
let k = 0
const casa = (nome: string, extra: Partial<EntradaFicha> = {}) => montarFicha({ indice: ++k, nome, marca: 'Marca', ...extra })

const rodar = (fichas: ReturnType<typeof casa>[], c = ctx(), rot = rotina()) => decidirCasa(rot, fichas, catalogo, c.filtros, c)
const ondeEsta = (r: ReturnType<typeof rodar>, indice: number) => r.passos.filter((d) => d.casa?.indice === indice).map((d) => `${d.periodo}:${d.passo.name}`)
const motivo = (r: ReturnType<typeof rodar>, indice: number) => r.fora.find((x) => x.ficha.indice === indice)?.motivo

Deno.test('salicílico de casa entra no lugar do salicílico do catálogo', () => {
  const sal = casa('Sérum Salicílico 2%', { categoria: 'serum' })
  const r = rodar([sal])
  assertEquals(ondeEsta(r, sal.indice), ['pm:Sérum de Ácido Salicílico'])
  assertEquals(r.passos.find((d) => d.ativo === 'salicilico')!.principal, null)
})

Deno.test('protetor de casa com FPS 30+ entra; FPS 15 é claramente pior', () => {
  const bom = casa('Protetor Solar Facial FPS 50', { categoria: 'protetor' })
  assertEquals(ondeEsta(rodar([bom]), bom.indice), ['am:Protetor Solar'])
  const fraco = casa('Protetor Facial FPS 15', { categoria: 'protetor' })
  const r = rodar([fraco])
  assertEquals(ondeEsta(r, fraco.indice), [])
  assertEquals(motivo(r, fraco.indice)?.texto, 'FPS 15 protege pouco; o rosto precisa de FPS 30 ou mais.')
  assert(r.passos.find((d) => d.passo.name === 'Protetor Solar')!.principal)
})

Deno.test('protetor corporal não faz o papel do protetor do rosto', () => {
  const corpo = casa('Protetor Solar Corpo FPS 50', { categoria: 'protetor' })
  assertEquals(motivo(rodar([corpo]), corpo.indice)?.tipo, 'sem_passo')
})

Deno.test('reação a protetor solar: o dela fica fora e o catálogo não sugere outro', () => {
  const fps = casa('Protetor Solar FPS 60', { categoria: 'protetor' })
  const r = rodar([fps], ctx({ alergiaDescricao: 'Protetor solar' }))
  assertEquals(motivo(r, fps.indice)?.texto, 'Você marcou reação a protetor solar, então ele fica fora.')
  const passo = r.passos.find((d) => d.passo.name === 'Protetor Solar')!
  assertEquals(passo.principal, null)
  assert(passo.semProduto?.includes('dermatologista'))
})

Deno.test('gravidez: tônico de salicílico fica fora com o motivo', () => {
  const t = casa('Tônico Ácido Salicílico 2%', { categoria: 'tonico' })
  const r = rodar([t], ctx({ perfil: perfil({ gravida: true }), fortesPermitidos: [] }, ['azelaico']), rotina([{ nome: 'Sérum de Ácido Azelaico', ativo: 'azelaico' }]))
  assertEquals(motivo(r, t.indice)?.texto, 'Tem ácido salicílico, que a gente evita na gravidez e na amamentação.')
})

Deno.test('azelaico abaixo do piso é claramente pior: fica o do catálogo', () => {
  const az = casa('Sérum Ácido Azelaico 5%', { categoria: 'serum' })
  const c = ctx({ plano: plano(['azelaico'], { ativos: [{ ativo: 'azelaico', dores: ['Manchas'], alternativas: [] }] }), fortesPermitidos: [] }, ['azelaico'])
  const r = rodar([az], c, rotina([{ nome: 'Sérum de Ácido Azelaico', ativo: 'azelaico' }]))
  assertEquals(motivo(r, az.indice)?.texto, 'Tem pouco ácido azelaico; para manchas, o ideal é a partir de 10%.')
})

Deno.test('concentração desconhecida: benefício da dúvida, o de casa entra', () => {
  const az = casa('Sérum Ácido Azelaico', { categoria: 'serum' })
  const c = ctx({ fortesPermitidos: [] }, ['azelaico'])
  assertEquals(ondeEsta(rodar([az], c, rotina([{ nome: 'Sérum de Ácido Azelaico', ativo: 'azelaico' }])), az.indice), ['pm:Sérum de Ácido Azelaico'])
})

Deno.test('dois de casa no mesmo passo: entra o que trata a dor principal; o outro fica com o motivo', () => {
  const simples = casa('Gel de Limpeza Suave', { categoria: 'limpeza' })
  const sal = casa('Gel de Limpeza Ácido Salicílico', { categoria: 'limpeza' })
  const r = rodar([simples, sal])
  assertEquals(ondeEsta(r, sal.indice), ['am:Gel de Limpeza Suave', 'pm:Gel de Limpeza Suave'])
  assertEquals(motivo(r, simples.indice)?.texto, 'Sua rotina já usa o Marca Gel de Limpeza Ácido Salicílico, que trata melhor os seus cravos.')
})

Deno.test('remédio de receita fica na estante com "Use como seu dermatologista orientou."', () => {
  const rem = casa('Adapaleno Gel 0,1%', { categoria: 'tratamento' })
  assertEquals(motivo(rodar([rem]), rem.indice)?.texto, 'Use como seu dermatologista orientou.')
  // O adapalenato (cosmético) não é remédio.
  assertEquals(casa('Pró-Adapaleno Sérum', { inci: ['Aqua', 'Oleyl Adapalenate'] }).medicamento, false)
})

Deno.test('memória de reação que cita o produto: fica fora', () => {
  const g = casa('Glycare Control Sérum', { marca: 'Mantecorp', categoria: 'serum' })
  const c = ctx({ memorias: [{ type: 'product_reaction', value: 'Irritação nas pálpebras após Belpele, Glycare e uma niacinamida nova.' }] })
  assertEquals(motivo(rodar([g], c), g.indice)?.tipo, 'memoria')
})

Deno.test('dupla limpeza: o óleo dela entra antes do gel, só à noite', () => {
  const oleo = casa('Madagascar Centella Light Cleansing Oil', { categoria: 'limpeza' })
  const r = rodar([oleo])
  assertEquals(ondeEsta(r, oleo.indice), ['pm:Óleo de Limpeza'])
  const pm = r.passos.filter((d) => d.periodo === 'pm').map((d) => d.passo.name)
  assertEquals(pm.indexOf('Óleo de Limpeza') + 1, pm.indexOf('Gel de Limpeza Suave'))
})

Deno.test('conferência: sabonete com salicílico sai da noite do retinoide, mas fica de manhã', () => {
  const sab = casa('Gel de Limpeza Ácido Salicílico', { categoria: 'limpeza' })
  const c = ctx({ fortesPermitidos: ['salicilico', 'retinoide'], filtros: filtros({ fortesPermitidos: ['salicilico', 'retinoide'] }) }, ['salicilico', 'retinoide'])
  const r = rodar([sab], c, rotina([
    { nome: 'Sérum de Ácido Salicílico', ativo: 'salicilico', dias: ['Seg', 'Qua', 'Sex'] },
    { nome: 'Sérum de Retinol', ativo: 'retinoide', dias: ['Ter', 'Qui', 'Sáb'] },
  ]))
  assertEquals(ondeEsta(r, sab.indice), ['am:Gel de Limpeza Suave'])
  assert(r.conferencia.some((l) => l.startsWith('incompatível')))
})

Deno.test('produto sem passo na rotina fica na estante com o motivo', () => {
  const vc = casa('Sérum Vitamina C', { categoria: 'serum' })
  assertEquals(motivo(rodar([vc], ctx({ fortesPermitidos: ['salicilico', 'vitc_pura'] })), vc.indice)?.texto, 'Não tem um passo para ele na sua rotina agora.')
})

Deno.test('ativo forte fora do plano (já com 2 fortes) fica fora com o texto aprovado', () => {
  const ret = casa('Sérum Retinol 0,3%', { categoria: 'serum' })
  const c = ctx({ fortesPermitidos: ['salicilico', 'aha'] }, ['salicilico', 'aha'])
  assertEquals(motivo(rodar([ret], c), ret.indice)?.texto, 'Tem retinol, e sua rotina já tem 2 ativos fortes.')
})

Deno.test('ficha pela lista: ácido lático no fim é corretor de pH; salicilato de filtro não é salicílico', () => {
  const h = casa('Hidratante Facial', { inci: ['Aqua', 'Glycerin', 'Cetearyl Alcohol', 'Niacinamide', 'Dimethicone', 'Phenoxyethanol', 'Lactic Acid'] })
  assertEquals(h.seguranca.includes('aha'), false)
  assertEquals(h.papel.includes('niacinamida'), true)
  const fps = casa('Protetor FPS 50', { inci: ['Aqua', 'Ethylhexyl Salicylate', 'Homosalate', 'Glycerin', 'Phenoxyethanol'] })
  assertEquals(fps.seguranca.includes('salicilico'), false)
  const ret = casa('Creme Noturno', { inci: ['Aqua', 'Glycerin', 'Phenoxyethanol', 'Parfum', 'Retinol'] })
  assertEquals(ret.seguranca.includes('retinoide'), true)
  assertEquals(ret.fragrancia, true)
})

Deno.test('resultado no formato do app da loja + passos da Minha rotina', () => {
  const sal = casa('Sérum Salicílico 2%', { categoria: 'serum' })
  const vc = casa('Sérum Vitamina C', { categoria: 'serum' })
  const r = rodar([sal, vc], ctx({ fortesPermitidos: ['salicilico', 'vitc_pura'] }))
  const total = vc.indice
  const res = resultadoDoLote(r, [sal, vc], total)
  assertEquals(res.rotina.pm.map((x) => x.produto_indice), [sal.indice])
  assertEquals(res.fora_da_rotina.map((x) => x.produto_indice), [vc.indice])
  assert(res.faltam.every((f) => f.por_que.startsWith('Sugestão: ')))
  assertEquals(res.produtos.filter((x) => !x.identificado).length, total - 2)
  const passos = passosDaMinhaRotina(r, (i) => `col-${i}`)
  assertEquals(passos.find((x) => x.nome === 'Sérum de Ácido Salicílico')!.produto, { colecao_id: `col-${sal.indice}` })
  assert(passos.filter((x) => x.nome !== 'Sérum de Ácido Salicílico').every((x) => x.produto && 'produto_id' in x.produto))
})

Deno.test('dois hidratantes: o leve de manhã, o rico à noite (usa os dois)', () => {
  const leve = casa('Hidratante Gel Toque Seco', { categoria: 'hidratante' })
  const rico = casa('Cicaplast Baume B5+', { categoria: 'hidratante' })
  const r = rodar([rico, leve])
  assertEquals(ondeEsta(r, leve.indice), ['am:Hidratante'])
  assertEquals(ondeEsta(r, rico.indice), ['pm:Hidratante'])
})

Deno.test('hidratante não precisa ter o ativo do nome do passo ("Hidratante com Ceramidas")', () => {
  const h = casa('Creme Hidratante Facial', { categoria: 'hidratante' })
  const rot: Rot = rotina().map((x) => x.passo.name === 'Hidratante' ? { ...x, passo: p('Hidratante com Ceramidas'), ativo: 'ceramidas' as AtivoId } : x)
  assertEquals(ondeEsta(rodar([h], ctx(), rot), h.indice).length, 2)
})

Deno.test('dois protetores: entra o de FPS maior', () => {
  const p30 = casa('Protetor Solar FPS 30', { categoria: 'protetor' })
  const p70 = casa('Protetor Solar Facial FPS 70', { categoria: 'protetor' })
  const r = rodar([p30, p70])
  assertEquals(ondeEsta(r, p70.indice), ['am:Protetor Solar'])
  assertEquals(motivo(r, p30.indice)?.tipo, 'repetido')
})

Deno.test('mesmo produto escaneado duas vezes: a cópia sai com "duas vezes; já está na rotina"', () => {
  const a = casa('Gel de Limpeza Facial', { categoria: 'limpeza' })
  const b = casa('Gel de Limpeza Facial', { categoria: 'limpeza' })
  assertEquals(motivo(rodar([a, b]), b.indice)?.texto, 'Você escaneou este produto duas vezes; ele já está na sua rotina.')
})

Deno.test('cópia lida de dois jeitos (caso real Creamy Solução): mesmo motivo do registro mais completo', () => {
  const a = casa('skincare Solução', { marca: 'creamy', categoria: 'tratamento', concentracoes: [{ ingrediente: 'ácido glicólico', valor: 'não impresso' }] })
  const b = casa('Creamy Solução', { marca: 'Creamy', categoria: 'tratamento' })
  const r = rodar([a, b])
  const ma = motivo(r, a.indice)!, mb = motivo(r, b.indice)!
  assertEquals(mb.texto, `Você escaneou este produto duas vezes. ${ma.texto}`)
  assertEquals(mb.tipo, ma.tipo)
})

Deno.test('mesma linha, produtos diferentes (sérum × solução) não são cópia', () => {
  const a = casa('Glycare Control', { marca: 'Mantecorp Skincare', categoria: 'serum' })
  const b = casa('Glycare Control Solução Antioleosidade', { marca: 'Mantecorp', categoria: 'tonico' })
  assertEquals(duplicatas([a, b]).size, 0)
  assertEquals(duplicatas([casa('Protetor FPS 30', { marca: 'X' }), casa('Protetor FPS 50', { marca: 'X' })]).size, 0)
})

Deno.test('"Vitamina C" só no nome de sabonete/hidratante é derivado (não forte); em sérum continua conservador', () => {
  const sab = casa('Gel de Limpeza Uniform & Matte Vitamina C', { categoria: 'limpeza' })
  assertEquals(sab.seguranca.includes('vitc_pura'), false)
  assertEquals(sab.seguranca.includes('vitc_derivado'), true)
  const ser = casa('Sérum Vitamina C', { categoria: 'serum' })
  assertEquals(ser.seguranca.includes('vitc_pura'), true)
})

Deno.test('remédio pelo nome comercial (Epiduo, Vitacid); "Benzac Oil Control" cosmético não', () => {
  assertEquals(casa('Epiduo 0,3%', { marca: 'Galderma' }).medicamento, true)
  assertEquals(casa('Vitacid Creme 0,05%', { marca: 'Theraskin' }).medicamento, true)
  assertEquals(casa('Benzac Oil Control Hidratante', { marca: 'Dermotivin' }).medicamento, false)
})

Deno.test('sabonete com forte FORA do plano entra se a rotina segue com no máximo 2 fortes', () => {
  const sab = casa('Gel de Limpeza Ácido Salicílico', { categoria: 'limpeza' })
  const c = ctx({ fortesPermitidos: [], filtros: filtros({ fortesPermitidos: [] }) }, ['azelaico'])
  const r = rodar([sab], c, rotina([{ nome: 'Sérum de Ácido Azelaico', ativo: 'azelaico' }]))
  assertEquals(ondeEsta(r, sab.indice), ['am:Gel de Limpeza Suave', 'pm:Gel de Limpeza Suave'])
})

Deno.test('sabonete com forte fora do plano sai quando passaria de 2 fortes', () => {
  const sab = casa('Gel de Limpeza Ácido Glicólico', { categoria: 'limpeza' })
  const c = ctx({ fortesPermitidos: ['salicilico', 'retinoide'], filtros: filtros({ fortesPermitidos: ['salicilico', 'retinoide'] }) }, ['salicilico', 'retinoide'])
  const r = rodar([sab], c, rotina([
    { nome: 'Sérum de Ácido Salicílico', ativo: 'salicilico', dias: ['Seg', 'Qua', 'Sex'] },
    { nome: 'Sérum de Retinol', ativo: 'retinoide', dias: ['Ter', 'Qui', 'Sáb'] },
  ]))
  assertEquals(ondeEsta(r, sab.indice), [])
  assertEquals(motivo(r, sab.indice)?.texto, 'Tem ácido glicólico, e sua rotina já tem 2 ativos fortes.')
})

Deno.test('sérum suave sem passo no plano entra como extra: 1 por turno, antes do hidratante', () => {
  const s1 = casa('Madagascar Centella Ampoule', { categoria: 'serum' })
  const s2 = casa('Sérum Peptídeos', { categoria: 'serum' })
  const s3 = casa('Sérum Ácido Hialurônico', { categoria: 'serum' })
  const r = rodar([s1, s2, s3])
  const extras = r.passos.filter((d) => d.extra && d.casa?.categoria === 'serum')
  assertEquals(extras.map((d) => d.periodo).sort(), ['am', 'pm'])
  assertEquals(motivo(r, [s1, s2, s3].find((x) => !extras.some((d) => d.casa?.indice === x.indice))!.indice)?.tipo, 'sem_passo')
  for (const per of ['am', 'pm']) {
    const nomes = r.passos.filter((d) => d.periodo === per).map((d) => d.extra && d.casa?.categoria === 'serum' ? 'EXTRA' : d.passo.name)
    assert(nomes.indexOf('EXTRA') < nomes.indexOf('Hidratante'))
  }
})

Deno.test('sérum com ativo forte não vira extra', () => {
  const ret = casa('Sérum Retinol 0,3%', { categoria: 'serum' })
  const c = ctx({ fortesPermitidos: ['salicilico', 'retinoide'] }, ['salicilico', 'retinoide'])
  assert(!rodar([ret], c).passos.some((d) => d.extra && d.casa?.indice === ret.indice && d.passo.name !== 'Sérum de Retinol'))
})

Deno.test('creme reparador que veio como "tratamento" (sem ativo) faz o papel de hidratante', () => {
  assertEquals(casa('Cicabio Crème+', { marca: 'Bioderma', categoria: 'tratamento' }).categoria, 'hidratante')
  assertEquals(casa('Secativo Ácido Salicílico', { categoria: 'tratamento' }).categoria, 'tratamento')
  assertEquals(casa('Glycare Control Solução Antioleosidade e Limpeza', { categoria: 'tonico' }).categoria, 'limpeza')
})
