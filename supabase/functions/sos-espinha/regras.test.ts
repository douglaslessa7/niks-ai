import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  bateComAlergia, emGestacao, inicioDoDiaBrasilia, peleSensivel, produtosPermitidos, produtosVetados, sanearConversa, TEXTO_SEGURO, sanearResposta, textoDaAnalise, type ProdutoSos,
} from './regras.ts'

const prod = (o: Partial<ProdutoSos> & { ref: string; nome: string }): ProdutoSos => ({
  colecaoId: `id-${o.ref}`, marca: 'Marca', categoria: 'Sérum', ativos: ['niacinamida'], alergenos: [],
  seguroGestante: null, indicadoSensivel: null, veredito: null, naRotina: [], ...o,
})

const refs = (l: ProdutoSos[]) => l.map((p) => p.ref)

Deno.test('gestação: cadastro bloqueia as 3 fases', () => {
  for (const s of ['pregnant', 'breastfeeding', 'trying']) assert(emGestacao({ pregnancy_status: s }, []))
  assert(!emGestacao({ pregnancy_status: 'none' }, []))
})

Deno.test('gestação: memória do chat conta, negação não', () => {
  assert(emGestacao({}, [{ type: 'pregnancy_status', value: 'Está grávida de 5 meses' }]))
  assert(!emGestacao({}, [{ type: 'pregnancy_status', value: 'Não está grávida' }]))
  assert(!emGestacao({}, [{ type: 'allergy', value: 'grávida' }]))
})

Deno.test('gestação: tira retinoide, hidroquinona e o marcado como não seguro', () => {
  const lista = [
    prod({ ref: 'p1', nome: 'Noturno', ativos: ['Adapaleno 0,1%'] }),
    prod({ ref: 'p2', nome: 'Clareador', ativos: ['hydroquinone'] }),
    prod({ ref: 'p3', nome: 'Catálogo', seguroGestante: false }),
    prod({ ref: 'p4', nome: 'Sérum Retinol' }),
    prod({ ref: 'p5', nome: 'Azelaico', ativos: ['ácido azelaico'] }),
    prod({ ref: 'p6', nome: 'Bakuchiol', ativos: ['bakuchiol (alternativa ao retinol)'] }),
  ]
  assertEquals(refs(produtosPermitidos(lista, { pregnancy_status: 'pregnant' }, [])), ['p5', 'p6'])
})

Deno.test('sem gestação, retinoide continua permitido', () => {
  assertEquals(refs(produtosPermitidos([prod({ ref: 'p1', nome: 'R', ativos: ['retinol'] })], { pregnancy_status: 'none' }, [])), ['p1'])
})

Deno.test('alergia: casos reais do cadastro', () => {
  const sal = prod({ ref: 'p1', nome: 'BHA', ativos: ['Salicylic Acid'] })
  const niac = prod({ ref: 'p2', nome: 'N', ativos: ['Niacinamide'] })
  const ret = prod({ ref: 'p3', nome: 'A', ativos: ['tretinoína'] })
  assert(bateComAlergia(sal, { allergy_description: 'Ácido salicílico' }, []))
  assert(!bateComAlergia(niac, { allergy_description: 'Ácido salicílico' }, []))
  assert(bateComAlergia(sal, { allergy_description: 'Ácidos' }, []))
  assert(bateComAlergia(sal, { allergy_description: 'Ácido muito forte' }, []))
  assert(!bateComAlergia(niac, { allergy_description: 'Ácidos' }, []))
  assert(bateComAlergia(ret, { allergy_description: 'Retinol' }, []))
  assert(!bateComAlergia(sal, { allergy_description: 'Não sei' }, []))
})

Deno.test('alergia: memória do chat e alérgeno do catálogo contam', () => {
  const p = prod({ ref: 'p1', nome: 'C', alergenos: ['Parfum'] })
  assert(bateComAlergia(p, {}, [{ type: 'allergy', value: 'perfume' }]))
  assert(!bateComAlergia(p, {}, [{ type: 'preference', value: 'perfume' }]))
})

