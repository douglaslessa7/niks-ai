import { assertEquals } from 'jsr:@std/assert@1'
import { conferirResultado } from './conferir.ts'
const base = (over: any = {}) => ({ status: 'ok', produto: { nome: 'X', ativos_detectados: [] }, veredito: 'pode_usar', compatibilidade: 85,
  resumo: 'r', explicacao: 'e', resultado_esperado_para_voce: 'v', avisos: [],
  decisao_rotina: { tipo: 'adicionar', passo: 'Sérum', periodo: 'pm', dias: null, justificativa: 'j' }, ...over })
const passo = (id: string, name: string, ingredient: string, dias: string[] | null = null) => ({ _rowId: id, name, ingredient, dias })
const ctx = (perfil: any = {}, am: any[] = [], pm: any[] = []) => ({ profile: perfil, lastScan: { full_result: { barrier_status: 'integra' } }, memories: [], protocol: { rotina_am: am, rotina_pm: pm } } as any)
const rotinaDono = [passo('p1', 'Gel de Limpeza Suave', 'Gel de Limpeza Suave'), passo('p2', 'Sérum de Ácido Salicílico', 'Sérum de Ácido Salicílico 2% (Seg/Qua/Sex)', ['Seg','Qua','Sex']), passo('p3', 'Hidratante Leve', 'Hidratante com Ceramidas')]

