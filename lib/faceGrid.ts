// Forma do rosto REAL para a malha da câmera do onboarding
// (`components/onboarding/FaceSkinMesh.tsx`, `app/(scan)/camera.tsx`).
//
// A malha não é mais um "rosto padrão" encaixado por 5 pontos: ela é CONSTRUÍDA dentro
// do rosto. A forma tem três linhas, todas de cima (testa, logo acima das sobrancelhas)
// até o queixo:
//   • `left` / `right`: as bordas do rosto na tela — a ponta da sobrancelha e depois o
//     CONTORNO do Vision (bochecha → mandíbula → queixo);
//   • `mid`: o meio do rosto — entre as sobrancelhas, a crista do nariz, a ponta do
//     nariz, a boca e o queixo. Quando a cabeça vira, o meio se desloca para o lado e as
//     colunas da malha se apertam do lado que some, como num rosto de verdade.
// Cada linha horizontal da malha liga left → mid → right na mesma altura relativa (`v`);
// cada coluna (`u`, -1 … +1) é uma fração do caminho do meio até a borda, com
// espaçamento de esfera (mais junto nas bordas).
//
// ⚠️ Sem o contorno (build sem o módulo novo), a borda vem de uma meia-elipse apoiada
// na caixa do rosto, nos olhos e no queixo — aproximada, mas do tamanho do rosto.
import type { FaceFrame } from '../modules/niks-face-tracker';

export type P = { x: number; y: number };
/** Forma do rosto, já reamostrada em pontos fixos (para suavizar quadro a quadro). */
export type FaceShape = { left: P[]; right: P[]; mid: P[] };

const N_SIDE = 24;
const N_MID = 16;
/** Faixa de testa acima das sobrancelhas, em distâncias entre os olhos. */
const FOREHEAD = 0.22;

const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Reamostra uma polilinha (de cima até o queixo) em `n` pontos igualmente espaçados na
 * ALTURA do rosto (`depth`), não no comprimento: assim a linha `v` da malha fica na mesma
 * altura na borda e no meio (pelo comprimento, a borda — que passa pela bochecha — ficaria
 * mais alta, e as linhas virariam um "V").
 */
function resampleByHeight(poly: P[], n: number, depth: (p: P) => number): P[] {
  if (poly.length === 1) return Array(n).fill(poly[0]);
  const d = poly.map(depth);
  for (let i = 1; i < d.length; i++) d[i] = Math.max(d[i], d[i - 1] + 1e-6);   // sempre descendo
  const d0 = d[0], span = d[d.length - 1] - d0 || 1;
  const out: P[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const h = d0 + (k / (n - 1)) * span;
    while (j < d.length - 1 && d[j] < h) j++;
    const seg = d[j] - d[j - 1] || 1;
    const f = Math.max(0, Math.min(1, (h - d[j - 1]) / seg));
    out.push({ x: poly[j - 1].x + (poly[j].x - poly[j - 1].x) * f, y: poly[j - 1].y + (poly[j].y - poly[j - 1].y) * f });
  }
  return out;
}

/** Ponto de uma polilinha reamostrada na fração `v` (0 = topo, 1 = queixo). */
export function along(poly: P[], v: number): P {
  const x = Math.max(0, Math.min(1, v)) * (poly.length - 1);
  const i = Math.min(poly.length - 2, Math.floor(x));
  const f = x - i;
  return { x: poly[i].x + (poly[i + 1].x - poly[i].x) * f, y: poly[i].y + (poly[i + 1].y - poly[i].y) * f };
}

/** Ponto da malha: `u` de -1 (borda esquerda) a +1 (direita), `v` de 0 (testa) a 1 (queixo). */
export function gridPoint(shape: FaceShape, u: number, v: number): P {
  const C = along(shape.mid, v);
  const E = along(u < 0 ? shape.left : shape.right, v);
  const s = Math.sin((Math.min(1, Math.abs(u)) * Math.PI) / 2);
  return { x: C.x + (E.x - C.x) * s, y: C.y + (E.y - C.y) * s };
}

