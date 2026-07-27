// ─────────────────────────────────────────────────────────────────────────────
// Progresso da rotina de skincare — fonte de verdade COMPARTILHADA entre a
// cerimônia (protocolo.tsx) e o card "Cuidados diários" da home.
// Guardado em AsyncStorage, por sessão-do-dia + período (am/pm), como lista de
// índices de passos concluídos. Reseta sozinho a cada nova sessão (chave muda).
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
function sessionDateStr(now: Date): string {
  const shifted = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
