// ─────────────────────────────────────────────────────────────────────────────
// "Sua caminhada" — números do design 68a–68f (Claude Design, projeto "NIKS home
// redesign", NiksCaminhada.dc.html). Frame de 393 × 852 com barra de status de 54.
// A trilha tem 2.846 pt; cada nível ocupa uma faixa de 250 pt, o 1 embaixo e o
// Ícone (11) no topo. Funções marcadas com 'worklet' rodam também no UI thread.
// ─────────────────────────────────────────────────────────────────────────────

export const PINK = '#FF5EA8';
export const INK = '#121212';
export const MUTE = '#818181';

export const PAD_TOP = 56;
export const ROW = 250;
export const CONTENT_H = 2846;
export const NIVEIS_TRILHA = 11;          // o design desenha do 1 ao Ícone

export const CARD_LEFT = 160;
export const CARD_W = 132;
export const CARD_H = 184;

// Fundos das cartas (design): aberta, Ícone e o véu das trancadas.
export const CARD_BG = 'linear-gradient(150deg, #FFE1EE 0%, #FBCDE5 38%, #EBD6FB 66%, #FFD9EA 100%)';
export const ICON_BG = 'linear-gradient(150deg, #FFEBD9 0%, #FFD3E2 36%, #F7DDB8 64%, #FFE0EC 100%)';
export const MUTED_BG = 'linear-gradient(160deg, #FBF6F8 0%, #F2EBEF 100%)';
export const HOLO = 'linear-gradient(115deg, rgba(255,255,255,0) 18%, rgba(255,170,215,0.9) 30%, rgba(205,180,255,0.9) 40%, rgba(255,255,255,1) 50%, rgba(255,190,225,0.9) 60%, rgba(190,175,255,0.85) 70%, rgba(255,255,255,0) 82%)';
export const SHEEN = 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.85), rgba(255,255,255,0))';
export const GLARE = 'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.75), rgba(255,255,255,0) 55%)';
export const ICON_GLOW = 'radial-gradient(closest-side, rgba(255,196,150,0.45), rgba(255,150,200,0.25) 60%, rgba(255,150,200,0))';
export const COLORS = ['#FF5EA8', '#FF8CC0', '#F7B3D6', '#D9B8FF', '#FFFFFF', '#FF5EA8'];

export const rowTop = (L: number) => { 'worklet'; return PAD_TOP + (NIVEIS_TRILHA - L) * ROW; };
export const dotY = (L: number) => { 'worklet'; return rowTop(L) + ROW; };
export const cardTop = (L: number) => { 'worklet'; return rowTop(L) + 10; };
export const cardCY = (L: number) => { 'worklet'; return cardTop(L) + 92; };

/** Limites dos 11 níveis da trilha (pontos), do servidor. */
export type Limites = number[];
/** Depois do Ícone: o Ícone II pede `passo` e cada seguinte +`incremento` (servidor). */
export type Icone = { passo: number; incremento: number };

/** Nível (1..11, o 11 cobre Ícone II+) e a fração dentro dele, para posicionar o marcador. */
export function nivelTrilha(xp: number, lim: Limites, ic: Icone) {
  'worklet';
  let L = 1;
  for (let i = 0; i < lim.length; i++) if (xp >= lim[i]) L = i + 1;
  if (L >= NIVEIS_TRILHA) {
    // Depois do Ícone, o marcador sobe no máximo (ROW − 60) dentro do passo atual.
    let piso = lim[NIVEIS_TRILHA - 1];
    let passo = ic.passo;
    let guard = 0;
    while (xp >= piso + passo && guard < 1000) { piso += passo; passo += ic.incremento; guard++; }
    return { L: NIVEIS_TRILHA, k: Math.min(1, (xp - piso) / passo) };
  }
  return { L, k: (xp - lim[L - 1]) / (lim[L] - lim[L - 1]) };
}

/** Y do marcador "Você está aqui" na trilha. */
export function xpY(xp: number, lim: Limites, ic: Icone) {
  'worklet';
  const { L, k } = nivelTrilha(xp, lim, ic);
  if (L >= NIVEIS_TRILHA) return dotY(NIVEIS_TRILHA) - k * (ROW - 60);
  return dotY(L) - k * ROW;
}

/** Quanto do trilho rosa está cheio (de baixo para cima). */
export function railK(xp: number, lim: Limites, ic: Icone) {
  'worklet';
  return (dotY(1) - xpY(xp, lim, ic)) / (dotY(1) - PAD_TOP);
}

export const clamp = (v: number, a: number, b: number) => { 'worklet'; return Math.min(b, Math.max(a, v)); };

/** Rolagem que deixa o marcador a 84% da altura da janela (design: sMark). */
export const sMark = (xp: number, lim: Limites, ic: Icone, vph: number) => {
  'worklet';
  return clamp(xpY(xp, lim, ic) - vph * 0.84, 0, CONTENT_H - vph);
};
/** Rolagem que centraliza a carta do nível L (design: sCard). */
export const sCard = (L: number, vph: number) => { 'worklet'; return clamp(cardCY(L) - vph / 2, 0, CONTENT_H - vph); };

/** Fundo da tela: fica mais rosado a cada nível (design: bgFor/glowFor). */
export function bgT(L: number) {
  return Math.min(1, Math.max(0, (L - 1) / 10));
}

/** 1234 → '1.234'. */
export const fmt = (n: number) => {
  'worklet';
  const d = String(Math.round(n));
  let out = '';
  for (let i = 0; i < d.length; i++) {
    if (i > 0 && (d.length - i) % 3 === 0) out += '.';
    out += d[i];
  }
  return out;
};

export const EO = [0.23, 1, 0.32, 1] as const;     // ease-out forte
export const EIO = [0.77, 0, 0.175, 1] as const;   // ease-in-out
export const GAVETA = [0.32, 0.72, 0, 1] as const; // curva de gaveta do iOS
