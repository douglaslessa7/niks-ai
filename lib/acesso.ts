// Estado de acesso da conta (Parte B, Fase 5). A última resposta fica no aparelho para a
// convidada não cair no paywall quando faltar internet. Sem resposta e sem histórico, paywall.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { estadoAcesso } from './gruposServidor';
import { confirmPremium } from './subscriptionGate';
import { trackFora } from './mixpanel/MixpanelProvider';
import { getUserId } from './currentUser';

export type EstadoAcesso = 'assinante' | 'convidada' | 'sem_acesso';
const CHAVE = (uid: string) => `acesso:estado:${uid}`;

// `boasVindasEx`: quem era convidada e acabou de assinar passa pelas boas-vindas sem o cadastro.
export const useAcesso = create<{ estado: EstadoAcesso | null; boasVindasEx: boolean }>(() => ({ estado: null, boasVindasEx: false }));
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

const INTERVALO_MS = 60_000;
let ultima = 0;

/**
 * Parte B, Fase 7: reconfere o acesso com o app aberto. Devolve o estado, ou `null` se não
 * conferiu (dentro do intervalo ou sem resposta do servidor: nada muda sem uma resposta).
 */
export async function reconferirAcesso(uid: string, forcar = false, motivo = 'removida'): Promise<EstadoAcesso | null> {
  if (!forcar && Date.now() - ultima < INTERVALO_MS) return null;
  ultima = Date.now();
  const antes = useAcesso.getState().estado;
  if (await confirmPremium({ label: 'reconferir' })) {
    definirAcesso('assinante', uid);
    return 'assinante';
  }
  let estado: EstadoAcesso;
  try {
    estado = await estadoAcesso();
  } catch {
    return null;
  }
  definirAcesso(estado, uid);
  if (antes === 'assinante' && estado !== 'assinante') trackFora('assinante_virou_convidada', { estado });
  if (antes === 'convidada' && estado === 'sem_acesso') trackFora('convidada_perdeu_acesso', { motivo });
  return estado;
}

/** Depois de sair de um grupo: `true` se a convidada ficou sem nenhum grupo. */
export async function saiuSemGrupo(): Promise<boolean> {
  if (useAcesso.getState().estado !== 'convidada') return false;
  const uid = await getUserId();
  return !!uid && (await reconferirAcesso(uid, true, 'saiu')) === 'sem_acesso';
}
