import { useAcesso } from './acesso';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ANDROID_CHANNEL_ID } from './notifications';
import { supabase } from './supabase';
import { dateKey, getRoutineHistory, sessionDate, type RoutineHistory, type RoutinePeriod } from './routineProgress';
import { chaveEstado, type EstadoCartas } from './cartasServidor';
import { readCache } from './cache';
import { peekUserId } from './currentUser';

// ─────────────────────────────────────────────────────────────────────────────
// Lembretes da rotina — notificações LOCAIS, agendadas no próprio aparelho a partir
// do horário que ela escolheu (`users.rotina_manha_horario` / `rotina_noite_horario`:
// tela "Horário da rotina" do onboarding, editável no Alarme). Como a hora é do relógio
// do aparelho, o fuso é sempre o dela. Local (e não do servidor) porque funciona sem
// internet e não depende do push_token.
//
//   • "hora" (manhã e noite, DIÁRIO) — chegou a hora:
//       "☀️ Bom dia! / Hora da sua rotina de skincare matinal."
//       "🌙 Boa noite! / Não esqueça sua rotina de skincare noturna antes de dormir."
//   • "ainda dá tempo" (fase 2 da gamificação, nov/2026) — UM por dia, 1 h depois do
//     horário da NOITE, só nos dias em que ela não fez NENHUMA rotina, com a sequência
//     que acaba naquele dia: "Sua sequência de 6 dias acaba hoje 🔥 / Faça seu skincare
//     antes de dormir." (sem sequência — 0 ou 1 — "Ainda dá tempo! 🔥" sem número).
//     O da manhã saiu. Agendado dia a dia (próximos DAYS_AHEAD); o número só vai em hoje
//     e amanhã (`sequenciaEmRisco`): para chegar a depois de amanhã sem abrir o app ela
//     já perdeu a sequência.
//   • ~~"carta misteriosa"~~ — REMOVIDA em 12/nov/2026 (build 1.62): a Carta de volta é
//     surpresa, sem aviso. Só a faxina sobrou: cancela a que uma versão anterior deixou
//     agendada (`niks-volta-…`); um toque numa que já tenha disparado ainda abre a carta
//     (lib/pushToque.ts → components/ToquePush.tsx).
// O dia é a "sessão-do-dia" de lib/routineProgress (a noite que passa da meia-noite
// conta para o dia em que começou) — a mesma chave do histórico.
//
// Quem chama: a home (a cada carga dos dados), o Alarme (ao salvar um horário, via
// `syncRoutineReminders`) e a rotina concluída (`reagendarLembretes`, protocolo.tsx:
// some o "ainda dá tempo" de hoje e a carta misteriosa, e o de amanhã ganha o número).
// O logout cancela. Só agenda com a permissão dada. Nada é reagendado se já está
// agendado igual (assinatura em `data.sig`).
//
// ⚠️ Os jobs `morning-routine` / `night-routine` do pg_cron (push fixo às 7h/21h para
// todo mundo, Edge Function `send-notifications`) precisam ficar DESLIGADOS, senão ela
// recebe os dois. Ver README → "Push Notifications".
// ─────────────────────────────────────────────────────────────────────────────

export type { RoutinePeriod };
type Kind = 'hora' | 'depois';

const ID_PREFIX = 'niks-rotina-';
// Prefixo próprio: a faxina de `niks-rotina-` não pode apagar a carta misteriosa.
const VOLTA_PREFIX = 'niks-volta-';
const PERIOD_ID: Record<RoutinePeriod, string> = { am: 'manha', pm: 'noite' };
const LATE_OFFSET_MIN = 60;
const DAYS_AHEAD = 7;
const HORARIOS_KEY = 'lembretes:horarios';

const dailyId = (period: RoutinePeriod) => `${ID_PREFIX}${PERIOD_ID[period]}`;
const lateId = (day: string) => `${ID_PREFIX}noite-depois-${day}`;
// "1 hora antes" agendado por versões anteriores (diário, repetia para sempre).
const LEGACY_IDS = [`${ID_PREFIX}manha-antes`, `${ID_PREFIX}noite-antes`];

