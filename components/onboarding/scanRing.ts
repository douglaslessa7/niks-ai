// Geometria do ANEL do scan do onboarding — FONTE ÚNICA, usada pela câmera
// (`app/(scan)/camera.tsx`) e pelo tutorial que a antecede (`app/(scan)/scan-prep.tsx`),
// para o tutorial mostrar exatamente o anel que ela vai ver.
//
// O anel tem traços em volta de um oval; cada uma das 3 etapas (3 fotos) é dona de um
// terço deles: frente = traços de cima e de baixo, esquerda = arco da esquerda da tela,
// direita = arco da direita da tela. Na etapa da vez o arco acende traço a traço.
export type ScanStepId = 'frente' | 'esquerda' | 'direita';

export const SCAN_STEPS: { id: ScanStepId; text: string }[] = [
  { id: 'frente', text: 'Olhe para a frente e fique parada' },
  { id: 'esquerda', text: 'Vire o rosto devagar para a esquerda' },
  { id: 'direita', text: 'Agora vire devagar para a direita' },
];

// Arco de cada traço. Ângulo em graus no sentido da tela: 0 = direita, 90 = baixo,
// 180 = esquerda, 270 = cima.
function arcOf(deg: number): ScanStepId {
  if (deg >= 120 && deg < 240) return 'esquerda';
  if (deg >= 300 || deg < 60) return 'direita';
  return 'frente';
}
// Ordem em que os traços de cada arco acendem (0 → 1), varrendo de uma ponta à
// outra. A frente tem dois pedaços (cima e baixo), que enchem juntos.
function orderInArc(deg: number, arc: ScanStepId): number {
  if (arc === 'esquerda') return (deg - 120) / 120;
  if (arc === 'direita') return ((deg + 60) % 360) / 120;
  return deg < 180 ? (deg - 60) / 60 : (deg - 240) / 60;
}

export type RingTick = { c: number; s: number; arc: ScanStepId; order: number };

/** `n` traços (múltiplo de 6), começando embaixo como no design. */
export function ringTicks(n: number): RingTick[] {
  return Array.from({ length: n }, (_, i) => {
    const d = (90 + (i * 360) / n) % 360;
    const arc = arcOf(d);
    const a = (d * Math.PI) / 180;
    return { c: Math.cos(a), s: Math.sin(a), arc, order: Math.min(0.999, Math.max(0, orderInArc(d, arc))) };
  });
}

// Overshoot do design (`back`, c1 = 2,2) para o traço que nasce rosa.
export const ringBack = (x: number) => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
