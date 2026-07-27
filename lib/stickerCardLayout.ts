// ── Geometria do adesivo em CARD ──────────────────────────────────────────────
// Compartilhado por `stickerAspect()` (lib/stickerSpec) e por `NiksStickerCard`.
// Existe separado por um motivo duro: a proporção do adesivo precisa ser conhecida
// ANTES de qualquer render, porque o `clampPose` de `share-preview` roda na UI thread
// e prende o adesivo pelas duas dimensões. Se a altura viesse do conteúdo, o clamp e
// a imagem exportada divergiriam do preview.
//
// ⚠️ REGRA: o componente é OBRIGADO a aplicar `height: baseH * u` explicitamente e a
// pôr o rótulo de 2 linhas ("Linhas de\nexpressão") numa caixa de altura FIXA — como
// a home já faz com `labelTop` 91 vs 101. Altura vinda do conteúdo quebra tudo isto.

import type { StickerSpec } from './stickerSpec';

// Unidades de DESENHO (não pontos de tela). `u()` no componente reescala a partir daqui.
export const COL_W = 84;   // largura de uma coluna de métrica
export const GUT = 14;     // goteira entre colunas
export const PAD_X = 16;
export const PAD_T = 14;
export const PAD_B = 12;

/** Número do score + "Niks score" + hairline separadora. Só quando `showScore`. */
export const SCORE_BLOCK = 72;
/** Altura de uma linha de métrica: rótulo (2 linhas) + valor + trilho + respiros. */
export const ROW_H = 68;
export const ROW_GAP = 12;
/** Rodapé da marca (logo tintada + "NIKS") — obrigatório, como no círculo. */
export const FOOTER_H = 22;

export type CardLayout = {
  cols: number;
  rows: number;
  baseW: number;
  baseH: number;
};

/**
 * Até 4 métricas cabem em 2 colunas (card mais compacto e mais legível sobre foto);
 * 5 ou 6 vão para 3 colunas, replicando a grade 3×2 do card da home.
 *
 * 6 métricas → 312×268 com score (aspect 1.16) · 312×196 sem score (1.59).
 */
export function cardLayout(spec: StickerSpec): CardLayout {
  const n = Math.max(1, spec.keys.length);
  // 1 métrica → 1 coluna (card estreito); 2–4 → 2 colunas; 5–6 → 3 colunas.
  // Agora que o card pode ter poucas métricas (formato escolhido à mão), o card de 1
  // não pode ficar com uma coluna vazia ao lado.
  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);

  const baseW = PAD_X * 2 + cols * COL_W + (cols - 1) * GUT;
  const baseH =
    PAD_T +
    (spec.showScore ? SCORE_BLOCK : 0) +
    rows * ROW_H +
    (rows - 1) * ROW_GAP +
    FOOTER_H +
    PAD_B;

  return { cols, rows, baseW, baseH };
}

/** Canto superior esquerdo da célula `i`, em unidades de desenho. */
export function cellOrigin(spec: StickerSpec, i: number): { left: number; top: number } {
  const { cols } = cardLayout(spec);
  const col = i % cols;
  const row = Math.floor(i / cols);
  return {
    left: PAD_X + col * (COL_W + GUT),
    top: PAD_T + (spec.showScore ? SCORE_BLOCK : 0) + row * (ROW_H + ROW_GAP),
  };
}
