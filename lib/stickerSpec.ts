// ── O que a usuária escolheu compartilhar ─────────────────────────────────────
// `StickerSpec` é a ÚNICA coisa que circula pela UI da bandeja de adesivos: ele diz
// QUAIS métricas entram, nunca os valores. Os números só se juntam ao spec na hora de
// desenhar (`resolveMetrics`). Por isso um spec é serializável, comparável (`specId`)
// e guardável no store sem arrastar dado do Supabase junto.
//
// ⚠️ O "card inteiro de métricas" NÃO é uma variante especial — é simplesmente
// `{ showScore: true|false, keys: [as 6] }`. `stickerShape()` já devolve 'card' a
// partir de 4 métricas. Não criar um campo `variant`: seriam dois caminhos para o
// mesmo desenho, e eles divergiriam.

import { MetricKey } from './metricColor';
import { METRIC_DEFS, METRIC_BY_KEY, Metricas } from './metricDefs';
import { cardLayout } from './stickerCardLayout';
import type { StickerMetric } from '../components/NiksSticker';

export type StickerShape = 'circle' | 'card';

export type StickerSpec = {
  showScore: boolean;
  /** Métricas escolhidas, sempre na ordem canônica de `METRIC_DEFS`. */
  keys: MetricKey[];
  /**
   * Forma escolhida à mão na aba "Montar o meu". `undefined` = automático pela
   * contagem (`stickerShape`). Só é respeitada quando viável (círculo até 4 métricas;
   * card com ≥1 métrica) — `normalizeSpec` derruba escolhas impossíveis.
   */
  shape?: StickerShape;
};

/** Máximo de métricas que o círculo comporta legivelmente. Acima disso, só card. */
export const CIRCLE_MAX = 4;

/**
 * Posição/tamanho do adesivo em coordenadas NORMALIZADAS (fração da colagem), para
 * que preview e export produzam o mesmo enquadramento em escalas diferentes.
 *
 * ⚠️ `nW` é só a LARGURA. A altura sai de `stickerAspect(spec)`. O nome antigo era
 * `nSize` e assumia adesivo quadrado — o card retangular quebrou essa suposição.
 */
export type StickerPose = { nx: number; ny: number; nW: number };

/** O adesivo padrão de sempre: o círculo só com o Niks score. */
export const SPEC_SCORE_ONLY: StickerSpec = { showScore: true, keys: [] };

/** Largura de desenho do círculo (o `NiksSticker` foi desenhado para 130pt). */
const CIRCLE_UNITS = 130;

/**
 * REGRA ÚNICA de forma.
 *  - Escolha explícita (`spec.shape`) vence, se for VIÁVEL: 'circle' só até
 *    `CIRCLE_MAX` métricas, 'card' só com ≥1 métrica.
 *  - Sem escolha (ou inviável) → automático: 0–3 métricas círculo, 4–6 card.
 * O card é a forma nicer para 4+, então continua sendo o default nessa faixa mesmo
 * agora que o círculo ACEITA até 4 (o usuário só chega em 4-círculo escolhendo).
 */
export function stickerShape(spec: StickerSpec): StickerShape {
  const n = spec.keys.length;
  if (spec.shape === 'circle' && n <= CIRCLE_MAX) return 'circle';
  if (spec.shape === 'card' && n >= 1) return 'card';
  return n <= 3 ? 'circle' : 'card';
}

/** Formas que o usuário pode ESCOLHER para este conjunto de métricas. */
export function feasibleShapes(spec: StickerSpec): StickerShape[] {
  const n = spec.keys.length;
  const out: StickerShape[] = [];
  if (n <= CIRCLE_MAX) out.push('circle');
  if (n >= 1) out.push('card');
  return out;
}

/** largura / altura. Círculo = 1. Card = baseW/baseH da geometria determinística. */
export function stickerAspect(spec: StickerSpec): number {
  if (stickerShape(spec) === 'circle') return 1;
  const { baseW, baseH } = cardLayout(spec);
  return baseW / baseH;
}

/** Largura canônica de DESENHO, em unidades do componente (não pontos de tela). */
export function stickerBaseUnits(spec: StickerSpec): number {
  if (stickerShape(spec) === 'circle') return CIRCLE_UNITS;
  return cardLayout(spec).baseW;
}

/**
 * Largura inicial sobre a colagem, como FRAÇÃO da largura dela.
 *
 * Fração (e não os 130pt absolutos de antes) porque um tamanho fixo em pontos fica
 * proporcionalmente MAIOR num iPhone SE do que num Pro Max — o adesivo deve ocupar a
 * mesma parte da foto em qualquer aparelho.
 */
export function stickerBaseFraction(spec: StickerSpec): number {
  if (stickerShape(spec) === 'circle') return 0.37;
  // Card: derivar a largura da PROPORÇÃO para a altura nunca estourar a colagem. Um
  // card estreito e alto (poucas métricas, 1 coluna) entra mais fino; um card largo e
  // baixo pode ocupar mais. Teto 0.72 (sobra foto), piso 0.42 (não fica minúsculo).
  const aspect = stickerAspect(spec); // baseW/baseH
  return Math.min(0.72, Math.max(0.42, aspect * 0.62));
}

/** Identidade estável de um spec — chave de lista, dedupe e dependência de efeito.
 *  Inclui a forma RESOLVIDA: dois specs com as mesmas métricas mas formas diferentes
 *  (círculo vs card) são adesivos distintos e devem ter ids distintos. */
export function specId(spec: StickerSpec): string {
  return `${spec.showScore ? 's1' : 's0'}:${spec.keys.join(',')}:${stickerShape(spec)}`;
}

export function specEq(a: StickerSpec, b: StickerSpec): boolean {
  return specId(a) === specId(b);
}

/** Ordena pela ordem canônica de `METRIC_DEFS` — a de clique não serve. */
export function sortKeys(keys: MetricKey[]): MetricKey[] {
  const order = new Map(METRIC_DEFS.map((m, i) => [m.key, i] as const));
  return [...new Set(keys)].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

/**
 * Poda chaves sem dado (scan legado/parcial) e garante que sobre algo para desenhar:
 * se não restar métrica alguma, força o score. Nunca fabricar zeros.
 */
export function normalizeSpec(spec: StickerSpec, avail: Set<MetricKey>): StickerSpec {
  const keys = sortKeys(spec.keys.filter((k) => avail.has(k)));
  const showScore = spec.showScore || keys.length === 0;
  // Derruba a forma escolhida se a poda a tornou inviável (ex.: escolheu card com 5
  // métricas, mas 3 ficaram sem dado → 2 métricas → card ainda ok; escolheu círculo
  // com 4, sobrou 1 → círculo ok). Mantém `shape` só quando `stickerShape` a respeita.
  let shape = spec.shape;
  if (shape && stickerShape({ showScore, keys, shape }) !== shape) shape = undefined;
  return { showScore, keys, shape };
}

/**
 * Junta o spec aos valores reais. `short: true` para o círculo (rótulos curtos, senão
 * reticenciam na corda estreita); `false` para o card, que usa o rótulo da home.
 */
export function resolveMetrics(
  spec: StickerSpec,
  metricas: Metricas,
  short: boolean,
): StickerMetric[] {
  const out: StickerMetric[] = [];
  for (const key of spec.keys) {
    const v = metricas?.[key];
    if (typeof v !== 'number') continue; // sem dado → a métrica simplesmente não entra
    const def = METRIC_BY_KEY[key];
    out.push({ key, label: short ? def.short : def.label, value: v, positive: def.positive });
  }
  return out;
}
