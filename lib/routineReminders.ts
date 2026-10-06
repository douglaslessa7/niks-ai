import * as Notifications from 'expo-notifications';
import { ANDROID_CHANNEL_ID } from './notifications';
import { supabase } from './supabase';
import { dateKey, getRoutineHistory, sessionDate, type RoutinePeriod } from './routineProgress';

// ─────────────────────────────────────────────────────────────────────────────
// Lembretes da rotina (manhã e noite) — notificações LOCAIS, agendadas no próprio
// aparelho a partir do horário que ela escolheu (`users.rotina_manha_horario` /
// `rotina_noite_horario`: tela "Horário da rotina" do onboarding, editável no Alarme).
// Como a hora é do relógio do aparelho, o fuso é sempre o dela.
//
// DOIS lembretes por rotina (regra do produto) → 4 por dia. Ex.: rotina às 8h →
//   • 8h  "hora"   — chegou a hora (texto da prévia da tela "Aviso de lembretes")  (DIÁRIO)
//   • 9h  "depois" — ainda dá tempo de não perder a sequência
// O "1 hora antes" existiu e SAIU (out/2026): `LEGACY_IDS` + a limpeza de tudo que não
// é esperado tiram os que versões anteriores deixaram agendados no aparelho.
// O "depois" NÃO vai para quem já fez a rotina daquele período: ele é agendado dia a
// dia (próximos DAYS_AHEAD dias, pulando os já concluídos) e `cancelLateReminder`
// tira o de hoje quando ela conclui a rotina (protocolo.tsx). O dia é a
// "sessão-do-dia" de lib/routineProgress (a noite que passa da meia-noite conta para
// o dia em que começou) — a mesma chave do histórico.
// N = passos da rotina daquele período (`protocolos.rotina_am/pm`); sem rotina, 5.
//
// Quem chama: a home (a cada carga dos dados, que já trazem horários e passos) e o
// Alarme (ao salvar um horário, via `syncRoutineReminders`). O logout cancela. Só
// agenda com a permissão dada; sem ela não faz nada (tenta de novo na próxima carga
// da home). Nada é reagendado se já está agendado igual (assinatura em `data.sig`).
//
// ⚠️ Os jobs `morning-routine` / `night-routine` do pg_cron (push fixo às 7h/21h para
// todo mundo, Edge Function `send-notifications`) precisam ser DESLIGADOS, senão ela
// recebe os dois. Ver README → "Push Notifications".
// ─────────────────────────────────────────────────────────────────────────────

export type { RoutinePeriod };
type Kind = 'hora' | 'depois';

const ID_PREFIX = 'niks-rotina-';
const PERIOD_ID: Record<RoutinePeriod, string> = { am: 'manha', pm: 'noite' };
const DEFAULT_STEPS = 5;
const LATE_OFFSET_MIN = 60;
const DAYS_AHEAD = 7;

const dailyId = (period: RoutinePeriod) => `${ID_PREFIX}${PERIOD_ID[period]}`;
const lateId = (period: RoutinePeriod, day: string) => `${ID_PREFIX}${PERIOD_ID[period]}-depois-${day}`;
// "1 hora antes" agendado por versões anteriores (diário, repetia para sempre).
const LEGACY_IDS = [`${ID_PREFIX}manha-antes`, `${ID_PREFIX}noite-antes`];

export function routineReminderContent(period: RoutinePeriod, steps: number, kind: Kind = 'hora') {
  const n = steps > 0 ? steps : DEFAULT_STEPS;
  const name = period === 'am' ? 'da manhã' : 'da noite';
  const emoji = period === 'am' ? '☀️' : '🌙';
  const passos = n === 1 ? 'seu passo te espera' : `seus ${n} passos te esperam`;
  if (kind === 'depois') {
    return { title: 'Ainda dá tempo! 🔥', body: `Faça sua rotina ${name} agora e não perca sua sequência ${emoji}` };
  }
  return {
    title: `Hora da sua rotina ${name} ${emoji}`,
    body: `${passos.charAt(0).toUpperCase()}${passos.slice(1)}. Leva só 10 minutos ✨`,
  };
}

type Slot = { minutes: number; steps: number };
type Scheduled = Awaited<ReturnType<typeof Notifications.getAllScheduledNotificationsAsync>>;

