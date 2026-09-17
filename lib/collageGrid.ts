// ── Grades da colagem do compartilhável ───────────────────────────────────────
// FONTE ÚNICA do layout da colagem, na referência da tela "Layout" do Instagram:
// a usuária escolhe a grade ANTES de tirar as fotos, e a mesma grade tem de ser
// desenhada na colagem final. Antes disto o layout era DEDUZIDO da quantidade de
// fotos (1 → inteira, 2 → empilhadas, 3 → uma em cima + duas, 4 → 2×2), o que
// tornava impossível pedir "duas lado a lado" ou "três empilhadas".
//
// ⚠️ Quem consome: `app/(share)/share-capture.tsx` (grade ao vivo sobre a câmera) e
// `app/(share)/share-preview.tsx` (o `<Collage>` do preview E da imagem exportada).
// Mexer aqui muda as três coisas ao mesmo tempo — que é exatamente o objetivo.

export type CollageGridId =
  | 'grid4'        // 2×2
  | 'rows2'        // duas faixas empilhadas
  | 'rows3'        // três faixas empilhadas
  | 'top1bottom2'  // uma larga em cima + duas embaixo
  | 'full'         // foto única, colagem inteira
  | 'cols2';       // duas colunas lado a lado

export type CollageGrid = {
  id: CollageGridId;
  /** Cada sub-array é uma LINHA; os números são os índices das células, em ordem. */
  rows: number[][];
  /** Quantidade de células. Derivado de `rows` — não redigitar. */
  cells: number;
  /** Rótulo de acessibilidade (VoiceOver) do botão da grade. */
  label: string;
};

function make(id: CollageGridId, rows: number[][], label: string): CollageGrid {
  return { id, rows, cells: rows.reduce((n, r) => n + r.length, 0), label };
}

// ⚠️ A ORDEM é a da bandeja de escolha (2 colunas × 3 linhas, igual ao Instagram).
// As quatro primeiras ficam nas MESMAS posições da bandeja do Instagram; no lugar
// da grade de 6 células (que a colagem final não desenha) entrou a foto única, que
// o usuário pediu explicitamente ("se ela quer uma foto só").
export const COLLAGE_GRIDS: CollageGrid[] = [
  make('grid4',       [[0, 1], [2, 3]], 'Quatro fotos em grade'),
  make('rows2',       [[0], [1]],       'Duas fotos empilhadas'),
  make('rows3',       [[0], [1], [2]],  'Três fotos empilhadas'),
  make('top1bottom2', [[0], [1, 2]],    'Uma foto em cima e duas embaixo'),
  make('full',        [[0]],            'Uma foto só'),
  make('cols2',       [[0, 1]],         'Duas fotos lado a lado'),
];

export const DEFAULT_GRID_ID: CollageGridId = 'grid4';

export function getGrid(id: CollageGridId | null | undefined): CollageGrid {
  return COLLAGE_GRIDS.find((g) => g.id === id) ?? COLLAGE_GRIDS[0];
}

/**
 * Grade histórica para uma quantidade de fotos — o layout que a colagem usava
 * ANTES de a grade ser escolhível. Serve de rede de segurança no preview: se o
 * store trouxer uma grade que não bate com a quantidade de fotos (hand-off velho,
 * app reaberto no meio do fluxo), a colagem cai neste mapa em vez de desenhar
 * células vazias.
 */
export function gridForCount(n: number): CollageGrid {
  if (n <= 1) return getGrid('full');
  if (n === 2) return getGrid('rows2');
  if (n === 3) return getGrid('top1bottom2');
  return getGrid('grid4');
}

/**
 * Goteira entre as células, como FRAÇÃO da largura da colagem.
 *
 * ⚠️ **HOJE É ZERO — as fotos se TOCAM, e isso é intencional.** A colagem do Instagram
 * usada como referência não tem goteira nenhuma: a "divisão" entre as fotos é só a
 * troca de imagem. Qualquer valor > 0 vira uma **linha branca** no arquivo exportado, e
 * foi exatamente disso que o usuário reclamou — três vezes, inclusive já com a goteira
 * afinada ("não quero que tenha essa linha branca no meio").
 *
 * ⚠️ A tela de captura NÃO depende deste número para desenhar a grade: lá as linhas são
 * traçadas POR CIMA das células (`GRID_LINE_W`), então a grade continua visível na hora
 * de tirar a foto sem custar goteira no resultado final. Não "consertar" isto pondo um
 * valor aqui só para ver a grade na captura.
 *
 * É fração, e não pontos, porque a captura (largura da tela), o preview (~293pt) e a
 * imagem exportada (360pt) desenham a MESMA grade em três escalas. Se um dia a goteira
 * voltar, é este o único número a mexer: `0.003` ≈ 3px numa colagem de 1080px.
 */
export const COLLAGE_GAP_FRACTION = 0;

export type CellRect = { left: number; top: number; width: number; height: number };

/**
 * Retângulo de cada célula, indexado pelo índice da célula.
 *
 * ⚠️ Estes números são EXATAMENTE os que o flex calcula no `<Collage>` (linhas
 * `flex: 1` sobre o espaço que sobra depois das goteiras). É essa igualdade que
 * permite à `share-capture` sobrepor fotos e divisórias a uma CameraView de
 * quadro inteiro e ainda assim mostrar a mesma grade que será exportada.
 */
export function cellRects(grid: CollageGrid, W: number, H: number, gap: number): CellRect[] {
  const out: CellRect[] = [];
  const rowH = (H - gap * (grid.rows.length - 1)) / grid.rows.length;
  grid.rows.forEach((row, r) => {
    const top = r * (rowH + gap);
    const colW = (W - gap * (row.length - 1)) / row.length;
    row.forEach((idx, c) => {
      out[idx] = { left: c * (colW + gap), top, width: colW, height: rowH };
    });
  });
  return out;
}
