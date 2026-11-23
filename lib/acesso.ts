// Estado de acesso da conta (Parte B, Fase 5). A última resposta fica no aparelho para a
// convidada não cair no paywall quando faltar internet. Sem resposta e sem histórico, paywall.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { estadoAcessoCompleto } from './gruposServidor';
import { confirmPremium } from './subscriptionGate';
import { trackFora } from './mixpanel/MixpanelProvider';
import { getUserId } from './currentUser';

export type EstadoAcesso = 'assinante' | 'convidada' | 'sem_acesso';
const CHAVE = (uid: string) => `acesso:estado:${uid}`;

// `boasVindasEx`: quem era convidada e acabou de assinar passa pelas boas-vindas sem o cadastro.
export const useAcesso = create<{ estado: EstadoAcesso | null; boasVindasEx: boolean }>(() => ({ estado: null, boasVindasEx: false }));
export const useEhConvidada = () => useAcesso((s) => s.estado === 'convidada');

// 1.64: "já foi convidada" — fica no aparelho mesmo depois que o estado vira 'sem_acesso'.
// Só quem foi convidada de verdade e perdeu o acesso vê a tela "sem grupo"
// (`lib/onboardingObrigatorio.ts`, `decidirSemAssinatura`).
const CHAVE_FOI = (uid: string) => `acesso:foi_convidada:${uid}`;

/**
 * Grava o estado; se for (ou tiver sido) 'convidada', marca "já foi convidada". `foiServidor`:
 * a resposta do servidor (migration 20261220120000) — quando vem, ela manda: `true` marca,
 * `false` desmarca (vale em qualquer celular). Sem resposta (`null`/`undefined`), só o aparelho.
 */
async function guardarEstado(uid: string, estado: EstadoAcesso, foiServidor?: boolean | null): Promise<void> {
  try {
    const antes = await AsyncStorage.getItem(CHAVE(uid));
    if (foiServidor === true || (foiServidor == null && (estado === 'convidada' || antes === 'convidada'))) {
      await AsyncStorage.setItem(CHAVE_FOI(uid), '1');
    } else if (foiServidor === false && estado !== 'convidada') {
      await AsyncStorage.removeItem(CHAVE_FOI(uid));
    }
    await AsyncStorage.setItem(CHAVE(uid), estado);
  } catch {
    // sem gravar, a próxima resposta do servidor grava
  }
}

/** Esta conta já foi convidada de grupo? (o que o servidor disse por último, ou o aparelho) */
export async function foiConvidada(uid: string): Promise<boolean> {
  try {
    const [foi, estado] = await Promise.all([AsyncStorage.getItem(CHAVE_FOI(uid)), AsyncStorage.getItem(CHAVE(uid))]);
    return foi === '1' || estado === 'convidada';
  } catch {
    return false;
  }
}

export function definirAcesso(estado: EstadoAcesso | null, uid?: string) {
  useAcesso.setState({ estado });
  if (uid && estado) void guardarEstado(uid, estado);
}

export async function carregarAcesso(uid: string): Promise<EstadoAcesso> {
  let estado: EstadoAcesso | null = null;
  let foi: boolean | null | undefined;
  try {
    const r = await Promise.race([estadoAcessoCompleto(), new Promise<null>((res) => setTimeout(() => res(null), 8000))]);
    estado = r?.estado ?? null;
    foi = r?.foi_convidada;
  } catch {
    estado = null;
  }
  if (!estado) {
    const guardado = await AsyncStorage.getItem(CHAVE(uid)).catch(() => null);
    estado = guardado === 'convidada' ? 'convidada' : 'sem_acesso';
  } else {
    // Espera gravar: quem decide a tela logo depois (`foiConvidada`) lê o que ficou aqui.
    await guardarEstado(uid, estado, foi);
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
    const r = await estadoAcessoCompleto();
    estado = r.estado;
    useAcesso.setState({ estado });
    await guardarEstado(uid, estado, r.foi_convidada);
  } catch {
    return null;
  }
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
