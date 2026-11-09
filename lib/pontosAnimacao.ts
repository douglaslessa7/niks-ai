// ─────────────────────────────────────────────────────────────────────────────
// A barra de nível animada para os NIKS Points ganhos SEM carta (regras novas, 05/nov/2026):
// 2º skincare do dia, check-in, scan de rosto e produto no grupo.
//
//   • Sem carta no fluxo: a barra sobe logo depois da ação (no topo da tela, por cima de
//     tudo — `components/cartas/BarraPontosHost.tsx`, montado no layout raiz).
//   • Com carta no mesmo fluxo: os pontos ficam SEGURADOS e a barra sobe uma vez só,
//     depois de raspar, somando tudo (a tela de raspar começa o pacote em `inicioDoPacote`).
//   • Saiu do fluxo sem raspar (não fez o check-in, fechou a câmera): `soltarPontos()`
//     mostra o que estava segurado.
// Estado só em memória: um segurado com mais de 15 min é descartado.
// ─────────────────────────────────────────────────────────────────────────────

export type GanhoBarra = { de: number; para: number };
type Pontos = { total_antes: number; total: number };

let ouvinte: ((g: GanhoBarra) => void) | null = null;
let fila: GanhoBarra[] = [];
let segurado: (GanhoBarra & { em: number }) | null = null;
const VALIDADE_MS = 15 * 60 * 1000;

/** O host da barra se registra aqui (um só, no layout raiz). */
export function registrarBarraPontos(fn: (g: GanhoBarra) => void): () => void {
  ouvinte = fn;
  const pendentes = fila;
  fila = [];
  pendentes.forEach(fn);
  return () => { if (ouvinte === fn) ouvinte = null; };
}

function emitir(g: GanhoBarra) {
  if (!(g.para > g.de)) return;
  if (ouvinte) ouvinte(g);
  else fila.push(g);
}

function vigente() {
  if (segurado && Date.now() - segurado.em > VALIDADE_MS) segurado = null;
  return segurado;
}

/**
 * Ganhou pontos sem carta. `segurar`: há carta para raspar neste mesmo fluxo — a barra
 * espera a carta. Aceita um evento ou uma lista (ex.: o check-in devolve skincare + check-in).
 */
export function ganhouPontos(p: Pontos | Pontos[] | null | undefined, opts: { segurar?: boolean } = {}) {
  const lista = (Array.isArray(p) ? p : p ? [p] : []).filter(
    (x) => x && typeof x.total_antes === 'number' && typeof x.total === 'number' && x.total > x.total_antes,
  );
  if (!lista.length) return;
  const de = Math.min(...lista.map((x) => x.total_antes));
  const para = Math.max(...lista.map((x) => x.total));
  const s = vigente();
  if (opts.segurar || s) {
    segurado = { de: Math.min(s?.de ?? de, de), para: Math.max(s?.para ?? para, para), em: Date.now() };
    return;
  }
  emitir({ de, para });
}

/** Saiu do fluxo sem raspar: a barra mostra o que estava segurado. */
export function soltarPontos() {
  const s = vigente();
  segurado = null;
  if (s) emitir({ de: s.de, para: s.para });
}

/** Tela de raspar: de onde o pacote começa (o total antes dos pontos segurados do fluxo). */
export function inicioDoPacote(totalAntes: number): number {
  const s = vigente();
  segurado = null;
  return s ? Math.min(s.de, totalAntes) : totalAntes;
}
