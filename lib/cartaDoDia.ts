// ─────────────────────────────────────────────────────────────────────────────
// Carta do dia — controle de "já abriu nesta sessão do app" (05/nov/2026).
// A carta abre SOZINHA no fim do fluxo (check-in publicado, "Agora não", câmera fechada) e,
// se sobrar uma sem raspar, ao entrar na home. Cada carta abre sozinha no máximo uma vez
// por sessão do app: se ela fechar no X sem raspar, a home não a reabre em seguida (senão
// ficaria presa na carta); na próxima abertura do app, abre de novo.
// ─────────────────────────────────────────────────────────────────────────────
const abertas = new Set<string>();

export function marcarCartaAberta(id: string | null | undefined) {
  if (id) abertas.add(id);
}

export function cartaJaAberta(id: string | null | undefined): boolean {
  return !!id && abertas.has(id);
}
