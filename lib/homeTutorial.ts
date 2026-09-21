// ─────────────────────────────────────────────────────────────────────────────
// Tutorial de primeiro acesso da home — o lado da CONTA.
//
// A regra é "uma única vez POR CONTA, nunca mais". Os flags do store
// (`homeTutorialPending`/`homeTutorialSeen`) são do APARELHO: morrem no logout e
// não existem num aparelho novo nem depois de reinstalar. Sozinhos, eles deixavam
// a conta que já viu o tutorial vê-lo de novo ao refazer o onboarding (entrar por
// "Começar" em vez de "Entrar" → paywall → signup com Google/Apple de uma conta
// que já existe).
//
// A verdade mora em `users.home_tutorial_seen_at` (migration
// 20260921120000_add_home_tutorial_seen_at_users.sql). Os flags locais viram um
// CACHE dela — existem para a tela não piscar enquanto a resposta não chega.
//
// ⚠️ A LEITURA não está aqui: ela pega carona no `fetchHome` da `home.tsx`, que já
// consulta a tabela `users` (por causa da `foto_home_url`). É por isso que esta
// feature não custa nenhuma ida à rede a mais.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { getUserId } from './currentUser';
import { invalidateCache } from './cache';

/**
 * Grava "esta conta já viu" no servidor. Chamado ao concluir a última parada.
 *
 * Fire-and-forget e engole erro de propósito: o flag local já trancou o tutorial
 * neste aparelho, e falhar aqui não pode quebrar nada para a usuária — no pior
 * caso ela veria o tutorial mais uma vez em OUTRO aparelho. Invalida o cache da
 * home para a próxima leitura já vir com o marcador.
 */
export async function markHomeTutorialSeenOnServer(): Promise<void> {
  try {
    const userId = await getUserId();
    if (!userId) return;
    const { error } = await supabase
      .from('users')
      .update({ home_tutorial_seen_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
    invalidateCache(`home:${userId}`);
  } catch (err) {
    console.warn('[homeTutorial] não consegui marcar como visto no servidor:', err);
  }
}

/**
 * Desfaz o marcador — **só existe para o atalho de `__DEV__`** do Perfil ("Rever
 * tutorial da home"). Sem isto, o atalho funcionaria uma vez só: na entrada
 * seguinte a home leria `home_tutorial_seen_at` do servidor e trancaria tudo de novo.
 *
 * ⚠️ Diferente do `markHomeTutorialSeenOnServer`, este é AGUARDADO por quem chama e
 * invalida o cache ANTES de navegar — senão a home refaria a busca, leria o valor
 * antigo (do cache ou do banco) e marcaria "já viu" na mesma hora.
 */
export async function clearHomeTutorialSeenOnServer(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('users').update({ home_tutorial_seen_at: null }).eq('id', userId);
  invalidateCache(`home:${userId}`);
}
