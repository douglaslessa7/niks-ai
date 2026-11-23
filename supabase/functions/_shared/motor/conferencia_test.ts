import { assertEquals, assert } from 'jsr:@std/assert@1'
import { montarPlano, type PerfilMotor } from './plano.ts'
import { corrigirRotina, problemasDaRotina, diasDoPasso, ativosDoPasso, comAvisos, type Protocolo, type Passo } from './conferencia.ts'

const base = (p: Partial<PerfilMotor>): PerfilMotor => ({
  marcadas: [], doScan: [], gravida: false, isotretinoina: false,
  barreiraComprometida: false, rosacea: false, alergiaCorta: [], ...p,
})
const passo = (name: string, ingredient: string, extra: Partial<Passo> = {}): Passo => ({ name, ingredient, instruction: '', steps: [], ...extra })
const limpeza = passo('Gel de Limpeza Suave', 'Gel de Limpeza sem sulfatos')
const hidr = passo('Hidratante com Ceramidas', 'Hidratante com Ceramidas')
const fps = passo('Protetor Solar', 'Protetor Solar FPS 50')

Deno.test('rotina antiga do caso real (sem salicílico) → falta_ativo e correção insere o salicílico à noite', () => {
  const plano = montarPlano(base({ marcadas: ['Acne/espinhas', 'Cravos', 'Manchas'] }), { temProduto: () => true })
  const proto: Protocolo = {
    morning: [limpeza, passo('Sérum de Niacinamida', 'Sérum de Niacinamida 5%'), hidr, fps],
    night: [limpeza, passo('Sérum de Ácido Azelaico', 'Sérum de Ácido Azelaico 10%'), hidr],
  }
  // A niacinamida da manhã não está no plano (16/nov/2026: tratamento fora do plano sai, mesmo não forte).
  assertEquals(problemasDaRotina(proto, plano).map((p) => p.tipo), ['falta_ativo', 'fora_do_plano'])
  const ok = corrigirRotina(proto, plano)
  assertEquals(problemasDaRotina(ok, plano), [])
  assert(ok.night.some((p) => ativosDoPasso(p).includes('salicilico')))
  // Tratamento entra antes do hidratante, e o protetor continua o último da manhã.
  assertEquals(ok.night.map((p) => p.ativo), [null, 'azelaico', 'salicilico', null])
  assertEquals(ok.morning[ok.morning.length - 1].name, 'Protetor Solar')
  assert(!ok.morning.some((p) => /niacinamida/i.test(p.name)))
})

Deno.test('salicílico e retinoide toda noite → conflito; correção divide os dias', () => {
  const plano = montarPlano(base({ marcadas: ['Rugas', 'Oleosidade'] }), {
    temProduto: () => true, tabela: { 'Rugas': ['retinoide'], 'Oleosidade': ['salicilico'] },
  })
  const proto: Protocolo = {
    morning: [limpeza, hidr, fps],
    night: [limpeza, passo('Sérum de Retinol', 'Sérum de Retinol 0,3%'), passo('Sérum de Ácido Salicílico', 'Sérum de Ácido Salicílico 2%'), hidr],
  }
  assert(problemasDaRotina(proto, plano).some((p) => p.tipo === 'conflito'))
  const ok = corrigirRotina(proto, plano)
  assertEquals(problemasDaRotina(ok, plano), [])
  // O salicílico pode ir para a manhã — a correção prefere mudar de turno a dividir dias.
  const ret = [...ok.morning, ...ok.night].find((p) => p.ativo === 'retinoide')!
  const sal = [...ok.morning, ...ok.night].find((p) => p.ativo === 'salicilico')!
  assert(ok.night.includes(ret))
  assert(ok.morning.includes(sal) || !(diasDoPasso(ret) ?? []).some((d) => (diasDoPasso(sal) ?? []).includes(d)))
})

