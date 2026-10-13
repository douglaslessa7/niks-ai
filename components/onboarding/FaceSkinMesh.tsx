// Malha da câmera do onboarding (`app/(scan)/camera.tsx`) — molde do scan do Lovi
// (referência do produto): uma grade fina que CONTORNA o rosto real, da testa (logo
// acima das sobrancelhas) ao queixo e de bochecha a bochecha; uma linha de scan branca e
// fina, com brilho leve, varre o rosto curvando junto com a grade; por onde ela acabou
// de passar a malha fica bem branca, com pontinhos de brilho nos cruzamentos, e volta ao
// tom normal em ~meio segundo (`TRAIL_MS`). A linha vai e volta, e o rastro fica sempre
// ATRÁS dela (conferido nos prints do Lovi).
//
// A grade é construída DENTRO da forma do rosto (`lib/faceGrid.ts`): bordas = contorno
// do Vision, meio = linha do nariz. Quando a cabeça vira, o meio se desloca e as colunas
// do lado que some se apertam — aparece só o lado visível.
//
// ⚠️ Só a CÂMERA usa esta malha (decisão do produto). A tela de resultado do scan segue
// com a `FaceScanMesh` (malha com olhos/boca, sobre a foto).
//
// Desempenho: ~2 mil trechos por quadro, cada um com uma intensidade. Em vez de um
// elemento por trecho, os trechos são agrupados por intensidade (`LEVELS` degraus) —
// ~20 `<Path>` por quadro no total.
import { G, Path } from 'react-native-svg';
import { gridPoint, type FaceShape } from '../../lib/faceGrid';

const ROWS = 19;               // linhas horizontais (v = 0 testa … 1 queixo)
const COLS = 23;               // linhas verticais (u = -1 … +1)
const ROW_SAMPLES = 44;        // pontos ao longo de cada linha horizontal
const COL_SAMPLES = 40;        // pontos ao longo de cada coluna

const SWEEP_MS = 2600;         // ida da linha de scan (de cima a baixo); a volta leva o mesmo
const TRAIL_MS = 520;          // rastro: a malha volta ao tom normal nesse tempo

const BASE = 0.3;              // intensidade da malha em repouso
const PEAK = 0.95;             // intensidade logo atrás da linha de scan
const LEVELS = 12;             // degraus de intensidade (= nº máximo de <Path> da malha)

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const lin = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const ROW_V = lin(ROWS, 0, 1);
const COL_U = lin(COLS, -1, 1);
const ROW_U = lin(ROW_SAMPLES, -1, 1);
const COL_V = lin(COL_SAMPLES, 0, 1);

/** Esmaecimento da borda: some aos poucos no alto da testa e nas laterais. */
const edgeFade = (u: number, v: number) => (1 - 0.75 * smooth(0.7, 1, Math.abs(u))) * smooth(0, 0.14, v);

// Varredura da linha de scan, em vai-e-vem com ease in-out: `q` = 0 no topo, 1 embaixo.
const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const easeInv = (q: number) => (q < 0.5 ? Math.sqrt(q / 2) : 1 - Math.sqrt((1 - q) / 2));

/** Há quanto tempo (ms) a linha passou pela altura `q`. `Infinity` = nunca passou. */
function sinceScan(q: number, t: number) {
  const half = Math.floor(t / SWEEP_MS);
  const tau = (t % SWEEP_MS) / SWEEP_MS;
  const down = half % 2 === 0;                       // descendo nesta metade?
  const pos = down ? ease(tau) : 1 - ease(tau);
  const passedNow = down ? q <= pos : q >= pos;
  if (passedNow) return (tau - easeInv(down ? q : 1 - q)) * SWEEP_MS;
  if (half === 0) return Infinity;
  // Passou na metade anterior (no sentido contrário).
  return (tau + 1 - easeInv(down ? 1 - q : q)) * SWEEP_MS;
}

// Cruzamentos que podem brilhar no rastro: só ~40% deles, sempre os mesmos (como no Lovi).
const GLINT = ROW_V.map((_, i) => COL_U.map((__, j) => {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return s - Math.floor(s) < 0.4;
}));

