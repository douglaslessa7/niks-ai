import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { extractJSON } from './roteador.ts'

const principal = '{"status":"ok","nota":"texto com { chave } e \\"aspas\\"","produto":{"nome":"X"}}'

Deno.test('o caso das 19:57: JSON principal + 2º objeto com lista_conhecida_confere', () => {
  const r = extractJSON(principal + '\n\n{"lista_conhecida_confere": true}')
  assertEquals(r.status, 'ok')
  assertEquals(r.lista_conhecida_confere, true)
  assertEquals(r.produto.nome, 'X')
})
Deno.test('um objeto só (o normal) continua igual', () => {
  assertEquals(extractJSON(principal).nota, 'texto com { chave } e "aspas"')
})
Deno.test('cerca de markdown e texto antes/depois', () => {
  assertEquals(extractJSON('Aqui está:\n```json\n' + principal + '\n```\nObrigado!').status, 'ok')
})
Deno.test('o 2º objeto não sobrescreve chave do principal', () => {
  assertEquals(extractJSON(principal + '{"status":"precisa_foto","x":1}'), { ...JSON.parse(principal), x: 1 })
})
Deno.test('chaves dentro de textos não confundem a separação', () => {
  const t = '{"status":"ok","nota":"}}}{{{"}{"lista_conhecida_confere":false}'
  assertEquals(extractJSON(t), { status: 'ok', nota: '}}}{{{', lista_conhecida_confere: false })
})
Deno.test('sem JSON: continua lançando (vai para a reserva)', () => {
  assertThrows(() => extractJSON('não consegui analisar'))
})
