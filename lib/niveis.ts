// ─────────────────────────────────────────────────────────────────────────────
// Nível individual por NIKS Points — a MESMA regra da função SQL `nivel_de`
// (supabase/migrations/20261103130000_niks_points_motor.sql). O servidor é a verdade
// (estado.pontos); aqui só para a "Sua caminhada" animar uma subida que atravessa
// vários níveis. Mudou lá, mude aqui.
// ─────────────────────────────────────────────────────────────────────────────
import type { NivelTabela } from './cartasServidor';

export type Nivel = { nivel: number; titulo: string; piso: number; teto: number; tituloProximo: string };

const ROMANOS: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function romano(n: number): string {
  let r = '';
  for (const [v, s] of ROMANOS) while (n >= v) { r += s; n -= v; }
  return r;
}

/** Nível de um total de pontos. `icone` = passo do Ícone II e o incremento de cada seguinte. */
export function nivelDe(total: number, niveis: NivelTabela[], icone: { passo: number; incremento: number }): Nivel {
  const t = Math.max(0, total);
  const qtd = niveis.length;
  let n = 1;
  niveis.forEach((l, i) => { if (t >= l.pontos) n = i + 1; });
  if (n < qtd) {
    return { nivel: n, titulo: niveis[n - 1].titulo, piso: niveis[n - 1].pontos, teto: niveis[n].pontos, tituloProximo: niveis[n].titulo };
  }
  const base = niveis[qtd - 1].titulo;
  let k = 1;
  let piso = niveis[qtd - 1].pontos;
  let passo = icone.passo;
  while (t >= piso + passo) { piso += passo; passo += icone.incremento; k += 1; }
  return {
    nivel: qtd + k - 1,
    titulo: k === 1 ? base : `${base} ${romano(k)}`,
    piso,
    teto: piso + passo,
    tituloProximo: `${base} ${romano(k + 1)}`,
  };
}
