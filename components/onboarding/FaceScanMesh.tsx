// Malha 3D + linha de scan desenhadas DENTRO do oval da câmera do onboarding
// (`app/(scan)/camera.tsx`) — referência dada pelo produto: o scan facial de apps de
// skincare em que uma malha branca cobre o rosto, uma linha clara varre a pele e
// faíscas acendem por onde ela passa.
//
// ⚠️ NÃO é rastreamento facial: a câmera do app não detecta o rosto (seria ARKit/uma
// lib nativa). A malha é um "rosto" genérico — um elipsoide com latitudes,
// longitudes, anéis dos olhos e da boca — projetado no oval em que ela encaixa o
// rosto, e girado (`yaw`) para o lado da etapa da vez. Casa com quem está centrada no
// oval; não acompanha um rosto fora dele.
//
// Componente PURO (desenha a partir de `t` e `yaw`); quem anima é a tela: a câmera, no
// mesmo relógio dos traços do anel, e o resultado do scan (tela 8), que mostra a malha
// parada sobre a foto com uma passada da linha de scan na abertura. Devolve elementos SVG para ir dentro do `<Svg>` da tela.
import { useRef } from 'react';
import { ClipPath, Defs, Ellipse, G, Path, Circle } from 'react-native-svg';

const DEG = Math.PI / 180;
const SWEEP_MS = 2600;            // ida da linha de scan (de cima a baixo); a volta leva o mesmo
const SPARK_MS = 750;             // faísca acesa depois que a linha passa

type Pt = { x: number; y: number; z: number };

/**
 * Ponto do "rosto" (latitude φ, longitude θ, em graus): elipsoide com o queixo
 * afinando, girado por `yaw` (lado) e inclinado por `PITCH` (a câmera um pouco abaixo
 * do rosto — é o que faz as linhas horizontais curvarem como na referência), com
 * uma perspectiva leve.
 */
const PITCH = -0.2;
function project(phi: number, theta: number, a: number, b: number, yaw: number): Pt {
  const p = phi * DEG, t = theta * DEG;
  const chin = phi < 0 ? 1 - 0.32 * Math.pow(-phi / 90, 1.4) : 1 - 0.08 * Math.pow(phi / 90, 2);
  const x0 = a * chin * Math.cos(p) * Math.sin(t);
  const y0 = -b * Math.sin(p);
  const z0 = a * chin * Math.cos(p) * Math.cos(t);
  // yaw (em volta do eixo vertical)
  const x1 = x0 * Math.cos(yaw) + z0 * Math.sin(yaw);
  const z1 = -x0 * Math.sin(yaw) + z0 * Math.cos(yaw);
  // pitch (em volta do eixo horizontal)
  const y2 = y0 * Math.cos(PITCH) - z1 * Math.sin(PITCH);
  const z2 = y0 * Math.sin(PITCH) + z1 * Math.cos(PITCH);
  const k = 1 + (z2 / a) * 0.12;                      // perspectiva leve
  return { x: x1 * k, y: (y2 + a * Math.sin(PITCH) * 0.9) * k, z: z2 };
}

/** Polilinha só com a parte VISÍVEL (de frente para a câmera), quebrada nas bordas. */
function visiblePath(pts: Pt[], cx: number, cy: number, a: number) {
  let d = '';
  let pen = false;
  let zSum = 0, n = 0;
  for (const p of pts) {
    if (p.z > a * 0.05) {
      d += `${pen ? 'L' : 'M'}${(cx + p.x).toFixed(1)} ${(cy + p.y).toFixed(1)}`;
      pen = true; zSum += p.z; n++;
    } else pen = false;
  }
  return { d, depth: n ? zSum / n / a : 0 };
}

