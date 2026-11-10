import { supabase } from './supabase';
import { peekCache } from './cache';

/**
 * Foto do ROSTO para o "Compartilhar com o NIKS" (rosto ↔ produto no carregamento). NÃO é
 * avatar: avatar usa `getFotoPerfilUrl` (09/nov/2026). Regra:
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

/**
 * Avatar (09/nov/2026): SÓ a foto de perfil (`users.foto_home_url`) — a do scan nunca vira
 * avatar, igual aos grupos. `foto` null = mostrar a inicial do `nome`.
 */
export async function getFotoPerfilUrl(userId: string): Promise<{ foto: string | null; nome: string | null }> {
  const { data } = await supabase.from('users').select('foto_home_url, nome').eq('id', userId).maybeSingle();
  return { foto: data?.foto_home_url ?? null, nome: data?.nome ?? null };
}
