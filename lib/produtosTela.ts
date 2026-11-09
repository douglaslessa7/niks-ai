// ─────────────────────────────────────────────────────────────────────────────
// Dados da aba Produtos, prontos ANTES de ela abrir (08/nov/2026).
//
// Antes, cada entrada fazia ~1,4 s (rotina) + 0,7 s (estante) + 0,5 s (escaneados) + 0,4 s
// (getUser) e a tela ia preenchendo aos poucos. Agora: a tela nasce com o último dado
// guardado e, ao focar, confere tudo no servidor em silêncio; só re-renderiza se mudou.
//
// Diferente do `useCachedQuery`: revalida a CADA foco (um produto adicionado no scan precisa
// aparecer na volta) e compara ignorando o token das URLs assinadas, que muda a cada leitura.
// ⚠️ Estante e escaneados têm URLs assinadas de 1 h: dado com mais de 50 min não é usado, e
// nessa idade o que veio da rede substitui o guardado mesmo sendo igual.
// ─────────────────────────────────────────────────────────────────────────────
import { Image as ExpoImage } from 'expo-image';
import { supabase } from './supabase';
import { peekCache, readCache, writeCache } from './cache';
import { getUserId } from './currentUser';
import { listColecao, type ColecaoItem } from './colecao';
import { listarEscaneados, type ScanItem } from './escaneados';
import { produtosDaRotinaPorNome } from './minhaRotina';

export type RecomendacaoCrua = { passos: any[]; prods: any[] };

type Tipos = {
  colecao: ColecaoItem[];
  escaneados: ScanItem[];
  salvos: Awaited<ReturnType<typeof produtosDaRotinaPorNome>>;
  recomendacao: RecomendacaoCrua;
  foto: { url: string | null };
};
export type TipoProdutos = keyof Tipos;

const MAX_IDADE_ASSINADA = 50 * 60_000;
const ASSINADOS: TipoProdutos[] = ['colecao', 'escaneados'];

const chave = (t: TipoProdutos, uid: string) => `produtos:${t}:${uid}`;
const valido = (t: TipoProdutos, at: number) => !ASSINADOS.includes(t) || Date.now() - at < MAX_IDADE_ASSINADA;

async function buscarRecomendacao(uid: string): Promise<RecomendacaoCrua> {
  const { data: row, error } = await supabase.from('recomendacoes_produtos').select('recomendacao').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  const passos: any[] = Array.isArray(row?.recomendacao) ? row!.recomendacao : [];
  const ids = [...new Set(passos.flatMap((p) => (p?.produtos ?? []).map((x: any) => x?.produto_id)).filter(Boolean))];
  if (!ids.length) return { passos, prods: [] };
  const { data: prods, error: e2 } = await supabase.from('produtos')
    .select('id, marca, nome, imagem_url, concerns, categoria, imagem_recorte_url, imagem_recorte_status')
    .in('id', ids);
  if (e2) throw e2;
  return { passos, prods: prods ?? [] };
}

