// ─────────────────────────────────────────────────────────────────────────────
// Cliente da Edge Function `cartas` (sistema de cartas + sequência no servidor).
// O sorteio acontece no servidor; aqui só chamamos e guardamos o que não pôde subir.
//
//   estadoCartas()          sequência, cartas a raspar, poderes armados, cota do dia.
//                           Na 1ª vez sobe o histórico do celular (routine_history) e,
//                           sempre, as rotinas que ficaram na fila sem internet.
//   concluirRotina(periodo) registra a rotina; sem rede, entra na fila e volta depois.
//   cartaDetalhe(id) / rasparCarta(id)
//
// Fetch direto com o token da sessão (padrão do app: nunca functions.invoke).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getRoutineHistory, type RoutinePeriod } from './routineProgress';
import { useCachedQuery, invalidateCache, writeCache, peekCache } from './cache';
import { getUserId, useUserId } from './currentUser';

const FN_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/cartas`;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const FILA_KEY = 'cartas:fila_rotinas';
const HIST_KEY = 'cartas:historico_enviado';

export type CartaCatalogo = {
  id: string;
  codigo: string;
  familia: 'colecionavel' | 'conhecimento' | 'poder';
  subtipo: string | null;
  serie: string | null;
  nome: string;
  raridade: 'normal' | 'rara';
  arte_path: string | null;
  arte_url: string | null;
  texto: string | null;
  efeito: Record<string, unknown> | null;
};

export type CartaGanha = {
  id: string;
  origem: 'rotina' | 'sos' | 'surpresa' | 'grupo' | 'marco';
  dia: string;
  ganha_em: string;
  raspada_em: string | null;
  conteudo: Record<string, unknown> | null;
  carta: CartaCatalogo | null;
};

export type Sequencia = { atual: number; recorde: number; ultimo_dia: string | null };

export type EstadoCartas = {
  hoje: string;
  sequencia: Sequencia;
  rotina_hoje: boolean;
  cartas_hoje: { cota: number; dadas: number };
  a_raspar: { id: string; origem: CartaGanha['origem']; ganha_em: string }[];
  poderes: {
    protecao: number;
    scan_antecipado: boolean;
    carta_extra_amanha: boolean;
    sequencia_dobro_dias: string[];
  };
  cartas_novas: string[];
};

export type Poder = { tipo: string; fim: string | null; dados: Record<string, unknown> | null };

type Pendente = { periodo: RoutinePeriod; quando: string };

// Mesmo padrão de token da niks-chat: só renova perto de expirar.
async function token(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const nowSecs = Math.floor(Date.now() / 1000);
    if (session?.access_token && (session.expires_at ?? 0) - nowSecs > 300) return session.access_token;
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    return !error && refreshed.session?.access_token ? refreshed.session.access_token : session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const t = await token();
  if (!t) throw new Error('sem sessão');
  const resp = await fetch(FN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error ?? `HTTP ${resp.status}`);
  return json as T;
}

async function lerFila(): Promise<Pendente[]> {
  try {
    const raw = await AsyncStorage.getItem(FILA_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Histórico do celular no formato da função: [{dia, am, pm}].
async function historicoLocal() {
  const hist = await getRoutineHistory();
  return Object.entries(hist).map(([dia, v]) => ({ dia, am: !!v?.am, pm: !!v?.pm }));
}

/** Estado das cartas e da sequência. Sobe o histórico (1ª vez) e a fila offline. */
export async function estadoCartas(): Promise<EstadoCartas> {
  const [fila, enviado] = await Promise.all([lerFila(), AsyncStorage.getItem(HIST_KEY)]);
  const body: Record<string, unknown> = { acao: 'estado' };
  if (!enviado) body.historico = await historicoLocal();
  if (fila.length) body.pendentes = fila;
  const estado = await chamar<EstadoCartas>(body);
  // Só limpa o que foi enviado com sucesso.
  if (!enviado) await AsyncStorage.setItem(HIST_KEY, new Date().toISOString()).catch(() => {});
  if (fila.length) await AsyncStorage.removeItem(FILA_KEY).catch(() => {});
  return estado;
}

/**
 * Registra a rotina concluída no servidor. Sem internet, guarda na fila (o servidor
 * aceita até 48 h depois) e devolve null — a próxima `estadoCartas()` envia.
 */
export async function concluirRotina(periodo: RoutinePeriod): Promise<{ sequencia: Record<string, unknown>; cartas: CartaGanha[] } | null> {
  try {
    const r = await chamar<{ sequencia: Record<string, any>; cartas: CartaGanha[] }>({ acao: 'concluir_rotina', periodo });
    await aplicarSequencia(r.sequencia); // o estado é relido sozinho a cada foco (staleMs 0)
    return r;
  } catch {
    const fila = await lerFila();
    if (!fila.some((p) => p.periodo === periodo && p.quando.slice(0, 10) === new Date().toISOString().slice(0, 10))) {
      fila.push({ periodo, quando: new Date().toISOString() });
      await AsyncStorage.setItem(FILA_KEY, JSON.stringify(fila.slice(-4))).catch(() => {});
    }
    return null;
  }
}

export const chaveEstado = (uid: string) => `cartas:estado:${uid}`;
export const chaveColecao = (uid: string) => `cartas:colecao:${uid}`;

/** Depois de raspar ou concluir rotina: o estado e a coleção são relidos na próxima tela. */
export async function invalidarCartas() {
  const uid = await getUserId();
  if (!uid) return;
  invalidateCache(chaveEstado(uid));
  invalidateCache(chaveColecao(uid));
}

/** Estado das cartas e da sequência, cacheado (revalida sempre que a tela foca). */
export function useEstadoCartas() {
  const uid = useUserId();
  const fetcher = useCallback(() => estadoCartas(), []);
  return useCachedQuery<EstadoCartas>(uid ? chaveEstado(uid) : null, fetcher, { staleMs: 0, enabled: Boolean(uid) });
}

/** Grava no cache a sequência que o servidor devolveu ao concluir a rotina (a tela não espera o próximo estado). */
export async function aplicarSequencia(seq: { atual?: number; recorde?: number; dia?: string } | null | undefined) {
  const uid = await getUserId();
  if (!uid || !seq || typeof seq.atual !== 'number') return;
  const atual = peekCache<EstadoCartas>(chaveEstado(uid))?.data;
  if (!atual) return;
  await writeCache(chaveEstado(uid), {
    ...atual,
    rotina_hoje: true,
    sequencia: { ...atual.sequencia, atual: seq.atual, recorde: seq.recorde ?? atual.sequencia.recorde, ultimo_dia: seq.dia ?? atual.sequencia.ultimo_dia },
  });
}

// ── Coleção (cartas raspadas) ────────────────────────────────────────────────
export type PoderRow = { id: string; tipo: string; inicio: string; fim: string | null; consumido_em: string | null; dados: Record<string, any> | null };
export type ItemColecao = {
  id: string;
  origem: CartaGanha['origem'];
  dia: string;
  raspada_em: string;
  conteudo: Record<string, unknown> | null;
  carta: CartaCatalogo;
  poder: PoderRow | null;
};

async function buscarColecao(): Promise<ItemColecao[]> {
  const uid = await getUserId();
  if (!uid) throw new Error('sem sessão');
  const { data, error } = await supabase
    .from('cartas_usuario')
    .select('id, origem, dia, raspada_em, conteudo, carta:cartas_catalogo(id, codigo, familia, subtipo, serie, nome, raridade, arte_path, texto, efeito), poder:poderes_usuario(id, tipo, inicio, fim, consumido_em, dados)')
    .eq('user_id', uid)
    .not('raspada_em', 'is', null)
    .order('raspada_em', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => r.carta)
    .map((r: any) => ({
      ...r,
      carta: { ...r.carta, arte_url: null },
      poder: Array.isArray(r.poder) ? r.poder[0] ?? null : r.poder ?? null,
    }));
}

export function useColecao() {
  const uid = useUserId();
  const fetcher = useCallback(() => buscarColecao(), []);
  return useCachedQuery<ItemColecao[]>(uid ? chaveColecao(uid) : null, fetcher, { enabled: Boolean(uid) });
}

/** Quantas vezes ela já raspou esta carta do catálogo (sem contar `excetoId`). */
export async function vezesRaspada(cartaId: string, excetoId: string): Promise<number> {
  const { count } = await supabase
    .from('cartas_usuario')
    .select('id', { count: 'exact', head: true })
    .eq('carta_id', cartaId)
    .neq('id', excetoId)
    .not('raspada_em', 'is', null);
  return count ?? 0;
}

// ── Poderes: textos e ícones do design (79a–79d, 79k) ───────────────────────
export const PODER_INFO: Record<string, { nome: string; efeito: string; icone: string }> = {
  sequencia_dobro: { nome: 'Sequência em dobro', efeito: 'Nos próximos 2 dias, cada dia vale +2', icone: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z' },
  protecao_sequencia: { nome: 'Proteção de sequência', efeito: 'Se você falhar 1 dia, sua sequência não zera', icone: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' },
  carta_extra: { nome: 'Carta extra', efeito: 'Amanhã você ganha 2 cartas', icone: 'M12 5v14M5 12h14' },
  scan_antecipado: { nome: 'Scan antecipado', efeito: 'Seu próximo scan já está liberado', icone: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 12h8' },
  xp_grupo_dobro: { nome: 'XP em dobro para o grupo', efeito: 'Por 2 dias, seus check-ins rendem XP dobrado', icone: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z' },
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** 'AAAA-MM-DD' (ou ISO) → '14 nov'. */
export function diaCurto(d: string | null | undefined): string {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m && d.length === 10) return `${Number(m[3])} ${MESES[Number(m[2]) - 1]}`;
  const dt = new Date(d);
  return `${dt.getDate()} ${MESES[dt.getMonth()]}`;
}
/** Hora de um ISO no fuso do aparelho: '7:42'. */
export function horaCurta(iso: string): string {
  const dt = new Date(iso);
  return `${dt.getHours()}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

