// cd supabase/functions && deno test --no-lock --config deno.json _shared/motor/
import { assertEquals, assert } from 'jsr:@std/assert@1'
import { montarPlano, type PerfilMotor } from './plano.ts'
import { perfilMotor, alergiaCorta } from './perfil.ts'
import { doresMarcadas } from './dores.ts'

const tudo = () => true
const base = (p: Partial<PerfilMotor>): PerfilMotor => ({
  marcadas: [], doScan: [], gravida: false, isotretinoina: false,
  barreiraComprometida: false, rosacea: false, alergiaCorta: [], ...p,
})
const ativos = (pl: ReturnType<typeof montarPlano>) => pl.ativos.map((a) => a.ativo)

Deno.test('Cravos sozinho → salicílico', () => {
  const pl = montarPlano(base({ marcadas: ['Cravos'] }), { temProduto: tudo })
  assertEquals(ativos(pl), ['salicilico'])
  assertEquals(pl.avisos, [])
})

Deno.test('Acne + Cravos + Manchas → salicílico + azelaico (caso real)', () => {
  const pl = montarPlano(base({ marcadas: ['Acne/espinhas', 'Cravos', 'Manchas'] }), { temProduto: tudo })
  assertEquals(ativos(pl), ['salicilico', 'azelaico'])
  assertEquals(pl.avisos, [])
  assertEquals(pl.ativos[0].dores.sort(), ['Acne/espinhas', 'Cravos'].sort())
})

Deno.test('Rugas + Cravos + Textura → só retinoide, sem aviso', () => {
  const pl = montarPlano(base({ marcadas: ['Rugas', 'Cravos', 'Textura irregular'] }), { temProduto: tudo })
  assertEquals(ativos(pl), ['retinoide'])
  assertEquals(pl.avisos, [])
})

Deno.test('limite de 2 fortes: 3 dores só com fortes sem sobreposição → 3ª vira aviso', () => {
  const pl = montarPlano(base({ marcadas: ['Cravos', 'Rugas', 'Textura irregular'] }), {
    temProduto: tudo,
    tabela: { 'Cravos': ['salicilico'], 'Rugas': ['retinoide'], 'Textura irregular': ['aha'] },
  })
  assertEquals(ativos(pl), ['salicilico', 'retinoide'])
  assertEquals(pl.avisos.map((a) => [a.dor, a.motivo]), [['Textura irregular', 'limite']])
})

Deno.test('gestante + alergia a ácidos com Cravos → azelaico (16/nov/2026: sem salicílico na gravidez, azelaico no lugar)', () => {
  const pl = montarPlano(base({ marcadas: ['Cravos'], gravida: true, alergiaCorta: alergiaCorta('tive reação a ácidos') }), { temProduto: tudo })
  assertEquals(ativos(pl), ['azelaico'])
  assertEquals(pl.avisos, [])
})

Deno.test('gravidez/amamentação/tentante: sem salicílico — cravos e acne vão para o azelaico; AHA continua liberado', () => {
  assertEquals(ativos(montarPlano(base({ marcadas: ['Cravos'], gravida: true }), { temProduto: tudo })), ['azelaico'])
  assertEquals(ativos(montarPlano(base({ marcadas: ['Acne/espinhas'], gravida: true }), { temProduto: tudo })), ['azelaico'])
  assertEquals(ativos(montarPlano(base({ marcadas: ['Textura irregular'], gravida: true }), { temProduto: tudo })), ['aha'])
  // Sem gravidez, nada muda: cravos → salicílico.
  assertEquals(ativos(montarPlano(base({ marcadas: ['Cravos'] }), { temProduto: tudo })), ['salicilico'])
})

Deno.test('gestante com Rugas → sem retinoide, usa peptídeos', () => {
  const pl = montarPlano(base({ marcadas: ['Rugas'], gravida: true }), { temProduto: tudo })
  assert(!ativos(pl).includes('retinoide'))
  assertEquals(ativos(pl), ['peptideos'])
})

Deno.test('gravidez vale para todos os ativos: peróxido também sai', () => {
  const pl = montarPlano(base({ marcadas: ['Acne/espinhas'], gravida: true }), {
    temProduto: tudo, tabela: { 'Acne/espinhas': ['peroxido', 'retinoide'] },
  })
  assertEquals(ativos(pl), [])
  assertEquals(pl.avisos[0].motivo, 'gravidez')
})

Deno.test('barreira comprometida → nenhum forte, ceramidas entram', () => {
  const pl = montarPlano(base({ marcadas: ['Cravos', 'Manchas'], barreiraComprometida: true }), { temProduto: tudo })
  assert(pl.ativos.every((a) => !['salicilico', 'aha', 'retinoide', 'peroxido', 'vitc_pura'].includes(a.ativo)))
  assertEquals(pl.avisos.map((a) => [a.dor, a.motivo]), [['Cravos', 'barreira']])
  assert(ativos(pl).includes('azelaico'))
  assert(ativos(pl).includes('ceramidas'))
})

Deno.test('isotretinoína → nenhum ativo de tratamento, nem os não fortes; só básicos', () => {
  const pl = montarPlano(base({ marcadas: ['Cravos', 'Acne/espinhas', 'Oleosidade'], isotretinoina: true }), { temProduto: tudo })
  assertEquals(ativos(pl), [])
  assertEquals(pl.avisos.map((a) => a.motivo), ['isotretinoina', 'isotretinoina', 'isotretinoina'])
  assert(pl.soBasicos)
  // Ressecamento continua: ceramidas vão no hidratante.
  assertEquals(ativos(montarPlano(base({ marcadas: ['Ressecamento'], isotretinoina: true }), { temProduto: tudo })), ['ceramidas'])
})

