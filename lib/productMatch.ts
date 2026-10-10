// ─────────────────────────────────────────────────────────────────────────────
// "É o mesmo produto?" — SÓ EXIBIÇÃO no app (out/2026). O scan de produto não fica
// ligado a nenhum produto do catálogo: `product_scans` guarda só a marca e o nome que
// a IA leu na embalagem. Para mostrar um card só por produto nos Escaneados e acertar
// o selo "Na estante", o app compara marca + nome lidos.
//
// Regra copiada da `supabase/functions/_shared/scanCutout.ts` (a mesma que o servidor
// usa para reaproveitar o recorte entre scans do mesmo produto) — mudou lá, mude aqui:
// - marca: igual ou uma contém a outra ("la roche" × "la roche posay");
// - nome: igual, ou ≥ 85% das palavras em comum (Jaccard), com ≥ 2 palavras cada.
// Sem marca ou sem nome → nunca casa (não dá para saber).
// Onde erra: a IA lendo o nome bem diferente em dois scans (ficam 2 cards — o erro
// seguro), e variantes de nome MUITO longo que só mudam 1 palavra (viram 1 card).
// ─────────────────────────────────────────────────────────────────────────────

// "SKIN1004 — Madagascar Centella Ampoule" → "skin1004 madagascar centella ampoule"
export function norm(s?: string | null): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(s: string): Set<string> {
  return new Set(s.split(' ').filter((t) => t.length > 1));
}

function sameBrand(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function sameName(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const A = tokens(a), B = tokens(b);
  if (A.size < 2 || B.size < 2) return false;
  let inter = 0;
  A.forEach((t) => { if (B.has(t)) inter++; });
  return inter / (A.size + B.size - inter) >= 0.85;
}

export type BrandName = { marca: string | null | undefined; nome: string | null | undefined };

/** Mesmo produto pela marca + nome lidos (ver regra no topo do arquivo). */
export function sameProduct(a: BrandName, b: BrandName): boolean {
  return sameBrand(norm(a.marca), norm(b.marca)) && sameName(norm(a.nome), norm(b.nome));
}

/** Um item por produto, mantendo o PRIMEIRO de cada (passe a lista do mais recente pro
 *  mais antigo → fica o mais recente). Itens sem marca/nome nunca são agrupados. */
export function dedupeByProduct<T>(list: T[], key: (t: T) => BrandName): T[] {
  const kept: T[] = [];
  for (const it of list) {
    if (!kept.some((k) => sameProduct(key(k), key(it)))) kept.push(it);
  }
  return kept;
}
