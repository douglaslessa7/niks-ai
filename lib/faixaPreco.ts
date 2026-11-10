// ─────────────────────────────────────────────────────────────────────────────
// Faixa de preço dos produtos do CATÁLOGO (nov/2026). A faixa é por marca:
// 1 = até R$ 150 · 2 = R$ 150 a R$ 250 · 3 = acima de R$ 250.
// Mora em `produtos.faixa_preco`, preenchida pelo banco a partir de `marcas_faixa_preco`.
//
// ⚠️ Leitura SEPARADA e tolerante de propósito: as consultas de `produtos` que já existem
// não pedem a coluna. Se a coluna ainda não existir (banco sem a migration) ou a leitura
// falhar, devolve "sem faixa" e a tela segue igual, só sem as barrinhas.
// Só para produtos recomendados do catálogo — escaneados e estante não têm faixa.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';

export type FaixaPreco = 1 | 2 | 3;

// FONTE ÚNICA dos nomes das faixas (aprovados em 10/nov/2026). O nome aparece no card do
// passo da Rotina ("▮▯▯ Custo-benefício") e no leitor de tela (`descricaoFaixa`).
export const FAIXA_NOME: Record<FaixaPreco, string> = {
  1: 'Custo-benefício',
  2: 'Médio',
  3: 'Premium',
};

export const FAIXA_TEXTO: Record<FaixaPreco, string> = {
  1: 'até R$ 150',
  2: 'R$ 150 a R$ 250',
  3: 'acima de R$ 250',
};

/** Leitor de tela: "Faixa de preço: Custo-benefício, até R$ 150". */
export const descricaoFaixa = (f: FaixaPreco) => `Faixa de preço: ${FAIXA_NOME[f]}, ${FAIXA_TEXTO[f]}`;

const memoria = new Map<string, FaixaPreco | null>();

const valida = (v: unknown): FaixaPreco | null => (v === 1 || v === 2 || v === 3 ? v : null);

async function lerFaixas(ids: string[]): Promise<{ id: string; faixa: unknown }[] | null> {
  const { data, error } = await supabase.from('produtos').select('id, faixa_preco').in('id', ids);
  if (error) return null;
  return (data ?? []).map((p: any) => ({ id: p.id, faixa: p.faixa_preco }));
}

/** Faixa de cada produto do catálogo, por id. Nunca lança. */
export async function faixasDosProdutos(ids: string[]): Promise<Map<string, FaixaPreco>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const faltam = unicos.filter((id) => !memoria.has(id));
  if (faltam.length) {
    try {
      const linhas = await lerFaixas(faltam);
      if (linhas) for (const p of linhas) memoria.set(p.id, valida(p.faixa));
    } catch {
      // sem rede ou coluna inexistente: segue sem faixa (e tenta de novo na próxima abertura)
    }
  }
  const out = new Map<string, FaixaPreco>();
  for (const id of unicos) {
    const f = memoria.get(id);
    if (f) out.set(id, f);
  }
  return out;
}