Deno.test('dor cortada pelo teto de tratamentos diz "teto", não "2 fortes"', () => {
  const todas = ['Cravos', 'Acne/espinhas', 'Oleosidade', 'Poros dilatados', 'Manchas', 'Textura irregular', 'Rugas', 'Ressecamento', 'Olheiras'] as any
  const pl = montarPlano(base({ marcadas: todas }), { temProduto: tudo })
  const olh = pl.avisos.find((a) => a.dor === 'Olheiras')!
  assertEquals(olh.motivo, 'teto')
  assert(!olh.texto.includes('2 ativos fortes'))
})

Deno.test('alergia a ácidos: Cravos cai no retinoide', () => {
  const pl = montarPlano(base({ marcadas: ['Cravos'], alergiaCorta: alergiaCorta('ácido salicílico') }), { temProduto: tudo })
  assertEquals(ativos(pl), ['retinoide'])
})

Deno.test('ativo sem produto no catálogo não entra', () => {
  const pl = montarPlano(base({ marcadas: ['Cravos'] }), { temProduto: (a) => a !== 'salicilico' })
  assertEquals(ativos(pl), ['retinoide'])
})

Deno.test('dor principal vem antes da ordem de toque', () => {
  assertEquals(doresMarcadas(['Manchas', 'Cravos'], 'cravos'), ['Cravos', 'Manchas'])
  assertEquals(doresMarcadas(['Manchas', 'Outro', 'Cravos']), ['Manchas', 'Cravos'])
})

Deno.test('perfil real da conta de teste (scan com acne leve e manchas)', () => {
  const scan = { barrier_status: 'integra', acne: { present: true }, pigmentacao: { present: true },
    prioridade_clinica: { primaria: 'acne inflamatória leve' }, textura_poros: { pore_visibility: 'levemente_dilatado', texture: 'levemente_irregular' } }
  const p = perfilMotor(scan, { concerns: ['Acne/espinhas', 'Cravos', 'Manchas'], pregnancy_status: 'none', allergy_type: 'none' })
  const pl = montarPlano(p, { temProduto: tudo })
  assertEquals(ativos(pl), ['salicilico', 'azelaico'])
})

Deno.test('dores do scan não geram aviso e não passam do teto', () => {
  const pl = montarPlano(base({ marcadas: ['Oleosidade'], doScan: ['Rugas', 'Manchas', 'Ressecamento', 'Olheiras'] }), { temProduto: tudo })
  assertEquals(pl.avisos, [])
  assert(pl.ativos.length <= 3)
})

Deno.test("isotretinoína: aceita 'sim' do app e true da linha users", () => {
  const scan = { barrier_status: 'integra' }
  for (const v of ['sim', true]) {
    const pl = montarPlano(perfilMotor(scan, { concerns: ['Cravos'], isotretinoina: v }), { temProduto: tudo })
    assertEquals(pl.avisos.map((a) => a.motivo), ['isotretinoina'])
  }
  assertEquals(ativos(montarPlano(perfilMotor(scan, { concerns: ['Cravos'], isotretinoina: 'nao' }), { temProduto: tudo })), ['salicilico'])
})

import { textosDosAvisos, AVISO_ISOTRETINOINA_AMAMENTACAO } from './plano.ts'

Deno.test('isotretinoína: um aviso só com as dores juntas; + amamentando → aviso de falar com o médico primeiro', () => {
  const pl = montarPlano(base({ marcadas: ['Oleosidade', 'Manchas'], isotretinoina: true, amamentando: true }), { temProduto: tudo })
  const t = textosDosAvisos(pl)
  assertEquals(t.length, 2)
  assertEquals(t[0], AVISO_ISOTRETINOINA_AMAMENTACAO)
  assert(t[1].includes('oleosidade e manchas'))
  // Sem amamentação: só o aviso das dores.
  assertEquals(textosDosAvisos(montarPlano(base({ marcadas: ['Oleosidade', 'Manchas'], isotretinoina: true }), { temProduto: tudo })).length, 1)
})

import { doresDoScan } from './dores.ts'

Deno.test('achado LEVE do scan não acrescenta tratamento; moderado acrescenta (16/nov/2026)', () => {
  // O scan real da conta de teste: acne IGA 1, manchas 2, oleosidade leve, poros "levemente".
  const leve = {
    acne: { present: true, severity: 'leve', severity_score: 1 }, pigmentacao: { present: true, intensity_score: 2 },
    brilho_sebaceo: { intensity: 'leve' }, textura_poros: { pore_visibility: 'levemente_dilatado', texture: 'levemente_irregular' },
    envelhecimento: { present: false }, skin_hydration: 'normal', prioridade_clinica: { primaria: 'pigmentação leve nas bochechas' },
  }
  assertEquals(doresDoScan(leve), [])
  const pl = montarPlano(base({ marcadas: ['Oleosidade', 'Manchas'], doScan: doresDoScan(leve) }), { temProduto: tudo })
  assertEquals(ativos(pl), ['niacinamida'])
  // Moderado: acne IGA 3 e oleosidade "moderado" entram.
  const moderado = { ...leve, acne: { present: true, severity: 'moderada', severity_score: 3 }, brilho_sebaceo: { intensity: 'moderado' } }
  assertEquals(doresDoScan(moderado), ['Acne/espinhas', 'Oleosidade'])
  // As dores marcadas sempre mandam, mesmo com o scan leve.
  assertEquals(ativos(montarPlano(base({ marcadas: ['Acne/espinhas'], doScan: doresDoScan(leve) }), { temProduto: tudo })), ['salicilico'])
})
