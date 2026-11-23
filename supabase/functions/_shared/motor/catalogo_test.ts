import { assert } from 'jsr:@std/assert@1'
import { ehMedicamento } from './catalogo.ts'

Deno.test('medicamento não é recomendado; o adapalenato cosmético da Creamy continua', () => {
  assert(ehMedicamento({ ativos_principais: ['peroxido_de_benzoila'] }))
  assert(ehMedicamento({ ativos_principais: ['tretinoina'] }))
  assert(ehMedicamento({ ativos_principais: ['adapaleno'] }))          // Effaclar Adapaleno (código corrigido no banco)
  assert(!ehMedicamento({ ativos_principais: ['adapalenato'] }))       // Creamy Pró-Adapaleno (cosmético)
})
