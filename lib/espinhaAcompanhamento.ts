// Acompanhamento da espinha (nov/2026): o balão sobre a navbar e o convite de retorno.
// Quem decide se há convite é o servidor (12 h / 24 h, ver a migration
// 20261117120000_espinha_acompanhamento.sql); aqui só perguntamos ao abrir o app.
import { create } from 'zustand';
import { getAccessToken } from './sessionToken';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
export const URL_SOS_ESPINHA = `${SUPABASE_URL}/functions/v1/sos-espinha`;

export const TEXTO_BALAO_DUVIDA = 'Ficou com dúvida? Continue o acompanhamento da sua espinha aqui.';

export type BalaoEspinha = { conversationId: string; texto: string; tipo: 'duvida' | 'retorno' };

export const useBalaoEspinha = create<{
  balao: BalaoEspinha | null;
  mostrar: (b: BalaoEspinha) => void;
  fechar: () => void;
}>((set) => ({
  balao: null,
  mostrar: (balao) => set({ balao }),
  fechar: () => set({ balao: null }),
}));

async function chamar(corpo: object): Promise<any | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const r = await fetch(URL_SOS_ESPINHA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(corpo),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const INTERVALO_MS = 60_000;
let ultimaBusca = 0;

/** Ao abrir o app: há convite de retorno esperando? Não tem custo de IA. */
export async function buscarConvite(): Promise<void> {
  if (Date.now() - ultimaBusca < INTERVALO_MS) return;
  ultimaBusca = Date.now();
  const r = await chamar({ acao: 'convite' });
  if (!r?.convite?.conversation_id || useBalaoEspinha.getState().balao) return;
  useBalaoEspinha.getState().mostrar({ conversationId: r.convite.conversation_id, texto: r.convite.texto, tipo: 'retorno' });
}

export function marcarConviteVisto(conversationId: string): void {
  void chamar({ acao: 'convite_visto', conversationId });
}

/** Rota da conversa. O `t` faz o chat reabrir mesmo se o id for o mesmo da última vez. */
export const rotaConversaEspinha = (conversationId: string) =>
  ({ pathname: '/(app)/niks-chat', params: { conversa: conversationId, t: String(Date.now()) } }) as any;
