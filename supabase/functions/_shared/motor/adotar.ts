// Motor da rotina v2 — lote "Montar minha rotina com o que tenho em casa": ADOTAR o ativo forte
// que ela já tem (pedido do produto, 22/nov/2026). ⚠️ Proposta — aguarda o OK para ir ao ar.
//
// Antes, o plano escolhia os fortes pelas dores (ex.: manchas → azelaico) e o produto de casa com
// OUTRO forte saía ("ativo forte fora do plano"), mesmo tratando a dor dela. Agora, antes de fechar
// o plano, os produtos de casa são olhados: um produto de tratamento dela cujo ativo forte trata
// uma das dores MARCADAS entra no plano no lugar de outro ativo da mesma dor.
//
// Regras:
//  - candidato: produto de tratamento (sérum, tratamento, esfoliante, tônico) que faria o papel do
//    passo desse ativo (`fazOPapel`), sem nenhum corte de segurança (reação, memória, gravidez,
//    isotretinoína, barreira, rosácea, pele sensível) e sem ser remédio de receita;
//  - não adota abaixo do piso de concentração (nem salicilato fraco para espinhas);
//  - prioridade: cobre a dor principal → cobre mais dores marcadas → concentração conhecida
//    acima do piso → ordem do lote;
//  - o plano é refeito com o ativo dela em `preferir` (`montarPlano`): segurança, limite de 2
//    fortes e o teto de tratamentos continuam valendo; a rotina separa ácido forte × retinoide
//    nos dias, como sempre;
//  - só adota se NENHUMA dor que o plano de antes cobria ficar sem cobertura (se o plano refeito
//    achar outro ativo para a dor que sobrou, vale).

import { ATIVOS, type AtivoId } from './ativos.ts'
import type { Dor } from './dores.ts'
import { DOR_ATIVOS } from './dores.ts'
import { montarPlano, type OpcoesPlano, type PerfilMotor, type Plano } from './plano.ts'
import { corteDeSeguranca, fazOPapel, PISO_PCT, PISO_RETINAL, PISO_RETINOL, type ContextoCasa, type FichaCasa } from './casa.ts'
import type { Passo } from './conferencia.ts'
import { FORTES } from './ativos.ts'

const CATS_TRATAMENTO = ['serum', 'tratamento', 'esfoliante', 'tonico']

export interface Adotado {
  ativo: AtivoId
  /** Produto de casa que trouxe o ativo (índice no lote). */
  indice: number
  /** Ativos fortes do plano de antes que saíram (os que ele substituiu). */
  substituiu: AtivoId[]
}

export interface CandidatoCasa { ativo: AtivoId; ficha: FichaCasa; principal: boolean; dores: number; pctOk: boolean }

const cobertas = (p: Plano) => new Set<Dor>(p.ativos.flatMap((e) => e.dores))

function acimaDoPiso(f: FichaCasa, a: AtivoId, marcadas: Dor[]): { ok: boolean; conhecido: boolean } {
  if (a === 'salicilico' && f.salicilicoFraco && marcadas.includes('Acne/espinhas')) return { ok: false, conhecido: false }
  const piso = a === 'retinoide' ? (f.retinal ? PISO_RETINAL : PISO_RETINOL) : PISO_PCT[a]
  const p = f.pct[a]
  if (piso == null || p == null) return { ok: true, conhecido: false }
  return { ok: p >= piso, conhecido: true }
}

/** Ativos fortes de casa que poderiam entrar no plano, na ordem de prioridade. */
export function candidatosDeCasa(
  fichas: FichaCasa[], perfil: PerfilMotor, ctx: Omit<ContextoCasa, 'fortesPermitidos' | 'ativosDoPlano'>,
): CandidatoCasa[] {
  const marcadas = perfil.marcadas
  const tabela = DOR_ATIVOS as Record<Dor, AtivoId[]>
  // A segurança da ficha sem a regra do "forte fora do plano" (é justamente o que se decide aqui).
  const ctxSeguranca = { ...ctx, fortesPermitidos: [...FORTES], ativosDoPlano: [] } as ContextoCasa
  const out: CandidatoCasa[] = []
  for (const f of fichas) {
    if (f.medicamento || !CATS_TRATAMENTO.includes(f.categoria)) continue
    if (corteDeSeguranca(f, ctxSeguranca)) continue
    for (const a of f.papel) {
      if (!ATIVOS[a].forte) continue
      const dores = marcadas.filter((d) => tabela[d]?.includes(a))
      if (!dores.length) continue
      const m = ATIVOS[a].passoModelo
      const passo = { name: m.nome, ingredient: m.ingrediente } as Passo
      if (!fazOPapel(f, passo, a, { ativosDoPlano: [] })) continue
      const piso = acimaDoPiso(f, a, marcadas)
      if (!piso.ok) continue
      out.push({ ativo: a, ficha: f, principal: dores.includes(marcadas[0]), dores: dores.length, pctOk: piso.conhecido })
    }
  }
  return out.sort((x, y) =>
    Number(y.principal) - Number(x.principal) || y.dores - x.dores || Number(y.pctOk) - Number(x.pctOk) || x.ficha.indice - y.ficha.indice)
}