Deno.test('ativos desconhecidos e veredito "evitaria" ficam de fora', () => {
  const lista = [prod({ ref: 'p1', nome: 'X', ativos: [] }), prod({ ref: 'p2', nome: 'Y', veredito: 'evitaria' }), prod({ ref: 'p3', nome: 'Z' })]
  assertEquals(refs(produtosPermitidos(lista, {}, [])), ['p3'])
})

Deno.test('pele sensível: tira o que o catálogo não indica', () => {
  assert(peleSensivel({ allergy_type: 'sensitive' }, []))
  assert(peleSensivel({}, [{ type: 'sensitivity', value: 'arde' }]))
  const lista = [prod({ ref: 'p1', nome: 'A', indicadoSensivel: false }), prod({ ref: 'p2', nome: 'B', indicadoSensivel: true })]
  assertEquals(refs(produtosPermitidos(lista, { allergy_type: 'sensitive' }, [])), ['p2'])
  assertEquals(refs(produtosPermitidos(lista, {}, [])), ['p1', 'p2'])
})

const P = [prod({ ref: 'p1', nome: 'BHA', naRotina: ['noite'] }), prod({ ref: 'p2', nome: 'Calm' })]
const ok = (x: object) => ({ status: 'ok', cuidados: ['Não esprema.'], evitar: [], ...x })

Deno.test('produto inventado ou repetido não passa', () => {
  const r: any = sanearResposta(ok({ produtos: [
    { ref: 'p9', como_usar: 'x' }, { ref: 'p1', como_usar: 'Só no ponto.', quando: 'noite' }, { ref: 'p1', como_usar: 'y' },
  ] }), P, false)
  assertEquals(r.produtos.length, 1)
  assertEquals(r.produtos[0].colecao_id, 'id-p1')
  assertEquals(r.produtos[0].na_rotina, true)
})

Deno.test('sinal de infecção não recomenda produto', () => {
  const r: any = sanearResposta(ok({ dermatologista: 'infeccao', produtos: [{ ref: 'p1', como_usar: 'x' }] }), P, false)
  assertEquals(r.produtos, [])
  assertEquals(r.dermatologista, null) // aviso desligado por enquanto; os produtos seguem zerados
})

Deno.test('"diagnóstico" nunca chega à tela', () => {
  const r: any = sanearResposta(ok({ cuidados: ['Este diagnóstico pede calma.'], evitar: ['DIAGNÓSTICO'] }), P, false)
  assert(!JSON.stringify(r).toLowerCase().includes('diagn'))
})

Deno.test('gestação: texto da IA com retinoide cai; o "evitar" pode citar', () => {
  const r: any = sanearResposta(ok({
    produtos: [{ ref: 'p1', como_usar: 'Misture com retinol.' }, { ref: 'p2', como_usar: 'Só no ponto.' }],
    cuidados: ['Use adapaleno.', 'Compressa morna.'],
    evitar: ['Evite retinol.'],
  }), P, true)
  assertEquals(r.produtos.map((p: any) => p.nome), ['Calm'])
  assertEquals(r.cuidados, ['Compressa morna.'])
  assertEquals(r.evitar, ['Evite retinol.'])
})

Deno.test('resposta sem cuidados falha; aviso e horário desconhecidos são normalizados', () => {
  assertEquals(sanearResposta({ status: 'ok', cuidados: [] }, P, false), null)
  assertEquals(sanearResposta({ status: 'x' }, P, false), null)
  assertEquals(sanearResposta({ status: 'precisa_foto' }, P, false), { status: 'precisa_foto' })
  const r: any = sanearResposta(ok({ dermatologista: 'talvez', produtos: [{ ref: 'p1', como_usar: 'a', quando: 'tarde' }] }), P, false)
  assertEquals(r.dermatologista, null)
  assertEquals(r.produtos[0].quando, 'noite')
})

Deno.test('máximo de 3 produtos', () => {
  const l = ['p1', 'p2', 'p3', 'p4'].map((ref) => prod({ ref, nome: ref }))
  const r: any = sanearResposta(ok({ produtos: l.map((p) => ({ ref: p.ref, como_usar: 'a' })) }), l, false)
  assertEquals(r.produtos.length, 3)
})

