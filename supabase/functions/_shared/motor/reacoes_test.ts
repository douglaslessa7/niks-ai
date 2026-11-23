import { assertEquals } from 'jsr:@std/assert@1'
import { alergiaCorta } from './perfil.ts'
import { avaliarProduto, lerReacoes, prefereSuave, resumoParaIA, textoReacao } from './reacoes.ts'

const corta = (t: string) => alergiaCorta(t).sort()
const av = (t: string, p: Parameters<typeof avaliarProduto>[0]) => {
  const v = avaliarProduto(p, lerReacoes(t))
  return v ? `${v.tipo}:${v.porque}` : null
}

const GLIC = { codigos: ['acido_glicolico', 'niacinamida'], intensidade: 'moderado', texto: 'Tônico Glicólico' }
const LATICO_SUAVE = { codigos: ['acido_latico', 'niacinamida'], intensidade: 'suave', texto: 'Ácido Lático Sérum Renovador Suave' }
const MANDELICO_MOD = { codigos: ['acido_mandelico', 'acido_hialuronico'], intensidade: 'moderado', texto: 'Mandelic Acid 10% + HA' }
const LATICO_FORTE = { codigos: ['acido_latico'], intensidade: 'forte', texto: 'Peeling Lático 10%' }
const AHA_GENERICO = { codigos: ['aha', 'bha', 'pha', 'tea_tree'], intensidade: 'moderado', texto: 'AHA-BHA-PHA 30 Days Miracle Toner' }
const SALIC = { codigos: ['acido_salicilico', 'tea_tree'], intensidade: 'moderado', texto: 'Salicylic Acid Daily Gentle Cleanser' }
const PHA = { codigos: ['gluconolactona_pha', 'centella'], intensidade: 'suave', texto: 'Super Cica Toner' }
const AZEL = { codigos: ['acido_azelaico'], intensidade: 'moderado', texto: 'Azelaico 10%' }
const VITC = { codigos: ['vitamina_c'], intensidade: 'moderado', texto: 'Vitamina C 10%' }
const TAG_AMBIGUA = { codigos: ['acido_hialuronico', 'pantenol'], alergenos: ['aha_bha'], intensidade: 'suave', texto: 'Hyalu B5' }

Deno.test('leitura do texto: ingrediente específico x família', () => {
  assertEquals(corta('Acido glicólico gerou descamação e espinhas'), ['aha'])          // sem marcador = forte
  assertEquals(corta('Ácido glicólico (leve)'), [])                                   // leve: nenhuma família
  assertEquals(corta('Ácido salicílico '), ['salicilico'])
  assertEquals(corta('Ácido Azelaico'), ['azelaico'])
  assertEquals(corta('Ácido salicílico e ácido glicólico '), ['aha', 'salicilico'])
  assertEquals(corta('Ácido glicólico, retinol'), ['aha', 'retinoide'])
  assertEquals(corta('Ácidos'), ['aha', 'pha', 'salicilico'])
  assertEquals(corta('Mix de ácidos da principia '), ['aha', 'pha', 'salicilico'])
  assertEquals(corta('Ácido de textura irregular da principia '), ['aha', 'pha', 'salicilico'])
  assertEquals(corta('Peeling químico '), ['aha', 'pha', 'salicilico'])
  assertEquals(corta('Esfoliante '), ['aha', 'pha', 'salicilico'])
  assertEquals(corta('Ácido Vitaminacid'), ['retinoide'])
  assertEquals(corta('Tretinoina (vitacid) e ácido azelaico todos os dias irrita muito minha pele '), ['azelaico', 'retinoide'])
  assertEquals(corta('O uso de muitos ácidos juntos, e tretinoina'), ['aha', 'pha', 'retinoide', 'salicilico'])
  assertEquals(corta('Ácido hialurônico'), [])
  assertEquals(corta('Protetor solar X'), [])
  assertEquals(corta('Vitamina C'), ['vitc_derivado', 'vitc_pura'])
  assertEquals(corta('Vitamina C (leve)'), ['vitc_pura'])
  assertEquals(corta('glycolic acid (mild)'), [])
  assertEquals(corta('acids'), ['aha', 'pha', 'salicilico'])
  assertEquals(corta(''), [])
})

