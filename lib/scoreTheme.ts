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
