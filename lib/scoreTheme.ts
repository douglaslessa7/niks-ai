import { ImageSourcePropType } from 'react-native';

// ── Tema de cor por faixa do Niks score ───────────────────────────────────────
// Réplica das 4 variações do Figma "Novo design app NIKS" (frames home 25/50/75/100):
//   0–25 vermelho · 26–50 laranja · 51–75 amarelo · 76–100 rosa.
// Usado na home (sparkle, número, traço, gradiente, anel) e no `product-result`
// (colorido pela faixa da `compatibilidade`).
// ⚠️ A logo central da navbar NÃO usa mais este tema — ela é sempre a logo rosa padrão
// da marca (#FF9D9D). Ver "Tab Bar / Navbar" no README.
export type ScoreTheme = {
  score: string;               // cor do número do Niks score (e do traço ondulado)
  heroSoft: string;            // parada suave do gradiente de fundo (meio)
  heroMed: string;             // parada mais forte do gradiente (topo do card de métricas)
  ringImg: ImageSourcePropType; // anel da foto = asset REAL do elipse do Figma (node 1:319)
  logo: ImageSourcePropType;    // sparkle do topo (E da navbar) — fundo transparente
  underline: ImageSourcePropType; // traço ondulado sob "Niks score"
};

export const THEME_RED: ScoreTheme = {
  score: '#FD3A42', heroSoft: '#FFF6F6', heroMed: '#FFEBEB',
  ringImg: require('../assets/home/ring-red.png'),
  logo: require('../assets/home/score-logo-red.png'),
  underline: require('../assets/home/score-underline-red.png'),
};
export const THEME_ORANGE: ScoreTheme = {
  score: '#FF9D47', heroSoft: '#FFF1EA', heroMed: '#FFE3D5',
  ringImg: require('../assets/home/ring-orange.png'),
  logo: require('../assets/home/score-logo-orange.png'),
  underline: require('../assets/home/score-underline-orange.png'),
};
export const THEME_YELLOW: ScoreTheme = {
  score: '#FEC343', heroSoft: '#FFFCF6', heroMed: '#FFFBEB',
  ringImg: require('../assets/home/ring-yellow.png'),
  logo: require('../assets/home/score-logo-yellow.png'),
  underline: require('../assets/home/score-underline-yellow.png'),
};
export const THEME_PINK: ScoreTheme = {
  score: '#FF5EA8', heroSoft: '#FFEFF6', heroMed: '#FFDEED',
  ringImg: require('../assets/home/ring-pink.png'),
  logo: require('../assets/home/score-logo-pink.png'),
  underline: require('../assets/home/score-underline-pink.png'),
};

export function getScoreTheme(score: number | null): ScoreTheme {
  if (score == null) return THEME_PINK; // sem scan → tema rosa (cor da marca)
  if (score <= 25) return THEME_RED;
  if (score <= 50) return THEME_ORANGE;
  if (score <= 75) return THEME_YELLOW;
  return THEME_PINK;
}

// ── Fundo de tela por faixa do score ("Seu progresso", out/2026) ──────────────
// Mesma estrutura do fundo da home (`lib/homeTheme`: 6 paradas em BG_STOPS, bolha de
// cor no canto, fundo do cabeçalho rolado), tingida pela faixa do score — como a home
// antiga mudava de cor pelo score. Rosa = exatamente o fundo de dia de hoje (BG_DAY).
export type ScoreScreenTheme = {
  bg: readonly [string, string, string, string, string, string];
  base: string;
  blob: string;
  header: string;
};

const SCREEN_RED: ScoreScreenTheme = {
  bg: ['#FFE4E4', '#FFD4D4', '#FFC7C7', '#FDDEDE', '#FBEEEE', '#F9F3F3'],
  base: '#F9F3F3', blob: 'rgba(255,214,214,0.40)', header: 'rgba(255,214,214,0.94)',
};
const SCREEN_ORANGE: ScoreScreenTheme = {
  bg: ['#FFEADC', '#FFDDC8', '#FFD1B6', '#FDE4D3', '#FBF1E9', '#F9F5F1'],
  base: '#F9F5F1', blob: 'rgba(255,226,206,0.40)', header: 'rgba(255,222,200,0.94)',
};
const SCREEN_YELLOW: ScoreScreenTheme = {
  bg: ['#FFF4D9', '#FFECC2', '#FFE4AB', '#FDEFCF', '#FBF6E9', '#F9F7F2'],
  base: '#F9F7F2', blob: 'rgba(255,238,198,0.40)', header: 'rgba(255,236,190,0.94)',
};
const SCREEN_PINK: ScoreScreenTheme = {
  bg: ['#FFE3EF', '#FFD3E5', '#FFC6DC', '#FDDFEB', '#FBEEF3', '#F9F2F5'],
  base: '#F9F2F5', blob: 'rgba(255,226,236,0.40)', header: 'rgba(255,214,231,0.94)',
};

export function getScoreScreenTheme(score: number | null): ScoreScreenTheme {
  if (score == null) return SCREEN_PINK;
  if (score <= 25) return SCREEN_RED;
  if (score <= 50) return SCREEN_ORANGE;
  if (score <= 75) return SCREEN_YELLOW;
  return SCREEN_PINK;
}