export function routineReminderContent(period: RoutinePeriod, kind: Kind = 'hora', sequencia = 0) {
  if (kind === 'depois') {
    return sequencia >= 2
      ? { title: `Sua sequência de ${sequencia} dias acaba hoje 🔥`, body: 'Faça seu skincare antes de dormir.' }
      : { title: 'Ainda dá tempo! 🔥', body: 'Faça seu skincare antes de dormir 🌙' };
  }
  // Textos do antigo push do servidor (`send-notifications`, 7h/21h fixos — desligado
  // em out/2026), agora no horário DELA (pedido do produto).
  return period === 'am'
    ? { title: '☀️ Bom dia!', body: 'Hora da sua rotina de skincare matinal.' }
    : { title: '🌙 Boa noite!', body: 'Não esqueça sua rotina de skincare noturna antes de dormir.' };
}

const LEMBRETE_CONVIDADA = { title: 'Hora do skincare!', body: 'Faça seu check-in no grupo.' };


type Slot = { minutes: number };
type Scheduled = Awaited<ReturnType<typeof Notifications.getAllScheduledNotificationsAsync>>;

async function upsert(scheduled: Scheduled, identifier: string, content: { title: string; body?: string }, data: Record<string, unknown>, trigger: Notifications.NotificationTriggerInput) {
  const sig = `${JSON.stringify(trigger)}|${content.title}|${content.body ?? ''}`;
  if (scheduled.some((n) => n.identifier === identifier && n.content.data?.sig === sig)) return;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { ...content, sound: 'default', data: { type: 'routine_reminder', ...data, sig } },
    trigger,
  });
}

const fezNoDia = (hist: RoutineHistory, day: string) => !!(hist[day]?.am || hist[day]?.pm);
const somaDias = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
};

/**
 * A sequência que acaba em cada dia sem rotina: { hoje, amanhã }. Do servidor (estado em
 * cache), corrigido pelo histórico do celular quando a rotina de hoje ainda não subiu.
 */
function sequenciaEmRisco(hist: RoutineHistory, hoje: string, estado: EstadoCartas | null) {
  const ontem = somaDias(hoje, -1);
  let atual = estado?.sequencia.atual ?? 0;
  let ultimo = estado?.sequencia.ultimo_dia ?? null;
  if (!estado) {
    // Sem o servidor: dias seguidos com rotina no celular, terminando hoje ou ontem.
    let d = fezNoDia(hist, hoje) ? hoje : ontem;
    ultimo = fezNoDia(hist, d) ? d : null;
    atual = 0;
    while (fezNoDia(hist, d)) { atual++; d = somaDias(d, -1); }
  } else if (fezNoDia(hist, hoje) && ultimo === ontem) {
    atual += 1; ultimo = hoje; // fez hoje sem internet
  }
  return { hoje: ultimo === ontem ? atual : 0, amanha: ultimo === hoje ? atual : 0 };
}

async function estadoEmCache(): Promise<EstadoCartas | null> {
  const uid = peekUserId();
  if (!uid) return null;
  return (await readCache<EstadoCartas>(chaveEstado(uid)).catch(() => null))?.data ?? null;
}

/**
 * Agenda (ou reagenda) os lembretes. `minutes` = minutos desde 0h (07:30 → 450).
 * Não mexe no que já está agendado igual — a home chama isto a cada carga.
 */
