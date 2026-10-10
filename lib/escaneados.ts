// ─────────────────────────────────────────────────────────────────────────────
// Produtos que a usuária ESCANEOU (tabela `product_scans`, RLS = só as próprias
// linhas), do mais recente pro mais antigo. Usado pelos Escaneados da aba Produtos e
// pela folha "Escolher produto" da Rotina.
// A foto está no bucket PRIVADO `product-scans` → URLs assinadas (1 h) em lote; por
// isso esta lista não vai para o cache (ver README, "CACHE DE DADOS").
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { catOf } from './productCategory';

export type ScanItem = {
  id: string;
  photoUrl: string | null;
  brand: string | null;
  name: string | null;
  createdAt: string;
  result: any;            // objeto `resultado` (resposta da analisar-produto)
  cat: string | null;     // uma das CAT_ORDER (filtros), ou null se não casar
  match: number | null;   // resultado.compatibilidade (0–100); scans antigos não têm
  cutoutUrl?: string | null;    // recorte sem fundo (Fase 3), quando pronto
  cutoutStatus?: string | null; // null = scan antigo, ainda sem pedido de recorte
  verdict?: string | null;      // veredito da análise (tag quando não há %)
};

/** Escaneados da usuária. `ids` = só esses scans (ex.: os que estão na rotina). */
export async function listarEscaneados(userId: string, ids?: string[]): Promise<ScanItem[]> {
  if (ids && !ids.length) return [];
  let q = supabase
    .from('product_scans')
    .select('id, image_path, produto_nome, produto_marca, resultado, created_at, recorte_status, recorte_path, recorte_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (ids) q = q.in('id', ids);
  const { data: rows, error } = await q;
  if (error) throw error;
  if (!rows?.length) return [];

  const paths = [
    ...rows.map((r: any) => r.image_path),
    ...rows.filter((r: any) => r.recorte_status === 'ok' && r.recorte_path && !r.recorte_url).map((r: any) => r.recorte_path),
  ].filter(Boolean) as string[];
  const signedMap = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('product-scans').createSignedUrls(paths, 3600);
    (signed ?? []).forEach((sn: any) => {
      if (sn?.path && sn?.signedUrl && !sn.error) signedMap.set(sn.path, sn.signedUrl);
    });
  }

  return rows.map((r: any) => ({
    id: r.id,
    photoUrl: r.image_path ? (signedMap.get(r.image_path) ?? null) : null,
    brand: r.produto_marca ?? r.resultado?.produto?.marca ?? null,
    name: r.produto_nome ?? r.resultado?.produto?.nome ?? null,
    createdAt: r.created_at,
    result: r.resultado,
    cat: catOf(r.resultado?.produto?.categoria),
    match: typeof r.resultado?.compatibilidade === 'number' ? Math.round(r.resultado.compatibilidade) : null,
    cutoutUrl: r.recorte_status === 'ok' ? (r.recorte_url ?? (r.recorte_path ? signedMap.get(r.recorte_path) ?? null : null)) : null,
    cutoutStatus: r.recorte_status ?? null,
    verdict: typeof r.resultado?.veredito === 'string' ? r.resultado.veredito : null,
  }));
}
