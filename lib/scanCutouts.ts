// ─────────────────────────────────────────────────────────────────────────────
// Recorte SEM FUNDO dos produtos ESCANEADOS (Fase 3) — `product_scans.recorte_*`.
// Feito no servidor (analisar-produto em segundo plano; recortar-produto sob demanda),
// pelo mesmo caminho: catálogo → reuso da mesma usuária → BiRefNet (Replicate).
// Recorte do catálogo = URL pública (recorte_url); feito na foto = arquivo no bucket
// privado product-scans (recorte_path) → URL assinada. Sem recorte: o app usa a foto original.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';

export type ScanCutout = { url: string | null; w: number | null; h: number | null; status: string | null };

// Recortes de uma lista de scans (só os que existem; status vem junto p/ quem quiser esperar).
export async function getScanCutouts(scanIds: string[]): Promise<Record<string, ScanCutout>> {
  const ids = [...new Set(scanIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from('product_scans')
    .select('id, recorte_status, recorte_path, recorte_url, recorte_w, recorte_h')
    .in('id', ids);
  if (error) return {};
  const paths = (data ?? []).filter((r: any) => r.recorte_status === 'ok' && r.recorte_path && !r.recorte_url).map((r: any) => r.recorte_path);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: s } = await supabase.storage.from('product-scans').createSignedUrls(paths, 3600);
    (s ?? []).forEach((x: any) => { if (x?.path && x?.signedUrl && !x.error) signed.set(x.path, x.signedUrl); });
  }
  const out: Record<string, ScanCutout> = {};
  (data ?? []).forEach((r: any) => {
    const url = r.recorte_status === 'ok' ? (r.recorte_url ?? (r.recorte_path ? signed.get(r.recorte_path) ?? null : null)) : null;
    out[r.id] = { url, w: r.recorte_w, h: r.recorte_h, status: r.recorte_status };
  });
  return out;
}

// Pede o recorte de um scan antigo (feito antes do recorte automático). Uma vez por
// scan por sessão do app, e no máximo SESSION_LIMIT pedidos por sessão — cota ÚNICA,
// dividida entre Escaneados, Minha coleção e estante (cada pedido pode virar uma
// chamada paga ao Replicate; sem lote no servidor, é o app que vai cobrindo aos poucos).
// Devolve null quando não pediu (já pedido, cota esgotada ou erro).
const SESSION_LIMIT = 40;
const asked = new Set<string>();
export function scanCutoutBudgetLeft(): number {
  return Math.max(0, SESSION_LIMIT - asked.size);
}
export async function requestScanCutout(scanId: string): Promise<string | null> {
  if (asked.has(scanId) || asked.size >= SESSION_LIMIT) return null;
  asked.add(scanId);
  try {
    const { data, error } = await supabase.functions.invoke('recortar-produto', { body: { scanId } });
    if (error) return null;
    return (data as any)?.status ?? null;
  } catch {
    return null;
  }
}

// Pede, um por vez, o recorte dos scans da lista que ainda não têm (status nulo = scan
// de antes do recorte automático; 'falhou' não é repetido). `onDone` roda após cada um
// que voltou — quem chama recarrega a tela. Para quando a cota da sessão acaba.
const running = new Set<string>();
export async function requestMissingScanCutouts(
  scans: { id: string; status: string | null | undefined }[],
  onDone?: (scanId: string, status: string) => void,
): Promise<void> {
  const todo = scans.filter((s) => s.id && !s.status && !asked.has(s.id) && !running.has(s.id));
  todo.forEach((s) => running.add(s.id));
  try {
    for (const s of todo) {
      if (scanCutoutBudgetLeft() === 0) break;
      const st = await requestScanCutout(s.id);
      if (st) onDone?.(s.id, st);
    }
  } finally {
    todo.forEach((s) => running.delete(s.id));
  }
}

// Espera o recorte de um scan recém-feito ficar pronto (o servidor faz em segundo plano).
// Devolve a URL quando 'ok'; null se falhar ou passar do tempo — aí fica a foto original.
export async function waitScanCutout(scanId: string, timeoutMs = 20_000, everyMs = 2_000): Promise<string | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const c = (await getScanCutouts([scanId]))[scanId];
    if (c?.status === 'ok' && c.url) return c.url;
    if (c?.status === 'falhou') return null;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return null;
}
