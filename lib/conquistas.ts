// ─────────────────────────────────────────────────────────────────────────────
// Conquistas (hub "Suas conquistas", designs 77 e 78 do Claude Design,
// NiksConquistas.dc.html).
//   • Sequência e recorde: do SERVIDOR (estado da função `cartas`); calendário: histórico.
//   • Cartas raspadas: REAIS (cartas_usuario, via lib/cartasServidor), em dev e produção.
//   • Medalhas ainda NÃO existem no banco: o exemplo do design aparece só em
//     desenvolvimento (__DEV__). Em produção vêm zeradas — nunca dado falso.
// ─────────────────────────────────────────────────────────────────────────────
import { dateKey, dayEarnsStreak, sessionDate, type RoutineHistory } from './routineProgress';
import type { ItemColecao } from './cartasServidor';

// Cartas: decks por FAMÍLIA (decisão de produto, nov/2026) — Colecionáveis, Conhecimento
// e Poderes. A colecionável não mostra nome nem série na tela (só no banco); as repetidas
// viram uma só na grade, com o selo "x2" (79e).
export type DeckKey = 'colecionavel' | 'conhecimento' | 'poder';
export type Deck = { k: DeckKey; name: string; titulo: string; rare: boolean; n: number; last: string | null };
export type Tile = { key: string; item: ItemColecao; vezes: number; rara: boolean };

const FAMILIAS: { k: DeckKey; name: string; titulo: string }[] = [
  { k: 'colecionavel', name: 'Colecionáveis', titulo: 'Colecionáveis' },
  { k: 'conhecimento', name: 'Conhecimento', titulo: 'Conhecimento' },
  { k: 'poder', name: 'Poderes', titulo: 'Cartas de poder' },
];

export type Colecao = { decks: Deck[]; tiles: Record<DeckKey, Tile[]>; total: number; raras: number };

/** Monta os decks a partir das cartas raspadas (mais recente primeiro). */
export function montarColecao(items: ItemColecao[] | null | undefined, diaCurto: (d: string) => string): Colecao {
  const lista = items ?? [];
  const tiles: Record<DeckKey, Tile[]> = { colecionavel: [], conhecimento: [], poder: [] };
  const porCarta = new Map<string, Tile>();
  for (const it of lista) {
    const fam = it.carta.familia as DeckKey;
    if (!tiles[fam]) continue;
    if (fam === 'colecionavel') {
      const t = porCarta.get(it.carta.id);
      if (t) { t.vezes += 1; continue; }
      const novo = { key: it.carta.id, item: it, vezes: 1, rara: it.carta.raridade === 'rara' };
      porCarta.set(it.carta.id, novo);
      tiles.colecionavel.push(novo);
    } else {
      tiles[fam].push({ key: it.id, item: it, vezes: 1, rara: false }); // dica e poder: sempre normais
    }
  }
  const decks = FAMILIAS.map((f) => {
    const daFamilia = lista.filter((it) => it.carta.familia === f.k);
    return { ...f, rare: false, n: daFamilia.length, last: daFamilia[0] ? diaCurto(daFamilia[0].raspada_em) : null };
  });
  // Só colecionável pode ser rara (motor de cartas, nov/2026).
  const ehRara = (it: ItemColecao) => it.carta.familia === 'colecionavel' && it.carta.raridade === 'rara';
  return { decks, tiles, total: lista.length, raras: lista.filter(ehRara).length };
}

export type MedalhaConquistada = { name: string; date: string };
export type MedalhaTrancada = { name: string; c: number; t: number };

const MED_U_DEMO: MedalhaConquistada[] = [
  ['Primeira rotina', '2 out'], ['3 dias seguidos', '5 out'], ['7 dias seguidos', '9 out'], ['Primeira carta', '2 out'],
  ['10 cartas raspadas', '14 out'], ['Primeira carta rara', '18 out'], ['Primeira foto do dia', '3 out'], ['Entrou num grupo', '21 out'],
].map(([name, date]) => ({ name, date }));

const MED_L_DEMO: MedalhaTrancada[] = ([
  ['14 dias seguidos', 6, 14], ['30 dias seguidos', 6, 30], ['100 dias seguidos', 6, 100], ['10 cartas raras', 3, 10],
  ['25 cartas raras', 3, 25], ['50 cartas raspadas', 23, 50], ['100 cartas raspadas', 23, 100], ['Primeiro desafio', 0, 1],
  ['5 desafios', 0, 5], ['30 fotos do dia', 12, 30], ['100 fotos do dia', 12, 100], ['7 noites seguidas', 4, 7],
  ['Mês completo', 0, 1], ['Grupo no nível 5', 4, 5], ['3 amigas convidadas', 1, 3], ['5 análises de pele', 2, 5],
] as [string, number, number][]).map(([name, c, t]) => ({ name, c, t }));

const NEXT_DEMO: MedalhaTrancada[] = ([
  ['14 dias seguidos', 6, 14], ['10 cartas raras', 3, 10], ['Primeiro desafio', 0, 1], ['30 fotos do dia', 12, 30],
] as [string, number, number][]).map(([name, c, t]) => ({ name, c, t }));

// Em produção: as 24 medalhas trancadas, sem progresso (as 8 do exemplo com a meta delas).
const META_DAS_CONQUISTADAS = [1, 3, 7, 1, 10, 1, 1, 1];
const MED_L_ZERO: MedalhaTrancada[] = [
  ...MED_U_DEMO.map((m, i) => ({ name: m.name, c: 0, t: META_DAS_CONQUISTADAS[i] })),
  ...MED_L_DEMO.map((m) => ({ ...m, c: 0 })),
];

const DEMO = __DEV__;

export const MEDALHAS_CONQUISTADAS: MedalhaConquistada[] = DEMO ? MED_U_DEMO : [];
export const MEDALHAS_TRANCADAS: MedalhaTrancada[] = DEMO ? MED_L_DEMO : MED_L_ZERO;
export const TOTAL_MEDALHAS = 24;
export const MEDALHAS_NOVAS = DEMO ? 1 : 0;
export const PROXIMAS: MedalhaTrancada[] = DEMO ? NEXT_DEMO : NEXT_DEMO.map((m) => ({ ...m, c: 0 }));

// ── Sequência (dados reais) ──────────────────────────────────────────────────

/** Maior sequência de dias seguidos (manhã OU noite) já feita, contando a atual. */
export function recordeDias(hist: RoutineHistory, now: Date = new Date()): number {
  const keys = Object.keys(hist).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (!keys.length) return 0;
  const [y, m, d] = keys[0].split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const end = dateKey(sessionDate(now));
  let best = 0, run = 0;
  while (dateKey(day) <= end) {
    run = dayEarnsStreak(hist, day) ? run + 1 : 0;
    if (run > best) best = run;
    day.setDate(day.getDate() + 1);
  }
  return best;
}

// Metas da barra "Meta N dias" — os mesmos marcos das medalhas de sequência; depois de
// 100, a próxima centena.
const METAS = [3, 7, 14, 30, 100];
export function metaDias(dias: number): number {
  return METAS.find((m) => m > dias) ?? (Math.floor(dias / 100) + 1) * 100;
}