Deno.test('dois incompatíveis que só podem à noite → dias divididos e sufixo reescrito', () => {
  const plano = montarPlano(base({ marcadas: ['Rugas', 'Textura irregular'] }), {
    temProduto: () => true, tabela: { 'Rugas': ['retinoide'], 'Textura irregular': ['aha'] },
  })
  const proto: Protocolo = {
    morning: [limpeza, hidr, fps],
    night: [limpeza, passo('Sérum de Retinol', 'Sérum de Retinol 0,3%'), passo('Sérum de Ácido Mandélico', 'Sérum de Ácido Mandélico 10%'), hidr],
  }
  const ok = corrigirRotina(proto, plano)
  assertEquals(problemasDaRotina(ok, plano), [])
  const ret = ok.night.find((p) => p.ativo === 'retinoide')!
  const aha = ok.night.find((p) => p.ativo === 'aha')!
  assert(ret.dias && aha.dias && !ret.dias.some((d) => aha.dias!.includes(d)))
  assert(ret.ingredient.endsWith(`(${ret.dias!.join('/')})`))
  assert(aha.ingredient.endsWith(`(${aha.dias!.join('/')})`))
})

Deno.test('forte fora do plano num sabonete → vira limpeza suave', () => {
  const plano = montarPlano(base({ marcadas: ['Manchas'] }), { temProduto: () => true })
  const proto: Protocolo = {
    morning: [passo('Gel de Limpeza com Ácido Salicílico', 'Gel de Limpeza com Ácido Salicílico 2%'), hidr, fps],
    night: [limpeza, passo('Sérum de Ácido Azelaico', 'Sérum de Ácido Azelaico 10%'), hidr],
  }
  assert(problemasDaRotina(proto, plano).some((p) => p.tipo === 'forte_fora_do_plano'))
  const ok = corrigirRotina(proto, plano)
  assertEquals(problemasDaRotina(ok, plano), [])
  assertEquals(ok.morning[0].name, 'Gel de Limpeza Suave')
})

Deno.test('gestante: retinoide proibido é removido, sem protetor ganha protetor', () => {
  const plano = montarPlano(base({ marcadas: ['Rugas'], gravida: true }), { temProduto: () => true })
  const proto: Protocolo = { morning: [limpeza, hidr], night: [limpeza, passo('Sérum de Retinol', 'Sérum de Retinol 0,3%'), hidr] }
  const ok = corrigirRotina(proto, plano)
  assertEquals(problemasDaRotina(ok, plano), [])
  assert(![...ok.morning, ...ok.night].some((p) => ativosDoPasso(p).includes('retinoide')))
  assert(ok.morning.some((p) => p.ativo === 'peptideos') || ok.night.some((p) => p.ativo === 'peptideos'))
})

Deno.test('a IA pode trocar por uma alternativa da mesma dor', () => {
  const plano = montarPlano(base({ marcadas: ['Manchas'] }), { temProduto: () => true })
  const proto: Protocolo = {
    morning: [limpeza, passo('Sérum de Vitamina C Estável', 'Sérum de Ascorbil Glucosídeo 12%'), hidr, fps],
    night: [limpeza, hidr],
  }
  assertEquals(problemasDaRotina(proto, plano), [])
})

Deno.test('dias: campo estruturado manda; sem ele, lê o sufixo', () => {
  assertEquals(diasDoPasso(passo('x', 'Sérum (Ter/Qui)')), ['Ter', 'Qui'])
  assertEquals(diasDoPasso(passo('x', 'Sérum (Ter/Qui)', { dias: ['Seg', 'Sex'] })), ['Seg', 'Sex'])
  assertEquals(diasDoPasso(passo('x', 'Sérum')), null)
})

Deno.test('avisos entram no introduction_warnings sem repetir', () => {
  const p = comAvisos({ morning: [], night: [], introduction_warnings: 'Texto da IA.' }, ['Aviso A.'])
  assertEquals(p.introduction_warnings, 'Aviso A. Texto da IA.')
  assertEquals(comAvisos(p, ['Aviso A.']).introduction_warnings, 'Aviso A. Texto da IA.')
})

Deno.test('o texto do passo manda sobre o campo ativo da IA', () => {
  assertEquals(ativosDoPasso(passo('Sérum de Niacinamida', 'Niacinamida 5%', { ativo: 'azelaico' })), ['niacinamida'])
  assertEquals(ativosDoPasso(passo('Sérum Tratamento', 'Sérum', { ativo: 'azelaico' })), ['azelaico'])
})

Deno.test('ordem: tratamento antes do hidratante; hidratante repetido sai', () => {
  const plano = montarPlano(base({ marcadas: ['Manchas'] }), { temProduto: () => true })
  const proto: Protocolo = {
    morning: [limpeza, hidr, fps],
    night: [limpeza, passo('Sérum de Retinol', 'x'), hidr, passo('Sérum de Ácido Azelaico', 'Azelaico 10%'), hidr],
  }
  const ok = corrigirRotina(proto, plano)
  assertEquals(ok.night.map((p) => p.name), ['Gel de Limpeza Suave', 'Sérum de Ácido Azelaico', 'Hidratante com Ceramidas'])
})

