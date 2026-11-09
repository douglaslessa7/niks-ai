import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Memoria, Perfil, ProdutoSos } from './regras.ts'

// Tudo sai do banco pelo usuário do token: o app só manda a foto.

export function createSupabaseClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

// deno-lint-ignore no-explicit-any
type Supabase = any

export type PassoSos = { periodo: string; nome: string | null; ingrediente: string | null; dias: string[] | null; colecao_item_id: string | null }

export type ContextoSos = {
  perfil: (Perfil & Record<string, unknown>) | null
  barreira: string | null
  memorias: Memoria[]
  passos: PassoSos[]
  produtos: ProdutoSos[]          // só os "Tenho em casa": o plano só pode indicar estes
  semEmCasa: ProdutoIndisponivel[] // os que acabaram ou que ela quer comprar
}

export type ProdutoIndisponivel = { nome: string; marca: string | null; status: 'acabou' | 'quero_comprar' }

const MAX_PRODUTOS = 40

const textos = (v: unknown): string[] =>
  // deno-lint-ignore no-explicit-any
  (Array.isArray(v) ? v : []).map((x: any) => String(x?.nome ?? x ?? '').trim()).filter(Boolean)

const ehStatusFora = (s: unknown): s is 'acabou' | 'quero_comprar' => s === 'acabou' || s === 'quero_comprar'

async function lerProdutos(supabase: Supabase, userId: string, passos: PassoSos[]): Promise<{ produtos: ProdutoSos[]; semEmCasa: ProdutoIndisponivel[] }> {
  const colunas = 'id, nome, marca, categoria, product_scan_id, produto_id, created_at'
  const ler = (cols: string) => supabase.from('colecao_produtos').select(cols).eq('user_id', userId).order('created_at', { ascending: false })
  let { data: todos, error } = await ler(`${colunas}, status`)
  // Coluna `status` ainda não existe (migration 20261116120000 não aplicada): tudo vale "em casa".
  if (error?.code === '42703') ({ data: todos, error } = await ler(colunas))
  if (error) throw error
  // deno-lint-ignore no-explicit-any
  const semEmCasa: ProdutoIndisponivel[] = (todos ?? []).filter((i: any) => ehStatusFora(i.status)).slice(0, MAX_PRODUTOS)
    // deno-lint-ignore no-explicit-any
    .map((i: any) => ({ nome: i.nome ?? 'Produto', marca: i.marca ?? null, status: i.status }))
  // deno-lint-ignore no-explicit-any
  const itens = (todos ?? []).filter((i: any) => !ehStatusFora(i.status))
  if (!itens.length) return { produtos: [], semEmCasa }

  const naRotina = new Map<string, string[]>()
  for (const p of passos) {
    if (!p.colecao_item_id) continue
    const onde = `${p.periodo === 'am' ? 'manhã' : 'noite'}${p.nome ? ` (${p.nome})` : ''}`
    naRotina.set(p.colecao_item_id, [...(naRotina.get(p.colecao_item_id) ?? []), onde])
  }
  // Os da rotina vêm antes: se passar do teto, o que sai é o que ela não está usando.
  // deno-lint-ignore no-explicit-any
  const escolhidos = [...itens].sort((a: any, b: any) => Number(naRotina.has(b.id)) - Number(naRotina.has(a.id))).slice(0, MAX_PRODUTOS)

  // deno-lint-ignore no-explicit-any
  const scanIds = escolhidos.map((i: any) => i.product_scan_id).filter(Boolean)
  // deno-lint-ignore no-explicit-any
  const catalogoIds = escolhidos.map((i: any) => i.produto_id).filter(Boolean)
  const [scans, catalogo] = await Promise.all([
    scanIds.length ? supabase.from('product_scans').select('id, resultado').in('id', scanIds) : { data: [] },
    catalogoIds.length
      ? supabase.from('produtos').select('id, ativos_principais, alergenos, seguro_gestante, indicado_pele_sensivel').in('id', catalogoIds)
      : { data: [] },
  ])
  // deno-lint-ignore no-explicit-any
  const scanPorId = new Map<string, any>((scans.data ?? []).map((s: any) => [s.id, s.resultado]))
  // deno-lint-ignore no-explicit-any
  const catalogoPorId = new Map<string, any>((catalogo.data ?? []).map((c: any) => [c.id, c]))

  // deno-lint-ignore no-explicit-any
  const produtos = escolhidos.map((i: any, n: number): ProdutoSos => {
    const scan = i.product_scan_id ? scanPorId.get(i.product_scan_id) : null
    const cat = i.produto_id ? catalogoPorId.get(i.produto_id) : null
    return {
      ref: `p${n + 1}`,
      colecaoId: i.id,
      nome: i.nome ?? scan?.produto?.nome ?? 'Produto',
      marca: i.marca ?? scan?.produto?.marca ?? null,
      categoria: i.categoria ?? scan?.produto?.categoria ?? null,
      ativos: [...textos(scan?.produto?.ativos_detectados), ...textos(cat?.ativos_principais)],
      alergenos: textos(cat?.alergenos),
      seguroGestante: typeof cat?.seguro_gestante === 'boolean' ? cat.seguro_gestante : null,
      indicadoSensivel: typeof cat?.indicado_pele_sensivel === 'boolean' ? cat.indicado_pele_sensivel : null,
      veredito: typeof scan?.veredito === 'string' ? scan.veredito : null,
      naRotina: naRotina.get(i.id) ?? [],
    }
  })
  return { produtos, semEmCasa }
}

export async function montarContexto(supabase: Supabase, userId: string): Promise<ContextoSos> {
  const [perfil, scan, memorias, passos] = await Promise.all([
    supabase.from('users').select('nome, tipo_pele, pregnancy_status, allergy_type, allergy_description, skincare_routine_type, skincare_routine_description').eq('id', userId).maybeSingle(),
    supabase.from('skin_scans').select('full_result').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('coach_memories').select('type, value').eq('user_id', userId).eq('is_active', true),
    supabase.from('minha_rotina_passos').select('periodo, ordem, nome, ingrediente, dias, colecao_item_id').eq('user_id', userId).order('ordem', { ascending: true }),
  ])
  // Sem o perfil não dá para aplicar as travas de gravidez e alergia: melhor falhar.
  if (perfil.error) throw perfil.error
  if (memorias.error) throw memorias.error
  if (passos.error) throw passos.error
  const listaPassos: PassoSos[] = passos.data ?? []
  const { produtos, semEmCasa } = await lerProdutos(supabase, userId, listaPassos)
  return {
    perfil: perfil.data ?? null,
    barreira: typeof scan.data?.full_result?.barrier_status === 'string' ? scan.data.full_result.barrier_status : null,
    memorias: memorias.data ?? [],
    passos: listaPassos,
    produtos,
    semEmCasa,
  }
}

/**
 * Análises feitas hoje. Uma linha em `ia_custos` por chamada: a tentativa abandonada (reserva
 * entrou no lugar) e a que falhou sem resposta não contam.
 */
export async function analisesDeHoje(supabase: Supabase, userId: string, desde: string): Promise<number> {
  const { count, error } = await supabase
    .from('ia_custos')
    .select('id', { count: 'exact', head: true })
    .eq('funcao', 'sos-espinha')
    .eq('user_id', userId)
    .gte('created_at', desde)
    .gt('output_tokens', 0)
    .or('fallback_motivo.is.null,fallback_motivo.not.like.abandonada*')
  if (error) {
    console.error('sos-espinha: falha ao contar o limite do dia', error)
    return 0
  }
  return count ?? 0
}
