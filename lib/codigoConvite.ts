// Código de convite dos grupos (Parte B, Fases 3 e 4): textos de erro e leitura do que foi colado.

/** Do texto colado (às vezes a mensagem inteira), tira só o código. */
export function extrairCodigo(texto: string): string {
  const m = texto.match(/NIKS[-\s]?([2-9A-HJ-NP-Z]{6})\b/i);
  return m ? `NIKS-${m[1].toUpperCase()}` : texto.trim().toUpperCase().slice(0, 20);
}

const MENSAGENS: Record<string, string> = {
  convite_invalido: 'Não encontramos esse código. Confira com sua amiga.',
  cheio: 'Esse grupo está cheio.',
  limite: 'Muitas tentativas. Tente de novo em alguns minutos.',
  removida: 'Você não pode entrar nesse grupo.',
  banida: 'Sua conta não pode entrar em grupos.',
  rede: 'Não conseguimos conferir o código. Confira sua internet.',
};

export const mensagemDoCodigo = (motivo: string | undefined) =>
  MENSAGENS[motivo ?? ''] ?? MENSAGENS.convite_invalido;
