// Estado de acesso da conta (Parte B, Fase 5). A última resposta fica no aparelho para a
// convidada não cair no paywall quando faltar internet. Sem resposta e sem histórico, paywall.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { estadoAcesso } from './gruposServidor';

export type EstadoAcesso = 'assinante' | 'convidada' | 'sem_acesso';
const CHAVE = (uid: string) => `acesso:estado:${uid}`;

export const useAcesso = create<{ estado: EstadoAcesso | null }>(() => ({ estado: null }));
export const useEhConvidada = () => useAcesso((s) => s.estado === 'convidada');

export function definirAcesso(estado: EstadoAcesso | null, uid?: string) {
  useAcesso.setState({ estado });
  if (uid && estado) void AsyncStorage.setItem(CHAVE(uid), estado).catch(() => {});
}

export async function carregarAcesso(uid: string): Promise<EstadoAcesso> {
  let estado: EstadoAcesso | null = null;
  try {
    estado = await Promise.race([estadoAcesso(), new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
  } catch {
    estado = null;
  }
  if (!estado) {
    const guardado = await AsyncStorage.getItem(CHAVE(uid)).catch(() => null);
    estado = guardado === 'convidada' ? 'convidada' : 'sem_acesso';
  } else {
    void AsyncStorage.setItem(CHAVE(uid), estado).catch(() => {});
  }
  useAcesso.setState({ estado });
  return estado;
}
