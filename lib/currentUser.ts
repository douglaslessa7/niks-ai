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
 */
export function useUserId(): string | null {
  const [id, setId] = useState<string | null>(peekUserId());
  useEffect(() => {
    if (id) return;
    let active = true;
    getUserId().then((v) => { if (active) setId(v); });
    return () => { active = false; };
  }, [id]);
  return id;
}
