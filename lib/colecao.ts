// ─────────────────────────────────────────────────────────────────────────────
// "Minha coleção" (design 47a) + "Minha estante" (design 48a).
// Produtos que a usuária marcou "Tenho em casa" — de um scan ou do catálogo —
// na tabela `colecao_produtos` (RLS: só as próprias linhas). Cada um ganha um
// recorte sem fundo (Edge Function `recortar-produto`, bucket privado `colecao`)
// que vira a "miniatura" na estante. `estante` guarda a posição; null = fora dela.
// Migration: supabase/migrations/20261003120000_create_colecao_produtos.sql.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { getCutoutsByProductId } from './productCutouts';
import { getScanCutouts, requestMissingScanCutouts } from './scanCutouts';

export type ShelfPos = { s: number; x: number }; // prateleira 0..2 + centro em pt (frame 393)

export type ColecaoItem = {
  id: string;
  origem: 'scan' | 'catalogo';
  productScanId: string | null;
  produtoId: string | null;
  nome: string | null;
  marca: string | null;
  categoria: string | null;
  compat: number | null;
  verdict: string | null;    // veredito do scan (pode_usar | com_ressalva | evitaria) — mostrado quando não há %
  photoUrl: string | null;   // foto original, pronta para exibir (URL assinada no caso do scan)
  cutoutUrl: string | null;  // recorte sem fundo (URL assinada), quando pronto
  cutoutStatus: 'pendente' | 'ok' | 'falhou';
  cutoutW: number | null;
  cutoutH: number | null;
  estante: ShelfPos | null;
  createdAt: string;
};

const SIGN_TTL = 3600;

async function signMany(bucket: string, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGN_TTL);
  (data ?? []).forEach((s: any) => { if (s?.path && s?.signedUrl && !s.error) out.set(s.path, s.signedUrl); });
  return out;
}

const isHttp = (s?: string | null) => !!s && /^https?:\/\//.test(s);

// Compatibilidade (0–100) que vale para a usuária, quando a linha da coleção não guardou:
// produto do catálogo → a da recomendação dela (recomendacoes_produtos); produto escaneado
// → a da análise do scan. Antes, um item salvo sem o número ficava sem o selo "% compatível".
async function compatFallback(userId: string, prodIds: string[], scanIds: string[]) {
  const byProd = new Map<string, number>();
  const byScan = new Map<string, number>();
  const verdictByScan = new Map<string, string>();
  const [rec, scans] = await Promise.all([
    prodIds.length
      ? supabase.from('recomendacoes_produtos').select('recomendacao').eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null } as any),
    scanIds.length
      ? supabase.from('product_scans').select('id, resultado').in('id', scanIds)
      : Promise.resolve({ data: [] } as any),
  ]);
  const passos = Array.isArray(rec?.data?.recomendacao) ? rec.data.recomendacao : [];
  passos.forEach((s: any) => (s?.produtos ?? []).forEach((x: any) => {
    if (x?.produto_id && typeof x.compatibilidade === 'number' && !byProd.has(x.produto_id)) byProd.set(x.produto_id, Math.round(x.compatibilidade));
  }));
  (scans?.data ?? []).forEach((r: any) => {
    const c = r?.resultado?.compatibilidade;
    if (typeof c === 'number') byScan.set(r.id, Math.round(c));
    if (typeof r?.resultado?.veredito === 'string') verdictByScan.set(r.id, r.resultado.veredito);
  });
  return { byProd, byScan, verdictByScan };
}

