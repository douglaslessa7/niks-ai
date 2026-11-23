// ─────────────────────────────────────────────────────────────────────────────
// Tela "Criando uma rotina só sua" nunca fica parada (18/nov/2026, pedido do produto).
//
// Antes, a tela só saía dos 95% quando `concluirCompraPendente()` terminava — e nenhuma etapa
// (análise completa, gravação do perfil/foto, rotina, recomendação) tinha limite de tempo: uma
// requisição pendurada deixava a usuária presa para sempre (caso real no TestFlight 1.63 (1)).
//
// Agora: cada TENTATIVA tem um teto. Estourou ou falhou → tenta de novo, sozinha. Depois da
// última, ela segue para o app e o resto termina em segundo plano (`lib/concluirCompra.ts`).
// Módulo PURO (sem React Native): testado com o Deno em `lib/esperaDaRotina_test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** Rejeita com `Error(motivo)` se a promessa não terminar em `ms`. */
export function comTeto<T>(p: Promise<T>, ms: number, motivo = 'teto'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(motivo)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** `fetch` com limite de tempo: passou de `ms`, a requisição é cancelada (AbortError). */
export async function fetchComTeto(url: string, init: RequestInit = {}, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export type StatusTentativa = 'ok' | 'sem_sessao' | 'falhou' | 'interrompida';
export type FimDaEspera = 'ok' | 'sem_sessao' | 'adiada';

export const TETO_TENTATIVA_MS = 75_000;
export const TENTATIVAS_NA_TELA = 2;

/**
 * Roda as tentativas com teto. `abandonar` é chamado quando uma tentativa estoura o teto,
 * para a próxima começar do zero (a abandonada não pode mais gravar nada).
 */
export async function esperarRotina(op: {
  tentar: () => Promise<{ status: StatusTentativa }>;
  abandonar: () => void;
  tetoMs?: number;
  tentativas?: number;
  aoTentarDeNovo?: (n: number, motivo: string) => void;
}): Promise<{ fim: FimDaEspera; tentativas: number; motivos: string[] }> {
  const teto = op.tetoMs ?? TETO_TENTATIVA_MS;
  const max = op.tentativas ?? TENTATIVAS_NA_TELA;
  const motivos: string[] = [];
  for (let n = 1; n <= max; n++) {
    let status: StatusTentativa;
    try {
      status = (await comTeto(op.tentar(), teto, 'teto')).status;
    } catch (e) {
      status = 'falhou';
      if ((e as Error)?.message === 'teto') {
        motivos.push('teto');
        op.abandonar();
      } else motivos.push('erro');
    }
    if (status === 'ok') return { fim: 'ok', tentativas: n, motivos };
    if (status === 'sem_sessao') return { fim: 'sem_sessao', tentativas: n, motivos };
    if (motivos.length < n) motivos.push(status);
    if (n < max) op.aoTentarDeNovo?.(n + 1, motivos[motivos.length - 1]);
  }
  return { fim: 'adiada', tentativas: max, motivos };
}
