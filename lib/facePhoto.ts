import { supabase } from './supabase';
import { peekCache } from './cache';

/**
 * Foto do rosto da usuária — MESMA regra da home (`home.tsx`):
 * `users.foto_home_url` (escolhida na galeria) tem precedência absoluta sobre a foto
 * do último scan (`skin_scans.foto_url`). `null` = nunca escaneou nem escolheu foto.
 *
 * Aproveita o cache da home (`home:${uid}`) quando já está em memória, sem rede.
 */
export async function getFacePhotoUrl(userId: string): Promise<string | null> {
  const cached = peekCache<{ fotoUrl?: string | null }>(`home:${userId}`);
  if (cached?.data?.fotoUrl) return cached.data.fotoUrl;

  const [{ data: scan }, { data: userRow }] = await Promise.all([
    supabase
      .from('skin_scans')
      .select('foto_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('users').select('foto_home_url').eq('id', userId).maybeSingle(),
  ]);
  return userRow?.foto_home_url ?? scan?.foto_url ?? null;
}
