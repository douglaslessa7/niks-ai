// ─────────────────────────────────────────────────────────────────────────────
// Cache de dados de rede — "stale-while-revalidate".
//
// PROBLEMA QUE ISSO RESOLVE: todas as telas de (app) vivem num `Tabs`, então
// montam uma vez e nunca desmontam — mas os `useFocusEffect` refaziam TODAS as
// consultas ao Supabase a cada troca de aba. A home fazia 4–5 round-trips por
// entrada, o chat rebaixava a conversa inteira. Resultado: a tela "recarregava"
// (piscava vazia) toda vez.
//
// COMO FUNCIONA: cada consulta ganha uma chave. O resultado é gravado em memória
// (leitura síncrona, no primeiro render, sem piscar) E no AsyncStorage (sobrevive
// a fechar o app). Ao focar a tela: se o dado ainda é fresco, NADA vai à rede; se
// está velho, a tela já aparece com o dado antigo e a atualização acontece por
// trás, em silêncio — sem estado de loading.
//
// ⚠️ NÃO cachear aqui: URLs assinadas do Storage (expiram em 1h — ver
// `recomendacao-produtos.tsx`) nem nada com base64 de imagem (estoura o
// AsyncStorage). Cache é para dados pequenos e relativamente estáveis.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

const PREFIX = 'niks_cache:';

/** Janela padrão de frescor: dentro dela, focar a tela não gera nenhuma requisição. */
export const DEFAULT_STALE_MS = 60_000;

type Entry<T> = { data: T; at: number };

// Espelho em memória do que está no AsyncStorage. Existe para o primeiro render
// já sair com dado (AsyncStorage é assíncrono — ler de lá causaria um frame vazio).
const mem = new Map<string, Entry<unknown>>();

// Requisições em voo, por chave. Duas telas pedindo a mesma coisa ao mesmo tempo
// compartilham a mesma promise em vez de disparar duas consultas.
const inFlight = new Map<string, Promise<unknown>>();

/** Leitura SÍNCRONA (só memória). Devolve null se ainda não foi lido do disco. */
export function peekCache<T>(key: string): Entry<T> | null {
  return (mem.get(key) as Entry<T> | undefined) ?? null;
}

/** Leitura assíncrona: memória primeiro, disco como fallback. */
export async function readCache<T>(key: string): Promise<Entry<T> | null> {
  const hit = peekCache<T>(key);
  if (hit) return hit;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (typeof entry?.at !== 'number') return null;
    mem.set(key, entry);
    return entry;
  } catch {
    return null; // cache corrompido nunca deve quebrar a tela
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  const entry: Entry<T> = { data, at: Date.now() };
  mem.set(key, entry);
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // disco cheio / valor grande demais — o cache em memória continua valendo
  }
}

/** Marca a chave como velha (força ida à rede no próximo foco), mantendo o dado. */
export function invalidateCache(key: string): void {
  const hit = mem.get(key);
  if (hit) mem.set(key, { ...hit, at: 0 });
}

/** Apaga tudo. Chamar no logout — o cache é por usuário. */
export async function clearAllCache(): Promise<void> {
  mem.clear();
  inFlight.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // ignora — a limpeza da memória acima já é o essencial
  }
}

type QueryState = 'loading' | 'ready' | 'error';

type Options = {
  /** Quanto tempo o dado é considerado fresco. Default: 60s. */
  staleMs?: number;
  /** Se false, o hook não busca nada (ex.: ainda não sei o id do usuário). */
  enabled?: boolean;
};

type Result<T> = {
  data: T | null;
  /** 'loading' SÓ quando não há nada em cache para mostrar. */
  state: QueryState;
  /** true durante uma revalidação silenciosa (já existe dado na tela). */
  refreshing: boolean;
  /** Força ida à rede agora, ignorando o frescor. */
  refresh: () => Promise<void>;
};

/**
 * Consulta cacheada, revalidada ao focar a tela.
 *
 * `key` null desliga o hook (útil enquanto uma dependência não resolveu).
 * `fetcher` deve ser estável (`useCallback`) — ele é lido por ref, então mudar
 * a identidade dele não redispara a busca sozinho.
 */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: Options = {},
): Result<T> {
  const { staleMs = DEFAULT_STALE_MS, enabled = true } = opts;

  // Primeiro render já sai com o que houver em memória — é isso que elimina o
  // "pisca vazio" ao voltar para uma aba.
  const initial = key ? peekCache<T>(key) : null;
  const [data, setData] = useState<T | null>(initial?.data ?? null);
  const [state, setState] = useState<QueryState>(initial ? 'ready' : 'loading');
  const [refreshing, setRefreshing] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Guarda contra setState depois do unmount e contra respostas fora de ordem.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(
    async (force: boolean) => {
      if (!key || !enabled) return;

      const cached = await readCache<T>(key);
      if (cached && mounted.current) {
        setData(cached.data);
        setState('ready');
      }

      const fresh = cached && Date.now() - cached.at < staleMs;
      if (fresh && !force) return; // caminho feliz: zero rede

      const hasData = Boolean(cached);
      if (mounted.current && hasData) setRefreshing(true);

      try {
        // Dedupe: se a mesma chave já está em voo, aproveita a promise existente.
        let promise = inFlight.get(key) as Promise<T> | undefined;
        if (!promise) {
          promise = fetcherRef.current();
          inFlight.set(key, promise);
          // ⚠️ O `.catch` no fim é obrigatório: `.finally()` devolve uma promise
          // DERIVADA, e se `promise` rejeitar essa derivada rejeita também. O
          // `await` abaixo só trata a original — sem isso, toda falha de rede
          // vira um "Possible unhandled promise rejection" no console.
          void promise.finally(() => { inFlight.delete(key); }).catch(() => {});
        }
        const result = await promise;

        await writeCache(key, result);
        if (mounted.current) {
          setData(result);
          setState('ready');
        }
      } catch (e) {
        console.warn(`[cache] falha ao revalidar "${key}":`, e);
        // Com dado em tela, uma falha de rede é invisível para o usuário —
        // ele continua vendo a última versão boa. Sem dado, é erro de verdade.
        if (mounted.current && !hasData) setState('error');
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    [key, enabled, staleMs],
  );

  useFocusEffect(useCallback(() => { void run(false); }, [run]));

  const refresh = useCallback(() => run(true), [run]);

  return { data, state, refreshing, refresh };
}
