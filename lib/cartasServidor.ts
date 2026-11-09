// ─────────────────────────────────────────────────────────────────────────────
// Cliente da Edge Function `cartas` (sistema de cartas + sequência no servidor).
// O sorteio acontece no servidor; aqui só chamamos e guardamos o que não pôde subir.
//
//   estadoCartas()          sequência, cartas a raspar, poderes armados, cota do dia,
//                           NIKS Points (total, nível) e a tabela de níveis.
//                           Na 1ª vez sobe o histórico do celular (routine_history) e,
//                           sempre, as rotinas que ficaram na fila sem internet.
//   concluirRotina(periodo) registra a rotina; sem rede, entra na fila e volta depois.
//   cartaDetalhe(id) / rasparCarta(id) (devolve os NIKS Points da carta)
//   marcarNivelVisto(nivel) ela viu a celebração do nível
//
// Fetch direto com o token da sessão (padrão do app: nunca functions.invoke).
//
// REGRAS NOVAS (05/nov/2026, migration 20261112120000): TODA chamada leva `regras: 2` —
// a conta passa às regras novas no servidor (1 carta por dia, só a de hoje para raspar,
// pontos sem carta, Proteção e Pontos em dobro). `marcarRegrasCartas()` marca a conta
// logo no cadastro, antes de salvar o scan do cadastro; se falhar, o próximo estado marca.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getRoutineHistory, type RoutinePeriod } from './routineProgress';
import { useCachedQuery, invalidateCache, writeCache, peekCache } from './cache';
import { getUserId, useUserId } from './currentUser';
import { trackFora } from './mixpanel/MixpanelProvider';
import { ajustarMedalhas } from './niveis';

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
  origem: 'rotina' | 'sos' | 'surpresa' | 'grupo' | 'marco' | 'volta' | 'scan_rosto' | 'checkin_grupo' | 'produto_grupo' | 'campea' | 'missoes';
  dia: string;
  ganha_em: string;
  raspada_em: string | null;
  conteudo: Record<string, unknown> | null;
  /** NIKS Points da carta (sorteados ao raspar; null antes disso). */
  pontos?: number | null;
  carta: CartaCatalogo | null;
};

/** NIKS Points e nível da usuária (o nível é só status: não libera nem bloqueia nada). */
export type PontosUsuaria = {
  total: number;
  nivel: number;
  titulo: string;
  /** Pontos do início do nível atual e do próximo nível. */
  piso: number;
  teto: number;
  titulo_proximo: string;
  nivel_visto: number;
  /** Subiu de nível e ainda não viu a celebração. */
  celebrar: boolean;
  /** A celebração pendente é a dos pontos retroativos ("Você já é…"). */
  retro: boolean;
  retro_pontos: number | null;
};

export type NivelTabela = { n: number; titulo: string; pontos: number };

export type Sequencia = { atual: number; recorde: number; ultimo_dia: string | null };

/** Pontos ganhos SEM carta (2º skincare do dia, check-in, scan de rosto, produto no grupo). */
export type PontosGanhos = {
  acao?: string;
  pontos: number;
  base?: number;
  dobro?: boolean;
  total_antes: number;
  total: number;
  nivel_antes: number;
  nivel: number;
  titulo: string;
};

/** Carta do dia (regras novas): sem skincare hoje · para raspar · feita (raspada ou sem carta). */
export type CartaHoje = {
  estado: 'bloqueada' | 'pronta' | 'feita';
  id: string | null;
  origem: CartaGanha['origem'] | null;
  /** 'comum' | 'rara' | 'poder:<subtipo>' */
  tipo: string | null;
};

