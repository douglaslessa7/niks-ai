// ─────────────────────────────────────────────────────────────────────────────
// REGRA (09/nov/2026): a compra só muda de dona quando a pessoa COMPRA ou toca em
// "Restaurar" NESTA sessão — nunca sozinha. Funções puras (sem React Native), testadas à
// parte; quem chama é `lib/sinalCompra.ts`, o paywall e o cadastro.
//
// Antes (1.0.60 (2)): a abertura do cadastro sem sessão tratava "Superwall ACTIVE" (qualquer
// assinatura do Apple ID do aparelho) como "pagou", e o cadastro mandava `transferir`. Uma
// convidada que fechou no X tomou a assinatura de outra conta.
// ─────────────────────────────────────────────────────────────────────────────

/** Comprou ou restaurou neste aparelho, nesta sessão (o paywall recebeu purchased/restored). */
export type OrigemCompra = 'compra' | 'restaurar';

/** O cadastro abre como quem pagou, como convidada, ou volta ao paywall. */
export function aberturaDoCadastro(sinal: OrigemCompra | null, conviteValido: boolean): 'pagou' | 'convidada' | 'paywall' {
  if (sinal) return 'pagou';
  if (conviteValido) return 'convidada';
  return 'paywall';
}

/** O que o cadastro manda ao servidor: só com o sinal. Convidada e abertura nunca transferem. */
export function transferirNoCadastro(sinal: OrigemCompra | null): OrigemCompra | undefined {
  return sinal ?? undefined;
}

/**
 * Assinatura ativa no Apple ID que não é desta conta, sem compra nem restauração nesta sessão:
 * pergunta antes. Convidada (convite no onboarding) nunca é perguntada: entra como convidada.
 * Sem sessão não dá para saber de quem é a compra; com sessão, só quando o servidor diz que é
 * de outra conta.
 */
export function deveriaPerguntar(p: {
  convite: boolean;
  superwallAtivo: boolean;
  temSessao: boolean;
  outraConta: boolean;
  sinal: OrigemCompra | null;
}): boolean {
  if (p.convite || p.sinal || !p.superwallAtivo) return false;
  return p.temSessao ? p.outraConta : true;
}
