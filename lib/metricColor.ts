// ── Semáforo das métricas de pele ─────────────────────────────────────────────
// Fonte ÚNICA da cor de uma métrica no app. Extraído de `home.tsx` (card de
// métricas, node 1:63) para ser reusado pelo adesivo (`components/NiksSticker`) —
// a mesma métrica precisa ter a MESMA cor na home e no Story. Não duplicar.
//
// A cor é "bom/ruim PRA PESSOA", não o valor cru.
//
// ⚠️ AS DUAS RÉGUAS NÃO SÃO ESPELHO UMA DA OUTRA — não "simplifique" isto de volta
// para um `good = 100 - value` com uma régua só (era o que fazia antes, e estava
// errado). As faixas negativas são MAIS EXIGENTES: verde só abaixo de 20, enquanto
// no positivo verde começa em 71. Contraexemplo concreto: Acne 60 → invertido daria
// good=40 → vermelho na régua positiva, mas a régua negativa manda LARANJA.

import { getScoreTheme } from './scoreTheme';

/** As 6 chaves de `full_result.metricas` da Edge Function `analyze-skin`. */
export type MetricKey =
  | 'qualidade_pele'
  | 'atratividade'
  | 'juventude'
  | 'oleosidade'
  | 'acne'
  | 'linhas_expressao';

const VERDE = '#5EFF7E';
const AMARELO = '#FFCC00';
const LARANJA = '#FF8A00';
const VERMELHO = '#FF0000';

/**
 * `positive: false` = quanto MENOR o valor, melhor (oleosidade, acne, linhas).
 *
 * Réguas (definidas pelo usuário, em valor CRU — sem inversão):
 *   positivas  (qualidade, atratividade, juventude):
 *     0–40 vermelho | 41–59 laranja | 60–74 amarelo | 75–100 verde
 *   negativas  (oleosidade, acne, linhas_expressao):
 *     70–100 vermelho | 50–69 laranja | 20–49 amarelo | 0–19 verde
 */
export function metricColor(value: number, positive: boolean): string {
  if (positive) {
    if (value >= 75) return VERDE;
    if (value >= 60) return AMARELO;
    if (value >= 41) return LARANJA;
    return VERMELHO;
  }
  if (value <= 19) return VERDE;
  if (value <= 49) return AMARELO;
  if (value <= 69) return LARANJA;
  return VERMELHO;
}

// ── Cor de uma métrica pela FAIXA DO SCORE (só nos adesivos em círculo) ─────────
// Decisão do usuário: no adesivo, o número de uma métrica NÃO usa o semáforo
// (verde/amarelo/vermelho da barra do card) — usa a MESMA lógica de cor do Niks
// score (rosa 76–100 · amarelo 51–75 · laranja 26–50 · vermelho 0–25), aplicada à
// PRÓPRIA nota da métrica. Ex.: Atratividade 77 → rosa, igual ao score.
//
// ⚠️ Métricas NEGATIVAS (oleosidade/acne/linhas — menor é melhor) são INVERTIDAS
// (`100 − value`) para manter "rosa = bom": Oleosidade 15 (ótimo) sai rosa, não
// vermelho. É o mesmo espírito do `metricColor`, mas na régua de cor do score.
//
// Vive aqui (a fonte única de cor de métrica) mas usa `getScoreTheme` de scoreTheme.
export function metricScoreColor(value: number, positive: boolean): string {
  const v = positive ? value : 100 - value;
  return getScoreTheme(v).score;
}
