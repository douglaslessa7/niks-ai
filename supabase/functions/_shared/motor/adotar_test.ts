// Testes do "adotar o ativo forte que ela já tem" (lote, 22/nov/2026).
// deno test --no-lock --config <deno.json vazio> supabase/functions/_shared/motor/adotar_test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { planoComCasa } from './adotar.ts'
import { montarFicha } from './casa.ts'
import { perfilMotor } from './perfil.ts'
import { filtrosDaPele } from './catalogo.ts'
import { montarPlano } from './plano.ts'
import { ATIVOS } from './ativos.ts'

const op = { temProduto: () => true }
const ficha = (indice: number, nome: string, categoria: string, inci: string[] | null = null) =>
  montarFicha({ indice, nome, marca: 'Teste', categoria, inci })

function rodar(concerns: string[], fichas: ReturnType<typeof ficha>[], extra: Record<string, unknown> = {}) {
  const onboarding = { concerns, ...extra }
  const perfil = perfilMotor(null, onboarding, [])
  const filtros = filtrosDaPele(perfil, onboarding, null, montarPlano(perfil, op))
  return planoComCasa(perfil, op, fichas, { perfil, filtros, alergiaDescricao: null, memorias: [] })
}
const ativos = (r: ReturnType<typeof rodar>) => r.plano.ativos.map((e) => e.ativo)

Deno.test('sem produto de casa: o plano de sempre', () => {
  const r = rodar(['Acne/espinhas', 'Manchas', 'Cravos'], [])
  assertEquals(r.adotados, [])
  assertEquals(ativos(r), ativos({ plano: montarPlano(perfilMotor(null, { concerns: ['Acne/espinhas', 'Manchas', 'Cravos'] }, []), op) } as any))
})

Deno.test('sérum de ácido mandélico 10% entra no lugar do azelaico (acne, manchas, cravos)', () => {
  const r = rodar(['Acne/espinhas', 'Manchas', 'Cravos'], [ficha(1, 'Sérum Renovador Ácido Mandélico 10%', 'serum')])
  assert(ativos(r).includes('aha'), `plano: ${ativos(r)}`)
  assert(!ativos(r).includes('azelaico'))
  assertEquals(r.adotados[0]?.indice, 1)
})

Deno.test('grávida: retinol de casa não é adotado', () => {
  const r = rodar(['Cravos', 'Poros dilatados'], [ficha(1, 'Sérum Retinol 0,3%', 'serum')], { pregnancy_status: 'pregnant' })
  assert(!ativos(r).includes('retinoide'))
  assertEquals(r.adotados, [])
})

Deno.test('remédio de receita nunca é adotado', () => {
  const r = rodar(['Acne/espinhas'], [ficha(1, 'Epiduo Gel adapaleno', 'tratamento')])
  assertEquals(r.adotados, [])
})

Deno.test('creme de olhos com retinal não vira o tratamento', () => {
  const r = rodar(['Cravos', 'Rugas'], [ficha(1, 'Retinal Eye Cream', 'olhos')])
  assertEquals(r.adotados, [])
})

Deno.test('o ativo de casa que já está no plano fica protegido', () => {
  const r = rodar(['Oleosidade', 'Manchas', 'Acne/espinhas'], [
    ficha(1, 'Sérum de Ácido Salicílico 2%', 'serum'),
    ficha(2, 'Retinal 2%', 'serum'),
  ])
  assert(ativos(r).includes('salicilico'), `plano: ${ativos(r)}`)
})

Deno.test('nenhuma dor que era coberta fica descoberta', () => {
  const concerns = ['Manchas', 'Olheiras', 'Textura irregular']
  const base = montarPlano(perfilMotor(null, { concerns }, []), op)
  const r = rodar(concerns, [ficha(1, 'Sérum Retinol 0,5%', 'serum')])
  const antes = new Set(base.ativos.flatMap((e) => e.dores))
  const depois = new Set(r.plano.ativos.flatMap((e) => e.dores))
  for (const d of antes) assert(depois.has(d), `perdeu ${d}`)
})

Deno.test('no máximo 2 ativos fortes', () => {
  const r = rodar(['Acne/espinhas', 'Manchas', 'Cravos', 'Rugas'], [
    ficha(1, 'Sérum Retinol 0,5%', 'serum'), ficha(2, 'Tônico Ácido Glicólico 7%', 'tonico'), ficha(3, 'Sérum Vitamina C 15% ácido ascórbico', 'serum'),
  ])
  assert(r.plano.ativos.filter((e) => ATIVOS[e.ativo].forte).length <= 2)
})
