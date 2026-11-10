// Puxar para atualizar (10/nov/2026): um `RefreshControl` com o indicador rosa da marca que,
// ao soltar, chama JUNTOS os `refresh()` das consultas que a tela já usa.
//   • O indicador tem estado PRÓPRIO ("puxando"). O `refreshing` do `useCachedQuery` também
//     liga na revalidação silenciosa de cada foco — ligado ao indicador, o spinner apareceria
//     toda vez que a tela abre.
//   • Sem consulta duplicada: o `refresh()` do `lib/cache.ts` aproveita a chamada em andamento
//     da mesma chave.
//   • Sem haptic (regra do README: nada de vibração em rolagem).
import { createElement, useCallback, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';

const ROSA = '#FF5EA8';

type Recarga = (() => Promise<unknown> | unknown) | null | undefined | false;

/** Devolve o `refreshControl` pronto para o `ScrollView` da tela. `offset` desce o indicador
 *  quando há cabeçalho fixo por cima da lista. */
export function usePuxarParaAtualizar(recargas: Recarga[], offset?: number) {
  const [puxando, setPuxando] = useState(false);
  const lista = useRef(recargas);
  lista.current = recargas;
  const emCurso = useRef(false);

  const onRefresh = useCallback(async () => {
    if (emCurso.current) return;
    emCurso.current = true;
    setPuxando(true);
    try {
      await Promise.allSettled(lista.current.filter(Boolean).map((f) => Promise.resolve((f as () => unknown)())));
    } finally {
      emCurso.current = false;
      setPuxando(false);
    }
  }, []);

  return createElement(RefreshControl, {
    refreshing: puxando,
    onRefresh,
    tintColor: ROSA,
    colors: [ROSA],
    ...(offset ? { progressViewOffset: offset } : {}),
  });
}
