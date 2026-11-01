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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getRoutineHistory, type RoutinePeriod } from './routineProgress';

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
    return await chamar({ acao: 'concluir_rotina', periodo });
  } catch {
    const fila = await lerFila();
    if (!fila.some((p) => p.periodo === periodo && p.quando.slice(0, 10) === new Date().toISOString().slice(0, 10))) {
      fila.push({ periodo, quando: new Date().toISOString() });
      await AsyncStorage.setItem(FILA_KEY, JSON.stringify(fila.slice(-4))).catch(() => {});
    }
    return null;
  }
}

export async function cartaDetalhe(id: string): Promise<CartaGanha> {
  return (await chamar<{ carta: CartaGanha }>({ acao: 'carta', id })).carta;
}

export async function rasparCarta(id: string): Promise<{ carta: CartaGanha; poder: Poder | null }> {
  return chamar({ acao: 'raspar', id });
}
