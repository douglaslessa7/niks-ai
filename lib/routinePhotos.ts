// ─────────────────────────────────────────────────────────────────────────────
// "Foto do dia" (designs 45b/45c): foto opcional do rosto ao concluir a rotina da
// manhã. Vai para o bucket privado `routine-photos` ({user_id}/{AAAA-MM-DD}.jpg) +
// uma linha em `routine_photos` (uma por dia — refazer no dia substitui).
// As fotos formam o antes/depois ("seu vídeo"), liberado depois de JOURNEY_DAYS
// dias contados da PRIMEIRA foto. Até lá o app não mostra as fotos antigas.
// Migration: supabase/migrations/20261001120000_create_routine_photos.sql.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { dateKey, sessionDate } from './routineProgress';

export const JOURNEY_DAYS = 30;

const BUCKET = 'routine-photos';

function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

// Em que dia da jornada a foto de HOJE cai: dia 1 = data da primeira foto (ou hoje,
// se ainda não há nenhuma). `left` = dias que faltam para liberar o vídeo.
export async function getPhotoJourney(userId: string, now: Date = new Date()): Promise<{ day: number; left: number }> {
  const today = sessionDate(now);
  try {
    const { data } = await supabase
      .from('routine_photos')
      .select('taken_on')
      .eq('user_id', userId)
      .order('taken_on', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.taken_on) {
      const [y, m, d] = String(data.taken_on).split('-').map(Number);
      const day = daysBetween(new Date(y, m - 1, d), today) + 1;
      return { day, left: Math.max(0, JOURNEY_DAYS - day) };
    }
  } catch {
    // sem tabela/sem rede: trata como o primeiro dia
  }
  return { day: 1, left: JOURNEY_DAYS - 1 };
}

// Sobe a foto (JPEG em base64) e registra o dia. Lança em caso de erro — quem chama
// decide o que fazer (a rotina já está concluída de qualquer jeito).
export async function saveRoutinePhoto(userId: string, base64: string, now: Date = new Date()): Promise<void> {
  const day = dateKey(sessionDate(now));
  const path = `${userId}/${day}.jpg`;
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: true });
  if (upErr) throw upErr;
  const { error: rowErr } = await supabase
    .from('routine_photos')
    .upsert({ user_id: userId, taken_on: day, image_path: path }, { onConflict: 'user_id,taken_on' });
  if (rowErr) throw rowErr;
}