Deno.test('dia de Brasília vira às 03:00 UTC', () => {
  assertEquals(inicioDoDiaBrasilia(new Date('2026-11-08T12:00:00Z')), '2026-11-08T03:00:00.000Z')
  assertEquals(inicioDoDiaBrasilia(new Date('2026-11-08T02:59:00Z')), '2026-11-07T03:00:00.000Z')
})

const R = (texto: string, x: object = {}) => ({ status: 'ok', texto, ...x })
const V = [prod({ ref: 'p1', nome: 'Noturno Forte', ativos: ['retinol'] })]

Deno.test('conversa: produto vetado só pode aparecer para mandar evitar', () => {
  assertEquals(sanearConversa(R('Passe o Noturno Forte hoje.'), V, false), null)
  assert(sanearConversa(R('Evite o Noturno Forte por enquanto.'), V, false))
  assert(sanearConversa(R('Não use o Noturno Forte hoje.'), V, false))
})

Deno.test('conversa: retinoide na gestação cai, mandar evitar passa', () => {
  assertEquals(sanearConversa(R('Passe adapaleno à noite.'), [], true), null)
  assert(sanearConversa(R('Evite adapaleno na gestação.'), [], true))
  assert(sanearConversa(R('Passe adapaleno à noite.'), [], false))
})

Deno.test('conversa: limpa diagnóstico e negrito; dermatologista não aparece', () => {
  const r = sanearConversa(R('**Este** diagnóstico mudou.', { dermatologista: true }), [], false)!
  assert(!r.texto.toLowerCase().includes('diagn') && !r.texto.includes('**'))
  assert(!r.texto.includes('dermatologista'))
  assertEquals(sanearConversa(R('Melhorou. Vale procurar um dermatologista. Continue no ponto.'), [], false)!.texto, 'Melhorou. Continue no ponto.')
  assertEquals(sanearConversa(R('Procure um dermatologista.'), [], false), null)
  assert(!TEXTO_SEGURO.includes('dermatologista'))
})

Deno.test('análise: dermatologista some da resposta e dos textos', () => {
  const r: any = sanearResposta(ok({ dermatologista: 'inflamada', cuidados: ['Compressa morna.', 'Procure um dermatologista.'], evitar: ['Não esprema. Se doer, vá ao dermatologista.'], produtos: [{ ref: 'p1', como_usar: 'Só no ponto. Veja um dermatologista.' }] }), P, false)
  assertEquals(r.dermatologista, null)
  assertEquals(r.cuidados, ['Compressa morna.'])
  assertEquals(r.evitar, ['Não esprema.'])
  assertEquals(r.produtos[0].como_usar, 'Só no ponto.')
})

Deno.test('conversa: resolvida só com true explícito; vazia falha', () => {
  assertEquals(sanearConversa(R('Que bom!', { resolvida: true }), [], false)!.resolvida, true)
  assertEquals(sanearConversa(R('Que bom!', { resolvida: 'sim' }), [], false)!.resolvida, false)
  assertEquals(sanearConversa(R('  '), [], false), null)
  assertEquals(sanearConversa({ status: 'x', texto: 'a' }, [], false), null)
})

Deno.test('vetado é diferente de ativo desconhecido', () => {
  const lista = [prod({ ref: 'p1', nome: 'Sem Dado', ativos: [] }), prod({ ref: 'p2', nome: 'R', ativos: ['retinol'] })]
  assertEquals(refs(produtosVetados(lista, { pregnancy_status: 'pregnant' }, [])), ['p2'])
  assertEquals(refs(produtosPermitidos(lista, { pregnancy_status: 'pregnant' }, [])), [])
})

Deno.test('análise vira mensagem com seções e sem produto vazio', () => {
  const t = textoDaAnalise({ status: 'ok', produtos: [], cuidados: ['Não esprema.'], evitar: [], dermatologista: 'varias' })
  assert(t.includes('Nenhum produto da sua estante'))
  assert(t.includes('várias espinhas'))
  assert(!t.includes('O que evitar'))
  const c = textoDaAnalise({ status: 'ok', produtos: [{ colecao_id: 'a', nome: 'BHA', marca: null, como_usar: 'Só no ponto.', quando: 'noite', na_rotina: false }], cuidados: ['x'], evitar: ['y'], dermatologista: null })
  assert(c.includes('• BHA (Hoje à noite): Só no ponto.'))
})