/** Acumula trechos por degrau de intensidade, emendando os que continuam a mesma linha. */
function buckets(n: number) {
  const d: string[] = Array(n + 1).fill('');
  const tail: (string | null)[] = Array(n + 1).fill(null);
  return {
    d,
    /** Trecho de A (`from`) a B (`to`); `from`/`to` identificam os pontos para emendar. */
    add(level: number, ax: number, ay: number, bx: number, by: number, from: string, to: string) {
      if (level <= 0) return;
      const lv = Math.min(n, level);
      d[lv] += tail[lv] === from ? `L${bx.toFixed(1)} ${by.toFixed(1)}` : `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`;
      tail[lv] = to;
    },
  };
}

export function FaceSkinMesh({ shape, t, opacity = 1 }: { shape: FaceShape; t: number; opacity?: number }) {
  if (opacity <= 0) return null;
  const trailOf = (v: number) => {
    const age = sinceScan(v, t);
    return age === Infinity ? 0 : Math.exp(-age / TRAIL_MS);
  };
  const alphaOf = (u: number, v: number) => (BASE + (PEAK - BASE) * trailOf(v)) * edgeFade(u, v) * opacity;

  const mesh = buckets(LEVELS);
  const polyline = (pts: { u: number; v: number }[], id: string) => {
    let prev: { x: number; y: number; al: number } | null = null;
    pts.forEach((s, i) => {
      const cur = { ...gridPoint(shape, s.u, s.v), al: alphaOf(s.u, s.v) };
      if (prev) {
        const level = Math.round(((prev.al + cur.al) / 2) * LEVELS);
        mesh.add(level, prev.x, prev.y, cur.x, cur.y, `${id}:${i - 1}`, `${id}:${i}`);
      }
      prev = cur;
    });
  };
  ROW_V.forEach((v, i) => polyline(ROW_U.map((u) => ({ u, v })), `r${i}`));
  COL_U.forEach((u, j) => polyline(COL_V.map((v) => ({ u, v })), `c${j}`));

  // Pontinhos de brilho nos cruzamentos por onde a linha acabou de passar.
  const glints = ['', '', ''];
  ROW_V.forEach((v, i) => {
    const tr = trailOf(v);
    if (tr < 0.3) return;
    COL_U.forEach((u, j) => {
      if (!GLINT[i][j]) return;
      const al = tr * edgeFade(u, v) * opacity;
      if (al < 0.2) return;
      const level = Math.min(2, Math.floor(al * 3));
      const p = gridPoint(shape, u, v);
      const r = 1.1;
      glints[level] += `M${(p.x - r).toFixed(1)} ${p.y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    });
  });

  // Linha de scan: uma linha horizontal da grade que vai e volta (curva com o rosto).
  const cyc = (t % (2 * SWEEP_MS)) / SWEEP_MS;
  const scanV = ease(cyc < 1 ? cyc : 2 - cyc);
  const scan = buckets(5);
  let prev: { x: number; y: number; al: number } | null = null;
  lin(60, -1, 1).forEach((u, i) => {
    const cur = { ...gridPoint(shape, u, scanV), al: (1 - 0.8 * smooth(0.75, 1, Math.abs(u))) * opacity };
    if (prev) {
      const level = Math.round(((prev.al + cur.al) / 2) * 5);
      scan.add(level, prev.x, prev.y, cur.x, cur.y, `s:${i - 1}`, `s:${i}`);
    }
    prev = cur;
  });

  return (
    <G>
      {mesh.d.map((d, level) => d && (
        <Path
          key={`m${level}`} d={d} fill="none" stroke="#FFFFFF"
          strokeOpacity={level / LEVELS} strokeWidth={0.6 + 0.4 * (level / LEVELS)}
          strokeLinecap="round" strokeLinejoin="round"
        />
      ))}
      {glints.map((d, level) => d && (
        <Path key={`g${level}`} d={d} fill="#FFFFFF" fillOpacity={0.45 + 0.27 * level} />
      ))}
      {scan.d.map((d, level) => d && (
        <G key={`s${level}`}>
          <Path d={d} fill="none" stroke="#FFFFFF" strokeOpacity={0.18 * (level / 5)} strokeWidth={6} strokeLinecap="round" />
          <Path d={d} fill="none" stroke="#FFFFFF" strokeOpacity={0.95 * (level / 5)} strokeWidth={1.3} strokeLinecap="round" />
        </G>
      ))}
    </G>
  );
}