/**
 * O plano com os ativos fortes de casa adotados (quando dá). Devolve o plano final e o que foi
 * adotado; sem candidato ou sem ganho, o plano de sempre.
 */
export function planoComCasa(
  perfil: PerfilMotor, op: OpcoesPlano, fichas: FichaCasa[], ctx: Omit<ContextoCasa, 'fortesPermitidos' | 'ativosDoPlano' | 'plano'>,
): { plano: Plano; adotados: Adotado[]; candidatos: CandidatoCasa[] } {
  const base = montarPlano(perfil, op)
  const candidatos = candidatosDeCasa(fichas, perfil, { ...ctx, plano: base })
  const antes = cobertas(base)
  let plano = base
  const preferir: AtivoId[] = []
  const adotados: Adotado[] = []
  const fortesDe = (p: Plano) => p.ativos.map((e) => e.ativo).filter((a) => ATIVOS[a].forte)
  // Ativo do plano que nenhum produto de casa (seguro) cobre = algo a comprar.
  const ctxSeg = { ...ctx, plano: base, fortesPermitidos: [...FORTES], ativosDoPlano: [] } as ContextoCasa
  const seguras = fichas.filter((f) => !f.medicamento && !corteDeSeguranca(f, ctxSeg))
  const temEmCasa = (a: AtivoId) => {
    const m = ATIVOS[a].passoModelo
    const passo = { name: m.nome, ingredient: m.ingrediente } as Passo
    return seguras.some((f) => fazOPapel(f, passo, a, { ativosDoPlano: [] }) && acimaDoPiso(f, a, perfil.marcadas).ok)
  }
  const faltaEmCasa = (p: Plano) => p.ativos.filter((e) => !temEmCasa(e.ativo)).length
  const fortesBase = fortesDe(base)
  for (const c of candidatos) {
    if (preferir.includes(c.ativo)) continue
    if (plano.ativos.some((e) => e.ativo === c.ativo)) {
      // Já está no plano: o produto dela entra pelo caminho normal — e fica protegido (a
      // próxima adoção não pode tirá-lo).
      preferir.push(c.ativo)
      continue
    }
    const tentativa = montarPlano(perfil, { ...op, preferir: [...preferir, c.ativo] })
    if (!tentativa.ativos.some((e) => e.ativo === c.ativo)) continue
    if (preferir.some((a) => !tentativa.ativos.some((e) => e.ativo === a))) continue // tiraria um que ela já tem
    const depois = cobertas(tentativa)
    if ([...antes].some((d) => !depois.has(d))) continue // deixaria uma dor descoberta
    // Nenhum forte novo além dos que ela tem.
    const fortesNovos = fortesDe(tentativa)
    if (fortesNovos.some((a) => !fortesBase.includes(a) && !preferir.includes(a) && a !== c.ativo)) continue
    // Troca, não soma: o que falta comprar não pode aumentar; e o plano só ganha um ativo a mais
    // se isso diminuir o que falta comprar.
    const faltaAntes = faltaEmCasa(plano), faltaDepois = faltaEmCasa(tentativa)
    if (faltaDepois > faltaAntes) continue
    if (tentativa.ativos.length > plano.ativos.length && faltaDepois >= faltaAntes) continue
    const fortesAntes = plano.ativos.map((e) => e.ativo).filter((a) => ATIVOS[a].forte)
    preferir.push(c.ativo)
    plano = tentativa
    const fortesAgora = plano.ativos.map((e) => e.ativo).filter((a) => ATIVOS[a].forte)
    adotados.push({ ativo: c.ativo, indice: c.ficha.indice, substituiu: fortesAntes.filter((a) => !fortesAgora.includes(a)) })
  }
  return { plano, adotados, candidatos }
}
