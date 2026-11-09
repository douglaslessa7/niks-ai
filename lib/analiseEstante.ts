// ─────────────────────────────────────────────────────────────────────────────
// O que a tela do produto da estante mostra sobre a pele dela, a partir da análise que
// já existe. Não gera análise nova.
//   · escaneado → `product_scans.resultado` (compatibilidade, veredito, resumo);
//   · catálogo  → compatibilidade e `copy` da recomendação dela. O catálogo não tem
//     veredito próprio: sai da regra de avisos (lib/avisoProduto), a mesma da Rotina.
// Sem compatibilidade nem veredito: `temAnalise` falso ("Ainda não analisado").
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { avaliarProduto } from './avisoProduto';
import { peleParaAviso } from './minhaRotina';
import type { ColecaoItem } from './colecao';
import type { DecisaoRotina } from './adicionarDoScan';

export type VereditoEstante = 'pode_usar' | 'com_ressalva' | 'evitaria';

export type AnaliseEstante = {
  temAnalise: boolean;
  compat: number | null;
  veredito: VereditoEstante | null;
  porque: string | null;
  decisao: DecisaoRotina | null; // só escaneado: onde a análise sugere pôr na rotina
  passoRecomendado: { passo: string; periodo: string | null } | null; // catálogo: o da recomendação dela
};

const VAZIA: AnaliseEstante = { temAnalise: false, compat: null, veredito: null, porque: null, decisao: null, passoRecomendado: null };

const lerVeredito = (v: unknown): VereditoEstante | null =>
  (v === 'pode_usar' || v === 'com_ressalva' || v === 'evitaria' ? v : null);

async function doScan(item: ColecaoItem, scanId: string): Promise<AnaliseEstante> {
  const { data, error } = await supabase.from('product_scans').select('resultado').eq('id', scanId).maybeSingle();
  if (error) throw error;
  const r: any = data?.resultado;
  if (!r || (r.status && r.status !== 'ok')) return VAZIA;
  const compat = item.compat ?? (typeof r.compatibilidade === 'number' ? Math.round(r.compatibilidade) : null);
  const veredito = lerVeredito(r.veredito);
  if (compat == null && !veredito) return VAZIA;
  return {
    temAnalise: true, compat, veredito,
    porque: (r.resumo || r.explicacao || '').trim() || null,
    decisao: r.decisao_rotina ?? null,
    passoRecomendado: null,
  };
}

async function doCatalogo(item: ColecaoItem, userId: string, produtoId: string): Promise<AnaliseEstante> {
  const [{ data: rec, error }, { data: p }, pele] = await Promise.all([
    supabase.from('recomendacoes_produtos').select('recomendacao').eq('user_id', userId).maybeSingle(),
    supabase.from('produtos').select('nome, categoria, ativos_principais, seguro_gestante, tipos_pele, porque_e_especial').eq('id', produtoId).maybeSingle(),
    peleParaAviso(userId),
  ]);
  if (error) throw error;
  const passos: any[] = Array.isArray(rec?.recomendacao) ? rec.recomendacao : [];
  const x = passos.flatMap((s) => s?.produtos ?? []).find((y: any) => y?.produto_id === produtoId);
  const noPasso = passos.find((s) => (s?.produtos ?? []).some((y: any) => y?.produto_id === produtoId));
  const nomePasso = String(noPasso?.passo ?? noPasso?.categoria ?? '').trim();
  const passoRecomendado = nomePasso ? { passo: nomePasso, periodo: typeof noPasso?.periodo === 'string' ? noPasso.periodo : null } : null;
  const compat = item.compat ?? (typeof x?.compatibilidade === 'number' ? Math.round(x.compatibilidade) : null);
  if (compat == null) return { ...VAZIA, passoRecomendado };
  const aviso = avaliarProduto({
    nome: p?.nome ?? item.nome, categoria: p?.categoria ?? item.categoria, compat,
    ativos: Array.isArray(p?.ativos_principais) ? p.ativos_principais : null,
    seguroGestante: typeof p?.seguro_gestante === 'boolean' ? p.seguro_gestante : null,
    tiposPele: Array.isArray(p?.tipos_pele) ? p.tipos_pele : null,
  }, pele);
  const veredito: VereditoEstante = aviso.nivel === 'forte' ? 'evitaria' : aviso.nivel === 'leve' ? 'com_ressalva' : 'pode_usar';
  // O motivo de um aviso (ex.: gravidez) vem antes do texto de venda da recomendação.
  const porque = (aviso.nivel !== 'nenhum' && aviso.texto) || (x?.copy ?? '').trim() || (p?.porque_e_especial ?? '').trim() || null;
  return { temAnalise: true, compat, veredito, porque, decisao: null, passoRecomendado };
}

export async function analiseDoItem(item: ColecaoItem, userId: string): Promise<AnaliseEstante> {
  if (item.productScanId) return doScan(item, item.productScanId);
  if (item.produtoId) return doCatalogo(item, userId, item.produtoId);
  return VAZIA;
}

/** O item já está em algum passo da rotina dela? */
export async function itemNaRotina(itemId: string): Promise<boolean> {
  const { data, error } = await supabase.from('minha_rotina_passos').select('id').eq('colecao_item_id', itemId).limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