Deno.test('manhã sem hidratante (caso real 16/nov) → problema e correção no código', () => {
  const pl = { ativos: [{ ativo: 'salicilico', dores: ['Cravos'], alternativas: [] }], avisos: [], proibidos: {}, limiteFortes: 2 } as any
  const proto = {
    morning: [{ name: 'Gel de Limpeza Suave', ingredient: 'Gel de Limpeza Suave' }, { name: 'Protetor Solar Diário', ingredient: 'Protetor Solar FPS 50' }],
    night: [{ name: 'Gel de Limpeza Suave', ingredient: 'Gel de Limpeza Suave' }, { name: 'Sérum de Ácido Salicílico', ingredient: 'Sérum de Ácido Salicílico 2% (Seg/Qua/Sex)', ativo: 'salicilico' }, { name: 'Hidratante Calmante', ingredient: 'Hidratante com Ceramidas' }],
  } as any
  const ps = problemasDaRotina(proto, pl)
  assertEquals(ps.map((p: any) => [p.tipo, p.basico, p.periodo]), [['sem_basico', 'hidratante', 'am']])
  const c = corrigirRotina(proto, pl)
  assertEquals(problemasDaRotina(c, pl), [])
  assertEquals(c.morning.map((p: any) => p.name), ['Gel de Limpeza Suave', 'Hidratante', 'Protetor Solar Diário'])
})

const planoDe = (ativos: string[], extra: Record<string, unknown> = {}) => ({
  ativos: ativos.map((a) => ({ ativo: a, dores: ['Manchas'], alternativas: [] })), avisos: [], proibidos: {}, limiteFortes: 2, soBasicos: false, ...extra,
}) as any
const lim = (n = 'Gel de Limpeza Suave') => ({ name: n, ingredient: n })
const hid = () => ({ name: 'Hidratante', ingredient: 'Hidratante com Ceramidas' })
const fps2 = () => ({ name: 'Protetor Solar', ingredient: 'Protetor Solar FPS 50' })

Deno.test('azelaico dividido entre manhã e noite → um turno só, todo dia', () => {
  const pl = planoDe(['azelaico'])
  const proto = {
    morning: [lim(), { name: 'Sérum de Azelaico', ingredient: 'Ácido Azelaico 10% (Seg/Qua/Sex)', ativo: 'azelaico', dias: ['Seg', 'Qua', 'Sex'] }, hid(), fps2()],
    night: [lim(), { name: 'Sérum de Azelaico', ingredient: 'Ácido Azelaico 10% (Ter/Qui/Sáb)', ativo: 'azelaico', dias: ['Ter', 'Qui', 'Sáb'] }, hid()],
  } as any
  assert(problemasDaRotina(proto, pl).some((p: any) => p.tipo === 'diario'))
  const c = corrigirRotina(proto, pl)
  assertEquals(problemasDaRotina(c, pl), [])
  const com = [...c.morning, ...c.night].filter((p: any) => p.ativo === 'azelaico')
  assertEquals(com.length, 1)
  assertEquals(com[0].dias, null)
})

Deno.test('retinoide todo dia ou 4×/semana → no máximo 3 dias', () => {
  const pl = planoDe(['retinoide'])
  const proto = { morning: [lim(), hid(), fps2()], night: [lim(), { name: 'Sérum de Retinol', ingredient: 'Retinol 0,3% (Seg/Ter/Qui/Sex)', ativo: 'retinoide' }, hid()] } as any
  assert(problemasDaRotina(proto, pl).some((p: any) => p.tipo === 'frequencia'))
  const c = corrigirRotina(proto, pl)
  assertEquals(problemasDaRotina(c, pl), [])
  assert((c.night.find((p: any) => p.ativo === 'retinoide')!.dias as string[]).length <= 3)
})

Deno.test('cafeína num "Sérum de Cafeína" → vira passo de olhos', () => {
  const pl = planoDe(['cafeina'])
  const proto = { morning: [lim(), { name: 'Sérum de Cafeína', ingredient: 'Sérum de Cafeína 5%', ativo: 'cafeina' }, hid(), fps2()], night: [lim(), hid()] } as any
  assert(problemasDaRotina(proto, pl).some((p: any) => p.tipo === 'olhos'))
  const c = corrigirRotina(proto, pl)
  assertEquals(problemasDaRotina(c, pl), [])
  assert(c.morning.some((p: any) => /olhos/i.test(p.name)))
})

