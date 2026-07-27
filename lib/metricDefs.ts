// ── As 6 métricas de pele: definição canônica ─────────────────────────────────
// Extraído de `app/(app)/home.tsx` (onde vivia sozinho) para ser a FONTE ÚNICA das
// chaves, rótulos e polaridade das métricas — a home, o adesivo do Story e a bandeja
// de adesivos precisam concordar sobre o que é "Atratividade" e se ela é positiva.
// Não duplicar esta lista em tela nenhuma.
//
// Irmão de `lib/metricColor.ts`, que é a fonte única da COR de uma métrica.

import { MetricKey } from './metricColor';

export type MetricDef = {
  key: MetricKey;
  /** Rótulo do design (node 1:63). Contém '\n' onde o card quebra em 2 linhas. */
  label: string;
  /**
   * Rótulo CURTO, para o adesivo circular. O círculo tem ~104pt de corda útil e
   * reticencia rótulos longos ("Linhas de expressão" virava "Linhas de exp…").
   */
  short: string;
  /** `false` = quanto MENOR o valor, melhor (oleosidade, acne, linhas). */
  positive: boolean;
};

/** Ordem canônica — a mesma da grade 3×2 da home. Não reordenar. */
export const METRIC_DEFS: MetricDef[] = [
  { key: 'qualidade_pele',   label: 'Qualidade da pele',    short: 'Qualidade',   positive: true  },
  { key: 'atratividade',     label: 'Atratividade',         short: 'Atratividade', positive: true  },
  { key: 'juventude',        label: 'Juventude',            short: 'Juventude',   positive: true  },
  { key: 'oleosidade',       label: 'Oleosidade',           short: 'Oleosidade',  positive: false },
  { key: 'acne',             label: 'Acne',                 short: 'Acne',        positive: false },
  { key: 'linhas_expressao', label: 'Linhas de\nexpressão', short: 'Linhas',      positive: false },
];

export const METRIC_BY_KEY: Record<MetricKey, MetricDef> = METRIC_DEFS.reduce(
  (acc, m) => { acc[m.key] = m; return acc; },
  {} as Record<MetricKey, MetricDef>,
);

/**
 * `full_result.metricas` como o app consome. Pode ser `null` inteiro (scan LEGADO,
 * anterior ao deploy das 6 métricas) ou ter chaves com valor `null`.
 */
export type Metricas = Partial<Record<MetricKey, number | null>> | null;

/** Chaves que têm número de verdade. Base para desabilitar chips e podar presets. */
export function availableKeys(m: Metricas): Set<MetricKey> {
  const set = new Set<MetricKey>();
  if (!m) return set;
  for (const def of METRIC_DEFS) {
    if (typeof m[def.key] === 'number') set.add(def.key);
  }
  return set;
}

/**
 * Fonte única do "scan legado": tem score, mas o `full_result` é anterior às 6
 * métricas. A própria ausência do dado é a flag — não há coluna nem migration.
 */
export function hasMetrics(m: Metricas): boolean {
  return availableKeys(m).size > 0;
}
