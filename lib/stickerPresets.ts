// ── Vitrine de adesivos prontos ───────────────────────────────────────────────
// 6 métricas + Niks score dão 128 combinações — uma grade com 128 itens seria
// inutilizável. A bandeja resolve isto em duas camadas: estes 14 presets curados na
// aba "Sugestões", e a aba "Montar o meu" (chips liga/desliga), que alcança as 128.
//
// Ordem = ordem de exibição. Vai do mais simples (só o score, o adesivo de sempre)
// ao mais denso (o card inteiro de métricas), com os dois pedidos explicitamente
// pelo usuário no fim: card completo COM score e card completo SEM score.

import { StickerSpec, StickerShape, normalizeSpec, specId, sortKeys } from './stickerSpec';
import { MetricKey } from './metricColor';
import { Metricas, availableKeys, METRIC_BY_KEY } from './metricDefs';

export type StickerPreset = {
  id: string;
  /** Nome curto sob a miniatura, na grade. */
  label: string;
  spec: StickerSpec;
};

const TODAS: MetricKey[] = [
  'qualidade_pele', 'atratividade', 'juventude', 'oleosidade', 'acne', 'linhas_expressao',
];
const POSITIVAS: MetricKey[] = ['qualidade_pele', 'atratividade', 'juventude'];
const NEGATIVAS: MetricKey[] = ['oleosidade', 'acne', 'linhas_expressao'];

const mk = (
  id: string, label: string, showScore: boolean, keys: MetricKey[], shape?: StickerShape,
): StickerPreset => ({
  id, label, spec: { showScore, keys: sortKeys(keys), shape },
});

export const STICKER_PRESETS: StickerPreset[] = [
  // ── Círculo: o score e UMA métrica isolada cada (número gigante, estilo do score) ─
  mk('score',            'Niks score',            true,  []),
  mk('m-qual',           'Qualidade da pele',     false, ['qualidade_pele']),
  mk('m-atrat',          'Atratividade',          false, ['atratividade']),
  mk('m-juv',            'Juventude',             false, ['juventude']),
  mk('m-oleo',           'Oleosidade',            false, ['oleosidade']),
  mk('m-acne',           'Acne',                  false, ['acne']),
  mk('m-linhas',         'Linhas de expressão',   false, ['linhas_expressao']),
  // ── Círculo: score + métricas ──────────────────────────────────────────────
  mk('score-qual',       'Score + Qualidade',     true,  ['qualidade_pele']),
  mk('score-atrat',      'Score + Atratividade',  true,  ['atratividade']),
  mk('score-juv',        'Score + Juventude',     true,  ['juventude']),
  mk('score-positivas',  'Score + destaques',     true,  POSITIVAS),
  mk('score-negativas',  'Score + a cuidar',      true,  NEGATIVAS),
  // ── Card ───────────────────────────────────────────────────────────────────
  mk('card4',            'Score + 4 métricas',    true,  TODAS.slice(0, 4), 'card'),
  mk('card-full-score',  'Card completo',         true,  TODAS,             'card'),
  mk('card-full',        'Card sem o score',      false, TODAS,             'card'),
];

/**
 * Presets utilizáveis com os dados que a usuária realmente tem. Poda as chaves sem
 * número e remove os que, depois da poda, viraram duplicata de um anterior — num scan
 * legado (sem `metricas`) todos colapsam para "só o score", e a grade mostraria 14
 * cópias do mesmo adesivo.
 */
export function usablePresets(metricas: Metricas): StickerPreset[] {
  const avail = availableKeys(metricas);
  const seen = new Set<string>();
  const out: StickerPreset[] = [];
  for (const p of STICKER_PRESETS) {
    const spec = normalizeSpec(p.spec, avail);
    const id = specId(spec);
    if (seen.has(id)) continue;
    seen.add(id);
    // ⚠️ Se a poda mudou o spec, o rótulo curado MENTE — num scan com só 3 das 6
    // métricas o preset "Card completo" vira um círculo de 3 e continuaria com aquele
    // nome. Nesse caso descreve-se o que o adesivo REALMENTE mostra.
    const label = specId(spec) === specId(p.spec) ? p.label : describeSpec(spec);
    out.push({ ...p, label, spec });
  }
  return out;
}

/** Rótulo honesto derivado do próprio spec, para quando a poda altera um preset. */
function describeSpec(spec: StickerSpec): string {
  const n = spec.keys.length;
  if (n === 0) return 'Niks score';
  if (n === 1) {
    const only = METRIC_BY_KEY[spec.keys[0]].label.replace('\n', ' ');
    return spec.showScore ? `Score + ${only}` : only;
  }
  const plural = `${n} métricas`;
  return spec.showScore ? `Score + ${plural}` : plural;
}
