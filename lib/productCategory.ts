// Categoria de um produto para os filtros (Produtos 47a, folha "Escolher produto").
// A categoria vinda da IA (analisar-produto) ou do catálogo é texto livre ("sérum
// facial", "gel de limpeza", "protetor solar com cor"…) → agrupa por palavra.

import { emIngles } from './i18n';

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
  // Categoria em inglês (etapa 3): só quando nada acima reconheceu e o celular está em
  // inglês — em português o resultado é exatamente o de antes.
  if (!emIngles) return null;
  if (/sunscreen|sunblock|\bspf\b|sun protect/.test(c)) return 'Protetor solar';
  if (/face wash|facial wash|makeup remover|micellar|foam/.test(c)) return 'Limpeza';
  if (/essence|tonic|mist/.test(c)) return 'Tônico';
  if (/moistur|cream|lotion|balm/.test(c)) return 'Hidratante';
  return null;
}