// Onde ficam os traços da máscara (latitude, longitude) — usado para ENCAIXAR a malha
// nos pontos do rosto devolvidos pela IA (`face_landmarks`, tela de resultado). Mesmos
// lugares dos anéis/ponte desenhados abaixo.
export const MESH_FEATURES = {
  eye_left: { phi: -2, theta: -24 },
  eye_right: { phi: -2, theta: 24 },
  nose_tip: { phi: -28, theta: 0 },
  mouth_center: { phi: -46, theta: 0 },
  chin: { phi: -76, theta: 0 },
  forehead: { phi: 34, theta: 0 },
} as const;

/** Posição na tela de um ponto da máscara — a MESMA conta que o componente desenha. */
export function faceMeshPoint(cx: number, cy: number, rx: number, ry: number, yaw: number, phi: number, theta: number) {
  const a = rx * 0.95;
  const p = project(phi, theta, a, ry * 0.97, yaw);
  return { x: cx + p.x, y: cy + ry * 0.07 + p.y };
}

// Limites da máscara: do meio da testa (latitude) e até as bochechas (longitude).
const MASK_TOP = 40;
const MASK_SIDE = 84;

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-6; v += step) out.push(v);
  return out;
};

// Faíscas: posições fixas no rosto (latitude/longitude), espalhadas pela pele.
const SPARKS = Array.from({ length: 22 }, (_, i) => {
  const r = (k: number) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  return { phi: -45 + r(1) * 85, theta: -55 + r(2) * 110, size: 1.3 + r(3) * 1.4 };
});