export type EstadoPoder = { st: 'active' | 'armed' | 'used'; texto: string };
/** Estado de um poder raspado (chip do detalhe 79a–79d e rodapé da revelação 79k). `hoje` = dia de sessão. */
export function estadoPoder(p: PoderRow | null, tipo: string, hoje: string): EstadoPoder {
  if (!p) return { st: 'active', texto: 'Ativo' };
  const consumido = p.consumido_em;
  switch (tipo) {
    case 'protecao_sequencia':
      return consumido ? { st: 'used', texto: `Usado em ${diaCurto((p.dados?.dia_coberto as string) ?? consumido)}` } : { st: 'armed', texto: 'Armado' };
    case 'scan_antecipado':
      return consumido ? { st: 'used', texto: `Usado em ${diaCurto(consumido)}` } : { st: 'active', texto: 'Ativo' };
    case 'carta_extra': {
      const d = String(p.dados?.dia ?? '');
      if (d && hoje < d) return { st: 'armed', texto: `Vale em ${diaCurto(d)}` };
      if (d && hoje === d) return { st: 'active', texto: 'Ativo hoje' };
      return { st: 'used', texto: `Usado em ${diaCurto(d)}` };
    }
    default: {
      const dias: string[] = Array.isArray(p.dados?.dias) ? [...p.dados!.dias].sort() : [];
      const fim = dias[dias.length - 1];
      if (fim && hoje <= fim) return { st: 'active', texto: `Ativo até ${diaCurto(fim)}` };
      return { st: 'used', texto: fim ? `Usado até ${diaCurto(fim)}` : 'Usado' };
    }
  }
}

/** Etiqueta da carta (topo do verso): poder → "Carta de poder"; o resto, pela origem. */
export function etiquetaCarta(familia: string, origem: string): string {
  if (familia === 'poder') return 'Carta de poder';
  return ({ rotina: 'Carta do dia', marco: 'Carta rara', surpresa: 'Carta surpresa', sos: 'SOS espinha', grupo: 'Carta do grupo' } as Record<string, string>)[origem] ?? 'Carta do dia';
}

export async function cartaDetalhe(id: string): Promise<CartaGanha> {
  return (await chamar<{ carta: CartaGanha }>({ acao: 'carta', id })).carta;
}

export async function rasparCarta(id: string): Promise<{ carta: CartaGanha; poder: Poder | null }> {
  const r = await chamar<{ carta: CartaGanha; poder: Poder | null }>({ acao: 'raspar', id });
  await invalidarCartas();
  return r;
}