// Coleção da usuária, mais antiga primeiro (a ordem do "Fora da estante" segue a de entrada).
export async function listColecao(userId: string): Promise<ColecaoItem[]> {
  const { data: rows, error } = await supabase
    .from('colecao_produtos')
    .select('id, origem, product_scan_id, produto_id, nome, marca, categoria, compatibilidade, imagem_url, recorte_path, recorte_status, recorte_w, recorte_h, estante, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const list = rows ?? [];
  const scanPaths = list.filter((r: any) => r.origem === 'scan' && r.imagem_url && !isHttp(r.imagem_url)).map((r: any) => r.imagem_url);
  const cutPaths = list.filter((r: any) => r.recorte_status === 'ok' && r.recorte_path).map((r: any) => r.recorte_path);
  // Produto do catálogo: usa o recorte do catálogo (Fase 2), que vale para todo mundo.
  const prodIds = list.filter((r: any) => r.origem === 'catalogo' && r.produto_id).map((r: any) => r.produto_id);
  // Produto de scan: usa o recorte do próprio scan (Fase 3, product_scans.recorte_*).
  const scanIds = list.filter((r: any) => r.origem === 'scan' && r.product_scan_id).map((r: any) => r.product_scan_id);
  const missing = list.filter((r: any) => typeof r.compatibilidade !== 'number');
  const [scanUrls, cutUrls, catCuts, scanCuts, fb] = await Promise.all([
    signMany('product-scans', scanPaths), signMany('colecao', cutPaths), getCutoutsByProductId(prodIds), getScanCutouts(scanIds),
    compatFallback(
      userId,
      missing.filter((r: any) => r.produto_id).map((r: any) => r.produto_id),
      missing.filter((r: any) => r.product_scan_id).map((r: any) => r.product_scan_id),
    ),
  ]);
  return list.map((r: any) => {
    const e = r.estante;
    const sc = r.product_scan_id ? scanCuts[r.product_scan_id] : undefined;
    const cat = r.produto_id ? catCuts[r.produto_id] : (sc?.url ? { url: sc.url, w: sc.w, h: sc.h } : undefined);
    if (cat) {
      r = { ...r, recorte_status: 'ok', recorte_w: cat.w, recorte_h: cat.h };
      const key = `recorte:${r.produto_id ?? r.product_scan_id}`;
      cutUrls.set(key, cat.url);
      r.recorte_path = key;
    }
    return {
      id: r.id,
      origem: r.origem,
      productScanId: r.product_scan_id,
      produtoId: r.produto_id,
      nome: r.nome,
      marca: r.marca,
      categoria: r.categoria,
      compat: typeof r.compatibilidade === 'number' ? r.compatibilidade
        : (r.produto_id ? fb.byProd.get(r.produto_id) : undefined) ?? (r.product_scan_id ? fb.byScan.get(r.product_scan_id) : undefined) ?? null,
      verdict: r.product_scan_id ? fb.verdictByScan.get(r.product_scan_id) ?? null : null,
      photoUrl: isHttp(r.imagem_url) ? r.imagem_url : (scanUrls.get(r.imagem_url) ?? null),
      cutoutUrl: r.recorte_path ? (cutUrls.get(r.recorte_path) ?? null) : null,
      cutoutStatus: r.recorte_status,
      cutoutW: r.recorte_w,
      cutoutH: r.recorte_h,
      estante: e && typeof e.s === 'number' && typeof e.x === 'number' ? { s: e.s, x: e.x } : null,
      createdAt: r.created_at,
    };
  });
}

// Itens da coleção/estante vindos de SCAN sem recorte: pede o recorte do próprio scan
// (product_scans — o mesmo que Escaneados usa), dentro da cota da sessão. Itens do
// catálogo não entram: usam o recorte do catálogo (rotina diária `recortar-catalogo`).
// `onDone` roda a cada recorte que voltou — quem chama recarrega a lista.
export async function requestMissingColecaoCutouts(items: ColecaoItem[], onDone?: () => void): Promise<void> {
  const scanIds = items
    .filter((c) => c.origem === 'scan' && c.productScanId && !c.cutoutUrl)
    .map((c) => c.productScanId!);
  if (!scanIds.length) return;
  const st = await getScanCutouts(scanIds);
  await requestMissingScanCutouts(scanIds.map((id) => ({ id, status: st[id]?.status })), () => onDone?.());
}

// Pede o recorte à Edge Function (em segundo plano; ela é idempotente). Tentar de
// novo um mesmo produto só uma vez por sessão do app, para não gastar à toa.
const asked = new Set<string>();
export function requestCutout(id: string, force = false): Promise<void> {
  if (asked.has(id) && !force) return Promise.resolve();
  asked.add(id);
  return supabase.functions.invoke('recortar-produto', { body: { id } })
    .then(({ error }) => { if (error) console.warn('[coleção] recorte falhou', id, error.message); })
    .catch((e) => console.warn('[coleção] recorte falhou', id, e));
}

type NewItem = {
  origem: 'scan' | 'catalogo';
  productScanId?: string | null;
  produtoId?: string | null;
  nome?: string | null;
  marca?: string | null;
  categoria?: string | null;
  compat?: number | null;
  imagemUrl?: string | null; // URL pública (catálogo) ou path em product-scans (scan)
};

// "Tenho em casa": adiciona (ou devolve o que já estava) e já pede o recorte.
export async function addToColecao(userId: string, it: NewItem): Promise<string | null> {
  const key = it.productScanId ? 'product_scan_id' : 'produto_id';
  const val = it.productScanId ?? it.produtoId;
  if (val) {
    const { data: hit } = await supabase.from('colecao_produtos').select('id').eq('user_id', userId).eq(key, val).maybeSingle();
    if (hit?.id) return hit.id;
  }
  // Scan: a foto de origem do recorte é o path no bucket product-scans.
  let imagemUrl = it.imagemUrl ?? null;
  if (it.origem === 'scan' && !imagemUrl && it.productScanId) {
    const { data: sc } = await supabase.from('product_scans').select('image_path').eq('id', it.productScanId).maybeSingle();
    imagemUrl = sc?.image_path ?? null;
  }
  const { data, error } = await supabase
    .from('colecao_produtos')
    .insert({
      user_id: userId,
      origem: it.origem,
      product_scan_id: it.productScanId ?? null,
      produto_id: it.produtoId ?? null,
      nome: it.nome ?? null,
      marca: it.marca ?? null,
      categoria: it.categoria ?? null,
      compatibilidade: typeof it.compat === 'number' ? Math.round(it.compat) : null,
      imagem_url: imagemUrl,
    })
    .select('id')
    .single();
  if (error) throw error;
  // Do catálogo e já recortado lá → não precisa de recorte próprio.
  const catCut = it.produtoId ? (await getCutoutsByProductId([it.produtoId]))[it.produtoId] : undefined;
  if (!catCut) void requestCutout(data.id);
  return data.id;
}

// Tira da coleção. O recorte no bucket fica para a limpeza da conta (delete-account)
// — o app não tem permissão de apagar arquivo lá.
export async function removeFromColecao(id: string): Promise<void> {
  const { error } = await supabase.from('colecao_produtos').delete().eq('id', id);
  if (error) throw error;
}

// Id do item da coleção que corresponde a um scan / produto do catálogo (ou null).
export async function findInColecao(userId: string, by: { productScanId?: string | null; produtoId?: string | null }): Promise<string | null> {
  const key = by.productScanId ? 'product_scan_id' : 'produto_id';
  const val = by.productScanId ?? by.produtoId;
  if (!val) return null;
  const { data } = await supabase.from('colecao_produtos').select('id').eq('user_id', userId).eq(key, val).maybeSingle();
  return data?.id ?? null;
}

// Move na estante (null = "Fora da estante").
export async function setShelfPos(id: string, pos: ShelfPos | null): Promise<void> {
  const { error } = await supabase.from('colecao_produtos').update({ estante: pos }).eq('id', id);
  if (error) console.warn('[estante] falha ao salvar posição', error.message);
}