export function FaceScanMesh({
  cx, cy, rx, ry, t, yaw, opacity = 1, scanLine = true, sparks = true, meshStrength = 1,
}: {
  cx: number; cy: number; rx: number; ry: number; t: number; yaw: number; opacity?: number;
  /** Linha de scan varrendo o rosto (a câmera usa sempre; o resultado só na abertura). */
  scanLine?: boolean;
  /** Faíscas por onde a linha passa. */
  sparks?: boolean;
  /** Multiplica a opacidade das linhas da malha (o resultado, sobre a foto, usa mais forte). */
  meshStrength?: number;
}) {
  const sparkHits = useRef<number[]>(SPARKS.map(() => -1e9));
  const a = rx * 0.95;                 // meia-largura do "rosto"
  const b = ry * 0.97;                 // meia-altura
  const ccy = cy + ry * 0.07;          // o rosto fica um pouco abaixo do centro do oval
  const P = (phi: number, theta: number) => project(phi, theta, a, b, yaw);

  // MÁSCARA, não globo (referência do produto): a malha cobre só o rosto — do meio da
  // testa (φ = MASK_TOP) ao queixo, de bochecha a bochecha (|θ| ≤ MASK_SIDE) —, com
  // malha fina e os traços em volta dos olhos e da boca em anéis com raios.
  // `k` = peso da opacidade: as linhas da borda da máscara (topo da testa, laterais)
  // somem aos poucos, sem o corte reto de "boné".
  const lines: { d: string; depth: number; w: number; k?: number }[] = [];
  const W_LINE = 0.75;
  const edgeTop = (ph: number) => (ph > MASK_TOP - 14 ? Math.max(0.15, (MASK_TOP - ph) / 14) : 1);
  for (const th of range(-MASK_SIDE, MASK_SIDE, 8)) {
    const side = Math.abs(th) > MASK_SIDE - 16 ? Math.max(0.2, (MASK_SIDE - Math.abs(th)) / 16) : 1;
    // Verticais em dois trechos: o de cima (perto da testa) mais apagado.
    lines.push({ ...visiblePath(range(-84, MASK_TOP - 14, 3).map((ph) => P(ph, th)), cx, ccy, a), w: W_LINE, k: side });
    lines.push({ ...visiblePath(range(MASK_TOP - 14, MASK_TOP, 3).map((ph) => P(ph, th)), cx, ccy, a), w: W_LINE, k: side * 0.45 });
  }
  for (const ph of range(-80, MASK_TOP, 7)) {
    lines.push({ ...visiblePath(range(-MASK_SIDE, MASK_SIDE, 3).map((th) => P(ph, th)), cx, ccy, a), w: W_LINE, k: edgeTop(ph) });
  }
  const ring = (ph0: number, th0: number, r: number, sx: number, sy: number) =>
    visiblePath(range(0, 360, 12).map((ang) => P(ph0 + Math.sin(ang * DEG) * r * sy, th0 + Math.cos(ang * DEG) * r * sx)), cx, ccy, a);
  const spokes = (ph0: number, th0: number, r0: number, r1: number, sx: number, sy: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * 360 * DEG;
      lines.push({
        ...visiblePath([r0, (r0 + r1) / 2, r1].map((r) => P(ph0 + Math.sin(ang) * r * sy, th0 + Math.cos(ang) * r * sx)), cx, ccy, a),
        w: W_LINE,
      });
    }
  };
  // Olhos: anéis concêntricos + raios.
  for (const th0 of [-24, 24]) {
    for (const r of [3, 6, 9, 12]) lines.push({ ...ring(-2, th0, r, 1.45, 0.62), w: W_LINE });
    spokes(-2, th0, 3, 13, 1.45, 0.62, 14);
  }
  // Boca: anéis achatados + raios.
  for (const r of [4, 8]) lines.push({ ...ring(-46, 0, r, 2.4, 0.5), w: W_LINE });
  spokes(-46, 0, 4, 11, 2.4, 0.5, 10);
  // Nariz: ponte e asas.
  for (const th of [-7, 7]) lines.push({ ...visiblePath(range(-30, -4, 2).map((ph) => P(ph, th)), cx, ccy, a), w: 1 });
  for (const th0 of [-9, 9]) lines.push({ ...ring(-27, th0, 3.5, 1.2, 0.8), w: W_LINE });

  // Linha de scan: latitude que vai de +62° a −62° e volta (ease in-out).
  const cyc = (t % (2 * SWEEP_MS)) / SWEEP_MS;
  const u = cyc < 1 ? cyc : 2 - cyc;
  const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const scanPhi = MASK_TOP - e * (MASK_TOP + 80);
  const scan = visiblePath(range(-MASK_SIDE, MASK_SIDE, 3).map((th) => P(scanPhi, th)), cx, ccy, a);

  SPARKS.forEach((s, i) => { if (Math.abs(s.phi - scanPhi) < 3.5) sparkHits.current[i] = t; });

  return (
    <G opacity={opacity}>
      <Defs>
        <ClipPath id="faceScanOval">
          <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#faceScanOval)">
        {lines.map((l, i) => (
          <Path
            key={i} d={l.d} fill="none" stroke="#FFFFFF" strokeWidth={l.w}
            strokeOpacity={Math.min(1, (0.12 + 0.5 * Math.max(0, l.depth)) * meshStrength * (l.k ?? 1))} strokeLinecap="round" strokeLinejoin="round"
          />
        ))}
        {/* Brilho rosa embaixo + traço branco por cima = a linha de scan */}
        {scanLine && <Path d={scan.d} fill="none" stroke="#FF5EA8" strokeOpacity={0.45} strokeWidth={9} strokeLinecap="round" />}
        {scanLine && <Path d={scan.d} fill="none" stroke="#FFFFFF" strokeWidth={2.8} strokeLinecap="round" />}
        {sparks && SPARKS.map((s, i) => {
          const k = 1 - (t - sparkHits.current[i]) / SPARK_MS;
          if (k <= 0) return null;
          const p = P(s.phi, s.theta);
          if (p.z <= a * 0.1) return null;
          return (
            <G key={i} opacity={k}>
              <Circle cx={cx + p.x} cy={ccy + p.y} r={s.size * 2.6} fill="#FF5EA8" fillOpacity={0.35} />
              <Circle cx={cx + p.x} cy={ccy + p.y} r={s.size} fill="#FFFFFF" />
            </G>
          );
        })}
      </G>
    </G>
  );
}
