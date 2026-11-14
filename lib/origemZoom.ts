// De onde o detalhe do check-in abriu (12/nov/2026, transição de zoom como a do iOS, referência:
// app de treino). Quem abre mede a miniatura na tela (mural do grupo, dia do calendário) e guarda
// aqui; o detalhe cresce a partir dela e, ao sair (puxando para baixo ou no voltar), volta voando
// para dentro dela. Sem origem (link, notificação), o detalhe entra e sai com fade + escala.

export type Origem = { x: number; y: number; w: number; h: number; r: number };

let guardada: { chave: string; o: Origem } | null = null;

/** A origem do detalhe aberto com estes `ids` (a mesma string do parâmetro). */
export function origemDe(chave: string): Origem | null {
  return guardada && guardada.chave === chave ? guardada.o : null;
}

type Medivel = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null | undefined;

/**
 * Mede `no` na janela, guarda como origem de `chave` e chama `abrir`. `ajustar` recorta o retângulo
 * medido (ex.: a célula do calendário → a foto redonda do meio dela). Sem medida em 60 ms, abre igual.
 */
export function abrirComOrigem(no: Medivel, chave: string, r: number, abrir: () => void, ajustar?: (o: Origem) => Origem) {
  let foi = false;
  const vai = (o: Origem | null) => {
    if (foi) return;
    foi = true;
    guardada = o && o.w > 0 && o.h > 0 ? { chave, o: ajustar ? ajustar(o) : o } : null;
    abrir();
  };
  if (!no?.measureInWindow) { vai(null); return; }
  no.measureInWindow((x, y, w, h) => vai({ x, y, w, h, r }));
  setTimeout(() => vai(null), 60);
}