export type EstadoCartas = {
  /** 2 = regras novas (o servidor respondeu com `estado_cartas_v2`). */
  regras?: number;
  hoje: string;
  sequencia: Sequencia;
  rotina_hoje: boolean;
  /** Regras novas: o card da home. */
  carta_hoje?: CartaHoje;
  /** Regras novas: o sistema está ligado para ela (catálogo com carta para ela). */
  ativo?: boolean;
  /** Regras antigas (o servidor não manda mais nas regras novas). */
  cartas_hoje?: { cota: number; dadas: number };
  /** `tipo` ('familia:subtipo[:rara]') e `motivo` do motor: só para medição. */
  a_raspar: { id: string; origem: CartaGanha['origem']; ganha_em: string; tipo?: string; motivo?: string | null }[];
  poderes: {
    protecao: number;
    pontos_dobro_dias?: string[];
    /** Último dia em que o Pontos em dobro vale (regras novas). */
    pontos_dobro_ate?: string | null;
    // Regras antigas (fora das regras novas):
    scan_antecipado?: boolean;
    carta_extra_amanha?: boolean;
    sequencia_dobro_dias?: string[];
  };
  pontos?: PontosUsuaria;
  /** Os 13 níveis-medalha (Bronze 1 → NIKS) com os pontos de cada um. */
  niveis?: NivelTabela[];
  /** Sobra da regra antiga ("Ícone II…"); ignorado desde as medalhas (o NIKS é o último). */
  icone?: { passo: number; incremento: number };
  /** Faixas de pontos (regras novas: `carta` 10–50 e as dos pontos sem carta: `rotina` = 2º skincare, `checkin_grupo`, `scan_rosto`, `produto_grupo`). */
  faixas?: Record<string, { min: number; max: number }>;
  /** Carta de volta entregue nesta abertura (a carta misteriosa do push). */
  carta_volta?: string | null;
  /**
   * Próxima Carta de volta: o dia em que ela sai se não houver rotina depois de
   * `ultimo_dia`, e se vai mesmo sair (`ok`). Agenda o push da carta misteriosa.
   */
  proxima_volta?: { dia: string; ultimo_dia: string; ok: boolean } | null;
  cartas_novas: string[];
};

/** Recompensa da primeira semana gravada na carta (o motor dá por trás; parece comum). */
export type Semana1 = { dia: number; tipo: string; pontos?: number; subtipo?: string; fallback?: boolean; marco?: boolean };

