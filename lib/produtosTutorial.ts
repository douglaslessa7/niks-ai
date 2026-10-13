// ─────────────────────────────────────────────────────────────────────────────
// Tutorial de primeira entrada da tela de Produtos (59a–59d) — o lado da CONTA.
//
// Regra: UMA vez por conta, na primeira abertura de Produtos (inclusive para quem
// já usava o app). A verdade mora em `users.produtos_tutorial_seen_at` (migration
// 20261011120000). Aqui fica um estado de MÓDULO (não persistido) por usuária:
//   • `checkProdutosTutorial()` — a tela de Produtos chama ao ganhar foco; lê a
//     coluna uma vez por sessão e arma o tutorial se for null.
//   • `finishProdutosTutorial()` — concluir ou "Pular": desarma na hora e grava no
//     servidor (fire-and-forget; se falhar, no pior caso ela vê de novo depois).
// O overlay mora no `(app)/_layout.tsx` e lê `useProdutosTutorialPending()`.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getUserId } from './currentUser';

let pending = false;
const checked = new Set<string>(); // usuárias já consultadas nesta sessão
const subs = new Set<() => void>();
const setPending = (v: boolean) => { if (pending !== v) { pending = v; subs.forEach((f) => f()); } };

export async function checkProdutosTutorial(): Promise<void> {
  try {
    const userId = await getUserId();
    if (!userId || checked.has(userId)) return;
    checked.add(userId);
    const { data, error } = await supabase
      .from('users')
      .select('produtos_tutorial_seen_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) { checked.delete(userId); return; } // tenta de novo no próximo foco
    setPending(!!data && data.produtos_tutorial_seen_at == null);
  } catch {
    // sem rede: não mostra agora, tenta no próximo foco
  }
}

export async function finishProdutosTutorial(): Promise<void> {
  setPending(false);
  try {
    const userId = await getUserId();
    if (!userId) return;
    const { error } = await supabase
      .from('users')
      .update({ produtos_tutorial_seen_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
  } catch (err) {
    console.warn('[produtosTutorial] não consegui marcar como visto no servidor:', err);
  }
}

export function useProdutosTutorialPending(): boolean {
  const [v, setV] = useState(pending);
  useEffect(() => {
    const f = () => setV(pending);
    subs.add(f);
    f();
    return () => { subs.delete(f); };
  }, []);
  return v;
}