Deno.test('glicólico LEVE: só o glicólico sai; família com o suave; outras famílias livres', () => {
  const t = 'Ácido glicólico (leve)'
  assertEquals(av(t, GLIC), 'bloqueia:ingrediente')
  assertEquals(av(t, LATICO_SUAVE), 'ressalva:mesma_familia')
  assertEquals(av(t, MANDELICO_MOD), 'ressalva:mesma_familia')
  assertEquals(av(t, LATICO_FORTE), 'bloqueia:mais_forte')
  assertEquals(av(t, AHA_GENERICO), 'bloqueia:pode_conter')
  assertEquals(av(t, TAG_AMBIGUA), 'bloqueia:pode_conter')
  assertEquals(av(t, SALIC), null)
  assertEquals(av(t, PHA), null)
  assertEquals(av(t, AZEL), null)
  assertEquals(av(t, VITC), null)
  assertEquals(prefereSuave('aha', lerReacoes(t)), true)
  assertEquals(prefereSuave('salicilico', lerReacoes(t)), false)
  // Pelo texto do rótulo (scan/casa), sem códigos do catálogo.
  assertEquals(av(t, { ativos: ['aha'], texto: 'Aqua, Glycolic Acid, Glycerin' }), 'bloqueia:ingrediente')
  assertEquals(av(t, { ativos: ['aha'], texto: 'Aqua, Lactic Acid, Glycerin' }), 'ressalva:mesma_familia')
  assertEquals(av(t, { ativos: ['aha'], texto: 'Sérum AHA' }), 'bloqueia:pode_conter')
})

Deno.test('glicólico FORTE (sem marcador): família AHA sai; PHA com ressalva; BHA livre', () => {
  const t = 'Ácido glicólico'
  assertEquals(av(t, GLIC), 'bloqueia:ingrediente')
  assertEquals(av(t, LATICO_SUAVE), 'bloqueia:familia')
  assertEquals(av(t, AHA_GENERICO), 'bloqueia:familia')
  assertEquals(av(t, PHA), 'ressalva:pha_depois_aha')
  assertEquals(av(t, SALIC), null)
  assertEquals(av(t, AZEL), null)
  assertEquals(lerReacoes(t)[0].revisarDermato, true)
})

Deno.test('azelaico e salicílico: só a própria família', () => {
  assertEquals(av('Ácido Azelaico', AZEL), 'bloqueia:ingrediente')
  assertEquals(av('Ácido Azelaico', GLIC), null)
  assertEquals(av('Ácido Azelaico', SALIC), null)
  assertEquals(av('Ácido salicílico', SALIC), 'bloqueia:ingrediente')
  assertEquals(av('Ácido salicílico', LATICO_SUAVE), null)
  assertEquals(av('Ácido salicílico', TAG_AMBIGUA), 'bloqueia:pode_conter')
  assertEquals(av('Ácidos', PHA), 'bloqueia:ingrediente')
})

Deno.test('textos para ela', () => {
  const v = avaliarProduto(GLIC, lerReacoes('Ácido glicólico (leve)'))!
  assertEquals(textoReacao(v), 'Você marcou reação leve a ácido glicólico, que está neste produto. Eu evitaria.')
  const f = avaliarProduto(LATICO_SUAVE, lerReacoes('Ácido glicólico'))!
  assertEquals(textoReacao(f), 'Você marcou reação a ácido glicólico. Este produto tem um ácido da mesma família; eu evitaria até seu dermatologista avaliar.')
  const r = avaliarProduto(LATICO_SUAVE, lerReacoes('Ácido glicólico (leve)'))!
  assertEquals(textoReacao(r, true), "You've told us you had a mild reaction to glycolic acid. This is a gentler one from the same family: patch test on a small area for a few days first.")
  assertEquals(resumoParaIA(lerReacoes('Ácido glicólico (leve)')).includes('BHA (salicílico), PHA, azelaico'), true)
})