/** Resultado dos pontos ao raspar uma carta. */
export type PontosRaspados = {
  ganhos: number;
  base: number;
  rara: boolean;
  dobro: boolean;
  /** Pontos extras da primeira semana (regras antigas; já somados em `ganhos`). */
  bonus?: number;
  /** Regras novas: o Pontos em dobro desta carta dobrou os pontos sem carta já ganhos hoje (somado em `total`). */
  bonus_dobro?: number;
  /** Regras novas: pontos sem carta ganhos hoje (já dentro de `total_antes`). */
  sem_carta_hoje?: number;
  semana1?: Semana1 | null;
  total_antes: number;
  total: number;
  nivel_antes: number;
  nivel: number;
  titulo: string;
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

/** A Edge Function `cartas` (com `regras: 2`). Também usada pelas missões (`lib/missoes.ts`). */
export async function chamarCartas<T>(body: Record<string, unknown>): Promise<T> {
  return chamar<T>(body);
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const t = await token();
  if (!t) throw new Error('sem sessão');
  const resp = await fetch(FN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
    // `regras: 2` em toda chamada: a conta fica nas regras novas (mesmo que a marca do cadastro tenha falhado).
    body: JSON.stringify({ ...body, regras: 2 }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error ?? `HTTP ${resp.status}`);
  return ajustarMedalhas(json) as T;   // níveis = medalhas, mesmo antes da migration (lib/niveis.ts)
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

/** Boas-vindas pós-pagamento que não chegaram ao servidor (sem rede na tela de espera):
 *  guarda o uid; `estadoCartas` tenta de novo. Ver `lib/boasVindas.ts`. */
export const BOAS_VINDAS_PENDENTE = 'boas_vindas_pendente';

/** Estado das cartas e da sequência. Sobe o histórico (1ª vez) e a fila offline. */
// A função `cartas` leva ~1 s e várias telas pedem o estado ao mesmo tempo: uma chamada só.
let estadoEmVoo: Promise<EstadoCartas> | null = null;
export function estadoCartas(): Promise<EstadoCartas> {
  if (estadoEmVoo) return estadoEmVoo;
  const p: Promise<EstadoCartas> = buscarEstado().finally(() => { if (estadoEmVoo === p) estadoEmVoo = null; });
  estadoEmVoo = p;
  return p;
}

async function buscarEstado(): Promise<EstadoCartas> {
  const pendenteBv = await AsyncStorage.getItem(BOAS_VINDAS_PENDENTE).catch(() => null);
  if (pendenteBv && pendenteBv === (await getUserId())) {
    try {
      await chamar({ acao: 'boas_vindas' });
      await AsyncStorage.removeItem(BOAS_VINDAS_PENDENTE).catch(() => {});
    } catch { /* tenta de novo no próximo estado */ }
  }
  const [fila, enviado] = await Promise.all([lerFila(), AsyncStorage.getItem(HIST_KEY)]);
  const body: Record<string, unknown> = { acao: 'estado' };
  if (!enviado) body.historico = await historicoLocal();
  if (fila.length) body.pendentes = fila;
  const estado = await chamar<EstadoCartas>(body);
  // Só limpa o que foi enviado com sucesso.
  if (!enviado) await AsyncStorage.setItem(HIST_KEY, new Date().toISOString()).catch(() => {});
  if (fila.length) await AsyncStorage.removeItem(FILA_KEY).catch(() => {});
  void medirRecebidas(estado.a_raspar);
  return estado;
}

// Medição: `carta_recebida` uma vez por carta, quando ela aparece para raspar (toda
// carta nasce de algo feito no app, então passa por aqui). Ids já enviados no aparelho.
const RECEBIDAS_KEY = 'mx:cartas_recebidas';
async function medirRecebidas(lista: EstadoCartas['a_raspar']) {
  if (!lista?.length) return;
  try {
    const raw = await AsyncStorage.getItem(RECEBIDAS_KEY);
    const vistos: string[] = raw ? JSON.parse(raw) : [];
    const novas = lista.filter((c) => !vistos.includes(c.id));
    if (!novas.length) return;
    for (const c of novas) trackFora('carta_recebida', { origem: c.origem, tipo: c.tipo ?? null, motivo: c.motivo ?? null });
    await AsyncStorage.setItem(RECEBIDAS_KEY, JSON.stringify([...vistos, ...novas.map((c) => c.id)].slice(-200)));
  } catch {}
}

/**
 * Marca a conta nas regras novas — no cadastro, ANTES de salvar o scan do cadastro (o
 * gatilho do scan já toma o caminho novo). Tenta algumas vezes, cada uma com prazo curto,
 * sem nunca travar o cadastro: se ainda assim falhar, o próximo `estadoCartas()` marca
 * (toda chamada leva `regras: 2`). Devolve se marcou.
 */
export async function marcarRegrasCartas(tentativas = 3, prazoMs = 3000): Promise<boolean> {
  for (let i = 0; i < tentativas; i++) {
    try {
      await Promise.race([
        chamar({ acao: 'regras' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('tempo')), prazoMs)),
      ]);
      return true;
    } catch (e) {
      console.warn(`[cartas] marcar regras novas falhou (tentativa ${i + 1}):`, String((e as Error)?.message ?? e));
      if (i < tentativas - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return false;
}

/**
 * Registra o skincare concluído no servidor (regras novas): devolve a carta do dia (1º
 * skincare de hoje) OU os pontos do skincare sem carta. Sem internet, guarda na fila (o
 * servidor aceita até 48 h depois) e devolve null — a próxima `estadoCartas()` envia.
 */
export async function concluirRotina(periodo: RoutinePeriod): Promise<{ sequencia: Record<string, any>; carta: CartaGanha | null; pontos: PontosGanhos | null } | null> {
  try {
    const r = await chamar<{ sequencia: Record<string, any>; carta: CartaGanha | null; pontos: PontosGanhos | null }>({ acao: 'concluir_rotina', periodo });
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
  estadoEmVoo = null; // uma leitura já em andamento pode ser de antes da mudança
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
  /** NIKS Points que a carta deu ao ser raspada. */
  pontos: number | null;
  carta: CartaCatalogo;
  poder: PoderRow | null;
};

export async function buscarColecao(): Promise<ItemColecao[]> {
  const uid = await getUserId();
  if (!uid) throw new Error('sem sessão');
  const { data, error } = await supabase
    .from('cartas_usuario')
    .select('id, origem, dia, raspada_em, conteudo, pontos, carta:cartas_catalogo(id, codigo, familia, subtipo, serie, nome, raridade, arte_path, texto, efeito), poder:poderes_usuario(id, tipo, inicio, fim, consumido_em, dados)')
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
  carta_extra: { nome: 'Carta extra', efeito: 'Amanhã você ganha 1 carta a mais', icone: 'M12 5v14M5 12h14' },
  scan_antecipado: { nome: 'Scan antecipado', efeito: 'Seu próximo scan já está liberado', icone: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 12h8' },
  pontos_dobro: { nome: 'Pontos em dobro', efeito: 'Por 2 dias, todos os seus pontos valem o dobro', icone: 'M12 3l2.3 6.2L21 9.6l-5.2 4.3L17.6 21 12 17.3 6.4 21l1.8-7.1L3 9.6l6.7-.4z' },
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
  return ({ rotina: 'Carta do dia', marco: 'Carta rara', surpresa: 'Carta surpresa', sos: 'SOS espinha', grupo: 'Carta do grupo', scan_rosto: 'Carta do scan', checkin_grupo: 'Carta do grupo', produto_grupo: 'Carta do grupo', volta: 'Carta de volta', campea: 'Campeã da semana', missoes: 'Missões concluídas' } as Record<string, string>)[origem] ?? 'Carta do dia';
}

export async function cartaDetalhe(id: string): Promise<CartaGanha> {
  return (await chamar<{ carta: CartaGanha }>({ acao: 'carta', id })).carta;
}

export async function rasparCarta(id: string): Promise<{ carta: CartaGanha; poder: Poder | null; pontos: PontosRaspados | null; vencida?: boolean }> {
  const r = await chamar<{ carta: CartaGanha; poder: Poder | null; pontos?: PontosRaspados | null; vencida?: boolean }>({ acao: 'raspar', id });
  await invalidarCartas();
  // Regras novas: a carta de outro dia venceu às 04:00 (não raspa, não dá pontos).
  if (r.vencida) return { carta: r.carta, poder: null, pontos: null, vencida: true };
  const p = r.pontos;
  if (p) {
    // Medição (o que traz ela de volta): a carta, a subida de nível e a recompensa da semana 1.
    const c = r.carta?.carta;
    trackFora('carta_raspada', {
      pontos: p.ganhos, rara: p.rara, origem: r.carta?.origem ?? null,
      tipo: c ? `${c.familia}${c.subtipo ? `:${c.subtipo}` : ''}` : null,
    });
    if (p.nivel > p.nivel_antes) trackFora('nivel_subiu', { nivel: p.nivel, origem: 'carta' });
    if (p.semana1) trackFora('semana1_recompensa', { dia: p.semana1.dia, tipo: p.semana1.tipo, fallback: !!p.semana1.fallback });
  }
  return { ...r, pontos: p ?? null };
}

/** Ela viu a celebração do nível `nivel` (subida ou retroativo): o servidor para de pedir. */
export async function marcarNivelVisto(nivel: number): Promise<void> {
  try {
    await chamar({ acao: 'nivel_visto', nivel });
  } finally {
    await invalidarCartas();
  }
}

/** 1234 → '1.234' (pontos sempre no formato brasileiro). */
export function fmtPontos(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
