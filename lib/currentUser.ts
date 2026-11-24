// ─────────────────────────────────────────────────────────────────────────────
// Id do usuário logado, barato.
//
// ⚠️ `supabase.auth.getUser()` faz uma REQUISIÇÃO DE REDE (valida o JWT no
// servidor). Ele estava sendo chamado no começo de praticamente todo bloco de
// fetch do app — home, protocolo, perfil, niks-chat, recomendacao-produtos,
// share-preview — ou seja, uma ida à rede extra por tela, por foco, só para
// descobrir um id que já está no disco.
//
// `getSession()` lê a sessão do AsyncStorage (local) e só vai à rede quando o
// token está realmente vencido. Para montar chaves de cache e filtrar por
// `user_id` é o suficiente: se o token estiver ruim, é a própria consulta que
// falha no RLS — não a leitura do id.
//
// Para operações sensíveis que precisam de um usuário *verificado pelo servidor*
// (apagar conta, etc.), continue usando `supabase.auth.getUser()`.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

let cachedId: string | null = null;

export async function getUserId(): Promise<string | null> {
  if (cachedId) return cachedId;
  const { data } = await supabase.auth.getSession();
  cachedId = data.session?.user?.id ?? null;
  return cachedId;
}

/** Leitura síncrona — null se `getUserId()` ainda não rodou nesta sessão. */
export function peekUserId(): string | null {
  return cachedId;
}

/** Chamar no logout / troca de conta, junto com `clearAllCache()`. */
export function resetUserId(): void {
  cachedId = null;
}

/**
 * Id do usuário para montar chaves de cache.
 *
 * Já sai preenchido a partir do segundo uso na sessão (o id fica em memória),
 * então a tela não perde um render esperando. Na primeira vez devolve null por
 * um instante — por isso quem consome deve passar `enabled: Boolean(userId)`.
 *
 * 1.64 (3): também acompanha a sessão. Antes perguntava UMA vez, ao montar: a aba montada
 * sem sessão (ex.: no meio da troca do onboarding para o "Entrar") guardava null para sempre
 * e a Rotina ficava em "Carregando sua rotina…" sem nem ir à rede (24/nov/2026).
 * O callback do `onAuthStateChange` não chama o Supabase (só lê a sessão recebida).
 */
export function useUserId(): string | null {
  const [id, setId] = useState<string | null>(peekUserId());
  useEffect(() => {
    let active = true;
    if (!id) getUserId().then((v) => { if (active && v) setId(v); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, session) => {
      const novo = session?.user?.id ?? null;
      cachedId = novo;
      if (active) setId(novo);
    });
    return () => { active = false; subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return id;
}