async function buscarFoto(uid: string): Promise<{ url: string | null }> {
  const [{ data: u }, { data: sc }] = await Promise.all([
    supabase.from('users').select('foto_home_url').eq('id', uid).maybeSingle(),
    supabase.from('skin_scans').select('foto_url').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { url: u?.foto_home_url ?? sc?.foto_url ?? null };
}

const BUSCAS: { [K in TipoProdutos]: (uid: string) => Promise<Tipos[K]> } = {
  colecao: listColecao,
  escaneados: (uid) => listarEscaneados(uid),
  salvos: produtosDaRotinaPorNome,
  recomendacao: buscarRecomendacao,
  foto: buscarFoto,
};

// Mesmo dado, ignorando o que vem depois do "?" das URLs (o token assinado).
const semToken = (v: unknown) => JSON.stringify(v).replace(/\?[^"]*token=[^"]*/g, '');

/** Leitura síncrona, para o primeiro render já sair com dado. */
export function dadoPronto<K extends TipoProdutos>(t: K, uid: string | null): Tipos[K] | null {
  if (!uid) return null;
  const e = peekCache<Tipos[K]>(chave(t, uid));
  return e && valido(t, e.at) ? e.data : null;
}

async function dadoGuardado<K extends TipoProdutos>(t: K, uid: string): Promise<Tipos[K] | null> {
  const e = await readCache<Tipos[K]>(chave(t, uid));
  return e && valido(t, e.at) ? e.data : null;
}

const emVoo = new Map<string, Promise<{ data: unknown; mudou: boolean }>>();

/** Vai ao servidor. `mudou` falso: o que já estava guardado continua valendo. */
export function revalidar<K extends TipoProdutos>(t: K, uid: string): Promise<{ data: Tipos[K]; mudou: boolean }> {
  const k = chave(t, uid);
  const atual = emVoo.get(k);
  if (atual) return atual as Promise<{ data: Tipos[K]; mudou: boolean }>;
  const p = (async () => {
    const data = await BUSCAS[t](uid);
    const antes = await readCache<Tipos[K]>(k);
    if (antes && valido(t, antes.at) && semToken(antes.data) === semToken(data)) return { data: antes.data, mudou: false };
    await writeCache(k, data);
    return { data, mudou: true };
  })();
  emVoo.set(k, p);
  void p.finally(() => { emVoo.delete(k); }).catch(() => {});
  return p;
}

/**
 * Mostra o que há guardado e confere no servidor. `temNaTela`: a tela já tem dado (inclusive
 * uma mudança otimista), então o guardado não é reaplicado por cima.
 * Lança o erro da rede só quando não havia nada para mostrar.
 */
export async function sincronizar<K extends TipoProdutos>(
  t: K, uid: string, o: { temNaTela: boolean; aplicar: (d: Tipos[K]) => void; semDado?: () => void },
): Promise<Tipos[K] | null> {
  const guardado = await dadoGuardado(t, uid);
  if (guardado && !o.temNaTela) o.aplicar(guardado);
  if (!guardado && !o.temNaTela) o.semDado?.();
  try {
    const r = await revalidar(t, uid);
    if (r.mudou || !o.temNaTela) o.aplicar(r.data);
    return r.data;
  } catch (e) {
    if (guardado || o.temNaTela) return guardado;
    throw e;
  }
}

/** Recorte/foto para o expo-image: o mesmo arquivo não baixa de novo quando só o token muda. */
export const fonteImagem = (uri: string) => ({ uri, cacheKey: uri.split('?')[0] });

const imagensDe = (colecao: ColecaoItem[] | null, scans: ScanItem[] | null, rec: RecomendacaoCrua | null): string[] => {
  const urls = [
    ...(colecao ?? []).map((c) => c.cutoutUrl ?? c.photoUrl),
    ...(scans ?? []).slice(0, 12).map((s) => s.cutoutUrl ?? s.photoUrl),
    ...(rec?.prods ?? []).map((p) => (p.imagem_recorte_status === 'ok' && p.imagem_recorte_url) || p.imagem_url),
  ];
  return [...new Set(urls.filter(Boolean) as string[])];
};

/** Lê do disco e atualiza tudo em segundo plano, com as imagens. Só leitura: nada de IA. */
export async function preaquecerProdutos(): Promise<void> {
  const uid = await getUserId();
  if (!uid) return;
  const tipos = Object.keys(BUSCAS) as TipoProdutos[];
  await Promise.all(tipos.map((t) => dadoGuardado(t, uid)));
  await Promise.allSettled(tipos.map((t) => revalidar(t, uid)));
  const urls = imagensDe(dadoPronto('colecao', uid), dadoPronto('escaneados', uid), dadoPronto('recomendacao', uid));
  if (urls.length) await ExpoImage.prefetch(urls, 'memory-disk').catch(() => false);
}
