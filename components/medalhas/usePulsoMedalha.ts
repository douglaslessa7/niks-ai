// ─────────────────────────────────────────────────────────────────────────────
// O pulso da medalha do nível em que ela está (08/nov/2026, pedido do produto; substituiu o
// arco rosa): só cresce e volta, sem parar. Não muda de cor nem de opacidade. Só transform,
// no UI thread. Reduzir movimento: parada.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import {
  cancelAnimation, Easing, useAnimatedReaction, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTelaFocada } from '../../hooks/useTelaFocada';

const MEIO_CICLO = 700;     // ms para ir (e para voltar)
const ESCALA = 0.08;        // 1 → 1,08

// `pausado`: verdadeiro enquanto a lista rola (nada disputa o dedo).
export function usePulsoMedalha(ativo: boolean, rm: boolean, escala: number = ESCALA, pausado?: SharedValue<boolean>) {
  const p = useSharedValue(0);
  const focada = useTelaFocada();
  const animar = ativo && !rm && focada;

  useEffect(() => {
    if (!animar) {
      cancelAnimation(p);
      p.set(0);
      return;
    }
    p.set(0);
    p.set(withRepeat(withTiming(1, { duration: MEIO_CICLO, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(p);
  }, [animar, p]);

  useAnimatedReaction(() => pausado?.get() ?? false, (agora, antes) => {
    if (!animar || agora === antes || antes === null) return;
    if (agora) cancelAnimation(p);
    else p.set(withRepeat(withTiming(1, { duration: MEIO_CICLO, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [animar]);

  return useAnimatedStyle(() => ({ transform: [{ scale: 1 + escala * p.get() }] }));
}
