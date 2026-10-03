// ─────────────────────────────────────────────────────────────────────────────
// Progresso da rotina de skincare.
//   • Passos concluídos — gravados pela cerimônia (protocolo.tsx), por
//     sessão-do-dia + período (am/pm), como lista de índices.
//   • Rotinas concluídas — `markRoutineDone` grava quando a cerimônia chega ao
//     último passo. É o que alimenta a sequência e a semana da home (design 38e).
// Guardado em AsyncStorage (por aparelho). Reseta sozinho a cada nova sessão.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';

export type RoutinePeriod = 'am' | 'pm';

// Regra de horário definida pelo produto:
//   04:00–17:59 → "Skincare matinal" (am)
//   18:00–03:59 → "Skincare noturno" (pm)
export function getRoutinePeriodForNow(date: Date = new Date()): RoutinePeriod {
  const h = date.getHours();
  return h >= 4 && h < 18 ? 'am' : 'pm';
}

export function periodLabel(period: RoutinePeriod): string {
  return period === 'am' ? 'Skincare matinal' : 'Skincare noturno';
}

// "Sessão-do-dia": deslocamos o relógio em 4h para que a noite (18:00→03:59) que
// cruza a meia-noite continue pertencendo à MESMA sessão (mesma data-chave).
export function sessionDate(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sessionDateStr(now: Date): string {
  return dateKey(sessionDate(now));
}

function keyFor(period: RoutinePeriod, now: Date = new Date()): string {
  return `routine_done:${sessionDateStr(now)}:${period}`;
}

// Índices de passos concluídos na sessão atual do período.
export async function getCompletedSteps(period: RoutinePeriod): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(period));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

// Marca um passo (por índice) como concluído. Idempotente.
export async function markStepCompleted(period: RoutinePeriod, index: number): Promise<void> {
  try {
    const cur = await getCompletedSteps(period);
    if (!cur.includes(index)) {
      await AsyncStorage.setItem(keyFor(period), JSON.stringify([...cur, index]));
    }
  } catch {
    // silencioso — progresso é best-effort, nunca deve quebrar a UI
  }
}

// ── Fluxo do "Iniciar rotina" em andamento (designs 45a–45c) ──────────────────
// Etapa (checklist / guia / foto do dia) + produtos marcados + passo do guia, por
// sessão-do-dia e período. Se a tela for recriada ou o iOS matar o app no meio (a
// câmera pesa na memória), a rotina reabre onde parou. `open` diz se o fluxo
// estava aberto: fechar no X guarda o progresso mas não reabre sozinho.
// Uma chave só, que guarda apenas o dia atual — um dia novo descarta o anterior.
export type RoutineFlowStep = 'check' | 'guide' | 'cam';
export type RoutineFlowState = { step: RoutineFlowStep; open: boolean; lit: number[]; run: number };
type RoutineFlowStore = { day: string; am?: RoutineFlowState; pm?: RoutineFlowState };
const FLOW_KEY = 'routine_flow';

async function readFlowStore(now: Date): Promise<RoutineFlowStore> {
  const day = sessionDateStr(now);
  try {
    const raw = await AsyncStorage.getItem(FLOW_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && obj.day === day ? obj : { day };
  } catch {
    return { day };
  }
}

export async function getRoutineFlow(period: RoutinePeriod, now: Date = new Date()): Promise<RoutineFlowState | null> {
  await flowWrites; // lê depois das gravações pendentes
  const s = (await readFlowStore(now))[period];
  if (!s || !['check', 'guide', 'cam'].includes(s.step)) return null;
  return {
    step: s.step,
    open: !!s.open,
    lit: Array.isArray(s.lit) ? s.lit.filter((n) => typeof n === 'number') : [],
    run: typeof s.run === 'number' ? s.run : 0,
  };
}

// Gravações em fila: marcar um produto e tocar no X logo em seguida dispara duas
// escritas (ler-alterar-gravar); fora de ordem, o "aberto" poderia vencer o "fechado"
// e o fluxo reabriria sozinho na próxima vez.
let flowWrites: Promise<void> = Promise.resolve();
function queueFlowWrite(fn: () => Promise<void>): Promise<void> {
  flowWrites = flowWrites.then(fn).catch(() => {}); // best-effort, igual ao progresso de passos
  return flowWrites;
}

export function saveRoutineFlow(period: RoutinePeriod, state: RoutineFlowState, now: Date = new Date()): Promise<void> {
  return queueFlowWrite(async () => {
    const store = await readFlowStore(now);
    await AsyncStorage.setItem(FLOW_KEY, JSON.stringify({ ...store, [period]: state }));
  });
}

export function clearRoutineFlow(period: RoutinePeriod, now: Date = new Date()): Promise<void> {
  return queueFlowWrite(async () => {
    const store = await readFlowStore(now);
    delete store[period];
    await AsyncStorage.setItem(FLOW_KEY, JSON.stringify(store));
  });
}

// ── Rotinas concluídas (histórico) ────────────────────────────────────────────
// Um mapa só, `{ 'AAAA-MM-DD': { am?: ms, pm?: ms } }`, chaveado pela sessão-do-dia
// (a noite que termina às 01:00 conta para o dia em que começou).
export type RoutineHistory = Record<string, { am?: number; pm?: number }>;
const HISTORY_KEY = 'routine_history';

export async function getRoutineHistory(): Promise<RoutineHistory> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

// Chamado quando a cerimônia conclui o ÚLTIMO passo do período. Idempotente:
// refazer a rotina no mesmo dia mantém o primeiro horário.
export async function markRoutineDone(period: RoutinePeriod, now: Date = new Date()): Promise<void> {
  try {
    const hist = await getRoutineHistory();
    const k = sessionDateStr(now);
    const day = hist[k] ?? {};
    if (day[period]) return;
    hist[k] = { ...day, [period]: now.getTime() };
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
  } catch {
    // best-effort, igual ao progresso de passos
  }
}

// Quantas rotinas (0, 1 ou 2) foram feitas na sessão-do-dia `d`.
export function routinesDoneOn(hist: RoutineHistory, d: Date): number {
  const day = hist[dateKey(d)];
  return (day?.am ? 1 : 0) + (day?.pm ? 1 : 0);
}

// Um dia vale ponto na sequência quando a usuária conclui QUALQUER uma das rotinas
// (manhã ou noite) na sessão-do-dia — não precisa das duas.
export function dayEarnsStreak(hist: RoutineHistory, d: Date): boolean {
  const day = hist[dateKey(d)];
  return !!day?.am || !!day?.pm;
}

// Sequência = dias seguidos que valeram ponto. Hoje só entra depois de ganhar o ponto;
// enquanto não, a sequência vem até ontem (não zera no meio do dia).
export function routineStreak(hist: RoutineHistory, now: Date = new Date()): number {
  const d = sessionDate(now);
  if (!dayEarnsStreak(hist, d)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (dayEarnsStreak(hist, d)) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