Deno.test('gestante + retinol pode_usar 85 → evitaria ≤35, rotina manter', () => {
  const r = conferirResultado(base({ produto: { nome: 'Retinol 0.5% in Squalane', ativos_detectados: ['Retinol 0,5%'] } }), ctx({ pregnancy_status: 'pregnant' })).result
  assertEquals([r.veredito, r.compatibilidade <= 35, r.decisao_rotina.tipo], ['evitaria', true, 'manter_rotina'])
})
Deno.test('rotina NÃO mexe na nota: com_ressalva 60 fica 60', () => {
  const r = conferirResultado(base({ veredito: 'com_ressalva', compatibilidade: 60, ressalvas: [{ codigo: 'tipo_pele', texto: 'x' }], decisao_rotina: { tipo: 'manter_rotina' } }), ctx({ tipo_pele: 'oleosa' }, [], rotinaDono)).result
  assertEquals([r.veredito, r.compatibilidade], ['com_ressalva', 60])
})
Deno.test('nota fora da faixa é presa', () => {
  assertEquals(conferirResultado(base({ compatibilidade: 60 }), ctx()).result.compatibilidade, 75)
})
Deno.test('máscara com BHA numa rotina com salicílico → manter (repetido)', () => {
  const c = conferirResultado(base({ produto: { nome: 'Zero Pore Blackhead Mud Mask', ativos_detectados: ['AHA', 'BHA', 'PHA', 'Argila'] } }), ctx({}, [], rotinaDono))
  assertEquals([c.result.decisao_rotina.tipo, c.mudancas[0].includes('repetido')], ['manter_rotina', true])
})
Deno.test('AHA numa rotina com salicílico Seg/Qua/Sex → dias fora deles, máx 3', () => {
  const c = conferirResultado(base({ produto: { nome: 'Glycolic', ativos_detectados: ['Ácido glicólico 7%'] }, decisao_rotina: { tipo: 'adicionar', periodo: 'pm', dias: ['Seg','Ter','Qua','Qui','Sex'], justificativa: 'j' } }), ctx({}, [], rotinaDono))
  assertEquals(c.result.decisao_rotina.dias, ['Ter', 'Qui', 'Sáb'])
})
Deno.test('3º ativo forte → manter (limite)', () => {
  const pm = [passo('a', 'Sérum de Ácido Salicílico', 'Sérum de Ácido Salicílico 2% (Seg/Qua/Sex)', ['Seg','Qua','Sex']), passo('b', 'Retinol', 'Retinol 0,3% (Ter/Sáb)', ['Ter','Sáb'])]
  const c = conferirResultado(base({ produto: { nome: 'Glycolic', ativos_detectados: ['Ácido glicólico'] } }), ctx({}, [], pm))
  assertEquals(c.result.decisao_rotina.tipo, 'manter_rotina')
})
Deno.test('substituir hidratante por sérum de azelaico → manter (não bate com o passo)', () => {
  const pm = [passo('h', 'Sérum de Niacinamida', 'Niacinamida 5%')]
  const c = conferirResultado(base({ produto: { nome: 'Azelaic Acid 10%', ativos_detectados: ['Ácido azelaico'] }, decisao_rotina: { tipo: 'substituir', periodo: 'pm', substitui_passo_id: 'h', justificativa: 'j' } }), ctx({}, [], pm))
  assertEquals(c.result.decisao_rotina.tipo, 'manter_rotina')
})
Deno.test('isotretinoína: niacinamida não derruba a nota, mas não entra na rotina', () => {
  const c = conferirResultado(base({ produto: { nome: 'Niacinamide 10%', ativos_detectados: ['Niacinamida 10%'] } }), ctx({ isotretinoina: true }))
  assertEquals([c.result.veredito, c.result.decisao_rotina.tipo], ['pode_usar', 'manter_rotina'])
})
Deno.test('com_ressalva sem motivo sustentado → pode_usar (Zero Pore Pads na conta do dono)', () => {
  const c = conferirResultado(base({ veredito: 'com_ressalva', compatibilidade: 70, ressalvas: [{ codigo: 'sensibilidade', texto: 'x' }], decisao_rotina: { tipo: 'manter_rotina' } }), ctx({ allergy_type: 'none' }))
  assertEquals([c.result.veredito, c.result.compatibilidade, c.result.ressalvas.length], ['pode_usar', 95, 0])
})
Deno.test('com_ressalva com sensibilidade na memória → fica', () => {
  const k = ctx({}); k.memories = [{ type: 'skin_observation', value: 'pele sensível a novos ativos' }]
  const c = conferirResultado(base({ veredito: 'com_ressalva', compatibilidade: 65, ressalvas: [{ codigo: 'sensibilidade', texto: 'x' }], decisao_rotina: { tipo: 'manter_rotina' } }), k)
  assertEquals([c.result.veredito, c.result.compatibilidade], ['com_ressalva', 65])
})
Deno.test('pode_usar com motivo sustentado → com_ressalva', () => {
  const k = ctx({}); k.lastScan.full_result.skin_phototype = 'V'
  const c = conferirResultado(base({ veredito: 'pode_usar', compatibilidade: 90, ressalvas: [{ codigo: 'fototipo', texto: 'x' }], decisao_rotina: { tipo: 'manter_rotina' } }), k)
  assertEquals([c.result.veredito, c.result.compatibilidade], ['com_ressalva', 66])
})
Deno.test('fragrância sem lista de ingredientes lida não sustenta ressalva', () => {
  const k = ctx({}); k.lastScan.full_result.contraindicacoes = ['produtos_com_alta_fragrancia']
  const c = conferirResultado(base({ veredito: 'com_ressalva', compatibilidade: 65, confianca: 'media', ressalvas: [{ codigo: 'contraindicacao_scan', texto: 'pode ter fragrância' }], decisao_rotina: { tipo: 'manter_rotina' } }), k)
  assertEquals(c.result.veredito, 'pode_usar')
})
Deno.test('texto de segurança usa o nome escrito no produto', () => {
  const r = conferirResultado(base({ produto: { nome: 'Retinol 0.5% in Squalane', ativos_detectados: ['Retinol 0,5%', 'Esqualano'] } }), ctx({ pregnancy_status: 'pregnant' })).result
  assertEquals(r.resumo, 'Com gestação, amamentação ou tentativa de engravidar, eu evitaria: ele tem retinol 0,5%. Confirme com seu obstetra antes de usar.')
})
Deno.test('vermelhidão: sem a palavra rosácea, sigla mantida', () => {
  const k = ctx({}); k.lastScan.full_result.rosacea = { present: true }
  const r = conferirResultado(base({ produto: { nome: 'Peeling', ativos_detectados: ['AHA 10% (ácido glicólico)'] } }), k).result
  assertEquals(r.resumo, 'Seu scan mostrou vermelhidão e sensibilidade, e AHA 10% tende a irritar. Eu evitaria por enquanto.')
})
Deno.test('rotina usa nome curto fixo', () => {
  const c = conferirResultado(base({ produto: { nome: 'Mask', ativos_detectados: ['BHA 2%'] } }), ctx({}, [], rotinaDono))
  assertEquals(c.result.decisao_rotina.justificativa.startsWith('Sua rotina já tem ácido salicílico no passo "Sérum de Ácido Salicílico"'), true)
})
