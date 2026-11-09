// cd supabase/functions && deno test --no-lock --config deno.json analise-rapida/validar_test.ts
// (`--no-lock`: o teste baixa o @std/assert, que não deve entrar no deno.lock das funções)
import { assertEquals } from 'jsr:@std/assert@1'
import { pedidosValidos, PROBLEMAS, validar, validarAncora } from '../_shared/analise-rapida.ts'

Deno.test('pedidos: só os conhecidos, sem repetir, na ordem dela; vazio → todos', () => {
  assertEquals(pedidosValidos(['manchas', 'olheiras', 'manchas', 'outro']), ['manchas', 'olheiras'])
  assertEquals(pedidosValidos([]), [...PROBLEMAS])
  assertEquals(pedidosValidos(undefined), [...PROBLEMAS])
})

Deno.test('resposta válida: um item por pedido, na ordem dos pedidos', () => {
  const r = validar({
    foto_valida: true, idade_pele: 31.4,
    problemas: [
      { problema: 'olheiras', intensidade: 2, regiao: 'area_periocular' },
      { problema: 'manchas', intensidade: 0, regiao: 'bochechas' },
    ],
  }, ['manchas', 'olheiras'])
  assertEquals(r, {
    foto_valida: true, idade_pele: 31,
    problemas: [
      { problema: 'manchas', intensidade: 0, regiao: null },
      { problema: 'olheiras', intensidade: 2, regiao: 'area_periocular' },
    ],
  })
})

Deno.test('os 9 problemas (o que a função pede desde 06/nov/2026): um item cada, na ordem da lista', () => {
  const r = validar({
    foto_valida: true, idade_pele: 28,
    problemas: [...PROBLEMAS].reverse().map((p, i) => ({ problema: p, intensidade: i % 2, regiao: i % 2 ? 'testa' : null })),
  }, PROBLEMAS)
  assertEquals(r?.problemas.map((x) => x.problema), [...PROBLEMAS])
  // Faltando um dos 9 → fora do formato.
  assertEquals(validar({ foto_valida: true, idade_pele: 28, problemas: PROBLEMAS.slice(1).map((p) => ({ problema: p, intensidade: 0, regiao: null })) }, PROBLEMAS), null)
})

Deno.test('foto inválida → sem problemas', () => {
  assertEquals(validar({ foto_valida: false, idade_pele: 40, problemas: [{ problema: 'acne', intensidade: 2, regiao: 'testa' }] }, ['acne']),
    { foto_valida: false, idade_pele: null, problemas: [] })
})

Deno.test('idade fora de 10–80 vira null sem invalidar', () => {
  assertEquals(validar({ foto_valida: true, idade_pele: 95, problemas: [{ problema: 'acne', intensidade: 1, regiao: 'testa' }] }, ['acne'])?.idade_pele, null)
})

Deno.test('fora do formato → null (vale nova tentativa)', () => {
  const ok = { problema: 'acne', intensidade: 1, regiao: 'testa' }
  assertEquals(validar(null, ['acne']), null)
  assertEquals(validar({ foto_valida: 'sim', problemas: [ok] }, ['acne']), null)
  assertEquals(validar({ foto_valida: true, idade_pele: 30 }, ['acne']), null)
  assertEquals(validar({ foto_valida: true, idade_pele: 30, problemas: [] }, ['acne']), null) // faltou o pedido
  assertEquals(validar({ foto_valida: true, idade_pele: 30, problemas: [{ ...ok, intensidade: 4 }] }, ['acne']), null)
  assertEquals(validar({ foto_valida: true, idade_pele: 30, problemas: [{ ...ok, regiao: null }] }, ['acne']), null) // aparece sem região
  assertEquals(validar({ foto_valida: true, idade_pele: 30, problemas: [{ ...ok, regiao: 'pescoco' }] }, ['acne']), null)
})

Deno.test('âncora da analyze-skin', () => {
  assertEquals(validarAncora({ idade_pele: 33, problema: 'rugas', intensidade: 2, regiao: 'area_periocular' }),
    { idade_pele: 33, problema: 'rugas', intensidade: 2, regiao: 'area_periocular', pontoForte: null })
  // Escolhido por ser o 1º marcado (não aparece na foto): sem região.
  assertEquals(validarAncora({ idade_pele: null, problema: 'manchas', intensidade: 0, regiao: 'testa' }),
    { idade_pele: null, problema: 'manchas', intensidade: 0, regiao: null, pontoForte: null })
  // Ponto forte da Carta 1: só um problema conhecido e diferente do da carta de alerta.
  assertEquals(validarAncora({ problema: 'acne', intensidade: 2, regiao: 'testa', ponto_forte: 'olheiras' })?.pontoForte, 'olheiras')
  assertEquals(validarAncora({ problema: 'acne', intensidade: 2, regiao: 'testa', ponto_forte: 'acne' })?.pontoForte, null)
  assertEquals(validarAncora({ problema: 'acne', intensidade: 2, regiao: 'testa', ponto_forte: 'sardas' })?.pontoForte, null)
  assertEquals(validarAncora({ problema: 'vermelhidao', intensidade: 1 }), null)
  assertEquals(validarAncora({ problema: 'acne', intensidade: 7 }), null)
  assertEquals(validarAncora(null), null)
})
