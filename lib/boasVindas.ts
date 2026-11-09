// ─────────────────────────────────────────────────────────────────────────────
// Boas-vindas pós-pagamento (07/nov/2026, design "NiksBoasVindas", telas 1–9 do Claude
// Design; a 10 ficou de fora a pedido do produto). Compra confirmada e SEM conta → as 8
// telas `(onboarding)/bv-*` → cadastro → tela de espera → home.
//
// A conta ainda não existe nessas telas, então o que ela faz fica guardado aqui (memória +
// o registro da compra pendente, que sobrevive a fechar o app):
//   • a FOTO DE PARTIDA (tela 3) — arquivo no cache do app com o prefixo `scan-compra-`,
//     apagado junto com a foto do scan;
//   • quando ela SELOU O PACTO (tela 5).
// Depois do cadastro, a tela de espera chama `concluirBoasVindas`: a foto vira a Foto do
// dia 1 (bucket `routine-photos`) e a foto de perfil (`users.foto_home_url`, se ainda não
// houver uma), e o servidor credita os +100 NIKS
// Points (Nível 2) e a sequência de 1 dia (`cartas` → `boas_vindas`, migration
// 20261114120000). Sem rede, fica marcado e o próximo `estadoCartas()` tenta de novo.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { atualizarCompraPendente, type CompraPendente } from './compraPendente';
import { BOAS_VINDAS_PENDENTE, chamarCartas, invalidarCartas } from './cartasServidor';
import { saveRoutinePhoto } from './routinePhotos';
import { supabase } from './supabase';
import { invalidateCache } from './cache';
import { uploadScanPhoto } from '../store/onboarding';

type Estado = { fotoUri: string | null; pactoEm: string | null };
const estado: Estado = { fotoUri: null, pactoEm: null };
/** Lembrete do 1º skincare (tela 7). Por enquanto só visual — ver o README. */
let lembrete = true;

export function boasVindasAtual(): Estado & { lembrete: boolean } {
  return { ...estado, lembrete };
}

export function setLembreteBoasVindas(v: boolean) {
  lembrete = v;
}

/** Tela 3: guarda a foto de partida (JPEG em base64, já reduzida). */
export async function registrarFotoPartida(base64: string): Promise<string | null> {
  try {
    if (estado.fotoUri) {
      try { new File(estado.fotoUri).delete(); } catch { /* segue */ }
    }
    const f = new File(Paths.cache, `scan-compra-partida-${Date.now()}.jpg`);
    f.write(base64, { encoding: 'base64' });
    estado.fotoUri = f.uri;
    await atualizarCompraPendente({ boasVindas: { ...estado } });
    return f.uri;
  } catch (e) {
    console.warn('[boasVindas] não guardou a foto de partida:', e);
    return null;
  }
}

/** Tela 5: pacto selado. */
export async function selarPacto() {
  estado.pactoEm = new Date().toISOString();
  await atualizarCompraPendente({ boasVindas: { ...estado } });
}

/**
 * A foto de partida vira a foto de perfil (`users.foto_home_url`), para ela não entrar no
 * app sem foto. Nunca substitui uma foto que já exista: a tela de espera pode rodar de novo.
 */
async function usarComoFotoDePerfil(uid: string, base64: string) {
  try {
    const { data, error } = await supabase.from('users').select('foto_home_url').eq('id', uid).maybeSingle();
    if (error) throw error;
    if (data?.foto_home_url) return;
    const url = await uploadScanPhoto(uid, base64, 'home_');
    const { error: e2 } = await supabase.from('users').update({ foto_home_url: url }).eq('id', uid).is('foto_home_url', null);
    if (e2) throw e2;
    invalidateCache(`home:${uid}`);
    invalidateCache(`progresso:${uid}`);
    invalidateCache(`perfil:${uid}`);
  } catch (e) {
    console.warn('[boasVindas] foto de perfil não salva:', e);
  }
}

/** Depois do cadastro (tela de espera), ANTES de apagar o registro da compra. Nunca lança. */
export async function concluirBoasVindas(uid: string, reg: CompraPendente | null) {
  const bv = reg?.boasVindas ?? estado;
  if (!bv?.pactoEm) return;

  if (bv.fotoUri) {
    try {
      const f = new File(bv.fotoUri);
      if (f.exists) {
        const base64 = await f.base64();
        await saveRoutinePhoto(uid, base64).catch((e) => console.warn('[boasVindas] foto de partida não subiu:', e));
        await usarComoFotoDePerfil(uid, base64);
      }
    } catch (e) {
      console.warn('[boasVindas] foto de partida não subiu:', e);
    }
  }

  for (let i = 0; i < 2; i++) {
    try {
      await chamarCartas({ acao: 'boas_vindas' });
      await AsyncStorage.removeItem(BOAS_VINDAS_PENDENTE).catch(() => {});
      await invalidarCartas();
      return;
    } catch (e) {
      console.warn(`[boasVindas] pontos não creditados (tentativa ${i + 1}):`, e);
    }
  }
  // Sem rede agora: o próximo estado das cartas tenta de novo (ver `estadoCartas`).
  await AsyncStorage.setItem(BOAS_VINDAS_PENDENTE, uid).catch(() => {});
}