/** Forma do rosto a partir de um quadro do Vision, em pontos de TELA (recorte "cover"). */
export function shapeFromFrame(f: FaceFrame | null, width: number, height: number): FaceShape | null {
  if (!f || !f.detected || !f.eyes || !f.chin) return null;
  const scale = Math.max(width / f.imgW, height / f.imgH);
  const offX = (width - f.imgW * scale) / 2;
  const offY = (height - f.imgH * scale) / 2;
  const M = (x: number, y: number): P => ({ x: offX + x * f.imgW * scale, y: offY + y * f.imgH * scale });
  const flat = (a?: number[]) => {
    const out: P[] = [];
    if (a) for (let i = 0; i + 1 < a.length; i += 2) out.push(M(a[i], a[i + 1]));
    return out;
  };

  const [e1, e2] = [M(f.eyes[0], f.eyes[1]), M(f.eyes[2], f.eyes[3])].sort((a, b) => a.x - b.x);
  const ed = Math.max(1, dist(e1, e2));
  const chin = M(f.chin[0], f.chin[1]);
  const eyeMid = { x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 };
  // "Para cima" do rosto (perpendicular aos olhos, apontando para longe do queixo):
  // acompanha a cabeça inclinada.
  let ux = -(e2.y - e1.y) / ed, uy = (e2.x - e1.x) / ed;
  if ((chin.x - eyeMid.x) * ux + (chin.y - eyeMid.y) * uy > 0) { ux = -ux; uy = -uy; }
  const lift = (p: P, k: number) => ({ x: p.x + ux * ed * k, y: p.y + uy * ed * k });

  // Sobrancelhas (ou, sem elas, olhos levantados): pontas de fora e o meio.
  const brows = [...flat(f.brow1), ...flat(f.brow2)];
  const browPts = brows.length >= 4 ? brows : [lift({ x: e1.x - ed * 0.35, y: e1.y }, 0.3), lift({ x: e2.x + ed * 0.35, y: e2.y }, 0.3), lift(eyeMid, 0.36)];
  const byX = [...browPts].sort((a, b) => a.x - b.x);
  const browL = lift(byX[0], FOREHEAD);
  const browR = lift(byX[byX.length - 1], FOREHEAD);
  const browC = lift({ x: eyeMid.x + ux * ed * 0.36, y: eyeMid.y + uy * ed * 0.36 }, FOREHEAD);

  // Contorno (ou meia-elipse apoiada na caixa do rosto).
  let contour = flat(f.contour);
  if (contour.length < 5) {
    const box = f.w != null && f.x != null ? { l: M(f.x, 0).x, r: M(f.x + f.w, 0).x } : { l: e1.x - ed * 0.6, r: e2.x + ed * 0.6 };
    const cx = (box.l + box.r) / 2, rx = (box.r - box.l) / 2;
    const top = eyeMid.y + ed * 0.1, ry = Math.max(1, chin.y - top);
    contour = Array.from({ length: 15 }, (_, i) => {
      const a = (i / 14) * Math.PI;
      return { x: cx - rx * Math.cos(a), y: top + ry * Math.sin(a) };
    });
  }
  // Divide no ponto mais baixo (queixo): cada ramo vai de cima até o queixo.
  let low = 0;
  contour.forEach((p, i) => { if (p.y > contour[low].y) low = i; });
  const a = contour.slice(0, low + 1);
  const b = contour.slice(low).reverse();
  if (a.length < 2 || b.length < 2) return null;
  const [leftBranch, rightBranch] = a[0].x <= b[0].x ? [a, b] : [b, a];

  // Meio: entre as sobrancelhas → crista do nariz → ponta → boca → queixo, de cima para baixo.
  const midPts = [browC, ...flat(f.noseCrest), ...(f.noseTip ? [M(f.noseTip[0], f.noseTip[1])] : []),
    ...(f.mouth ? [M(f.mouth[0], f.mouth[1])] : []), contour[low]];
  const depth = (p: P) => -((p.x - eyeMid.x) * ux + (p.y - eyeMid.y) * uy);   // "para baixo" ao longo do rosto
  midPts.sort((p, q) => depth(p) - depth(q));

  return {
    left: resampleByHeight([browL, ...leftBranch], N_SIDE, depth),
    right: resampleByHeight([browR, ...rightBranch], N_SIDE, depth),
    mid: resampleByHeight(midPts, N_MID, depth),
  };
}

/** Plano B (sem detecção): rosto genérico dentro do oval. */
export function shapeFromOval(cx: number, cy: number, rx: number, ry: number): FaceShape {
  const top = cy - ry * 0.32;
  const jawTop = cy - ry * 0.12;
  const chin = { x: cx, y: cy + ry * 0.78 };
  const side = (sgn: number) => [
    { x: cx + sgn * rx * 0.74, y: top },
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (i / 11) * (Math.PI / 2);
      return { x: cx + sgn * rx * 0.76 * Math.cos(a), y: jawTop + (chin.y - jawTop) * Math.sin(a) };
    }),
  ];
  const depth = (p: P) => p.y;
  return {
    left: resampleByHeight(side(-1), N_SIDE, depth),
    right: resampleByHeight(side(1), N_SIDE, depth),
    mid: resampleByHeight([{ x: cx, y: top }, chin], N_MID, depth),
  };
}

/** Suaviza uma forma em direção a outra (`k` de 0 a 1, por quadro). */
export function easeShape(cur: FaceShape | null, target: FaceShape, k: number): FaceShape {
  if (!cur) return target;
  const mix = (a: P[], b: P[]) => a.map((p, i) => ({ x: p.x + (b[i].x - p.x) * k, y: p.y + (b[i].y - p.y) * k }));
  return { left: mix(cur.left, target.left), right: mix(cur.right, target.right), mid: mix(cur.mid, target.mid) };
}
