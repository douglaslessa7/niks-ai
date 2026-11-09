// ─────────────────────────────────────────────────────────────────────────────
// "Foto do dia" (designs 45b/45c): foto opcional do rosto ao concluir a rotina da
// manhã. Vai para o bucket privado `routine-photos` ({user_id}/{AAAA-MM-DD}.jpg) +
// uma linha em `routine_photos` (uma por dia — refazer no dia substitui).
// Migration: supabase/migrations/20261001120000_create_routine_photos.sql.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { dateKey, sessionDate } from './routineProgress';

const BUCKET = 'routine-photos';

// Já existe Foto do dia hoje (sessão-do-dia)? Usado pelo "Iniciar skincare" da home: a foto
// do check-in vale como Foto do dia, mas a PRIMEIRA do dia vale (a da noite não troca a da
// manhã). Sem rede, responde `true` — na dúvida, não sobrescreve.
export async function temFotoDoDia(userId: string, now: Date = new Date()): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('routine_photos')
      .select('taken_on')
      .eq('user_id', userId)
      .eq('taken_on', dateKey(sessionDate(now)))
      .maybeSingle();
    if (error) return true;
    return Boolean(data);
  } catch {
    return true;
  }
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
