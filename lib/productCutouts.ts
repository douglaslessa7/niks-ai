// ─────────────────────────────────────────────────────────────────────────────
// Recorte SEM FUNDO das fotos do catálogo (Fase 2 — Edge Function `recortar-catalogo`).
// `produtos.imagem_recorte_url` (WebP com transparência) quando o status é 'ok'; a
// `imagem_url` original segue como reserva. Os produtos escolhidos na rotina
// (`lib/savedProducts`) guardam a URL da foto ORIGINAL — aqui ela vira o recorte.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';

export type Cutout = { url: string; w: number | null; h: number | null };

// Mapa "URL da foto original" → recorte pronto (só os que existem).
export async function getCutoutsByImageUrl(urls: string[]): Promise<Record<string, Cutout>> {
  const list = [...new Set(urls.filter(Boolean))];
  if (!list.length) return {};
  const { data, error } = await supabase
    .from('produtos')
    .select('imagem_url, imagem_recorte_url, imagem_recorte_w, imagem_recorte_h')
    .in('imagem_url', list)
    .eq('imagem_recorte_status', 'ok');
  if (error) return {};
  const out: Record<string, Cutout> = {};
  (data ?? []).forEach((r: any) => {
    if (r.imagem_recorte_url) out[r.imagem_url] = { url: r.imagem_recorte_url, w: r.imagem_recorte_w, h: r.imagem_recorte_h };
  });
  return out;
}

// Mapa "id do produto do catálogo" → recorte pronto.
export async function getCutoutsByProductId(ids: string[]): Promise<Record<string, Cutout>> {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const { data, error } = await supabase
    .from('produtos')
    .select('id, imagem_recorte_url, imagem_recorte_w, imagem_recorte_h')
    .in('id', list)
    .eq('imagem_recorte_status', 'ok');
  if (error) return {};
  const out: Record<string, Cutout> = {};
  (data ?? []).forEach((r: any) => {
    if (r.imagem_recorte_url) out[r.id] = { url: r.imagem_recorte_url, w: r.imagem_recorte_w, h: r.imagem_recorte_h };
  });
  return out;
}