export async function scheduleRoutineReminders(slots: Record<RoutinePeriod, Slot>): Promise<void> {
  try {
    await AsyncStorage.setItem(HORARIOS_KEY, JSON.stringify(slots)).catch(() => {});
    // O "1 hora antes" saiu: some do aparelho mesmo sem permissão (aí nada mais é agendado).
    await Promise.all(LEGACY_IDS.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const [scheduled, histLocal, estado] = await Promise.all([
      Notifications.getAllScheduledNotificationsAsync(),
      getRoutineHistory(),
      estadoEmCache(),
    ]);
    const wanted = new Set<string>();
    const now = new Date();
    const hoje = dateKey(sessionDate(now));
    // Feito = no celular OU no servidor (rotina registrada por outro aparelho / reinstalação).
    const hist: RoutineHistory = { ...histLocal };
    const doServidor = [estado?.sequencia.ultimo_dia, estado?.rotina_hoje && estado.hoje === hoje ? hoje : null];
    for (const d of doServidor) if (d && !fezNoDia(hist, d)) hist[d] = { ...hist[d], am: 1 };
    const risco = sequenciaEmRisco(hist, hoje, estado);

    const convidada = useAcesso.getState().estado === 'convidada';
    // "hora": diário, manhã e noite.
    for (const period of ['am', 'pm'] as const) {
      const { minutes } = slots[period];
      wanted.add(dailyId(period));
      await upsert(
        scheduled, dailyId(period), convidada ? LEMBRETE_CONVIDADA : routineReminderContent(period, 'hora'), { period, kind: 'hora' },
        { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: Math.floor(minutes / 60) % 24, minute: minutes % 60, channelId: ANDROID_CHANNEL_ID },
      );
    }

    // "ainda dá tempo": 1 h depois da noite, só nos dias sem nenhuma rotina.
    const pm = slots.pm.minutes;
    for (let i = 0; !convidada && i <= DAYS_AHEAD; i++) {
      const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 0, pm + LATE_OFFSET_MIN);
      if (fire.getTime() <= now.getTime() + 30_000) continue;
      const day = dateKey(sessionDate(fire));
      if (fezNoDia(hist, day)) continue;
      const seq = day === hoje ? risco.hoje : day === somaDias(hoje, 1) ? risco.amanha : 0;
      const id = lateId(day);
      wanted.add(id);
      await upsert(
        scheduled, id, routineReminderContent('pm', 'depois', seq), { period: 'pm', kind: 'depois', day, sequencia: seq },
        { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire, channelId: ANDROID_CHANNEL_ID },
      );
    }

    // Carta misteriosa (12:30 do dia da Carta de volta): REMOVIDA em 12/nov/2026 (build 1.62,
    // pedido do produto) — a Carta de volta é surpresa: aparece sozinha ao voltar para a home
    // ou no fim do fluxo do skincare, sem aviso. Nada é agendado; a faxina abaixo cancela a
    // que uma versão anterior tenha deixado agendada (prefixo `niks-volta-`, fora de `wanted`).

    // Tudo nosso que não é mais esperado: "ainda dá tempo" de um horário antigo, de um
    // dia já feito ou da manhã (saiu), a carta misteriosa de outra ausência, e qualquer
    // lembrete de versão anterior (ex.: o "1 hora antes").
    await Promise.all(
      scheduled
        .filter((n) => (n.identifier.startsWith(ID_PREFIX) || n.identifier.startsWith(VOLTA_PREFIX)) && !wanted.has(n.identifier))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
  } catch (e) {
    console.warn('[routineReminders] falha ao agendar:', e);
  }
}

/**
 * Ela concluiu uma rotina: tira na hora o "ainda dá tempo" de hoje e a carta
 * misteriosa e reagenda com os últimos horários (sem rede) — o de amanhã ganha o número.
 */
export async function reagendarLembretes(now: Date = new Date()): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(lateId(dateKey(sessionDate(now)))).catch(() => {});
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => [] as Scheduled);
  await Promise.all(scheduled.filter((n) => n.identifier.startsWith(VOLTA_PREFIX))
    .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
  const slots = await AsyncStorage.getItem(HORARIOS_KEY).then((v) => (v ? JSON.parse(v) : null)).catch(() => null);
  if (slots?.am && slots?.pm) await scheduleRoutineReminders(slots);
}

const DEFAULT_MINUTES: Record<RoutinePeriod, number> = { am: 7 * 60, pm: 21 * 60 };

/** 'HH:MM[:SS]' (coluna `time`) → minutos desde 0h. */
function toMinutes(v: unknown, fallback: number): number {
  const m = typeof v === 'string' ? v.match(/^(\d{1,2}):(\d{2})/) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

/** Lê os horários do banco e reagenda — para quem não os tem à mão (Alarme). */
export async function syncRoutineReminders(uid: string): Promise<void> {
  const { data: u, error } = await supabase
    .from('users').select('rotina_manha_horario, rotina_noite_horario').eq('id', uid).maybeSingle();
  if (error) return;
  await scheduleRoutineReminders({
    am: { minutes: toMinutes(u?.rotina_manha_horario, DEFAULT_MINUTES.am) },
    pm: { minutes: toMinutes(u?.rotina_noite_horario, DEFAULT_MINUTES.pm) },
  });
}

/** Cancela todos os lembretes da rotina e a carta misteriosa (logout / conta apagada). */
export async function cancelRoutineReminders(): Promise<void> {
  await AsyncStorage.removeItem(HORARIOS_KEY).catch(() => {});
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => [] as Scheduled);
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX) || n.identifier.startsWith(VOLTA_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
  );
}
