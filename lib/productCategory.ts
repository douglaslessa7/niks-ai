// Categoria de um produto para os filtros (Produtos 47a, folha "Escolher produto").
// A categoria vinda da IA (analisar-produto) ou do catálogo é texto livre ("sérum
// facial", "gel de limpeza", "protetor solar com cor"…) → agrupa por palavra.

// Filtros do 47a, na ordem do design.
export const CAT_ORDER = ['Limpeza', 'Tônico', 'Sérum', 'Hidratante', 'Protetor solar'] as const;

export function catOf(raw?: string | null): string | null {
  const c = (raw ?? '').toLowerCase();
  if (!c) return null;
  if (/protetor|fps|solar/.test(c)) return 'Protetor solar';
  if (/limp|sabonete|micelar|cleans/.test(c)) return 'Limpeza';
  if (/t[oô]nico|toner|essência|essencia/.test(c)) return 'Tônico';
  if (/s[ée]rum|ampoule|booster/.test(c)) return 'Sérum';
  if (/hidrat|creme|loção|locao|gel/.test(c)) return 'Hidratante';
  return null;
}