Deno.test('isotretinoína: passo de tratamento sai, ficam só os básicos', () => {
  const pl = planoDe([], { soBasicos: true })
  const proto = { morning: [lim(), { name: 'Sérum Calmante', ingredient: 'Sérum de Pantenol' }, hid(), fps2()], night: [lim(), { name: 'Sérum de Niacinamida', ingredient: 'Niacinamida 5%' }, hid()] } as any
  assert(problemasDaRotina(proto, pl).some((p: any) => p.tipo === 'so_basicos'))
  const c = corrigirRotina(proto, pl)
  assertEquals(problemasDaRotina(c, pl), [])
  assertEquals(c.night.map((p: any) => p.name), ['Gel de Limpeza Suave', 'Hidratante'])
})

Deno.test('tratamento fora do plano, mesmo não forte (azelaico extra), sai', () => {
  const pl = planoDe(['salicilico'])
  const proto = {
    morning: [lim(), { name: 'Sérum de Ácido Azelaico', ingredient: 'Ácido Azelaico 10%' }, hid(), fps2()],
    night: [lim(), { name: 'Sérum de Ácido Salicílico', ingredient: 'Salicílico 2% (Seg/Qua/Sex)', ativo: 'salicilico' }, hid()],
  } as any
  assert(problemasDaRotina(proto, pl).some((p: any) => p.tipo === 'fora_do_plano'))
  const c = corrigirRotina(proto, pl)
  assertEquals(problemasDaRotina(c, pl), [])
  assertEquals(c.morning.map((p: any) => p.name), ['Gel de Limpeza Suave', 'Hidratante', 'Protetor Solar'])
})

Deno.test('salicílico de manhã todo dia + 3 noites → um turno só, no máximo 3 dias', () => {
  const pl = planoDe(['salicilico'])
  const proto = {
    morning: [lim(), { name: 'Sérum de Ácido Salicílico', ingredient: 'Salicílico 2%', ativo: 'salicilico' }, hid(), fps2()],
    night: [lim(), { name: 'Sérum de Ácido Salicílico', ingredient: 'Salicílico 2% (Seg/Qua/Sex)', ativo: 'salicilico' }, hid()],
  } as any
  const tipos = problemasDaRotina(proto, pl).map((p: any) => p.tipo)
  assert(tipos.includes('um_turno') && tipos.includes('frequencia'))
  const c = corrigirRotina(proto, pl)
  assertEquals(problemasDaRotina(c, pl), [])
  const com = [...c.morning, ...c.night].filter((p: any) => p.ativo === 'salicilico')
  assertEquals(com.length, 1)
  assert((com[0].dias as string[]).length <= 3)
})

Deno.test('comAvisos tira a frase da IA sobre isotretinoína quando o aviso do plano já cobre', () => {
  const proto = { morning: [], night: [], introduction_warnings: 'Enquanto você usa isotretinoína, a pele fica sensível. Se surgir vermelhidão por mais de 48 horas, procure seu dermatologista.' } as any
  const r = comAvisos(proto, ['Aviso do plano.'], /isotretino/i)
  assertEquals(r.introduction_warnings, 'Aviso do plano. Se surgir vermelhidão por mais de 48 horas, procure seu dermatologista.')
})

Deno.test('a IA copiou o nome interno "AHA (glicólico, mandélico ou lático)" → vira um ativo específico', () => {
  const pl = planoDe(['aha'])
  const proto = { morning: [lim(), hid(), fps2()], night: [lim(), { name: 'AHA Noite', ingredient: 'AHA (glicólico, mandélico ou lático) (Seg/Qua/Sex)', ativo: 'aha' }, hid()] } as any
  assert(problemasDaRotina(proto, pl).some((p: any) => p.tipo === 'nome_interno'))
  const c = corrigirRotina(proto, pl)
  assertEquals(problemasDaRotina(c, pl), [])
  const aha = c.night.find((p: any) => p.ativo === 'aha')!
  assert(!aha.ingredient.includes(' ou '))
  assertEquals(aha.dias, ['Seg', 'Qua', 'Sex'])
})
