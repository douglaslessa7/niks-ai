import { supabase } from './supabase';

/**
 * Token de sessão válido para Edge Functions que verificam o JWT localmente
 * (`analisar-produto`, `extrair-imagem-produto`). Mesmo padrão do niks-chat:
 * só faz refresh se faltar menos de 5 min para expirar, evitando round-trip extra.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session: current } } = await supabase.auth.getSession();
    const expiresAt = current?.expires_at ?? 0;
    const nowSecs = Math.floor(Date.now() / 1000);
    if (current?.access_token && expiresAt - nowSecs > 300) {
      return current.access_token;
    }
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    return (!error && refreshed.session?.access_token)
      ? refreshed.session.access_token
      : (current?.access_token ?? null);
  } catch {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }
}
