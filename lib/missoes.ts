// ─────────────────────────────────────────────────────────────────────────────
// Desafios do primeiro acesso (08/nov/2026) — o card "Suas missões" no topo da home.
//   1. Escanear um produto;
//   2. Colocar na estante;
//   3. Colocar os produtos nos passos da rotina (todos de UM período);
//   4. Fazer o skincare.
// O progresso e os pontos vêm do SERVIDOR, calculados dos dados reais (Edge Function
// `cartas`, ação `missoes`, migration 20261113120000): cada desafio paga uma vez, na hora; o
// que a conta já tinha feito conta como concluído, sem pontos. Concluídos os 4, uma carta rara
// por conta, fora da regra de 1 carta por dia, que não vence até ser raspada.
// Contas novas: depois do tour, o desafio 1 começa sozinho. Contas existentes: só o card.
// ─────────────────────────────────────────────────────────────────────────────
import { irPara } from './navegar';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCachedQuery, invalidateCache, peekCache, writeCache } from './cache';
import { getUserId, useUserId } from './currentUser';
import { chamarCartas, type CartaGanha } from './cartasServidor';
import { supabase } from './supabase';
import { encerrarGuia, iniciarGuia, pedirProximoDesafio } from './guia';
import { ganhouPontos } from './pontosAnimacao';

export type PeriodoMissao = { passos: number; com_produto: number };
export type GanhoDesafio = { desafio: number; pontos: number; total_antes: number; total: number };
export type EstadoMissoes = {
  iniciadas_em: string;
  guia_visto_em: string | null;
  concluidas_em: string | null;
  d1: boolean;
  d2: boolean;
  d3: boolean;
  d4: boolean;
  periodos: Partial<Record<'am' | 'pm', PeriodoMissao>>;
  /** Pontos pagos NESTA chamada (a animação sobe uma vez só). */
  ganhos: GanhoDesafio[];
  /** A rara das missões (null enquanto não saiu — ou sem catálogo ativo). */
  carta: CartaGanha | null;
};

export const DESAFIOS = ['d1', 'd2', 'd3', 'd4'] as const;
export type DesafioId = (typeof DESAFIOS)[number];

export const chaveMissoes = (uid: string) => `missoes:${uid}`;

type OpcoesPontos = { segurar?: boolean };

/** Lê o estado no servidor e mostra a barra de nível dos pontos pagos agora. */
export async function estadoMissoes(body: Record<string, unknown> = {}, opts: OpcoesPontos = {}): Promise<EstadoMissoes> {
  const r = await chamarCartas<EstadoMissoes>({ acao: 'missoes', ...body });
  if (r?.ganhos?.length) ganhouPontos(r.ganhos, opts);
  return r;
}

export function useMissoes() {
  const uid = useUserId();
  const fetcher = useCallback(() => estadoMissoes(), []);
  useEffect(() => { if (uid) void carregarPulados(uid); }, [uid]);
  return useCachedQuery<EstadoMissoes>(uid ? chaveMissoes(uid) : null, fetcher, { staleMs: 0, enabled: Boolean(uid) });
}

/** A home relê no próximo foco, sem chamar o servidor agora. */
export async function invalidarMissoes() {
  const uid = await getUserId();
  if (uid) invalidateCache(chaveMissoes(uid));
}

/**
 * Depois de uma ação que pode concluir um desafio: confere agora e paga os pontos na hora.
 * `segurar`: há carta para raspar neste fluxo, e a barra sobe uma vez só depois dela.
 * Nunca lança: falhou, a home confere no próximo foco.
 */
export async function verificarDesafios(opts: OpcoesPontos = {}): Promise<EstadoMissoes | null> {
  const uid = await getUserId();
  if (!uid) return null;
  const atual = peekCache<EstadoMissoes>(chaveMissoes(uid))?.data;
  if (atual?.concluidas_em && atual.carta) return atual;
  try {
    const r = await estadoMissoes({}, opts);
    await writeCache(chaveMissoes(uid), r);
    return r;
  } catch (e) {
    console.warn('[missoes] conferir desafios falhou:', e);
    invalidateCache(chaveMissoes(uid));
    return null;
  }
}

/** Ela começou os desafios: eles não abrem sozinhos de novo. Não trava nada. */
export async function marcarGuiaVisto() {
  try {
    const uid = await getUserId();
    const r = await estadoMissoes({ marcar: 'guia' });
    if (uid) await writeCache(chaveMissoes(uid), r);
  } catch (e) {
    console.warn('[missoes] marcar guia falhou:', e);
  }
}

export const quantasFeitas = (e: EstadoMissoes) => DESAFIOS.filter((d) => e[d]).length;

// ── Desafios pulados ("Não tenho um produto agora") ───────────────────────────
// Pular só muda a ORDEM em que o app guia: nada vai ao servidor, que continua calculando cada
// desafio pelos dados reais. O pulado segue pendente, sem pontos, e paga ao ser feito. Guardado
// no aparelho, por conta. (O servidor não precisa saber: a carta rara exige os 4 feitos.)
let pulados: DesafioId[] = [];
let puladosDe: string | null = null;
const ouvintesPulados = new Set<() => void>();
const chavePulados = (uid: string) => `missoes_pulados_${uid}`;
const definirPulados = (lista: DesafioId[]) => { pulados = lista; ouvintesPulados.forEach((f) => f()); };

