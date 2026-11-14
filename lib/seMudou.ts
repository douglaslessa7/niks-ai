// ─────────────────────────────────────────────────────────────────────────────
// Atualizar estado SÓ se o valor mudou (12/nov/2026). As abas releem dados ao ganhar foco
// (histórico, passos feitos, hora) e gravavam objetos NOVOS iguais aos de antes: cada troca de
// aba re-renderizava a tela inteira (Rotina, Home) — 300 ms de JavaScript a cada toque na navbar.
// Uso: `setX(seMudou(novo))` — devolve o anterior quando é igual, e o React nem re-renderiza.
// ─────────────────────────────────────────────────────────────────────────────

/** Igualdade estrutural barata para dados de tela (JSON simples). */
export function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** Atualizador funcional de `setState`: mantém o valor anterior quando o novo é igual. */
export function seMudou<T>(novo: T): (antes: T) => T {
  return (antes) => (igual(antes, novo) ? antes : novo);
}

/** `setNow` que só muda quando o minuto muda (a tela usa a hora, não os segundos). */
export function agoraSeMudou(): (antes: Date) => Date {
  const n = new Date();
  return (antes) => (antes && Math.floor(antes.getTime() / 60_000) === Math.floor(n.getTime() / 60_000) ? antes : n);
}
