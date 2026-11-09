// Cadeados da convidada (Parte B, Fase 5): tocar abre o aviso com a frase da função.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export const FRASES = {
  rotina: 'Assine para ter sua rotina feita pela IA',
  skincare: 'Assine para seguir sua rotina passo a passo',
  produtos: 'Assine para analisar seus produtos com a IA',
  chat: 'Assine para conversar com a NIKS',
  scan: 'Assine para acompanhar a evolução da sua pele',
  espinha: 'Assine para cuidar das suas espinhas com a IA',
  compatibilidade: 'Assine para ver se esse produto combina com você',
  calendario: 'Assine para ver o histórico da sua rotina',
  carta: 'Assine para ter tudo no NIKS',
  criarGrupo: 'Assine para criar seu próprio grupo',
} as const;

export const useTrava = create<{ frase: string | null; funcao: string | null; aposCarta: string | null; caminhadaDepois: boolean }>(() => ({ frase: null, funcao: null, aposCarta: null, caminhadaDepois: false }));

export function abrirTrava(funcao: keyof typeof FRASES) {
  useTrava.setState({ frase: FRASES[funcao], funcao });
}
export const fecharTrava = () => useTrava.setState({ frase: null, funcao: null });
/** Abre direto o paywall da convidada (Perfil, carta especial, subida de medalha). */
export const abrirPaywallConvidada = (origem = 'perfil') => abridorPaywall?.(origem);

/** Pede o paywall para depois que a carta sair da tela: por cima dela o Superwall não abre. */
export const paywallAposCarta = (origem: string, caminhadaDepois = false) => useTrava.setState({ aposCarta: origem, caminhadaDepois });

// Chamada direta, sem passar por efeito de tela: com a carta aberta por cima, as telas de
// baixo ficam congeladas e um efeito do `(app)/_layout` não rodaria.
let abridorPaywall: ((origem: string) => void) | null = null;
export const definirAbridorPaywall = (f: ((origem: string) => void) | null) => { abridorPaywall = f; };

const CHAVE_MEDALHA = 'convidada:medalha:paywall';
let pularPaywallDaMedalha = false;
export const pularProximoPaywallDaMedalha = () => { pularPaywallDaMedalha = true; };
/** Depois da celebração: abre o paywall uma vez por medalha. */
export async function paywallDaMedalha(nivel: number): Promise<void> {
  const ultimo = Number(await AsyncStorage.getItem(CHAVE_MEDALHA).catch(() => null)) || 0;
  if (nivel <= ultimo) return;
  await AsyncStorage.setItem(CHAVE_MEDALHA, String(nivel)).catch(() => {});
  // Acabou de ver o paywall na carta: não mostra outro logo em seguida.
  if (pularPaywallDaMedalha) { pularPaywallDaMedalha = false; return; }
  abrirPaywallConvidada('medalha');
}