async function carregarPulados(uid: string) {
  if (puladosDe === uid) return;
  puladosDe = uid;
  try {
    const bruto = await AsyncStorage.getItem(chavePulados(uid));
    definirPulados(bruto ? (JSON.parse(bruto) as DesafioId[]) : []);
  } catch {
    definirPulados([]);
  }
}

export function usePulados(): DesafioId[] {
  return useSyncExternalStore(
    (f) => { ouvintesPulados.add(f); return () => { ouvintesPulados.delete(f); }; },
    () => pulados,
    () => pulados,
  );
}

/** Desafio que não dá para guiar agora: a estante precisa de um produto escaneado e a rotina, de passos. */
export const desafioBloqueado = (e: EstadoMissoes, d: DesafioId) =>
  (d === 'd2' && !e.d1) || (d === 'd3' && !periodoDaRotina(e));

const aFazer = (e: EstadoMissoes) => DESAFIOS.filter((d) => !e[d] && !desafioBloqueado(e, d));

/** O próximo desafio a fazer (o card guia este e os pulados): primeiro os não pulados. */
export const proximoDesafio = (e: EstadoMissoes, lista: DesafioId[] = pulados): DesafioId | null => {
  const faltam = aFazer(e);
  return faltam.find((d) => !lista.includes(d)) ?? faltam[0] ?? null;
};

/** Depois de pular: o próximo NÃO pulado (null = não sobrou nenhum; os pulados ficam no card). */
export const proximoNaoPulado = (e: EstadoMissoes, lista: DesafioId[] = pulados): DesafioId | null =>
  aFazer(e).find((d) => !lista.includes(d)) ?? null;

/**
 * "Não tenho um produto agora": encerra a dica, marca como pulado, volta à home e segue para o
 * próximo desafio. Da câmera (fora do grupo das abas), fecha a pilha antes.
 */
export async function pularDesafio(
  d: DesafioId,
  router: { canDismiss: () => boolean; dismissAll: () => void; navigate: (href: any) => void },
  pathname: string,
) {
  encerrarGuia();
  if (!pulados.includes(d)) definirPulados([...pulados, d]);
  const uid = await getUserId();
  if (uid) {
    puladosDe = uid;
    try { await AsyncStorage.setItem(chavePulados(uid), JSON.stringify(pulados)); } catch {}
  }
  if (pathname === '/home') { pedirProximoDesafio(); return; }
  if (pathname === '/product-camera' && router.canDismiss()) router.dismissAll();
  irPara('/home');
  setTimeout(pedirProximoDesafio, 450); // a home assenta antes da dica nova medir o alvo
}

/** O card aparece enquanto falta desafio, ou enquanto a rara não foi raspada. */
export const cardVisivel = (e: EstadoMissoes) => !e.concluidas_em || (!!e.carta && !e.carta.raspada_em);

/** Desafio 3: o período mais perto de completo (empate → manhã). null = rotina sem passos. */
export function periodoDaRotina(e: EstadoMissoes | null | undefined): { periodo: 'am' | 'pm'; passos: number; com: number } | null {
  if (!e) return null;
  const op = (['am', 'pm'] as const)
    .map((p) => ({ periodo: p, passos: e.periodos[p]?.passos ?? 0, com: e.periodos[p]?.com_produto ?? 0 }))
    .filter((x) => x.passos > 0);
  if (!op.length) return null;
  op.sort((a, b) => b.com / b.passos - a.com / a.passos || (a.periodo === 'am' ? -1 : 1));
  return op[0];
}

/** "3 de 4 passos da manhã". */
export function textoProgressoRotina(e: EstadoMissoes | null | undefined): string | null {
  const p = periodoDaRotina(e);
  if (!p || e?.d3) return null;
  return `${p.com} de ${p.passos} passos da ${p.periodo === 'am' ? 'manhã' : 'noite'}`;
}

/**
 * Fim do tour (conta nova): o desafio 1 começa sozinho — uma vez por conta (`guia_visto_em`)
 * e só se ainda não foi feito. O desafio da rotina substitui a intro da aba Rotina
 * (`users.rotina_intro_status = 'guiado'`, só se ela ainda não viu a intro).
 * Depois disso, os desafios seguem pelo card. Falha não trava nada.
 */
export async function comecarDesafios(): Promise<void> {
  try {
    const uid = await getUserId();
    if (!uid) return;
    const e = peekCache<EstadoMissoes>(chaveMissoes(uid))?.data ?? (await estadoMissoes());
    if (!e || e.d1 || e.guia_visto_em) return;
    iniciarGuia({ passo: 'd1-aba', guiado: true });
    void marcarGuiaVisto();
    const { error } = await supabase.from('users').update({ rotina_intro_status: 'guiado' }).eq('id', uid).is('rotina_intro_status', null);
    if (error) console.warn('[missoes] intro da Rotina → guiado falhou:', error.message);
    invalidateCache(`rotinaintro:${uid}`);
  } catch (err) {
    console.warn('[missoes] desafios não começaram:', err);
  }
}
