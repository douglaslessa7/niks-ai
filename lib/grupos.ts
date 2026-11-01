import type { ImageSourcePropType } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Grupos (comunidades estilo Gym Rats) — conteúdo do design "Nível só do grupo"
// (Claude Design, NiksHomeHeat.dc.html: MEM, GR, VOCE). A função ainda NÃO existe no
// app nem no banco: a home (74a–74c) e a aba Seus grupos (75b–75e) mostram estes
// grupos de exemplo. "Você" é sempre a usuária logada (foto e "fez hoje" reais).
// ─────────────────────────────────────────────────────────────────────────────

// Estado de exemplo enquanto a função não existe: 'um' = só "Glow das Meninas",
// 'dois' = os dois grupos (selo "+1" na home), 'nenhum' = sem grupo (74c / 75c).
export const DEMO_GRUPO: 'um' | 'dois' | 'nenhum' = 'um';

export type Membro = { k: string; name: string; img: ImageSourcePropType | null };

export type Grupo = {
  name: string; since: string; lvl: number; lvlName: string; xp: number; max: number;
  members: Membro[]; done: string[]; news?: string;
};

export const VOCE: Membro = { k: 'voce', name: 'Você', img: null };

export const MEMBROS: Membro[] = [
  { k: 'bia', name: 'Bia', img: require('../assets/review-beatriz.png') },
  { k: 'ana', name: 'Ana', img: require('../assets/review-mariana.png') },
  { k: 'carol', name: 'Carol', img: require('../assets/review-larissa.png') },
  { k: 'ju', name: 'Ju', img: require('../assets/home-grupo/model-face-3.png') },
  VOCE,
];

const GRUPOS_DESIGN: Grupo[] = [
  { name: 'Glow das Meninas', since: 'out 2026', lvl: 4, lvlName: 'Sem Filtro Gang', xp: 520, max: 700, members: MEMBROS, done: ['bia', 'ana', 'carol', 'voce'], news: 'Carta do grupo liberada' },
  {
    name: 'Skincare em Família', since: 'out 2026', lvl: 2, lvlName: 'Hidratadinha Gang', xp: 180, max: 250,
    members: [VOCE, { k: 'mae', name: 'Mãe', img: require('../assets/scan-tutorial/pessoa-scan.png') }, { k: 'irma', name: 'Irmã', img: require('../assets/home-grupo/model-face-3.png') }],
    done: ['voce', 'mae'],
  },
];

export function gruposDemo(): Grupo[] {
  if (DEMO_GRUPO === 'nenhum') return [];
  return DEMO_GRUPO === 'dois' ? GRUPOS_DESIGN : GRUPOS_DESIGN.slice(0, 1);
}

/** Grupo novo criado pela folha "Criar grupo" (onSubmit do design). */
export function novoGrupo(name: string): Grupo {
  return { name, since: 'hoje', lvl: 1, lvlName: 'Cara Lavada Gang', xp: 0, max: 100, members: [VOCE], done: [] };
}

/** "Você" fez hoje vem da rotina real; as outras integrantes seguem o design. */
export function fezHoje(g: Grupo, k: string, voceFez: boolean): boolean {
  return k === 'voce' ? voceFez : g.done.includes(k);
}
