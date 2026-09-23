// ─────────────────────────────────────────────────────────────────────────────
// PRODUTO FIXADO NUM PASSO — a escolha da usuária, do botão "Adicionar à minha
// rotina" (detalhe de um produto recomendado, ou de uma alternativa dele).
//
// ⚠️ NÃO confundir com a Minha Coleção (`lib/colecao.ts`):
//   • Coleção        = "eu TENHO esse produto em casa" — entra por SCAN, tem foto
//                      dela e compatibilidade medida pela IA;
//   • produto fixado = "eu QUERO esse produto neste passo" — é do CATÁLOGO, ela
//                      não necessariamente tem.
// São dois botões e duas tabelas de propósito: misturar faria o app afirmar que
// ela tem em casa um produto que ela só escolheu.
//
// ⚠️ A ESCOLHA DELA GANHA DA IA. `recomendar-produtos` resolve cada passo nesta
// ordem: fixado → Coleção → catálogo. Se ela fixou um recomendado e depois um
// produto de casa compatível aparece para o mesmo passo, a escolha PERMANECE.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { normStepKey } from './savedProducts';

/**
 * Fixa (ou troca) o produto de um passo. Idempotente por `(user_id, passo_key)`:
 * fixar de novo substitui a escolha anterior daquele passo.
 *
 * Não dispara a recomendação — quem chama decide quando refrescar (e passa
 * `preservarCatalogo: true`, para os outros passos não serem re-sorteados).
 */
export async function fixarProdutoNoPasso(
  userId: string,
  passo: string,
  produtoId: string,
): Promise<void> {
  const passoKey = normStepKey(passo);
  if (!passoKey || !produtoId) return;

  const { error } = await supabase
    .from('rotina_produto_fixado')
    .upsert(
      { user_id: userId, passo_key: passoKey, produto_id: produtoId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,passo_key' },
    );
  if (error) throw error;
}

/**
 * Desfaz a escolha de um passo — ele volta a ser resolvido pela ordem normal
 * (Coleção → catálogo). ⚠️ Remoção por chave explícita, nunca por `user_id` só.
 */
export async function desfixarPasso(userId: string, passo: string): Promise<void> {
  const passoKey = normStepKey(passo);
  if (!passoKey) return;
  const { error } = await supabase
    .from('rotina_produto_fixado')
    .delete()
    .eq('user_id', userId)
    .eq('passo_key', passoKey);
  if (error) throw error;
}
