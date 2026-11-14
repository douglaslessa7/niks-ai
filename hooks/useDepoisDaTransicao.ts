// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo pesado só DEPOIS da transição de entrada (12/nov/2026). Medido no iPhone (Ranking e
// Jornada do grupo): a thread de UI ficava a 120 fps, mas montar a tela inteira bloqueava o
// JavaScript por 200–300 ms bem no começo do deslize, e a entrada saía engasgada. Com isto a
// tela entra leve (topo, título, abas) e o resto monta quando o deslize termina — o bloqueio cai
// numa tela parada, onde não se vê, e as entradas da lista começam dali.
// `transitionEnd` da pilha nativa; sem ele (tela já aberta, aba), libera em `limiteMs`.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigation } from 'expo-router';

export function useDepoisDaTransicao(limiteMs = 520): boolean {
  const navigation = useNavigation();
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    if (pronto) return;
    const t = setTimeout(() => setPronto(true), limiteMs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tirar = (navigation as any).addListener?.('transitionEnd', (e: { data?: { closing?: boolean } }) => {
      if (!e?.data?.closing) setPronto(true);
    });
    return () => { clearTimeout(t); tirar?.(); };
  }, [navigation, pronto, limiteMs]);
  return pronto;
}