async function upsert(scheduled: Scheduled, identifier: string, content: { title: string; body: string }, data: Record<string, unknown>, trigger: Notifications.NotificationTriggerInput) {
  const sig = `${JSON.stringify(trigger)}|${content.title}|${content.body}`;
  if (scheduled.some((n) => n.identifier === identifier && n.content.data?.sig === sig)) return;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { ...content, sound: 'default', data: { type: 'routine_reminder', ...data, sig } },
    trigger,
  });
}

/**
 * Agenda (ou reagenda) os lembretes. `minutes` = minutos desde 0h (07:30 → 450).
 * Não mexe no que já está agendado igual — a home chama isto a cada foco.
 */
export async function scheduleRoutineReminders(slots: Record<RoutinePeriod, Slot>): Promise<void> {
  try {
    // O "1 hora antes" saiu: some do aparelho mesmo sem permissão (aí nada mais é agendado).
    await Promise.all(LEGACY_IDS.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const [scheduled, hist] = await Promise.all([
      Notifications.getAllScheduledNotificationsAsync(),
      getRoutineHistory(),
    ]);
    const wanted = new Set<string>();
    const now = new Date();

    for (const period of ['am', 'pm'] as const) {
      const { minutes, steps } = slots[period];

      // "hora": diário.
      wanted.add(dailyId(period));
      await upsert(
        scheduled, dailyId(period), routineReminderContent(period, steps, 'hora'), { period, kind: 'hora' },
        { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: Math.floor(minutes / 60) % 24, minute: minutes % 60, channelId: ANDROID_CHANNEL_ID },
      );

      // "depois": um por dia, só nos dias em que a rotina ainda não foi feita.
      for (let i = 0; i <= DAYS_AHEAD; i++) {
        const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 0, minutes + LATE_OFFSET_MIN);
        if (fire.getTime() <= now.getTime() + 30_000) continue;
        const day = dateKey(sessionDate(fire));
        if (hist[day]?.[period]) continue;
        const id = lateId(period, day);
        wanted.add(id);
        await upsert(
          scheduled, id, routineReminderContent(period, steps, 'depois'), { period, kind: 'depois', day },
          { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire, channelId: ANDROID_CHANNEL_ID },
        );
      }
    }

    // Tudo da rotina que não é mais esperado: "depois" de um horário antigo ou de um dia
    // já concluído, e qualquer lembrete de versão anterior (ex.: o "1 hora antes").
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(ID_PREFIX) && !wanted.has(n.identifier))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
  } catch (e) {
    console.warn('[routineReminders] falha ao agendar:', e);
  }
}

/** Ela concluiu a rotina: tira o "ainda dá tempo" desta sessão-do-dia. */
export async function cancelLateReminder(period: RoutinePeriod, now: Date = new Date()): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(lateId(period, dateKey(sessionDate(now)))).catch(() => {});
}

const DEFAULT_MINUTES: Record<RoutinePeriod, number> = { am: 7 * 60, pm: 21 * 60 };

/** 'HH:MM[:SS]' (coluna `time`) → minutos desde 0h. */
function toMinutes(v: unknown, fallback: number): number {
  const m = typeof v === 'string' ? v.match(/^(\d{1,2}):(\d{2})/) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

/** Lê horários e passos do banco e reagenda — para quem não tem esses dados à mão (Alarme). */
export async function syncRoutineReminders(uid: string): Promise<void> {
  const [userRes, protoRes] = await Promise.all([
    supabase.from('users').select('rotina_manha_horario, rotina_noite_horario').eq('id', uid).maybeSingle(),
    supabase.from('protocolos').select('rotina_am, rotina_pm').eq('user_id', uid)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (userRes.error) return;
  const u = userRes.data;
  const p = protoRes.data;
  await scheduleRoutineReminders({
    am: { minutes: toMinutes(u?.rotina_manha_horario, DEFAULT_MINUTES.am), steps: Array.isArray(p?.rotina_am) ? p!.rotina_am.length : 0 },
    pm: { minutes: toMinutes(u?.rotina_noite_horario, DEFAULT_MINUTES.pm), steps: Array.isArray(p?.rotina_pm) ? p!.rotina_pm.length : 0 },
  });
}

/** Cancela todos os lembretes da rotina (logout / conta apagada). */
export async function cancelRoutineReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => [] as Scheduled);
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
  );
}
