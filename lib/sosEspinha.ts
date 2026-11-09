// SOS espinha (08/nov/2026): conversa com a função `sos-espinha` e guarda a última análise.
// A foto fica só na memória, entre a câmera e o fim do carregamento. A resposta fica só neste
// aparelho, por 24 h, separada por conta.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getAccessToken } from './sessionToken';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export type QuandoSos = 'agora' | 'manha' | 'noite';
export type DermatologistaSos = 'inflamada' | 'infeccao' | 'varias';

export type ProdutoSos = {
  colecao_id: string;
  nome: string;
  marca: string | null;
  como_usar: string;
  quando: QuandoSos;
  na_rotina: boolean;
};

export type AnaliseSos = {
  status: 'ok';
  produtos: ProdutoSos[];
  cuidados: string[];
  evitar: string[];
  dermatologista: DermatologistaSos | null;
  // Conversa de acompanhamento; null se o servidor não conseguiu criar.
  conversation_id?: string | null;
};

export type ResultadoSos = AnaliseSos | { status: 'precisa_foto' } | { status: 'limite' } | { status: 'erro' };

// A função espera até 30 s pelo Claude e ainda tenta a reserva.
const TEMPO_MAXIMO_MS = 70_000;
const VALIDADE_MS = 24 * 60 * 60 * 1000;

let foto: { base64: string; uri: string } | null = null;

export const guardarFoto = (base64: string, uri: string) => { foto = { base64, uri }; };
export const fotoAtual = () => foto;
export const limparFoto = () => { foto = null; };

export async function analisarEspinha(): Promise<ResultadoSos> {
  if (!foto) return { status: 'erro' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEMPO_MAXIMO_MS);
  try {
    const token = await getAccessToken();
    if (!token) return { status: 'erro' };
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/sos-espinha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ image: { base64: foto.base64, mimeType: 'image/jpeg' } }),
      signal: controller.signal,
    });
    if (resp.status === 429) return { status: 'limite' };
    if (!resp.ok) return { status: 'erro' };
    const data = await resp.json();
    if (data?.status === 'precisa_foto') return { status: 'precisa_foto' };
    if (data?.status === 'ok' && Array.isArray(data.cuidados)) return data as AnaliseSos;
    return { status: 'erro' };
  } catch {
    return { status: 'erro' };
  } finally {
    clearTimeout(timer);
  }
}

const chave = async () => {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  return uid ? `sos_espinha_ultima_${uid}` : null;
};

export async function salvarUltimaAnalise(analise: AnaliseSos): Promise<void> {
  try {
    const k = await chave();
    if (k) await AsyncStorage.setItem(k, JSON.stringify({ em: Date.now(), analise }));
  } catch {}
}

/** A última análise desta conta neste aparelho, se tiver menos de 24 h. */
export async function lerUltimaAnalise(): Promise<AnaliseSos | null> {
  try {
    const k = await chave();
    if (!k) return null;
    const bruto = await AsyncStorage.getItem(k);
    if (!bruto) return null;
    const { em, analise } = JSON.parse(bruto);
    if (typeof em !== 'number' || Date.now() - em >= VALIDADE_MS) {
      await AsyncStorage.removeItem(k);
      return null;
    }
    return analise as AnaliseSos;
  } catch {
    return null;
  }
}
