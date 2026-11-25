// "De onde ela veio" para eventos de abertura (ex.: `chat_aberto { origem }`). Quem navega marca a
// origem antes de abrir; a tela consome no foco. Memória de módulo, uso único: sem marca = null.
const origens = new Map<string, string>();

export function marcarOrigem(tela: string, origem: string): void {
  origens.set(tela, origem);
}

export function consumirOrigem(tela: string): string | null {
  const o = origens.get(tela) ?? null;
  origens.delete(tela);
  return o;
}
