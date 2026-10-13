import { useEffect, useState } from 'react';
import { Image, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Onde estava o ROSTO na foto do scan do onboarding (`app/(scan)/camera.tsx`).
//
// A câmera mostra o preview em "cover" na tela inteira e pede para ela encaixar o
// rosto num oval grande (`cameraOval` — FONTE ÚNICA, usada pela própria câmera). A foto
// salva é o quadro inteiro da câmera, então o rosto ocupa só uma parte dela. Este
// módulo refaz a conta do preview e devolve o oval em coordenadas NORMALIZADAS da foto
// (0–1), para as telas que mostram o rosto de perto (resultado do scan, rotina pronta)
// poderem enquadrá-lo.
// ⚠️ É aproximação: vale se ela estava centrada no oval e se a tela é a mesma da foto.

/** PROPORÇÃO do oval da câmera e da malha (altura ÷ largura = 316 ÷ 236). */
export const CAM_OVAL_W = 236;
export const CAM_OVAL_H = 316;

/**
 * Oval da câmera do onboarding em pontos da tela (molde: o scan do Lovi). Ocupa até
 * 86% da largura e o que couber na altura entre a fileira de cima (?, luz, X) e o
 * botão "Começar"/pílula de instrução embaixo, com folga para os tracinhos do anel.
 * `buttonCy` = centro do botão e da pílula.
 */
export function cameraOval(width: number, height: number, insetTop: number, insetBottom: number) {
  const ratio = CAM_OVAL_H / CAM_OVAL_W;
  const buttonCy = height - Math.max(insetBottom, 16) - 70;
  const top = insetTop + 80;
  const bottom = buttonCy - 95;
  const ring = 18;                                          // espaço dos tracinhos em volta
  const w = Math.min(width * 0.86, (bottom - top - 2 * ring) / ratio);
  const h = w * ratio;
  return { cx: width / 2, cy: (top + bottom) / 2, rx: w / 2, ry: h / 2, buttonCy };
}

export type FaceOval = { cx: number; cy: number; h: number }; // frações da largura/altura da foto

export function useImageSize(uri: string | null | undefined) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!uri) { setSize(null); return; }
    let alive = true;
    Image.getSize(uri, (w, h) => alive && setSize({ w, h }), () => alive && setSize(null));
    return () => { alive = false; };
  }, [uri]);
  return size;
}

/** Oval do rosto na foto, em frações (centro x/y e altura). */
export function useFaceOval(size: { w: number; h: number } | null): FaceOval | null {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!size) return null;
  const s = Math.max(width / size.w, height / size.h);       // escala do preview da câmera
  const oval = cameraOval(width, height, insets.top, insets.bottom);
  const cyPx = size.h / 2 + (oval.cy - height / 2) / s;
  return { cx: 0.5, cy: cyPx / size.h, h: (oval.ry * 2) / s / size.h };
}

/**
 * Posição/tamanho da foto para o oval ocupar `faceH` pt de altura com centro em
 * (`centerX`, `centerY`) dentro de um quadro. Vale para qualquer imagem com o MESMO
 * enquadramento da foto (ex.: o antes/depois da IA, gerado a partir dela).
 */
export function fitFace(
  size: { w: number; h: number }, oval: FaceOval, faceH: number, centerX: number, centerY: number,
) {
  const k = faceH / (oval.h * size.h);
  return {
    width: size.w * k,
    height: size.h * k,
    left: centerX - oval.cx * size.w * k,
    top: centerY - oval.cy * size.h * k,
  };
}

// ── Encaixe por pontos do rosto (`face_landmarks` da analyze-skin) ───────────────
export type Pt2 = { x: number; y: number };

/**
 * Transformação afim (2 × 3) que leva os pontos `src` aos `dst` com o menor erro
 * (mínimos quadrados ponderados). Resolve escala, rotação, cisalhamento e posição de
 * uma vez — é o que "encaixa" a máscara genérica nos traços de um rosto real.
 * Devolve `[a, b, c, d, e, f]` no formato do `matrix()` do SVG:
 * x' = a·x + c·y + e,  y' = b·x + d·y + f. `null` se os pontos forem degenerados.
 */
export function affineFit(src: Pt2[], dst: Pt2[], w: number[]): number[] | null {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const bx = [0, 0, 0];
  const by = [0, 0, 0];
  src.forEach((s, i) => {
    const v = [s.x, s.y, 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) A[r][c] += w[i] * v[r] * v[c];
      bx[r] += w[i] * v[r] * dst[i].x;
      by[r] += w[i] * v[r] * dst[i].y;
    }
  });
  const px = solve3(A, bx);
  const py = solve3(A, by);
  if (!px || !py) return null;
  return [px[0], py[0], px[1], py[1], px[2], py[2]];
}

function solve3(M: number[][], b: number[]): number[] | null {
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-9) return null;
  return [0, 1, 2].map((col) => det(M.map((row, r) => row.map((v, c) => (c === col ? b[r] : v)))) / D);
}
